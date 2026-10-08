/**
 * The flood route's cuts (research pass 39): a size no page asks for is the
 * listed crop nearest it, each crop is cut once a process and kept, and no
 * more than two are cut at once. Driven through the route itself, with the
 * session, the deal's row and the bucket faked and the pixels real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));

const DEAL = "11111111-2222-4333-8444-555555555555";
const FRAME_PATH = `flood/${DEAL}/abc123.jpg`;

const state = vi.hoisted(() => ({
  frame: null as Buffer | null,
  downloads: 0,
  deal: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/storage", () => ({
  downloadDealFile: async () => {
    state.downloads++;
    return state.frame!;
  },
  uploadDealPhoto: async () => {},
  removeStorageFiles: async () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "owner" }),
  createSupabaseServerClient: async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: state.deal, error: null }),
      };
      return q;
    },
  }),
}));

import sharp from "sharp";
import { GET } from "@/app/api/deals/[id]/flood/route";
import { FLOOD_CROP_IN_FLIGHT, MAX_HELD_FLOOD_CROPS, floodCropsMade, forgetFloodCrops } from "./flood-map";
import { FLOOD_FRAME, FLOOD_FRAME_VERSION, pointKey } from "./flood-frame-core";
import { GEO_VERSION, geoKey } from "./deal-location";
import { FLOOD_FRAMES, FLOOD_REPORT, FLOOD_STRIP, FLOOD_VIEW, FLOOD_VIEW_2X, FLOOD_VIEWER, nearestFrame } from "./image-frames";
import { REPORT_FLOOD_SIZE } from "./basemaps";

const W = FLOOD_FRAME.width * FLOOD_FRAME.scale;
const H = FLOOD_FRAME.height * FLOOD_FRAME.scale;
const POINT = { lat: 39.9526, lng: -75.1652 };
const ADDRESS = { label: "1 Main St, Philadelphia, PA 19103", street: "1 Main St", city: "Philadelphia", state: "PA", zip: "19103" };

const ask = (query: string) =>
  GET(new Request(`https://underwrite.example/api/deals/${DEAL}/flood?v=1.x${query}`), { params: Promise.resolve({ id: DEAL }) });

async function size(res: Response): Promise<{ width?: number; height?: number }> {
  expect(res.status).toBe(200);
  return sharp(Buffer.from(await res.arrayBuffer())).metadata();
}

beforeEach(async () => {
  forgetFloodCrops();
  state.downloads = 0;
  state.frame ??= await sharp({ create: { width: W, height: H, channels: 3, background: { r: 60, g: 110, b: 60 } } })
    .jpeg({ quality: 85 })
    .toBuffer();
  state.deal = {
    id: DEAL,
    address: ADDRESS,
    photo: {
      geoAt: new Date().toISOString(),
      geoV: GEO_VERSION,
      geoFor: geoKey(ADDRESS as never),
      lat: POINT.lat,
      lng: POINT.lng,
      geoPrecision: "street",
      floodFrame: {
        v: FLOOD_FRAME_VERSION,
        path: FRAME_PATH,
        at: new Date().toISOString(),
        for: pointKey(POINT),
        width: W,
        height: H,
        classes: { page: [], full: [], report: [] },
      },
    },
  };
});

describe("the crops the site asks the flood frame for, and no others", () => {
  it("are the page's, the viewer's and the report's, read off the code that asks for them", () => {
    expect(FLOOD_VIEW).toEqual({ w: 1280, h: 720 });
    expect(FLOOD_VIEW_2X).toEqual({ w: 2560, h: 1440 });
    expect(FLOOD_STRIP).toEqual({ w: 192, h: 108 });
    expect(FLOOD_VIEWER).toEqual({ w: W, h: H });
    expect(FLOOD_REPORT).toEqual({ w: REPORT_FLOOD_SIZE.width * 2, h: REPORT_FLOOD_SIZE.height * 2 });
    // Each is a size the stored frame can give whole: nothing is stretched.
    for (const f of FLOOD_FRAMES) expect(f.w <= W && f.h <= H, `${f.w}x${f.h}`).toBe(true);
  });

  it("snap any other size to the listed crop nearest it", () => {
    expect(nearestFrame(FLOOD_FRAMES, 2559, 1919, FLOOD_VIEW)).toEqual(FLOOD_VIEWER);
    expect(nearestFrame(FLOOD_FRAMES, 2000, 1500, FLOOD_VIEW)).toEqual(FLOOD_VIEW_2X);
    expect(nearestFrame(FLOOD_FRAMES, 48, 48, FLOOD_VIEW)).toEqual(FLOOD_STRIP);
    expect(nearestFrame(FLOOD_FRAMES, null, null, FLOOD_VIEW)).toEqual(FLOOD_VIEW);
  });
});

describe("GET /api/deals/[id]/flood", { timeout: 60_000 }, () => {
  it("answers a size no page asks for at the nearest crop the pages do", async () => {
    expect(await size(await ask("&w=2559&h=1919"))).toMatchObject({ width: FLOOD_VIEWER.w, height: FLOOD_VIEWER.h });
    expect(await size(await ask("&w=1999&h=1499"))).toMatchObject({ width: FLOOD_VIEW_2X.w, height: FLOOD_VIEW_2X.h });
    expect(await size(await ask(""))).toMatchObject({ width: FLOOD_VIEW.w, height: FLOOD_VIEW.h });
    expect(floodCropsMade().count).toBe(3);
  });

  it("cuts a size once: a second ask of it, or of any size that snaps to it, makes nothing", async () => {
    expect(await size(await ask(`&w=${FLOOD_VIEW.w}&h=${FLOOD_VIEW.h}`))).toMatchObject({ width: FLOOD_VIEW.w });
    expect(floodCropsMade().count).toBe(1);
    expect(await size(await ask(`&w=${FLOOD_VIEW.w}&h=${FLOOD_VIEW.h}`))).toMatchObject({ width: FLOOD_VIEW.w });
    expect(await size(await ask("&w=1279&h=721"))).toMatchObject({ width: FLOOD_VIEW.w });
    expect(floodCropsMade().count).toBe(1);
    expect(state.downloads).toBeLessThanOrEqual(1);
  });

  it("shares one cut among the asks that arrive while it is made", async () => {
    const answers = await Promise.all(Array.from({ length: 6 }, (_, i) => ask(`&w=${2560 - i}&h=${1920 - i}`)));
    for (const res of answers) expect(res.status).toBe(200);
    expect(floodCropsMade().count).toBe(1);
  });

  it("makes no more than two cuts at once, however many sizes are asked together", async () => {
    const answers = await Promise.all(FLOOD_FRAMES.map((f) => ask(`&w=${f.w}&h=${f.h}`)));
    for (const res of answers) expect(res.status).toBe(200);
    expect(floodCropsMade()).toEqual({ count: FLOOD_FRAMES.length, mostAtOnce: FLOOD_CROP_IN_FLIGHT });
  });

  it("keeps a bounded number of cuts, room for every crop of a few deals", () => {
    expect(MAX_HELD_FLOOD_CROPS).toBeGreaterThanOrEqual(FLOOD_FRAMES.length * 4);
  });
});
