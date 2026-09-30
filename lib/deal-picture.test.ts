import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture, DealVisualCache } from "./deal-location";
import { testMap, testMemorandum, testPicture } from "./test-memorandum";

// Storage faked: the memorandum each deal holds, what is written, what is removed.
const store = vi.hoisted(() => ({
  oms: new Map<string, Uint8Array | Error>(),
  files: new Map<string, Buffer>(),
  uploads: [] as string[],
  removed: [] as string[],
}));

vi.mock("@/lib/storage", () => ({
  dealPhotoPath: (dealId: string, stamp: string, size: string) => `photos/${dealId}/${stamp}-${size}.jpg`,
  downloadDealFile: async (path: string) => store.files.get(path) ?? Buffer.alloc(0),
  downloadOmPdf: async (path: string) => {
    const om = store.oms.get(path);
    if (!om) throw new Error("no such object");
    if (om instanceof Error) throw om;
    return om;
  },
  uploadDealPhoto: async (path: string, bytes: Buffer) => {
    store.uploads.push(path);
    store.files.set(path, bytes);
  },
  removeStorageFiles: async (paths: string[]) => {
    store.removed.push(...paths);
  },
}));

import {
  GALLERY_VERSION,
  PICTURE_SEARCH_VERSION,
  clearOmPicture,
  ensureDealPicture,
  picturePaths,
} from "./deal-picture";

/** A deals table of one row's photo cache, read and written as the code does. */
function fakeDb(photo: DealVisualCache | null) {
  const db = { photo };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo: db.photo } }) }) }),
      update: (row: { photo: DealVisualCache }) => ({
        eq: async () => {
          // What a jsonb column keeps: the object as JSON, undefined dropped.
          db.photo = JSON.parse(JSON.stringify(row.photo));
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, db };
}

const OLD: DealPicture = {
  hero: "photos/d1/old-hero.jpg",
  thumb: "photos/d1/old-thumb.jpg",
  width: 1600,
  height: 1100,
  source: "om",
  at: "2026-09-01T00:00:00Z",
};
const staleCache = (): DealVisualCache => ({ picture: OLD, pictureCheckedAt: OLD.at, pictureSearchV: PICTURE_SEARCH_VERSION - 1 });

describe("a memorandum photograph lifted under older rules, judged again (#444)", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
  });

  it("is replaced by the cover page's photograph, and the old pair removed", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }]));
    const { client, db } = fakeDb(staleCache());
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: staleCache(), waitMs: 5_000 });
    expect(got).not.toBeNull();
    expect(got!.hero).not.toBe(OLD.hero);
    // The cover page's 800 x 500 photograph, its hero enlarged cleanly (#446).
    expect({ w: got!.width, h: got!.height, source: got!.source }).toEqual({ w: 1200, h: 750, source: "om" });
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(db.photo?.picture?.hero).toBe(got!.hero);
    expect(store.uploads).toHaveLength(2);
    expect(store.removed).toEqual([OLD.hero, OLD.thumb]);
  });

  it("is dropped where the first pages hold no photograph, so the card shows the next picture", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testMap(1600, 1100, "jpeg")] }]));
    const { client, db } = fakeDb(staleCache());
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: staleCache(), waitMs: 5_000 });
    expect(got).toBeNull();
    expect(db.photo?.picture).toBeUndefined();
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(store.removed).toEqual([OLD.hero, OLD.thumb]);
    expect(store.uploads).toEqual([]);
  });

  it("stands where the memorandum cannot be read, and nothing is written", async () => {
    store.oms.set("u/d1.pdf", new Error("storage is down"));
    const { client, db } = fakeDb(staleCache());
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: staleCache(), waitMs: 5_000 });
    expect(got).toEqual(OLD);
    expect(db.photo).toEqual(staleCache());
    expect(store.removed).toEqual([]);
  });

  it("shows at once on a page render, and is judged behind it", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }]));
    const { client, db } = fakeDb(staleCache());
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: staleCache() });
    expect(got).toEqual(OLD);
    await vi.waitFor(() => expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION), { timeout: 10_000 });
    expect(db.photo?.picture?.width).toBe(1200);
  });

  it("never touches the reader's own picture, whatever rules it was stored under", async () => {
    const own: DealPicture = { ...OLD, source: "upload" };
    const cache: DealVisualCache = { picture: own, pictureSearchV: 1 };
    const { client } = fakeDb(cache);
    expect(await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache, waitMs: 5_000 })).toBe(own);
    expect(store.uploads).toEqual([]);
  });
});

