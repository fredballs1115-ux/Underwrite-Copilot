/**
 * The frames the signed-in deal aerial and best-picture routes draw
 * (research pass 22): a typed size is the listed frame nearest it, every
 * frame a page asks for is listed — so no existing caller's picture moves —
 * and the pages build their URLs from the same constants. The routes are
 * driven with their reads faked: the session, the deal row and the sources.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const asked = vi.hoisted(() => ({ sizes: [] as { width: number; height: number }[] }));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "d1",
              address: { label: "1 Main St, Philadelphia, PA 19106", street: "1 Main St", city: "Philadelphia", state: "PA" },
              photo: null,
              om_storage_path: null,
              is_sample: false,
              asset_class: "multifamily",
              extracted_class: null,
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/imagery", () => {
  const answer = (size: { width: number; height: number }) => {
    asked.sizes.push({ width: size.width, height: size.height });
    return { source: "aerial", response: new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } }) };
  };
  return {
    IMAGE_CREDIT: { photo: "Photo", streetview: "Google Street View", aerial: "USGS The National Map", satellite: "Google" },
    GOOGLE_NO_STORE: "private, no-store",
    isGoogleImage: (source: string) => source === "streetview" || source === "satellite",
    fetchOneImage: async (_src: string, _s: unknown, _id: string, _a: unknown, _c: unknown, size: { width: number; height: number }) => answer(size),
    fetchBestAerialImage: async (_s: unknown, _id: string, _a: unknown, _c: unknown, size: { width: number; height: number }) => answer(size),
    fetchBestBuildingImage: async (_s: unknown, _id: string, _a: unknown, _c: unknown, size: { width: number; height: number }) => answer(size),
  };
});
vi.mock("@/lib/deal-picture", () => ({
  PICTURE_CREDIT: { om: "From the offering memorandum", upload: "Photograph added to the deal" },
  SEARCH_WAIT_MS: 0,
  ensureDealPicture: async () => null,
  pictureSizeFor: () => "hero",
}));

import { GET as aerialRoute } from "@/app/api/deals/[id]/aerial/route";
import { GET as imageRoute } from "@/app/api/deals/[id]/image/route";
import { DealAvatar } from "@/app/(app)/deal-avatar";
import {
  DEAL_AERIAL_FRAMES,
  DEAL_AERIAL_VIEW,
  DEAL_AERIAL_VIEWER,
  DEAL_IMAGE_FRAMES,
  nearestFrame,
  type PixelFrame,
} from "./image-frames";
import { BANNER, CARD, THUMB, bannerSources } from "./deal-banner";
import { tooltipHtml } from "./pipeline-map";

const key = (f: { w: number; h: number }) => `${f.w}x${f.h}`;
const listed = (frames: readonly PixelFrame[]) => new Set(frames.map(key));
/** The w and h a URL asks for. */
const sizeOf = (url: string) => {
  const q = new URL(url.replace(/&amp;/g, "&"), "http://x").searchParams;
  return { w: Number(q.get("w")), h: Number(q.get("h")) };
};

const TYPED: [string | null, string | null][] = [
  ["301", "177"],
  ["1279", "575"],
  ["5000", "5000"],
  ["48", "48"],
  ["1", "1"],
  ["abc", "-4"],
  [null, null],
  ["70", null],
];

describe("each route's frames", () => {
  it.each([
    ["the aerial", DEAL_AERIAL_FRAMES],
    ["the best picture", DEAL_IMAGE_FRAMES],
  ])("%s: a listed frame is itself, so no caller's picture moves, and a typed size is the nearest listed one", (_name, frames) => {
    for (const f of frames) expect(nearestFrame(frames, f.w, f.h)).toBe(f);
    for (const [w, h] of TYPED) expect(listed(frames).has(key(nearestFrame(frames, w, h))), `${w}×${h}`).toBe(true);
  });
});

