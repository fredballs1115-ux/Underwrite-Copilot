import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture, DealVisualCache } from "./deal-location";
import { testMap, testMemorandum, testPicture } from "./test-memorandum";
import { TEST_JPX } from "./test-jpx";

// Storage faked: the memorandum each deal holds, what is written, what is removed.
const store = vi.hoisted(() => ({
  oms: new Map<string, Uint8Array | Error>(),
  files: new Map<string, Buffer>(),
  uploads: [] as string[],
  removed: [] as string[],
}));

// The cover's read, given no time at all where a test asks for a read the
// time budget cuts short; the real reader otherwise.
const decodeBudget = vi.hoisted(() => ({ ms: undefined as number | undefined }));
vi.mock("@/lib/om-photo-decode", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./om-photo-decode")>();
  return {
    ...orig,
    decodeOmCover: (pdf: Uint8Array, opts?: { budgetMs?: number }) =>
      orig.decodeOmCover(pdf, decodeBudget.ms === undefined ? opts : { budgetMs: decodeBudget.ms }),
  };
});

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
  MAX_CUT_READS,
  PHOTO_RULES_SINCE,
  PICTURE_SEARCH_VERSION,
  RETRY_AFTER_MS,
  backfillPreview,
  clearOmPicture,
  currentPicture,
  derivePicture,
  ensureDealPicture,
  pictureMayBeInMemorandum,
  picturePaths,
  previewOf,
  retryWaiting,
  searchedRecently,
} from "./deal-picture";
import { PREVIEW_PX, isPreview } from "./photo-preview";
import sharp from "sharp";

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
const staleCache = (): DealVisualCache => ({ picture: OLD, pictureCheckedAt: OLD.at, pictureSearchV: PHOTO_RULES_SINCE - 1 });

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

