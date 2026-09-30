/**
 * The memo's cover picture is a courtesy, never a dependency: a picture that
 * arrives intact becomes a data URI with its credit; one that does not
 * arrive in time, is not an image, is corrupt, or fails, is simply absent —
 * because react-pdf hangs its whole render on a corrupt PNG, the memo
 * download must never be handed one.
 */
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORRUPT_PNG, TINY_PNG } from "./test-png";

const state = vi.hoisted(() => ({
  pictureBytes: null as Buffer | null,
  pictureReads: [] as string[],
  aerialAsks: 0,
}));

// The stored photograph (#434), and the aerial behind it.
vi.mock("@/lib/deal-picture", () => ({
  PICTURE_CREDIT: { om: "From the offering memorandum", upload: "Photograph added to the deal" },
  memorandumPhotoCredit: (page?: number | null) => (page ? `From the offering memorandum, page ${page}` : "From the offering memorandum"),
  readPictureBytes: async (dealId: string, picture: { hero?: string }, size: string) => {
    state.pictureReads.push(`${dealId}:${size}`);
    if (!state.pictureBytes || picture?.hero?.includes("gone")) throw new Error("the stored file is gone");
    return state.pictureBytes;
  },
}));
vi.mock("@/lib/imagery", () => ({
  IMAGE_CREDIT: {
    photo: "From the offering memorandum",
    streetview: "Street View imagery © Google",
    satellite: "Satellite imagery © Google",
    aerial: "Imagery: USGS The National Map",
  },
  fetchOneImage: async (source: string) => {
    state.aerialAsks += 1;
    return {
      source,
      response: new Response(new Uint8Array(TINY_PNG), { headers: { "content-type": "image/png" } }),
    };
  },
}));

import { COVER_SIZE, PHOTO_PAGE_SIZE, coverFrom, coverPictureFor, fitCover, galleryPhotosFor, intactImage } from "./cover-aerial";

const image = (type: string, body: Buffer | null = TINY_PNG) =>
  new Response(body ? new Uint8Array(body) : null, { headers: { "content-type": type } });

// A JPEG's skeleton: start marker, some bytes, end marker.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1), Buffer.from([0xff, 0xd9])]);

describe("intactImage", () => {
  it("accepts a whole PNG and a whole JPEG", () => {
    expect(intactImage(TINY_PNG, "image/png")).toBe(true);
    expect(intactImage(JPEG, "image/jpeg")).toBe(true);
    // A little padding after a JPEG's end marker is common and fine.
    expect(intactImage(Buffer.concat([JPEG, Buffer.alloc(8)]), "image/jpeg")).toBe(true);
  });

  it("refuses a PNG whose data fails its check, a truncated PNG, a JPEG with no end, and a mismatched type", () => {
    expect(intactImage(CORRUPT_PNG, "image/png")).toBe(false);
    expect(intactImage(TINY_PNG.subarray(0, TINY_PNG.length - 6), "image/png")).toBe(false);
    expect(intactImage(JPEG.subarray(0, JPEG.length - 2), "image/jpeg")).toBe(false);
    expect(intactImage(TINY_PNG, "image/jpeg")).toBe(false);
    expect(intactImage(TINY_PNG, "image/webp")).toBe(false);
  });
});