describe("the URLs the pages build ask for listed frames, the same as before", () => {
  it("a card's overhead, at every frame lib/deal-banner is handed", () => {
    for (const frame of [BANNER, CARD, THUMB]) {
      const aerial = bannerSources({ dealId: "d1", pictureCredit: null, googleEnabled: false, hasStreetAddress: true, hasAddress: true }, frame).find(
        (s) => s.kind === "aerial",
      )!;
      expect(sizeOf(aerial.src)).toEqual({ w: frame.w, h: frame.h });
      expect(listed(DEAL_AERIAL_FRAMES).has(key(frame))).toBe(true);
    }
    expect([BANNER, CARD, THUMB].map(key)).toEqual(["640x360", "720x450", "168x168"]);
  });

  it("the deal page's overheads: lib/image-frames' own constants, at the sizes they always were", () => {
    expect([DEAL_AERIAL_VIEW, DEAL_AERIAL_VIEWER].map(key)).toEqual(["1280x576", "1280x960"]);
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/property-visual.tsx"), "utf8");
    expect(src).toMatch(/import \{ DEAL_AERIAL_VIEW, DEAL_AERIAL_VIEWER \} from "@\/lib\/image-frames";/);
    expect(src).toContain("const AERIAL = DEAL_AERIAL_VIEW;");
    expect(src).toContain("const VIEWER = DEAL_AERIAL_VIEWER;");
    for (const m of src.matchAll(/\/aerial\?src=[a-z]+&w=\$\{([A-Z_]+)\.w\}&h=\$\{([A-Z_]+)\.h\}/g)) {
      expect(["AERIAL", "VIEWER"]).toContain(m[1]);
      expect(m[2]).toBe(m[1]);
    }
  });

  it("a deal's avatar and the pipeline map's card", () => {
    for (const size of ["sm", "md"] as const) {
      const html = renderToStaticMarkup(createElement(DealAvatar, { dealId: "d1", size }));
      const src = /src="([^"]+)"/.exec(html)![1];
      const { w, h } = sizeOf(src);
      expect({ w, h }).toEqual(size === "sm" ? { w: 64, h: 64 } : { w: 80, h: 80 });
      expect(listed(DEAL_IMAGE_FRAMES).has(key({ w, h }))).toBe(true);
    }
    const tip = tooltipHtml({ id: "d1", name: "The Maddox", verdict: "pass", price: null, figure: null } as never);
    const src = /src="([^"]+)"/.exec(tip)![1];
    expect(sizeOf(src)).toEqual({ w: 96, h: 96 });
    expect(listed(DEAL_IMAGE_FRAMES).has(key(sizeOf(src)))).toBe(true);
  });

  it("no source asks either route for a size typed as a number", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(join(process.cwd(), "app"));
    walk(join(process.cwd(), "lib"));
    const typed = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/\/api\/deals\/\$\{[^}]+\}\/(?:aerial|image)\?[^`"']*?\b[wh]=\d/g)].map((m) => `${f}: ${m[0]}`),
    );
    expect(typed).toEqual([]);
  });
});

describe("the routes draw a typed size at the nearest listed frame", () => {
  beforeEach(() => {
    asked.sizes = [];
  });
  const get = (route: typeof aerialRoute, path: string) =>
    route(new Request(`http://x/api/deals/d1/${path}`), { params: Promise.resolve({ id: "d1" }) });

  it("/api/deals/[id]/aerial", async () => {
    for (const [w, h] of TYPED) {
      const q = [w === null ? "" : `w=${w}`, h === null ? "" : `h=${h}`].filter(Boolean).join("&");
      expect((await get(aerialRoute, `aerial?src=usgs&${q}`)).status).toBe(200);
      expect((await get(aerialRoute, `aerial?${q}`)).status).toBe(200);
    }
    expect(asked.sizes.every((s) => listed(DEAL_AERIAL_FRAMES).has(key({ w: s.width, h: s.height })))).toBe(true);
    // The deal page's own sizes are drawn as asked.
    asked.sizes = [];
    await get(aerialRoute, "aerial?src=usgs&w=1280&h=576");
    await get(aerialRoute, "aerial?src=satellite&w=1280&h=960");
    await get(aerialRoute, "aerial?src=usgs&w=640&h=360");
    expect(asked.sizes).toEqual([
      { width: 1280, height: 576 },
      { width: 1280, height: 960 },
      { width: 640, height: 360 },
    ]);
  });

  it("/api/deals/[id]/image", async () => {
    for (const [w, h] of TYPED) {
      const q = [w === null ? "" : `w=${w}`, h === null ? "" : `h=${h}`].filter(Boolean).join("&");
      expect((await get(imageRoute, `image?${q}&fallback=cover`)).status).toBe(200);
    }
    expect(asked.sizes.every((s) => listed(DEAL_IMAGE_FRAMES).has(key({ w: s.width, h: s.height })))).toBe(true);
    asked.sizes = [];
    for (const n of [64, 80, 96]) await get(imageRoute, `image?w=${n}&h=${n}&fallback=cover`);
    expect(asked.sizes).toEqual([
      { width: 64, height: 64 },
      { width: 80, height: 80 },
      { width: 96, height: 96 },
    ]);
  });
});
