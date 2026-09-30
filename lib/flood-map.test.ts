// The Flood view's picture, drawn once a deal and kept (#472): the aerial
// and FEMA's restyled zones for one frame, the overlay measured and — where
// FEMA applied its own layer transparency — corrected, the classes each crop
// shows read off the drawing, the frame stored and cut to each surface's
// shape. The network and the bucket are faked; the pixels are real.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));

const store = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  uploads: [] as string[],
  removed: [] as string[],
}));

vi.mock("@/lib/storage", () => ({
  downloadDealFile: async (path: string) => {
    const f = store.files.get(path);
    if (!f) throw new Error("no such object");
    return f;
  },
  uploadDealPhoto: async (path: string, bytes: Buffer) => {
    store.uploads.push(path);
    store.files.set(path, bytes);
  },
  removeStorageFiles: async (paths: string[]) => {
    store.removed.push(...paths);
  },
}));

import sharp from "sharp";
import { composeFloodFrame, drawFloodFrame, ensureFloodFrame, floodCrop, floodKeyFor, VENDORED_LEGEND, type FloodFetchers } from "./flood-map";
import { FLOOD_FRAME, FLOOD_FRAME_VERSION, floodFramePaths, pointKey } from "./flood-frame-core";
import { FEMA_LAYER_OPACITY, floodStyleOf, type Rgba } from "./flood-style";
import { intactImage } from "@/lib/memo/cover-aerial";
import type { DealLocation, DealVisualCache } from "./deal-location";

// FEMA's service is never reached here: the class list falls back to the
// runner's copy of the legend at once.
vi.stubGlobal("fetch", async () => {
  throw new Error("offline in tests");
});

const W = FLOOD_FRAME.width;
const H = FLOOD_FRAME.height;
const OW = W * FLOOD_FRAME.scale;
const OH = H * FLOOD_FRAME.scale;
const GREEN = { r: 60, g: 110, b: 60 };

async function aerialJpeg(): Promise<Buffer> {
  return sharp({ create: { width: W, height: H, channels: 3, background: GREEN } }).jpeg({ quality: 95 }).toBuffer();
}

