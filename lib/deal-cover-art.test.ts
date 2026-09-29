import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COVER_ART, coverBackground, coverSvg, type CoverKind } from "./deal-cover-art";
import { COVER_TONES, coverFor } from "./deal-cover";
import { imagePlan } from "./imagery-plan";

const KINDS = Object.keys(COVER_ART) as CoverKind[];

/** The cover drawn for real — librsvg, through sharp — so a document a
 *  browser could not read fails here rather than as a broken image. */
async function pixels(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { info, data, at };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe("the cover as a picture (#443)", () => {
  it("draws every kind at the size asked, the ground light to dark and the drawing in white", async () => {
    for (const kind of KINDS) {
      const tone = COVER_TONES[KINDS.indexOf(kind) % COVER_TONES.length];
      const { info, data, at } = await pixels(coverSvg(kind, tone, 96, 96));
      expect([info.width, info.height], kind).toEqual([96, 96]);
      // The corners are the gradient's ends, the drawing well inside them.
      expect(near(at(2, 2), rgb(tone[0]), 40), `${kind} top left`).toBe(true);
      expect(near(at(93, 93), rgb(tone[1]), 24), `${kind} bottom right`).toBe(true);
      // The drawing is there: pixels far lighter than any ground pixel.
      let lit = 0;
      for (let i = 0; i < data.length; i += 3) if (data[i] + data[i + 1] + data[i + 2] > 3 * 170) lit += 1;
      expect(lit, kind).toBeGreaterThan(60);
    }
  });

  it("fills a frame of any shape, as the photograph it stands in for would", async () => {
    const tone = COVER_TONES[0];
    const { info, at } = await pixels(coverSvg("office", tone, 160, 90));
    expect([info.width, info.height]).toEqual([160, 90]);
    // No letterbox: the far corners are the ground, not transparent black.
    expect(at(0, 0).some((v) => v > 20)).toBe(true);
    expect(at(159, 89).some((v) => v > 5)).toBe(true);
  });

  it("carries no words, no script and no style, and refuses a tone that is not a colour", () => {
    for (const kind of KINDS) {
      const svg = coverSvg(kind, COVER_TONES[1], 64, 64);
      expect(svg).not.toMatch(/<text|<script|<style|on[a-z]+=|href=/i);
      expect(svg).toContain(COVER_ART[kind]);
    }
    expect(() => coverSvg("housing", ["red", "#000000"], 64, 64)).toThrow();
    expect(() => coverSvg("housing", ['#000000"/><script>', "#000000"], 64, 64)).toThrow();
  });

  it("paints the same ground the card does", () => {
    expect(coverBackground(["#1f5f5b", "#0b2e2c"])).toContain("linear-gradient(140deg, #1f5f5b, #0b2e2c)");
  });

  it("leaves the overheads out of the plan where the caller asks for photographs only", () => {
    expect(imagePlan({ hasStreetAddress: true, googleConfigured: true, hasPicture: true, overhead: false })).toEqual([
      "photo",
      "streetview",
    ]);
    expect(imagePlan({ hasStreetAddress: true, googleConfigured: false, overhead: false })).toEqual([]);
    // Unsaid, every caller keeps the overheads, as before.
    expect(imagePlan({ hasStreetAddress: false, googleConfigured: false })).toEqual(["aerial"]);
  });
});

// The route, with its reads faked: who asks, what the deal row holds, and
// what the picture sources answer.
const route = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  planAsked: [] as { overhead?: boolean }[],
  photo: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: route.row }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/deal-picture", () => ({
  PICTURE_CREDIT: { om: "From the offering memorandum", upload: "Photograph added to the deal" },
  SEARCH_WAIT_MS: 0,
  ensureDealPicture: async () => null,
  pictureSizeFor: () => "thumb",
}));
vi.mock("@/lib/imagery", () => ({
  IMAGE_CREDIT: { photo: "Photo", streetview: "Google Street View", aerial: "USGS The National Map (public domain)" },
  fetchBestBuildingImage: async (_s: unknown, _id: string, _a: unknown, _c: unknown, _size: unknown, opts: { overhead?: boolean } = {}) => {
    route.planAsked.push(opts);
    if (!route.photo) return null;
    return {
      source: "streetview",
      response: new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } }),
    };
  },
}));

import { GET } from "@/app/api/deals/[id]/image/route";

const ask = (query: string) =>
  GET(new Request(`http://x/api/deals/d1/image?${query}`), { params: Promise.resolve({ id: "d1" }) });

describe("the image route's cover (#443)", () => {
  beforeEach(() => {
    route.row = { id: "d1", address: { label: "Waco, TX", city: "Waco", state: "TX" }, photo: null, om_storage_path: null, is_sample: false, asset_class: "auto", extracted_class: "Self-storage facility" };
    route.planAsked = [];
    route.photo = false;
  });

  it("answers the deal's cover where no photograph of the building answers, never an overhead", async () => {
    const res = await ask("w=64&h=64&fallback=cover");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("x-image-source")).toBe("cover");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(route.planAsked).toEqual([{ overhead: false }]);
    const svg = await res.text();
    // The class the deck turned out to be, where the deal was filed "auto";
    // the gradient the pipeline's card wears for the same deal.
    const cover = coverFor({ seed: "d1", assetClass: "self_storage" });
    expect(cover.kind).toBe("storage");
    expect(svg).toContain(COVER_ART.storage);
    expect(svg).toContain(cover.tone[0]);
    const { info } = await pixels(svg);
    expect([info.width, info.height]).toEqual([64, 64]);
  });

  it("still leads with the building's photograph when one answers", async () => {
    route.photo = true;
    const res = await ask("w=64&h=64&fallback=cover");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-image-source")).toBe("streetview");
  });

  it("keeps the overheads, and its 404, for a caller that does not ask for the cover", async () => {
    const res = await ask("w=640&h=360");
    expect(res.status).toBe(404);
    expect(route.planAsked).toEqual([{ overhead: true }]);
  });

  it("answers a deal the caller cannot read with a 404, never a cover", async () => {
    route.row = null;
    expect((await ask("w=64&h=64&fallback=cover")).status).toBe(404);
  });
});