describe("coverFrom", () => {
  it("turns an aerial answer into a PNG data URI with the USGS credit", async () => {
    const cover = await coverFrom(async () => ({ source: "aerial", response: image("image/png") }));
    expect(cover?.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(cover?.dataUri.endsWith(TINY_PNG.toString("base64"))).toBe(true);
    expect(cover?.credit).toBe("Imagery: USGS The National Map");
  });

  it("keeps the JPEG type and drops the charset suffix", async () => {
    const cover = await coverFrom(async () => ({
      source: "aerial",
      response: image("image/jpeg; charset=binary", JPEG),
    }));
    expect(cover?.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("no answer, a non-image answer, an empty body, a corrupt picture and a throw are all no cover", async () => {
    expect(await coverFrom(async () => null)).toBeNull();
    expect(
      await coverFrom(async () => ({ source: "aerial", response: image("application/json", Buffer.from("{}")) })),
    ).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/webp") }))).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/png", Buffer.alloc(0)) }))).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/png", CORRUPT_PNG) }))).toBeNull();
    expect(
      await coverFrom(async () => {
        throw new Error("network down");
      }),
    ).toBeNull();
  });

  it("a source that does not answer in time is no cover, and the memo is not held up", async () => {
    const started = Date.now();
    const cover = await coverFrom(() => new Promise(() => {}), 40);
    expect(cover).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("coverPictureFor — the building's own photograph on the cover, the aerial behind it (#434)", () => {
  const supabase = {} as SupabaseClient;
  const address = { label: "1200 N 31st St, Philadelphia, PA", street: "1200 N 31st St" } as never;
  const picture = {
    hero: "photos/d1/1700000000000-hero.jpg",
    thumb: "photos/d1/1700000000000-thumb.jpg",
    width: 1600,
    height: 1067,
    source: "om" as const,
    at: "2026-09-20T12:00:00Z",
  };
  beforeEach(() => {
    state.pictureReads = [];
    state.aerialAsks = 0;
    state.pictureBytes = null;
  });
  // A 1600 × 1067 photograph, as the stored hero derivative is.
  const hero = () =>
    sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 120, g: 150, b: 180 } } })
      .jpeg()
      .toBuffer();

  it("cuts a stored photograph to the cover's own pixels, a whole JPEG", async () => {
    const framed = await fitCover(await hero());
    const meta = await sharp(framed).metadata();
    expect([meta.width, meta.height]).toEqual([COVER_SIZE.width, COVER_SIZE.height]);
    expect(meta.format).toBe("jpeg");
    expect(intactImage(framed, "image/jpeg")).toBe(true);
  });

  it("leads with the deal's own photograph, credited as the memorandum's, and asks for no aerial", async () => {
    state.pictureBytes = await hero();
    const cover = await coverPictureFor(supabase, "d1", address, { picture } as never);
    expect(cover?.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(cover?.credit).toBe("From the offering memorandum");
    expect(state.pictureReads).toEqual(["d1:hero"]);
    expect(state.aerialAsks).toBe(0);
    // A picture the reader added is credited as theirs.
    const theirs = await coverPictureFor(supabase, "d1", address, { picture: { ...picture, source: "upload" } } as never);
    expect(theirs?.credit).toBe("Photograph added to the deal");
  });

  it("falls back to the aerial where the deal has no photograph, or its file is gone", async () => {
    const aerial = await coverPictureFor(supabase, "d1", address, null);
    expect(aerial?.credit).toBe("Imagery: USGS The National Map");
    expect(state.pictureReads).toEqual([]);
    expect(state.aerialAsks).toBe(1);

    const gone = await coverPictureFor(supabase, "d1", address, { picture } as never);
    expect(gone?.credit).toBe("Imagery: USGS The National Map");
    expect(state.pictureReads).toEqual(["d1:hero"]);
    expect(state.aerialAsks).toBe(2);
  });

  it("a deal with a photograph and no address still gets its photograph; with neither, no cover", async () => {
    state.pictureBytes = await hero();
    expect((await coverPictureFor(supabase, "d1", null, { picture } as never))?.credit).toBe("From the offering memorandum");
    state.pictureBytes = null;
    expect(await coverPictureFor(supabase, "d1", null, null)).toBeNull();
  });
});

describe("galleryPhotosFor — the memorandum's other photographs for the report's page (#459)", () => {
  const photo = (n: number, page: number | null) => ({
    hero: `photos/d1/170000000000${n}-hero.jpg`,
    thumb: `photos/d1/170000000000${n}-thumb.jpg`,
    width: 1600,
    height: 1067,
    source: "om" as const,
    at: "2026-09-20T12:00:00Z",
    ...(page != null ? { page } : {}),
  });
  beforeEach(() => {
    state.pictureReads = [];
    state.pictureBytes = null;
  });
  const hero = () =>
    sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 90, g: 120, b: 150 } } })
      .jpeg()
      .toBuffer();

  it("cuts each stored photograph to the page's frame, credited with its page, four at most", async () => {
    state.pictureBytes = await hero();
    const gallery = [photo(1, 3), photo(2, 7), photo(3, null), photo(4, 11), photo(5, 12)];
    const photos = await galleryPhotosFor("d1", { gallery } as never);
    expect(photos.map((p) => p.credit)).toEqual([
      "From the offering memorandum, page 3",
      "From the offering memorandum, page 7",
      "From the offering memorandum",
      "From the offering memorandum, page 11",
    ]);
    expect(state.pictureReads).toEqual(["d1:hero", "d1:hero", "d1:hero", "d1:hero"]);
    const bytes = Buffer.from(photos[0].dataUri.split(",")[1], "base64");
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([PHOTO_PAGE_SIZE.width, PHOTO_PAGE_SIZE.height]);
  });

  it("leaves out a photograph whose file is gone, and makes no page of fewer than two", async () => {
    state.pictureBytes = await hero();
    const kept = await galleryPhotosFor("d1", { gallery: [photo(1, 3), { ...photo(2, 7), hero: "photos/d1/gone-hero.jpg" }, photo(3, 9)] } as never);
    expect(kept.map((p) => p.credit)).toEqual(["From the offering memorandum, page 3", "From the offering memorandum, page 9"]);
    expect(await galleryPhotosFor("d1", { gallery: [photo(1, 3), { ...photo(2, 7), hero: "photos/d1/gone-hero.jpg" }] } as never)).toEqual([]);
    expect(await galleryPhotosFor("d1", { gallery: [photo(1, 3)] } as never)).toEqual([]);
    expect(await galleryPhotosFor("d1", null)).toEqual([]);
  });
});
