import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import vendoredLegend from "@/data/nfhl-legend.json";
import { NFHL_ROOT, REPORT_FLOOD_SIZE, nfhlRestyledForm, usgsAerialUrl } from "@/lib/basemaps";
export { FLOOD_MIN_ZOOM, FLOOD_ZOOM, REPORT_FLOOD_SIZE } from "@/lib/basemaps";
import { finishAerial } from "@/lib/aerial-finish";
import {
  FLOOD_AERIAL_MUTE,
  FLOOD_CLASS_LABEL,
  classesIn,
  floodClassOfZone,
  floodDynamicLayers,
  floodStyleOf,
  floodSwatchSvg,
  overlayAlphaScale,
  unscaleAlpha,
  type FloodClassKey,
} from "@/lib/flood-style";
import {
  FLOOD_CROPS,
  FLOOD_FRAME,
  FLOOD_FRAME_VERSION,
  cropBox,
  cropRegion,
  floodFrameCurrent,
  pointKey,
  servedSize,
  type FloodCrop,
  type FloodFrameRecord,
} from "@/lib/flood-frame-core";
import {
  floodZoneLine,
  parseNfhlLegend,
  resolveNfhlLayerId,
  type FloodMapView,
  type NfhlLegendEntry,
  type SiteFlagsResult,
} from "@/lib/site-flags/core";
import { floodFramePath } from "@/lib/storage-paths";
import { downloadDealFile, removeStorageFiles, uploadDealPhoto } from "@/lib/storage";
import { resolveDealLocation, writeCache, type DealLocation, type DealVisualCache } from "@/lib/deal-location";
import type { StructuredAddress } from "@/lib/address";
import { RunGate } from "@/lib/anthropic/run-gate";
import { intactImage } from "@/lib/memo/cover-aerial";

// FEMA's flood map over the deal's aerial (#425), drawn once a deal (#472).
//
// What the runner printed before any of this was written (flood-sheet runs,
// 2026-09-25 and 2026-09-30): the zones are layer 28 of the service; that
// layer draws only finer than 1:36,112; its legend is eight entries, each
// with the FLD_ZONE,ZONE_SUBTY values it draws; the export answers a
// transparent PNG for a Web-Mercator bbox, POSTed dynamic layers in the
// site's palette included, up to 4096 pixels a side at any dpi; the
// composites line up over the USGS frame. And the hosts are slow cold: the
// first request of a run took 20–30 s where the rest took one or two, and one
// run died on a connection reset — so every request is asked twice, with a
// timeout sized to the cold answer, and the frame is drawn behind the page
// and kept, so a reader waits for FEMA at most once a month a deal.

export const FLOOD_ROOT = process.env.NFHL_SERVICE_ROOT ?? NFHL_ROOT;

const UA = "underwrite-copilot/1.0";
/** A cold FEMA or USGS answer took up to 30 s on the runner. */
const REQUEST_TIMEOUT_MS = 35_000;

/**
 * A request asked up to twice. A throw (a timeout, a reset), a 5xx, or an
 * answer that is not what was asked for (`ok` false — ArcGIS answers 200 with
 * a JSON error body when it dislikes a request) is asked again; the second
 * answer stands either way.
 */
