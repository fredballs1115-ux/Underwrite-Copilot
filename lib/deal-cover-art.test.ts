import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COVER_EDITION, COVER_KINDS, COVER_TONES, SMALL_FRAME_PX, coverImage, coverLayout, coverSvg, type CoverKind, type CoverScene } from "./deal-cover-art";
import { coverFor } from "./deal-cover";
import { imagePlan } from "./imagery-plan";

/** Every frame a surface draws the cover into: a card's, the image route's
 *  default, the email's banner, a list row's square, the avatars, the map's
 *  hover card and the digest's square. */
const FRAMES = [
  [640, 400],
  [800, 450],
  [1040, 520],
  [96, 96],
  [80, 80],
  [64, 64],
  [48, 48],
] as const;

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
/** How many pixels are within `tol` of a colour. */
function count(data: Buffer, hex: string, tol: number): number {
  const [r, g, b] = rgb(hex);
  let n = 0;
  for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol) n += 1;
  return n;
}

describe("the cover as a picture (#443)", () => {
  it("draws every kind under every sky through librsvg: the sky at its top, the ground at its foot, a lamp lit in a window", async () => {
    for (const kind of COVER_KINDS) {
      for (const [tone, t] of COVER_TONES.entries()) {
        const { info, data, at } = await pixels(coverSvg({ kind, tone, variant: 17 * tone + 3 }, 640, 400));
        expect([info.width, info.height]).toEqual([640, 400]);
        // The top right is the sky's own top, far from the sun on the left.
        expect(near(at(638, 1), rgb(t.sky[0]), 12), `${kind} ${tone} sky`).toBe(true);
        // The foot is the ground at its deepest.
        expect(near(at(2, 399), rgb(t.ground[1]), 12), `${kind} ${tone} ground`).toBe(true);
        // The sun is up, and something of the kind's own is lit: a window,
        // or the survey flag on the land.
        expect(count(data, t.sun, 3), `${kind} ${tone} sun`).toBeGreaterThan(200);
        expect(count(data, kind === "land" ? t.accent : t.glow[0], 3), `${kind} ${tone} lit`).toBeGreaterThan(40);
      }
    }
  });

  it("draws at every size a surface asks for, filling the frame to its corners", async () => {
    for (const kind of COVER_KINDS) {
      const tone = COVER_KINDS.indexOf(kind) % COVER_TONES.length;
      const t = COVER_TONES[tone];
      for (const [w, h] of FRAMES) {
        const { info, at } = await pixels(coverSvg({ kind, tone, variant: 5 }, w, h));
        expect([info.width, info.height], `${kind} ${w}x${h}`).toEqual([w, h]);
        // No letterbox and no transparent edge: the corners are the sky and
        // the ground, as the photograph it stands in for would be.
        expect(near(at(w - 1, 0), rgb(t.sky[0]), 16), `${kind} ${w}x${h} sky`).toBe(true);
        expect(near(at(0, h - 1), rgb(t.ground[1]), 16), `${kind} ${w}x${h} ground`).toBe(true);
      }
    }
  });

  /** Forty deals' draws: the forms, the suns and the lit windows they pick. */
  const DRAWS = [0, 4294967295, ...Array.from({ length: 38 }, (_, i) => ((i + 1) * 2654435761) >>> 0)];

  it("stands the building whole in the frame on its horizon, the sun clear of it, the foot kept for a card's words", () => {
    for (const kind of COVER_KINDS) {
      for (const [w, h] of FRAMES) {
        for (const variant of DRAWS) {
          const { small, horizon, building, sun } = coverLayout({ kind, tone: 0, variant }, w, h);
          const at = `${kind} ${w}x${h} ${variant}`;
          expect(small, at).toBe(Math.min(w, h) <= SMALL_FRAME_PX);
          // The smallest card the pipeline draws is 140px tall, and its words
          // begin 37.75px from its foot: 73% of the way down. The horizon
          // is above them on every wide frame.
          if (!small) expect(horizon / h, at).toBeLessThanOrEqual(0.72);
          if (kind === "land") {
            expect(building, at).toBeNull();
            continue;
          }
          expect(building, at).not.toBeNull();
          const b = building!;
          expect(b.x, at).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w, at).toBeLessThanOrEqual(w);
          expect(b.y, at).toBeGreaterThanOrEqual(h * 0.12);
          expect(b.y + b.h, at).toBeCloseTo(horizon, 6);
          // Never sitting on a roofline: on a wide frame the sun is clear of
          // the building, beside it or above it, and clear of the card's call
          // at the top left; on a small one it may be half set behind it.
          const clear = sun.x + sun.r <= b.x || sun.y + sun.r <= b.y;
          if (small) expect(clear || sun.y >= b.y, at).toBe(true);
          else {
            expect(clear, at).toBe(true);
            expect(sun.y - sun.r, at).toBeGreaterThanOrEqual(h * 0.25);
          }
        }
      }
    }
  });

  it("carries no words, no script, no style and nothing from outside; every colour its sky's own", () => {
    for (const kind of COVER_KINDS) {
      for (const [w, h] of [FRAMES[0], FRAMES[3]]) {
        const tone = COVER_KINDS.indexOf(kind) % COVER_TONES.length;
        const svg = coverSvg({ kind, tone, variant: 9 }, w, h);
        expect(svg).not.toMatch(/<text|<script|<style|<image|<foreignObject|<a\b|style=|\son[a-z]+=|xlink:|href="(?!#)|url\((?!#)/i);
        // Colours are literal hex in the attributes, or a gradient of its own.
        for (const m of svg.matchAll(/\b(fill|stroke|stop-color)="([^"]*)"/g)) {
          expect(m[2], `${kind} ${m[0]}`).toMatch(/^(#[0-9a-f]{6}|url\(#[a-z]\)|none)$/);
        }
        const own = new Set([...Object.values(COVER_TONES[tone]).flat(), "#ffffff", "#000000"]);
        for (const hex of svg.match(/#[0-9a-f]{6}/g) ?? []) expect(own.has(hex), `${kind}: ${hex}`).toBe(true);
      }
    }
  });

  it("refuses a sky it does not have and a kind it does not draw, rather than writing either into the document", () => {
    const scene: CoverScene = { kind: "housing", tone: 0, variant: 1 };
    for (const tone of [-1, COVER_TONES.length, 1.5, Number.NaN]) expect(() => coverSvg({ ...scene, tone }, 64, 64)).toThrow();
    expect(() => coverSvg({ ...scene, kind: "castle" as CoverKind }, 64, 64)).toThrow();
    expect(() => coverSvg({ ...scene, kind: '"/><script>' as CoverKind }, 64, 64)).toThrow();
    for (const t of COVER_TONES) for (const c of Object.values(t).flat()) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("draws one cover for one deal, and another deal's details as its own", () => {
    const scene: CoverScene = { kind: "hotel", tone: 3, variant: 41 };
    expect(coverSvg(scene, 640, 400)).toBe(coverSvg(scene, 640, 400));
    // Another draw lights other windows and puts the sun elsewhere.
    expect(coverSvg({ ...scene, variant: 42 }, 640, 400)).not.toBe(coverSvg(scene, 640, 400));
    expect(coverLayout({ ...scene, variant: 42 }, 640, 400).sun).not.toEqual(coverLayout(scene, 640, 400).sun);
    // Another sky is another set of colours.
    expect(coverSvg({ ...scene, tone: 4 }, 640, 400)).toContain(COVER_TONES[4].sky[0]);
    expect(coverSvg({ ...scene, tone: 4 }, 640, 400)).not.toContain(COVER_TONES[3].sky[0]);
    // The eight skies are eight: no two share a sky.
    expect(new Set(COVER_TONES.map((t) => t.sky.join())).size).toBe(COVER_TONES.length);
  });

  it("paints a card with the very document the routes serve, and stays light enough to ride in the page", () => {
    for (const kind of COVER_KINDS) {
      const scene: CoverScene = { kind, tone: 2, variant: 12345 };
      const css = coverImage(scene, 640, 400);
      const m = css.match(/^url\("data:image\/svg\+xml;charset=utf-8,([^"#<>]*)"\)$/);
      expect(m, kind).not.toBeNull();
      expect(decodeURIComponent(m![1])).toBe(coverSvg(scene, 640, 400));
      // A cover inlined in every card of a pipeline: a few kilobytes, the
      // largest form a kind draws included.
      for (const variant of DRAWS) {
        expect(coverSvg({ ...scene, variant }, 640, 400).length, `${kind} ${variant}`).toBeLessThan(6_000);
        expect(coverSvg({ ...scene, variant }, 96, 96).length, `${kind} ${variant}`).toBeLessThan(4_500);
      }
    }
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
  /** the cache each source is handed */
  cacheHanded: [] as unknown[],
  photo: false,
  /** the deal's own photograph, as the row stores it */
  picture: null as Record<string, unknown> | null,
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
  ensureDealPicture: async () => route.picture,
  pictureSizeFor: () => "thumb",
}));
vi.mock("@/lib/imagery", () => ({
  IMAGE_CREDIT: { photo: "Photo", streetview: "Google Street View", aerial: "USGS The National Map (public domain)" },
  GOOGLE_NO_STORE: "private, no-store",
  isGoogleImage: (source: string) => source === "streetview" || source === "satellite",
  fetchBestBuildingImage: async (_s: unknown, _id: string, _a: unknown, cache: unknown, _size: unknown, opts: { overhead?: boolean } = {}) => {
    route.planAsked.push(opts);
    route.cacheHanded.push(cache);
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
    route.cacheHanded = [];
    route.photo = false;
    route.picture = null;
  });

  it("answers the deal's cover where no photograph of the building answers, never an overhead", async () => {
    const res = await ask("w=64&h=64&fallback=cover");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("x-image-source")).toBe("cover");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(route.planAsked).toEqual([{ overhead: false, google: true }]);
    const svg = await res.text();
    // The class the deck turned out to be, where the deal was filed "auto";
    // the sky and the draw the pipeline's card wears for the same deal.
    const cover = coverFor({ seed: "d1", assetClass: "self_storage" });
    expect(cover.kind).toBe("storage");
    expect(svg).toBe(coverSvg(cover, 64, 64));
    const { info } = await pixels(svg);
    expect([info.width, info.height]).toEqual([64, 64]);
  });

  it("sends a browser holding an earlier edition of the drawing this one, and today's a 304", async () => {
    const etag = (await ask("w=64&h=64&fallback=cover")).headers.get("etag") ?? "";
    expect(etag).toContain(`:cover${COVER_EDITION}"`);
    const again = (tag: string) =>
      GET(new Request("http://x/api/deals/d1/image?w=64&h=64&fallback=cover", { headers: { "if-none-match": tag } }), {
        params: Promise.resolve({ id: "d1" }),
      });
    expect((await again(etag)).status).toBe(304);
    // The line drawing's own validator, from the day this edition ships.
    const earlier = etag.replace(`:cover${COVER_EDITION}"`, ':cover"');
    const res = await again(earlier);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(coverSvg(coverFor({ seed: "d1", assetClass: "self_storage" }), 64, 64));
  });

  it("still leads with the building's photograph when one answers", async () => {
    route.photo = true;
    const res = await ask("w=64&h=64&fallback=cover");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-image-source")).toBe("streetview");
    // Google's photograph is never kept, and has no validator to keep it by.
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("etag")).toBeNull();
  });

  it("keeps the overheads, and its 404, for a caller that does not ask for the cover", async () => {
    const res = await ask("w=640&h=360");
    expect(res.status).toBe(404);
    expect(route.planAsked).toEqual([{ overhead: true, google: true }]);
  });

  it("asks no Google source for a surface beside a non-Google map, under a validator of its own", async () => {
    // The pipeline map's hover card and every deal avatar: Google's terms
    // forbid Street View beside a non-Google map.
    const res = await ask("w=64&h=64&fallback=cover&google=0");
    expect(res.status).toBe(200);
    expect(route.planAsked).toEqual([{ overhead: false, google: false }]);
    const mine = res.headers.get("etag") ?? "";
    const theirs = (await ask("w=64&h=64&fallback=cover")).headers.get("etag") ?? "";
    expect(mine).toContain(":nog");
    expect(mine).not.toBe(theirs);
  });

  it("answers a deal the caller cannot read with a 404, never a cover", async () => {
    route.row = null;
    expect((await ask("w=64&h=64&fallback=cover")).status).toBe(404);
  });

  it("puts nothing from the stored row in its validator that is not a stored path or a stamp (research pass 22)", async () => {
    // deals.photo is the deal owner's to write: a line break in the stored
    // path, or in the geocode stamp, had made the route answer 500.
    const own = { hero: "photos/d1/1-hero.jpg", thumb: "photos/d1/1-thumb.jpg", source: "om" };
    route.picture = { ...own, thumb: "photos/d1/1-thumb.jpg\r\nX: y" };
    route.row = { ...route.row!, photo: { picture: route.picture, geoAt: "2026-10-01T00:00:00Z\nX: y" } };
    const res = await ask("w=64&h=64&fallback=cover");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-image-source")).toBe("cover");
    expect(res.headers.get("etag")).toMatch(/^W\/"map::\d{4}-\d{2}-\d{2}:64x64:cover\d+"$/);
    // …and the picture whose path is not this deal's is no picture of it.
    expect((route.cacheHanded[0] as { picture?: unknown }).picture).toBeUndefined();
    // The deal's own photograph and stamp still make the validator.
    route.picture = own;
    route.row = { ...route.row!, photo: { picture: own, geoAt: "2026-10-01T00:00:00.000Z" } };
    expect((await ask("w=64&h=64&fallback=cover")).headers.get("etag")).toBe(`W/"photos/d1/1-thumb.jpg"`);
    route.picture = null;
    expect((await ask("w=64&h=64&fallback=cover")).headers.get("etag")).toMatch(/^W\/"map:2026-10-01T00:00:00\.000Z:/);
  });
});