/** FEMA's overlay: the 1% zone's tint over the left half, at `alpha`. */
async function overlayPng(alpha: number, width = OW, height = OH): Promise<Buffer> {
  const [r, g, b] = floodStyleOf("sfha").fill;
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width / 2; x++) px.set([r, g, b, alpha], (y * width + x) * 4);
  }
  return sharp(px, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function pixel(jpeg: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const SFHA_ALPHA = floodStyleOf("sfha").fill[3];

function fetchers(overlayAlpha = SFHA_ALPHA): FloodFetchers & { seen: { aerial: string[]; forms: URLSearchParams[] } } {
  const seen = { aerial: [] as string[], forms: [] as URLSearchParams[] };
  return {
    seen,
    aerial: async (url) => {
      seen.aerial.push(url);
      return aerialJpeg();
    },
    overlay: async (_url, form) => {
      seen.forms.push(form);
      return overlayPng(overlayAlpha);
    },
  };
}

/** A deals table of one row's photo cache, read and written as the code does. */
function fakeDb(photo: DealVisualCache | null) {
  const db = { photo };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo: db.photo } }) }) }),
      update: (row: { photo: DealVisualCache }) => ({
        eq: async () => {
          db.photo = JSON.parse(JSON.stringify(row.photo));
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, db };
}

const LOC: DealLocation = { lat: 39.975, lng: -75.18, precision: "street" };

beforeEach(() => {
  store.files.clear();
  store.uploads.length = 0;
  store.removed.length = 0;
});

// Full frames through sharp: seconds each on a loaded runner, so the
// heavy blocks get the report tests' allowance rather than the 5 s default.
describe("composeFloodFrame — the aerial, calmed, with the zones drawn over it", { timeout: 60_000 }, () => {
  it("lays the zones where FEMA drew them, at the zones' own pixels, and reads the classes each crop shows", async () => {
    const drawn = (await composeFloodFrame(await aerialJpeg(), await overlayPng(SFHA_ALPHA)))!;
    expect(intactImage(drawn.jpeg, "image/jpeg")).toBe(true);
    expect([drawn.width, drawn.height]).toEqual([OW, OH]);
    const left = await pixel(drawn.jpeg, 200, OH / 2);
    const right = await pixel(drawn.jpeg, OW - 200, OH / 2);
    // The tinted half is bluer than the plain half; the plain half is the
    // aerial, calmed (less saturated than the green it was).
    expect(left[2] - left[1]).toBeGreaterThan(right[2] - right[1]);
    expect(right[1] - right[0]).toBeLessThan(GREEN.g - GREEN.r);
    expect(drawn.classes.page).toEqual(["sfha"]);
    expect(drawn.classes.full).toEqual(["sfha"]);
    expect(drawn.classes.report).toEqual(["sfha"]);
  });

  it("corrects an overlay FEMA sent at its own 30% — the same picture as one sent as asked", async () => {
    const asked = (await composeFloodFrame(await aerialJpeg(), await overlayPng(SFHA_ALPHA)))!;
    const faint = (await composeFloodFrame(await aerialJpeg(), await overlayPng(Math.round(SFHA_ALPHA * FEMA_LAYER_OPACITY))))!;
    const a = await pixel(asked.jpeg, 200, OH / 2);
    const b = await pixel(faint.jpeg, 200, OH / 2);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(6);
    expect(faint.classes.page).toEqual(["sfha"]);
  });

  it("refuses an overlay at an alpha neither of FEMA's behaviours draws, rather than keeping a look it cannot vouch for", async () => {
    expect(await composeFloodFrame(await aerialJpeg(), await overlayPng(60))).toBeNull();
  });
});

describe("drawFloodFrame — one frame for the aerial and the zones", { timeout: 60_000 }, () => {
  it("asks both for the same ground: the aerial at the frame's pixels, the restyled zones at twice them, POSTed", async () => {
    const f = fetchers();
    const drawn = await drawFloodFrame(LOC, f);
    expect(drawn.classes.page).toEqual(["sfha"]);
    const aerial = new URL(f.seen.aerial[0]);
    expect(aerial.searchParams.get("size")).toBe(`${W},${H}`);
    const form = f.seen.forms[0];
    expect(form.get("bbox")).toBe(aerial.searchParams.get("bbox"));
    expect(form.get("size")).toBe(`${OW},${OH}`);
    expect(form.get("dpi")).toBe(String(96 * FLOOD_FRAME.scale));
    expect(form.get("format")).toBe("png32");
    // Drawn from the runner's copy of FEMA's legend when FEMA's own does
    // not answer: the tints, casings and hatches over every value it lists.
    const layers = JSON.parse(form.get("dynamicLayers")!) as { id: number; source: { mapLayerId: number } }[];
    expect(layers.map((l) => l.id)).toEqual([901, 902, 903]);
    expect(layers[0].source.mapLayerId).toBe(28);
    expect(VENDORED_LEGEND.length).toBeGreaterThanOrEqual(8);
  });
});

describe("ensureFloodFrame — drawn once a deal, kept, and drawn again only when it no longer stands", { timeout: 60_000 }, () => {
  it("stores the frame and records it on the deal's photo cache; the next ask reads it without drawing", async () => {
    const { client, db } = fakeDb({ lat: LOC.lat, lng: LOC.lng });
    const f = fetchers();
    const record = (await ensureFloodFrame(client, "deal-1", LOC, db.photo, { fetchers: f }))!;
    expect(record.v).toBe(FLOOD_FRAME_VERSION);
    expect(record.for).toBe(pointKey(LOC));
    expect(record.path).toMatch(/^flood\/deal-1\/[a-z0-9]+\.jpg$/);
    expect(store.uploads).toEqual([record.path]);
    expect(db.photo?.floodFrame).toEqual(record);
    // The photo cache kept what it held.
    expect(db.photo?.lat).toBe(LOC.lat);
    expect(floodFramePaths(db.photo)).toEqual([record.path]);

    const again = await ensureFloodFrame(client, "deal-1", LOC, db.photo, { fetchers: f });
    expect(again).toEqual(record);
    expect(f.seen.forms).toHaveLength(1);
  });

  it("draws again for a moved deal and removes the frame it replaces", async () => {
    const { client, db } = fakeDb(null);
    const first = (await ensureFloodFrame(client, "deal-2", LOC, db.photo, { fetchers: fetchers() }))!;
    const moved: DealLocation = { lat: 40.744, lng: -74.0324, precision: "street" };
    const second = (await ensureFloodFrame(client, "deal-2", moved, db.photo, { fetchers: fetchers() }))!;
    expect(second.path).not.toBe(first.path);
    expect(second.for).toBe(pointKey(moved));
    expect(store.removed).toEqual([first.path]);
  });

  it("shares one draw among the asks that arrive while it runs, and records nothing when it fails", async () => {
    const { client, db } = fakeDb(null);
    const f = fetchers();
    const [a, b] = await Promise.all([
      ensureFloodFrame(client, "deal-3", LOC, db.photo, { fetchers: f }),
      ensureFloodFrame(client, "deal-3", LOC, db.photo, { fetchers: f }),
    ]);
    expect(a).toEqual(b);
    expect(f.seen.forms).toHaveLength(1);

    const failing = fakeDb(null);
    const broken: FloodFetchers = {
      aerial: async () => aerialJpeg(),
      overlay: async () => {
        throw new Error("FEMA did not answer");
      },
    };
    expect(await ensureFloodFrame(failing.client, "deal-4", LOC, null, { fetchers: broken })).toBeNull();
    expect(failing.db.photo).toBeNull();
  });

  it("answers a caller that stops waiting with nothing, while the draw goes on and is kept", async () => {
    const { client, db } = fakeDb(null);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: FloodFetchers = {
      aerial: async () => aerialJpeg(),
      overlay: async () => {
        await gate;
        return overlayPng(SFHA_ALPHA);
      },
    };
    expect(await ensureFloodFrame(client, "deal-5", LOC, null, { fetchers: slow, waitMs: 20 })).toBeNull();
    release();
    const record = await ensureFloodFrame(client, "deal-5", LOC, null, { fetchers: slow });
    expect(record?.path).toMatch(/^flood\/deal-5\//);
    expect(db.photo?.floodFrame?.path).toBe(record?.path);
  });
});

describe("floodCrop — the frame cut to a surface's shape", { timeout: 60_000 }, () => {
  it("cuts from the centre, and never serves more pixels than the frame holds in that shape", async () => {
    const { client, db } = fakeDb(null);
    const record = (await ensureFloodFrame(client, "deal-6", LOC, db.photo, { fetchers: fetchers() }))!;
    const page = await floodCrop("deal-6", record, 1280, 720);
    expect(await sharp(page).metadata()).toMatchObject({ format: "jpeg", width: 1280, height: 720 });
    const huge = await floodCrop("deal-6", record, 5120, 2880);
    expect(await sharp(huge).metadata()).toMatchObject({ width: OW, height: Math.round((OW * 9) / 16) });
    const whole = await floodCrop("deal-6", record, OW, OH);
    expect(await sharp(whole).metadata()).toMatchObject({ width: OW, height: OH });
  });
});

describe("floodKeyFor — the key under a crop", () => {
  it("lists the classes the crop shows, the building's own first and marked, and never a class it does not show", () => {
    const flood = { zone: "AE", subtype: null, isHighRisk: true };
    expect(floodKeyFor(["floodway", "sfha", "moderate"], flood, VENDORED_LEGEND)).toEqual([
      { key: "sfha", label: "1% annual chance flood hazard", here: true },
      { key: "floodway", label: "Floodway", here: false },
      { key: "moderate", label: "0.2% annual chance flood hazard", here: false },
    ]);
    // The building's zone is not in the crop (Zone X of minimal hazard is
    // never drawn): nothing is marked, nothing added.
    const minimal = { zone: "X", subtype: "AREA OF MINIMAL FLOOD HAZARD", isHighRisk: false };
    expect(floodKeyFor(["moderate"], minimal, VENDORED_LEGEND)).toEqual([
      { key: "moderate", label: "0.2% annual chance flood hazard", here: false },
    ]);
    expect(floodKeyFor([], "unavailable", VENDORED_LEGEND)).toEqual([]);
  });
});

// Keep the palette's alpha in the fixtures honest.
const _check: Rgba = floodStyleOf("sfha").fill;
void _check;