describe("a read the time budget cut short writes no verdict", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
    decodeBudget.ms = undefined;
  });

  // A secured memorandum: every stream encrypted, so the byte scan cannot
  // see its cover and only the pages' read can find it.
  const locked = async () => testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }], "aes-128");
  const ask = (client: SupabaseClient, cache: DealVisualCache | null) =>
    ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache, waitMs: 5_000, gallery: false });
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  /** The last read cut short, moved back past its wait. */
  const waited = (cache: DealVisualCache): DealVisualCache => ({
    ...cache,
    pictureRetry: { ...cache.pictureRetry!, at: ago(RETRY_AFTER_MS[RETRY_AFTER_MS.length - 1] + 1_000) },
  });

  it("says nothing, holds the next read back for its wait, and takes the third in a row as the verdict", async () => {
    store.oms.set("u/d1.pdf", await locked());
    decodeBudget.ms = 0;
    const { client, db } = fakeDb(null);
    expect(await ask(client, null)).toBeNull();
    // No verdict: the memorandum was never looked at. The read is counted.
    expect(db.photo?.pictureCheckedAt).toBeUndefined();
    expect(db.photo?.pictureRetry).toMatchObject({ n: 1, v: PICTURE_SEARCH_VERSION });
    expect(searchedRecently(db.photo)).toBe(false);
    // Inside its wait no read is made, and the pipeline's cards do not ask.
    expect(retryWaiting(db.photo)).toBe(true);
    expect(retryWaiting(db.photo, Date.now() + RETRY_AFTER_MS[0] + 1_000)).toBe(false);
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache: db.photo })).toBe(false);
    const first = db.photo!.pictureRetry!.at;
    expect(await ask(client, db.photo)).toBeNull();
    expect(db.photo?.pictureRetry).toMatchObject({ n: 1, at: first });
    // Its wait over, the second read; cut short too, it holds the next back longer.
    db.photo = { ...db.photo!, pictureRetry: { ...db.photo!.pictureRetry!, at: ago(RETRY_AFTER_MS[0] + 1_000) } };
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache: db.photo })).toBe(true);
    expect(await ask(client, db.photo)).toBeNull();
    expect(db.photo?.pictureRetry?.n).toBe(2);
    expect(retryWaiting(db.photo, Date.now() + RETRY_AFTER_MS[0] + 1_000)).toBe(true);
    // The third in a row stands as the verdict for the month: a file the
    // reader can never finish is not decoded on every view.
    expect(MAX_CUT_READS).toBe(3);
    db.photo = waited(db.photo!);
    expect(await ask(client, db.photo)).toBeNull();
    expect(db.photo?.pictureRetry).toBeUndefined();
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(searchedRecently(db.photo)).toBe(true);
    expect(store.uploads).toEqual([]);
  });

  it("finds the photograph on a later read given its time, and forgets the reads cut short", async () => {
    store.oms.set("u/d1.pdf", await locked());
    decodeBudget.ms = 0;
    const { client, db } = fakeDb(null);
    await ask(client, null);
    expect(db.photo?.pictureRetry?.n).toBe(1);
    decodeBudget.ms = undefined;
    const got = await ask(client, waited(db.photo!));
    expect(got).toMatchObject({ source: "om", width: 1200, height: 750 });
    expect(db.photo?.picture?.hero).toBe(got!.hero);
    expect(db.photo?.pictureRetry).toBeUndefined();
  });

  it("neither drops nor replaces a photograph lifted under older rules, and keeps it after the third", async () => {
    store.oms.set("u/d1.pdf", await locked());
    decodeBudget.ms = 0;
    const { client, db } = fakeDb(staleCache());
    expect(await ask(client, staleCache())).toEqual(OLD);
    expect(db.photo?.picture).toEqual(OLD);
    expect(db.photo?.pictureRetry?.n).toBe(1);
    // The card shows it as it is while the next read waits.
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache: db.photo })).toBe(false);
    for (let n = 2; n <= MAX_CUT_READS; n++) {
      expect(await ask(client, waited(db.photo!))).toEqual(OLD);
    }
    // No read could judge it, so it stands as the deal's photograph.
    expect(db.photo?.picture).toEqual(OLD);
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(currentPicture(db.photo)).toEqual(OLD);
    expect(store.removed).toEqual([]);
    expect(store.uploads).toEqual([]);
  });

  it("is forgotten with the memorandum it was read from", async () => {
    const cache: DealVisualCache = { pictureRetry: { n: 2, at: new Date().toISOString(), v: PICTURE_SEARCH_VERSION } };
    const { client, db } = fakeDb(cache);
    await clearOmPicture(client, "d1", cache);
    expect(db.photo?.pictureRetry).toBeUndefined();
    expect(retryWaiting(db.photo)).toBe(false);
  });
});

describe("a cover stored as JPEG 2000", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
    decodeBudget.ms = undefined;
  });

  it("is found where a verdict of none reached under the rules before was written, and stored as any cover is", async () => {
    // A secured memorandum whose cover is JPEG 2000: the byte scan sees
    // nothing, and the read before the decoders were found passed it over.
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [TEST_JPX], text: "The Maddox" }], "aes-128"));
    const judged: DealVisualCache = { pictureCheckedAt: new Date().toISOString(), pictureSearchV: PICTURE_SEARCH_VERSION - 1 };
    expect(searchedRecently(judged)).toBe(false);
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache: judged })).toBe(true);
    const { client, db } = fakeDb(judged);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: judged, waitMs: 5_000, gallery: false });
    expect(got).toMatchObject({ source: "om", width: 1200, height: 750 });
    expect(db.photo?.picture?.hero).toBe(got!.hero);
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(store.uploads).toHaveLength(2);
  });
});