async function askTwice(
  url: string,
  init: RequestInit,
  ok: (res: Response) => boolean,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (ok(res) || attempt === 1) return res;
      last = new Error(`HTTP ${res.status} ${res.headers.get("content-type") ?? ""} from ${new URL(url).host}`);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const isImage = (res: Response) => res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");

async function fetchJson(url: string): Promise<unknown> {
  const res = await askTwice(url, { headers: { "user-agent": UA, accept: "application/json" } }, (r) => r.ok, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

/** The zones layer's id, from the service's own layer list. A service that
 *  lists no zones layer throws rather than returns, so the miss is not
 *  cached for a day. */
const liveLayerId = unstable_cache(
  async (root: string): Promise<number> => {
    const id = resolveNfhlLayerId(await fetchJson(`${root}?f=json`));
    if (id === null) throw new Error("FEMA's flood service lists no Flood Hazard Zones layer");
    return id;
  },
  ["nfhl-zones-layer"],
  { revalidate: 86_400 },
);

const liveLegend = unstable_cache(
  async (root: string, layerId: number): Promise<NfhlLegendEntry[]> => {
    const legend = parseNfhlLegend(await fetchJson(`${root}/legend?f=json`), layerId);
    if (legend.length === 0) throw new Error("FEMA's legend has no entries for the zones layer");
    return legend;
  },
  ["nfhl-zones-legend"],
  { revalidate: 86_400 },
);

/** The legend the runner printed (data/nfhl-legend.json), for when FEMA's
 *  own does not answer — the classes a drawing needs are FEMA's either way. */
export const VENDORED_LEGEND: NfhlLegendEntry[] = vendoredLegend.legend.map((e) => ({
  label: e.label.trim(),
  image: null,
  values: e.values,
}));

/**
 * The zones layer and FEMA's legend for it: the service's own, cached a day,
 * or — when it does not answer — the copy the runner printed, so a slow
 * FEMA never leaves a frame undrawn for want of its class list.
 */
export async function floodClasses(): Promise<{ layerId: number; legend: NfhlLegendEntry[]; live: boolean }> {
  try {
    const layerId = await liveLayerId(FLOOD_ROOT);
    return { layerId, legend: await liveLegend(FLOOD_ROOT, layerId), live: true };
  } catch {
    return { layerId: vendoredLegend.layerId, legend: VENDORED_LEGEND, live: false };
  }
}

/** FEMA's legend — its own, else the runner's copy. Never empty. */
export async function floodLegend(): Promise<NfhlLegendEntry[]> {
  return (await floodClasses()).legend;
}

// ── Drawing the frame ───────────────────────────────────────────────────────

/** The network, swappable in tests. */
export interface FloodFetchers {
  aerial: (url: string) => Promise<Buffer>;
  overlay: (url: string, form: URLSearchParams) => Promise<Buffer>;
}

const defaultFetchers: FloodFetchers = {
  async aerial(url) {
    const res = await askTwice(url, { headers: { "user-agent": UA } }, isImage);
    if (!isImage(res)) throw new Error(`the aerial answered HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`);
    return Buffer.from(await res.arrayBuffer());
  },
  async overlay(url, form) {
    const init: RequestInit = {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    };
    const res = await askTwice(url, init, isImage);
    if (!isImage(res)) throw new Error(`FEMA answered HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`);
    return Buffer.from(await res.arrayBuffer());
  },
};

export interface DrawnFloodFrame {
  jpeg: Buffer;
  width: number;
  height: number;
  classes: Record<FloodCrop, FloodClassKey[]>;
}

/**
 * The aerial and the zones as one picture: the aerial finished (#429),
 * brought to the zones' pixels and calmed, so the zones carry the colour and
 * the photograph the place; FEMA's overlay measured and, where FEMA applied
 * its own layer transparency, corrected — or refused where the measure fits
 * neither behaviour, since a frame whose look cannot be vouched for is not
 * one to keep. The classes each crop shows are read off the overlay here,
 * once.
 */
export async function composeFloodFrame(aerial: Buffer, overlay: Buffer): Promise<DrawnFloodFrame | null> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(overlay).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const scale = overlayAlphaScale(px, info.width, info.height);
  if (scale === null) return null;
  unscaleAlpha(px, scale);
  const { width, height } = info;
  let base = aerial;
  try {
    base = await finishAerial(aerial);
  } catch {
    // The plain export is still the real picture.
  }
  const calm = await sharp(base)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .modulate({ saturation: FLOOD_AERIAL_MUTE.saturation, brightness: FLOOD_AERIAL_MUTE.brightness })
    .toBuffer();
  const zones = await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const jpeg = await sharp(calm).composite([{ input: zones }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const min = Math.round(150 * (width / FLOOD_FRAME.width) ** 2);
  const classes = Object.fromEntries(
    (Object.keys(FLOOD_CROPS) as FloodCrop[]).map((crop) => [crop, classesIn(px, width, height, cropRegion(crop), min)]),
  ) as Record<FloodCrop, FloodClassKey[]>;
  return { jpeg, width, height, classes };
}

/** Draw the frame around a point: the aerial and FEMA's restyled zones for
 *  the same ground, asked for together. Throws on any failure. */
export async function drawFloodFrame(point: { lat: number; lng: number }, fetchers: FloodFetchers = defaultFetchers): Promise<DrawnFloodFrame> {
  const { layerId, legend } = await floodClasses();
  const dynamicLayers = floodDynamicLayers(layerId, legend);
  if (!dynamicLayers) throw new Error("no legend entry matches a class the palette draws");
  const frame = { center: point, zoom: FLOOD_FRAME.zoom, width: FLOOD_FRAME.width, height: FLOOD_FRAME.height };
  const [aerial, overlay] = await Promise.all([
    fetchers.aerial(usgsAerialUrl(frame)),
    fetchers.overlay(`${FLOOD_ROOT}/export`, nfhlRestyledForm({ ...frame, dynamicLayers, scale: FLOOD_FRAME.scale })),
  ]);
  const drawn = await composeFloodFrame(aerial, overlay);
  if (!drawn) throw new Error("FEMA's overlay came back at an alpha neither behaviour draws");
  return drawn;
}

// ── Keeping it ──────────────────────────────────────────────────────────────

/** Two frames drawn at once a process: each holds a few megabytes of
 *  pixels for a second or two. */
const DRAW_GATE = new RunGate(() => 2);
/** One draw a deal at a time, shared by whoever asks while it runs. */
const drawing = new Map<string, Promise<FloodFrameRecord | null>>();

/** The stored frames' bytes a process holds, by path — a frame is read
 *  once, then cut to each surface's shape from memory. */
const held = new Map<string, Buffer>();
const HELD_MAX = 16;
function hold(path: string, bytes: Buffer): Buffer {
  held.delete(path);
  held.set(path, bytes);
  while (held.size > HELD_MAX) held.delete(held.keys().next().value!);
  return bytes;
}

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * The deal's flood frame around `loc`: the stored one where it is current,
 * else drawn now — one draw a deal at a time, two a process — stored in the
 * bucket and recorded on the deal's photo cache, the frame it replaces
 * removed. Null where the frame could not be drawn this time (the next ask
 * tries again: a failure is never recorded). `waitMs` bounds how long the
 * caller waits; the draw goes on behind a caller that stops waiting.
 */
export async function ensureFloodFrame(
  supabase: SupabaseClient,
  dealId: string,
  loc: DealLocation,
  cache: DealVisualCache | null,
  opts: { waitMs?: number; fetchers?: FloodFetchers } = {},
): Promise<FloodFrameRecord | null> {
  if (floodFrameCurrent(cache?.floodFrame, loc)) return cache!.floodFrame!;
  let run = drawing.get(dealId);
  if (!run) {
    run = (async (): Promise<FloodFrameRecord | null> => {
      const release = await DRAW_GATE.acquire();
      try {
        const drawn = await drawFloodFrame(loc, opts.fetchers);
        const path = floodFramePath(dealId, stamp());
        await uploadDealPhoto(path, drawn.jpeg, { kind: "deal", dealId, only: ["flood"] });
        hold(path, drawn.jpeg);
        const record: FloodFrameRecord = {
          v: FLOOD_FRAME_VERSION,
          path,
          at: new Date().toISOString(),
          for: pointKey(loc),
          width: drawn.width,
          height: drawn.height,
          classes: drawn.classes,
        };
        await writeCache(supabase, dealId, cache, { floodFrame: record });
        const old = cache?.floodFrame?.path;
        if (old && old !== path) {
          await removeStorageFiles([old], { kind: "deal", dealId, only: ["flood"] }).catch(() => {});
        }
        return record;
      } catch (err) {
        console.warn(`[flood-frame] deal ${dealId}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      } finally {
        release();
        drawing.delete(dealId);
      }
    })();
    drawing.set(dealId, run);
  }
  if (opts.waitMs === undefined) return run;
  return within(run, opts.waitMs, null);
}

/**
 * The frame cut to `w`×`h` from its centre, as a JPEG — never larger than
 * the stored frame gives in that shape, so nothing is stretched.
 */
export async function floodCrop(dealId: string, record: FloodFrameRecord, w: number, h: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const bytes = held.get(record.path) ?? hold(record.path, await downloadDealFile(record.path, { kind: "deal", dealId, only: ["flood"] }));
  const box = cropBox(record.width, record.height, w, h);
  const out = servedSize(w, h, record.width, record.height);
  return sharp(bytes)
    .extract(box)
    .resize(out.width, out.height, { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── The key ─────────────────────────────────────────────────────────────────

/** A key entry: a class the frame shows, in FEMA's words, marked where it is
 *  the class the building's own zone is drawn in. */
export interface FloodKeyEntry {
  key: FloodClassKey;
  label: string;
  here: boolean;
}

/** The key under a crop: the classes it shows, the building's own first. */
export function floodKeyFor(
  classes: readonly FloodClassKey[],
  flood: SiteFlagsResult["flood"] | undefined,
  legend: readonly NfhlLegendEntry[],
): FloodKeyEntry[] {
  const own = flood && flood !== "unavailable" ? floodClassOfZone(legend, flood.zone, flood.subtype) : null;
  const shown = own && classes.includes(own) ? [own, ...classes.filter((c) => c !== own)] : [...classes];
  return shown.map((key) => ({ key, label: FLOOD_CLASS_LABEL[key], here: key === own }));
}

const swatches = new Map<FloodClassKey, string>();
/** A class's swatch as a PNG data URI, for the report. */
async function swatchPng(key: FloodClassKey): Promise<string | null> {
  const hit = swatches.get(key);
  if (hit) return hit;
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(floodSwatchSvg(floodStyleOf(key)))).png().toBuffer();
    if (!intactImage(png, "image/png")) return null;
    const uri = `data:image/png;base64,${png.toString("base64")}`;
    swatches.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}

// ── The flood map as a picture in the full report (#427) ────────────────────

/**
 * The full report's flood map, for a deal with a street address: the deal's
 * frame cut to the report's band at twice its points, the key the band shows
 * with the building's own class marked, and the zone sentence. Bounded — the
 * report is a download a person is waiting on — and never throws: a frame
 * that is not drawn in time leaves the page's words without the picture (it
 * goes on drawing, for the next report and the page), and nothing at all
 * where there is nothing to say.
 */
export async function floodMapFor(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  flags: SiteFlagsResult | null,
): Promise<FloodMapView | null> {
  if (!address?.street?.trim()) return null;
  const flood = flags && flags.status !== "pending" ? flags.flood : undefined;
  const legend = await within(floodLegend(), 3_000, VENDORED_LEGEND);
  const picture = await within(
    (async (): Promise<{ image: string; classes: FloodClassKey[] } | null> => {
      const loc = await resolveDealLocation(supabase, dealId, address, cache);
      if (!loc || loc.precision === "area") return null;
      const record = await ensureFloodFrame(supabase, dealId, loc, cache);
      if (!record) return null;
      const jpeg = await floodCrop(dealId, record, REPORT_FLOOD_SIZE.width * 2, REPORT_FLOOD_SIZE.height * 2);
      if (!intactImage(jpeg, "image/jpeg")) return null;
      return { image: `data:image/jpeg;base64,${jpeg.toString("base64")}`, classes: record.classes.report };
    })(),
    20_000,
    null,
  );
  const line = floodZoneLine(flood, legend);
  if (!picture && !line) return null;
  const key = picture
    ? await Promise.all(
        floodKeyFor(picture.classes, flood, legend).map(async (k) => ({ label: k.label, image: await swatchPng(k.key), here: k.here })),
      )
    : [];
  return { image: picture?.image ?? null, key, line };
}

// ── How FEMA and USGS answer from the site's own network (#472) ────────────

export interface FloodHealthPart {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface FloodHealth {
  checkedAt: string;
  summary: string;
  layer: FloodHealthPart & { id: number | null };
  legend: FloodHealthPart & { entries: number; values: number; matchesCopy: boolean | null; added: string[]; removed: string[] };
  overlay: FloodHealthPart & { bytes: number; scale: number | null; classes: FloodClassKey[] };
  aerial: FloodHealthPart & { bytes: number };
}

/** The frame the check draws: Hoboken, a public place the runner's flood
 *  sheets drew, in Zone AE beside the 0.2% zone. */
const HEALTH_POINT = { lat: 40.744, lng: -74.0324 };
const HEALTH_TTL_MS = 10 * 60 * 1000;

const healthState = ((globalThis as { [k: symbol]: unknown })[Symbol.for("uc.floodHealth")] ??= {
  at: 0,
  result: null as FloodHealth | null,
  running: null as Promise<FloodHealth> | null,
}) as { at: number; result: FloodHealth | null; running: Promise<FloodHealth> | null };

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    return { value: null, ms: Date.now() - t0, error: errText(err) };
  }
}

/**
 * Whether FEMA's flood service and USGS's imagery answer from this
 * deployment, and how fast: the layer list, the legend (held against the
 * runner's copy the drawings fall back on — a value FEMA added or dropped is
 * named), a restyled overlay for a small frame (its alpha measured, the
 * classes it shows read) and the aerial for the same frame. Uncached reads,
 * so it measures the services rather than this process's memory; the answer
 * is kept ten minutes, so the check never hammers either host.
 */
export async function floodHealth(): Promise<FloodHealth> {
  if (healthState.result && Date.now() - healthState.at < HEALTH_TTL_MS) return healthState.result;
  if (healthState.running) return healthState.running;
  healthState.running = (async (): Promise<FloodHealth> => {
    const layer = await timed(async () => {
      const id = resolveNfhlLayerId(await fetchJson(`${FLOOD_ROOT}?f=json`));
      if (id === null) throw new Error("no Flood Hazard Zones layer listed");
      return id;
    });
    const layerId = layer.value ?? vendoredLegend.layerId;
    const legend = await timed(async () => {
      const entries = parseNfhlLegend(await fetchJson(`${FLOOD_ROOT}/legend?f=json`), layerId);
      if (!entries.length) throw new Error("no legend entries for the zones layer");
      return entries;
    });
    const live = new Set((legend.value ?? []).flatMap((e) => e.values));
    const copy = new Set(VENDORED_LEGEND.flatMap((e) => e.values));
    const added = legend.value ? [...live].filter((v) => !copy.has(v)) : [];
    const removed = legend.value ? [...copy].filter((v) => !live.has(v)) : [];
    const frame = { center: HEALTH_POINT, zoom: FLOOD_FRAME.zoom, width: 640, height: 360 };
    const dynamicLayers = floodDynamicLayers(layerId, legend.value ?? VENDORED_LEGEND);
    const [overlay, aerial] = await Promise.all([
      timed(async () => {
        if (!dynamicLayers) throw new Error("no legend entry matches a class the palette draws");
        const png = await defaultFetchers.overlay(`${FLOOD_ROOT}/export`, nfhlRestyledForm({ ...frame, dynamicLayers, scale: 2 }));
        const sharp = (await import("sharp")).default;
        const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const px = new Uint8Array(data.buffer, data.byteOffset, data.length);
        const scale = overlayAlphaScale(px, info.width, info.height);
        if (scale) unscaleAlpha(px, scale);
        return { bytes: png.length, scale, classes: classesIn(px, info.width, info.height, { w: 1, h: 1 }, 150) };
      }),
      timed(async () => (await defaultFetchers.aerial(usgsAerialUrl(frame))).length),
    ]);
    const result: FloodHealth = {
      checkedAt: new Date().toISOString(),
      summary: "",
      layer: { ok: layer.value !== null, ms: layer.ms, id: layer.value, ...(layer.error ? { error: layer.error } : {}) },
      legend: {
        ok: legend.value !== null,
        ms: legend.ms,
        entries: legend.value?.length ?? 0,
        values: live.size,
        matchesCopy: legend.value ? added.length === 0 && removed.length === 0 : null,
        added,
        removed,
        ...(legend.error ? { error: legend.error } : {}),
      },
      overlay: {
        ok: overlay.value !== null,
        ms: overlay.ms,
        bytes: overlay.value?.bytes ?? 0,
        scale: overlay.value?.scale ?? null,
        classes: overlay.value?.classes ?? [],
        ...(overlay.error ? { error: overlay.error } : {}),
      },
      aerial: { ok: aerial.value !== null, ms: aerial.ms, bytes: aerial.value ?? 0, ...(aerial.error ? { error: aerial.error } : {}) },
    };
    const s = (x: number) => `${(x / 1000).toFixed(1)} s`;
    result.summary = [
      result.overlay.ok
        ? `FEMA drew the restyled zones in ${s(result.overlay.ms)}${result.overlay.scale && result.overlay.scale !== 1 ? " (at its own 30%, corrected)" : ""}`
        : `FEMA's restyled zones FAILED after ${s(result.overlay.ms)}`,
      result.legend.matchesCopy === true
        ? "its legend matches the runner's copy"
        : result.legend.matchesCopy === false
          ? `its legend DIFFERS from the runner's copy (${added.length} added, ${removed.length} dropped)`
          : "its legend did not answer",
      result.aerial.ok ? `USGS answered in ${s(result.aerial.ms)}` : `USGS FAILED after ${s(result.aerial.ms)}`,
    ].join("; ");
    healthState.result = result;
    healthState.at = Date.now();
    return result;
  })().finally(() => {
    healthState.running = null;
  });
  return healthState.running;
}
