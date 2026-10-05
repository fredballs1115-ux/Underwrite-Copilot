/**
 * What deals.photo puts in a picture route's headers (research pass 22). The
 * column is the deal owner's to write, and the deal picture route printed a
 * gallery photograph's `page` into its `x-image-credit` header and the
 * stored path into its validator: a line break in either made the route
 * answer 500. A page is printed only as a whole page number a memorandum
 * the site reads can have (`galleryPage`), and a path only where it is this
 * deal's own photograph file. Driven through the real route and the real
 * lib/deal-picture, with the session and storage faked.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture } from "./deal-location";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  reads: [] as string[],
  bytes: Buffer.alloc(0) as Buffer,
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (_k: string, id: string) => ({
          maybeSingle: async () => ({ data: state.row && state.row.id === id ? state.row : null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/storage", () => ({
  dealPhotoPath: (dealId: string, stamp: string, size: string) => `photos/${dealId}/${stamp}-${size}.jpg`,
  downloadDealFile: async (path: string) => {
    state.reads.push(path);
    return state.bytes;
  },
  downloadOmPdf: async () => {
    throw new Error("no memorandum here");
  },
  uploadDealPhoto: async () => {},
  removeStorageFiles: async () => {},
}));

import { GET } from "@/app/api/deals/[id]/picture/route";
import { galleryPage, memorandumPhotoCredit } from "./deal-picture";
import { MAX_OM_PAGES } from "./pdf";

const photo = (stamp: string, page?: unknown): DealPicture =>
  ({
    hero: `photos/${DEAL}/${stamp}-hero.jpg`,
    thumb: `photos/${DEAL}/${stamp}-thumb.jpg`,
    width: 1600,
    height: 1067,
    source: "om",
    at: "2026-09-01T00:00:00Z",
    ...(page === undefined ? {} : { page }),
  }) as DealPicture;

const ask = (query: string) =>
  GET(new Request(`http://x/api/deals/${DEAL}/picture?${query}`), { params: Promise.resolve({ id: DEAL }) });

beforeEach(async () => {
  state.reads = [];
  state.bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#806040" } }).jpeg().toBuffer();
});

describe("a gallery photograph's page, as a credit prints it", () => {
  it("is a whole page number a memorandum the site reads can have, else none", () => {
    expect([1, 7, MAX_OM_PAGES].map(galleryPage)).toEqual([1, 7, MAX_OM_PAGES]);
    for (const bad of [0, -3, 7.5, MAX_OM_PAGES + 1, 1e12, Number.NaN, Number.POSITIVE_INFINITY, "7", "7\r\nSet-Cookie: a=b", null, undefined, {}, [7]]) {
      expect(galleryPage(bad), String(bad)).toBeNull();
      expect(memorandumPhotoCredit(bad)).toBe("From the offering memorandum");
    }
    expect(memorandumPhotoCredit(7)).toBe("From the offering memorandum, page 7");
  });
});

describe("GET /api/deals/[id]/picture?g=N — what the stored row puts in its headers", () => {
  it("credits a gallery photograph with its page", async () => {
    state.row = { id: DEAL, photo: { picture: photo("1"), gallery: [photo("2", 7)] }, om_storage_path: null, is_sample: false };
    const res = await ask("size=hero&g=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-image-credit")).toBe("From the offering memorandum, page 7");
    expect(res.headers.get("etag")).toBe(`W/"photos/${DEAL}/2-hero.jpg"`);
  });

  it("answers a page that is no page number with the plain credit, never a 500", async () => {
    for (const page of ["7\r\nSet-Cookie: a=b", "7\n", 7.5, -1, MAX_OM_PAGES + 1, { toString: "x" }]) {
      state.row = { id: DEAL, photo: { picture: photo("1"), gallery: [photo("2", page)] }, om_storage_path: null, is_sample: false };
      const res = await ask("size=hero&g=1");
      expect(res.status, JSON.stringify(page)).toBe(200);
      expect(res.headers.get("x-image-credit")).toBe("From the offering memorandum");
    }
  });

  it("answers a stored path that is not this deal's photograph with a 404 and no read, never a 500", async () => {
    for (const hero of [`photos/${DEAL}/2-hero.jpg\r\nX: y`, "photos/7c6b5a49-3827-4615-8a4b-3c2d1e0f9a8b/2-hero.jpg", `u1/${DEAL}.pdf`, 42]) {
      state.row = {
        id: DEAL,
        photo: { picture: photo("1"), gallery: [{ ...photo("2", 7), hero }] },
        om_storage_path: null,
        is_sample: false,
      };
      const res = await ask("size=hero&g=1");
      expect(res.status, String(hero)).toBe(404);
    }
    expect(state.reads).toEqual([]);
  });
});

describe("GET /api/deals/[id]/picture — a URL that names the picture's version is kept (research pass 25)", () => {
  it("answers the version the stored files carry as never changing, and anything else as before", async () => {
    state.row = { id: DEAL, photo: { picture: photo("lk2x9a"), gallery: [photo("lk2x9ag1", 4)] }, om_storage_path: null, is_sample: false };
    const pinned = await ask("size=thumb&v=lk2x9a");
    expect(pinned.status).toBe(200);
    expect(pinned.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    // A gallery photograph carries its own stamp.
    expect((await ask("size=hero&g=1&v=lk2x9ag1")).headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    // No version, or a picture since replaced: revalidated, never kept.
    expect((await ask("size=thumb")).headers.get("cache-control")).toBe("private, no-cache");
    expect((await ask("size=thumb&v=older1")).headers.get("cache-control")).toBe("private, no-cache");
    expect((await ask("size=hero&g=1&v=lk2x9a")).headers.get("cache-control")).toBe("private, no-cache");
  });
});