describe("the memorandum's other photographs, read behind the cover (#448)", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
  });

  const memorandum = async () =>
    testMemorandum([
      { images: [await testPicture(800, 500, "jpeg", 1)] },
      { images: [await testPicture(800, 500, "jpeg", 2)] },
      { images: [await testMap(1600, 1100, "jpeg")] },
      { images: [await testPicture(640, 480, "jpeg", 3)] },
    ]);

  it("answers with the cover at once and stores the rest in the same turn, credited with their pages", async () => {
    store.oms.set("u/d1.pdf", await memorandum());
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000 });
    expect(got?.page ?? null).toBeNull();
    await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
    expect(db.photo?.picture?.hero).toBe(got!.hero);
    expect(db.photo?.gallery?.map((g) => g.page)).toEqual([2, 4]);
    // Every one stored as the cover is, under the deal's own photo paths.
    for (const g of db.photo!.gallery!) {
      expect(g.source).toBe("om");
      expect(g.hero).toMatch(/^photos\/d1\/[a-z0-9]+-hero\.jpg$/);
      expect(g.thumb).toMatch(/^photos\/d1\/[a-z0-9]+-thumb\.jpg$/);
    }
    expect(store.uploads).toHaveLength(6);
    expect(picturePaths(db.photo)).toHaveLength(6);
  });

  it("reads the gallery of a deal whose cover is current, behind the render, passing over the cover", async () => {
    store.oms.set("u/d1.pdf", await memorandum());
    const { client, db } = fakeDb(null);
    await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000 });
    await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
    // A gallery read under older rules: the cover stands and the gallery is
    // read again from the memorandum, the stored cover's hero its hash.
    const cache: DealVisualCache = { ...db.photo!, galleryV: undefined };
    db.photo = cache;
    const before = db.photo.gallery!.map((g) => g.hero);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache });
    expect(got).toEqual(cache.picture);
    await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
    expect(db.photo?.gallery?.map((g) => g.page)).toEqual([2, 4]);
    expect(store.removed).toEqual(before.flatMap((h) => [h, h.replace("-hero", "-thumb")]));
  });

  it("goes with the memorandum it came from, whoever's the cover is", async () => {
    const gallery: DealPicture[] = [{ ...OLD, hero: "photos/d1/xg1-hero.jpg", thumb: "photos/d1/xg1-thumb.jpg", page: 3 }];
    const own: DealPicture = { ...OLD, source: "upload" };
    const cache: DealVisualCache = { picture: own, pictureSearchV: PICTURE_SEARCH_VERSION, gallery, galleryV: GALLERY_VERSION };
    const { client, db } = fakeDb(cache);
    await clearOmPicture(client, "d1", cache);
    expect(db.photo?.picture).toEqual(own);
    expect(db.photo?.gallery).toBeUndefined();
    expect(db.photo?.galleryV).toBeUndefined();
    expect(store.removed).toEqual(["photos/d1/xg1-hero.jpg", "photos/d1/xg1-thumb.jpg"]);
  });

  it("is never read for the sample deal", async () => {
    store.oms.set("u/d1.pdf", await memorandum());
    const { client, db } = fakeDb(null);
    expect(await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: true, cache: null, waitMs: 5_000 })).toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    expect(db.photo).toBeNull();
    expect(store.uploads).toEqual([]);
  });
});
