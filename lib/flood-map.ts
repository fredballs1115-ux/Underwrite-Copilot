import "server-only";
import { unstable_cache } from "next/cache";
import { NFHL_ROOT, nfhlOverlayUrl } from "@/lib/basemaps";
export { FLOOD_MIN_ZOOM, FLOOD_ZOOM } from "@/lib/basemaps";
import type { DealLocation } from "@/lib/deal-location";
import { parseNfhlLegend, resolveNfhlLayerId, type NfhlLegendEntry } from "@/lib/site-flags/core";

// FEMA's flood map over the deal's aerial (#425): the National Flood Hazard
// Layer's zones, in FEMA's own symbology, for the aerial's own frame.
//
// What the runner printed before any of this was written (flood-sheet run,
// 2026-09-25): the service answers a layer list with the zones on layer 28;
// that layer draws only at map scales finer than 1:36,112; its legend is
// eight entries of 20px swatches; the export answers a transparent PNG for a
// Web-Mercator bbox; and the composites line up over the USGS frame. The
// same run's first attempt died on a connection reset from FEMA's host, so
// every request here is asked twice before it is given up on.

export const FLOOD_ROOT = process.env.NFHL_SERVICE_ROOT ?? NFHL_ROOT;

const UA = { "user-agent": "underwrite-copilot/1.0", accept: "application/json" };

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchWithRetry(url, { headers: UA }, 12_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

/** The zones layer's id, from the service's own layer list. A service that
 *  lists no zones layer throws rather than returns, so the miss is not
 *  cached for a day. */
const floodLayerId = unstable_cache(
  async (root: string): Promise<number> => {
    const id = resolveNfhlLayerId(await fetchJson(`${root}?f=json`));
    if (id === null) throw new Error("FEMA's flood service lists no Flood Hazard Zones layer");
    return id;
  },
  ["nfhl-zones-layer"],
  { revalidate: 86_400 },
);

const cachedLegend = unstable_cache(
  async (root: string, layerId: number): Promise<NfhlLegendEntry[]> => {
    const legend = parseNfhlLegend(await fetchJson(`${root}/legend?f=json`), layerId);
    if (legend.length === 0) throw new Error("FEMA's legend has no entries for the zones layer");
    return legend;
  },
  ["nfhl-zones-legend"],
  { revalidate: 86_400 },
);

/** FEMA's own legend for the zones layer — its labels and swatches — or an
 *  empty list when the service does not answer. */
export async function floodLegend(): Promise<NfhlLegendEntry[]> {
  try {
    return await cachedLegend(FLOOD_ROOT, await floodLayerId(FLOOD_ROOT));
  } catch {
    return [];
  }
}

/**
 * FEMA's zones for the frame the aerial route draws at the same location,
 * zoom and size (both go through lib/basemaps' one frame definition), as a
 * transparent PNG. Null on any failure: the tab then goes, never a stale or
 * wrong picture.
 */
export async function fetchFloodOverlay(
  loc: DealLocation,
  size: { width: number; height: number; zoom: number },
): Promise<Response | null> {
  try {
    const layerId = await floodLayerId(FLOOD_ROOT);
    const res = await fetchWithRetry(
      nfhlOverlayUrl({ center: loc, zoom: size.zoom, width: size.width, height: size.height, layerId, root: FLOOD_ROOT }),
      { headers: { "user-agent": UA["user-agent"] } },
      15_000,
    );
    // ArcGIS answers 200 with a JSON error body when it dislikes a request,
    // so the content type is the real test.
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !res.body || !type.startsWith("image/")) return null;
    return res;
  } catch {
    return null;
  }
}
