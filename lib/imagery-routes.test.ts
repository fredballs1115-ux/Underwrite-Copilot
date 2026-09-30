/**
 * The public imagery routes and the link preview's card, driven with the
 * network faked. An id is read against the site's own tables, so one that
 * names what every object inherits ("constructor", "__proto__") is a 404
 * that asks nobody for anything — never a photograph with no file, or a 500.
 * And a size is one the site's own pages ask for (the security review of
 * 2026-09-30): any other is snapped to the nearest, so a public route cannot
 * be made to fetch and draw a new picture per request.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as skylineRoute } from "@/app/api/imagery/skyline/[id]/route";
import { GET as metroRoute } from "@/app/api/imagery/metro/[id]/route";
import { GET as ogRoute } from "@/app/api/og/market/[id]/route";
import { forgetSkylinePhotos } from "./skyline-fetch";
import { forgetOverheads } from "./metro-overhead";
import { OG_CARD, OG_PHOTO_WIDTH, forgetCards } from "./og-card";
import { METRO_FRAMES } from "./metro-imagery";
import { SKYLINES, SKYLINE_SRCSET, SKYLINE_WIDTHS } from "./skyline";
import { marketPhotoWidth } from "./market-picture";
import { HERO_AERIAL } from "./photos";

type Route = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const net = { answer: "fail" as "fail" | "image", urls: [] as string[] };
let picture: Buffer | undefined;
// next/og loads its own wasm through fetch (a file: URL): that goes through.
const realFetch = globalThis.fetch;
const fetcher = vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
  if (!/^https?:/.test(String(url))) return realFetch(url, init);
  net.urls.push(String(url));
  if (net.answer === "fail" || !picture) return new Response(null, { status: 500 });
  return new Response(new Uint8Array(picture), { headers: { "content-type": "image/jpeg" } });
});

beforeEach(async () => {
  picture ??= await sharp({ create: { width: 64, height: 48, channels: 3, background: "#6a8aa0" } }).jpeg().toBuffer();
  net.answer = "fail";
  net.urls.length = 0;
  fetcher.mockClear();
  forgetSkylinePhotos();
  forgetOverheads();
  forgetCards();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

const ask = (route: Route, url: string, id: string) =>
  route(new Request(`http://site.test${url}`), { params: Promise.resolve({ id }) });

describe("an id off the URL that names an inherited property", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "%s is no market to the skyline, the overhead or the card, and nothing is fetched",
    async (id) => {
      expect((await ask(skylineRoute, `/api/imagery/skyline/${id}?w=1600`, id)).status).toBe(404);
      expect((await ask(metroRoute, `/api/imagery/metro/${id}?w=480&h=360`, id)).status).toBe(404);
      expect((await ask(ogRoute, `/api/og/market/${id}`, id)).status).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});

describe("a size off the URL", () => {
  it("is served at the nearest width the pages ask for, and a width typed twice is one fetch", async () => {
    net.answer = "image";
    const a = await ask(skylineRoute, "/api/imagery/skyline/chicago?w=1234", "chicago");
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toMatch(/^image\//);
    expect((await ask(skylineRoute, "/api/imagery/skyline/chicago?w=1333&v=x", "chicago")).status).toBe(200);
    expect((await ask(skylineRoute, "/api/imagery/skyline/chicago", "chicago")).status).toBe(200);
    expect(net.urls.map((u) => new URL(u).searchParams.get("width"))).toEqual(["1400", "1600"]);
  });

  it("draws an overhead at the nearest frame the pages ask for", async () => {
    net.answer = "image";
    expect((await ask(metroRoute, "/api/imagery/metro/montgomery_county?w=5000&h=5000", "montgomery_county")).status).toBe(200);
    expect((await ask(metroRoute, "/api/imagery/metro/montgomery_county?w=1601&h=899", "montgomery_county")).status).toBe(200);
    expect((await ask(metroRoute, "/api/imagery/metro/montgomery_county", "montgomery_county")).status).toBe(200);
    expect(net.urls.map((u) => new URL(u).searchParams.get("size"))).toEqual(["1600,900", "480,360"]);
  });

  it("the link preview's card is drawn once and kept", async () => {
    net.answer = "image";
    const first = await ask(ogRoute, "/api/og/market/pittsburgh", "pittsburgh");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    const asked = net.urls.length;
    expect(asked).toBe(1);
    const again = await ask(ogRoute, "/api/og/market/pittsburgh", "pittsburgh");
    expect(again.status).toBe(200);
    expect(Buffer.from(await again.arrayBuffer()).equals(Buffer.from(await first.arrayBuffer()))).toBe(true);
    expect(net.urls.length).toBe(asked);
  }, 30_000);
});

// ── The sizes the pages ask for are the sizes the routes serve ──────────────

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("the sizes the site's pages ask the imagery routes for", () => {
  const files = sources(join(process.cwd(), "app")).map((f) => readFileSync(f, "utf8"));
  const elements = (tag: string) => files.flatMap((s) => [...s.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?\\/>`, "g"))].map((m) => m[0]));
  const num = (el: string, prop: string) => {
    const m = new RegExp(`\\b${prop}=\\{(\\d+)\\}`).exec(el);
    return m ? Number(m[1]) : null;
  };

  // PlaceBackdrop hands its `height` to CityPhoto: each caller's, else its
  // default.
  const bandSource = readFileSync(join(process.cwd(), "app/place-band.tsx"), "utf8");
  const bandDefault = Number(/export function PlaceBackdrop\(\{[\s\S]*?height = (\d+),/.exec(bandSource)?.[1]);
  const bandHeights = elements("PlaceBackdrop").map((el) =>
    /\bheight=\{HERO_AERIAL\.height\}/.test(el) ? HERO_AERIAL.height : (num(el, "height") ?? bandDefault),
  );

  // Every CityPhoto: its width and height, and — where it offers a srcset —
  // twice them within 1600, as CityPhoto's own rule draws an overhead's 2x.
  const asks = elements("CityPhoto").flatMap((el) => {
    const width = num(el, "width");
    const heights = /\bheight=\{height\}/.test(el) ? bandHeights : [num(el, "height")];
    const sized = /\bsizes=/.test(el);
    return heights.map((height) => ({ width, height, sized }));
  });

  it("finds the pages' pictures", () => {
    expect(bandDefault).toBeGreaterThan(0);
    expect(bandHeights.length).toBeGreaterThanOrEqual(5);
    expect(asks.length).toBeGreaterThanOrEqual(7);
    for (const a of asks) {
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
    }
  });

  it("asks the overhead route only for frames it draws as asked", () => {
    const listed = new Set(METRO_FRAMES.map((f) => f.join("x")));
    for (const { width, height, sized } of asks) {
      expect(listed.has(`${width}x${height}`), `${width}x${height}`).toBe(true);
      if (sized && width! * 2 <= 1600 && height! * 2 <= 1600) {
        expect(listed.has(`${width! * 2}x${height! * 2}`), `${width! * 2}x${height! * 2}`).toBe(true);
      }
    }
    // The link preview's card, and the frame live-verify's AERIALS probe asks for.
    expect(listed.has(`${OG_CARD.width}x${OG_CARD.height}`)).toBe(true);
    expect(listed.has("1600x900")).toBe(true);
  });

  it("asks the skyline route only for widths it serves as asked", () => {
    const widths = [
      ...asks.map((a) => a.width!),
      ...SKYLINE_SRCSET,
      ...Object.values(SKYLINES).map((shot) => marketPhotoWidth(shot)),
      OG_PHOTO_WIDTH,
    ];
    for (const w of widths) expect(SKYLINE_WIDTHS, String(w)).toContain(w);
  });
});