describe("the memorandum's bytes a caller already holds (the screen's lift)", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
  });

  it("are read in place of a download, and are left as they were handed over", async () => {
    // Nothing in storage: a download would fail, so the cover can only come
    // from the bytes handed over.
    const pdf = await testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }]);
    const before = Buffer.from(pdf);
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", {
      omPath: "u/d1.pdf",
      isSample: false,
      cache: null,
      waitMs: 5_000,
      gallery: false,
      pdf,
    });
    expect(got?.source).toBe("om");
    expect(db.photo?.picture?.hero).toBe(got!.hero);
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    // The cover and its thumbnail, and the caller's buffer untouched.
    expect(store.uploads).toHaveLength(2);
    expect(Buffer.from(pdf).equals(before)).toBe(true);
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

  it("is left to the deal's first view where the caller asks for the cover alone (#464, the worker)", async () => {
    store.oms.set("u/d1.pdf", await memorandum());
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000, gallery: false });
    expect(got?.hero).toBe(db.photo?.picture?.hero);
    await new Promise((r) => setTimeout(r, 300));
    expect(db.photo?.gallery).toBeUndefined();
    expect(db.photo?.galleryV).toBeUndefined();
    // The cover and its thumb, nothing else.
    expect(store.uploads).toHaveLength(2);
    // Current now, the cover is answered with no gallery started behind it.
    await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: db.photo, gallery: false });
    await new Promise((r) => setTimeout(r, 300));
    expect(store.uploads).toHaveLength(2);
    // The deal's first view reads it.
    await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: db.photo });
    await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
    expect(db.photo?.gallery?.map((g) => g.page)).toEqual([2, 4]);
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

describe("the blur-up preview each stored photograph carries (#463)", () => {
  beforeEach(() => {
    store.oms.clear();
    store.files.clear();
    store.uploads = [];
    store.removed = [];
  });

  it("is a WebP a couple of dozen pixels long, inline, made beside the hero and the thumb", async () => {
    const photo = await testPicture(1600, 1000, "jpeg", 1);
    const d = await derivePicture(Buffer.from(photo));
    expect(isPreview(d.preview)).toBe(true);
    expect(d.preview!.startsWith("data:image/webp;base64,")).toBe(true);
    const px = await sharp(Buffer.from(d.preview!.split(",")[1], "base64")).metadata();
    expect(Math.max(px.width ?? 0, px.height ?? 0)).toBe(PREVIEW_PX);
    expect(px.width! / px.height!).toBeCloseTo(1.6, 0);
    // A few hundred bytes: small enough to ride in the page for every card.
    expect(d.preview!.length).toBeLessThan(1_000);
    expect(await previewOf(Buffer.from("not a picture"))).toBeNull();
  });

  it("is stored with the cover and with every gallery photograph", async () => {
    store.oms.set(
      "u/d1.pdf",
      await testMemorandum([
        { images: [await testPicture(800, 500, "jpeg", 1)] },
        { images: [await testPicture(800, 500, "jpeg", 2)] },
        { images: [await testPicture(640, 480, "jpeg", 3)] },
      ]),
    );
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000 });
    expect(isPreview(got?.preview)).toBe(true);
    await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
    expect(isPreview(db.photo?.picture?.preview)).toBe(true);
    for (const g of db.photo!.gallery!) expect(isPreview(g.preview)).toBe(true);
  });

  it("is backfilled for a photograph stored before previews, from the hero bytes a route holds, and never over a newer picture", async () => {
    const hero = await testPicture(1600, 1000, "jpeg", 4);
    const cache: DealVisualCache = { picture: OLD, pictureSearchV: PICTURE_SEARCH_VERSION, gallery: [] };
    const { client, db } = fakeDb(cache);
    await backfillPreview(client, "d1", OLD, Buffer.from(hero));
    expect(isPreview(db.photo?.picture?.preview)).toBe(true);
    expect(db.photo?.picture?.hero).toBe(OLD.hero);
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    // The route read OLD, then the photograph was replaced before the
    // backfill ran: the replacement stays, with no preview of the old one.
    const replaced: DealPicture = { ...OLD, hero: "photos/d1/new-hero.jpg", source: "upload" };
    const second = fakeDb({ picture: replaced });
    await backfillPreview(second.client, "d1", OLD, Buffer.from(hero));
    expect(second.db.photo?.picture).toEqual(replaced);
    // A preview already stored is never overwritten.
    const kept = "data:image/webp;base64,AAAA";
    const third = fakeDb({ picture: { ...OLD, preview: kept } });
    await backfillPreview(third.client, "d1", OLD, Buffer.from(hero));
    expect(third.db.photo?.picture?.preview).toBe(kept);
  });
});
