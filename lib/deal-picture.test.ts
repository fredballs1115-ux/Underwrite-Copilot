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
  /** a memorandum download held until the test lets it go */
  gate: null as Promise<void> | null,
}));

// The cover's read, given no time at all where a test asks for a read the
// time budget cuts short; the real reader otherwise.
const decodeBudget = vi.hoisted(() => ({ ms: undefined as number | undefined }));
// The gallery's read, the same way, apart from the cover's.
const galleryBudget = vi.hoisted(() => ({ ms: undefined as number | undefined }));
vi.mock("@/lib/om-photo-decode", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./om-photo-decode")>();
  return {
    ...orig,
    decodeOmCover: (pdf: Uint8Array, opts?: { budgetMs?: number }) =>
      orig.decodeOmCover(pdf, decodeBudget.ms === undefined ? opts : { budgetMs: decodeBudget.ms }),
    decodeOmPhotos: (...args: Parameters<typeof orig.decodeOmPhotos>) =>
      orig.decodeOmPhotos(
        args[0],
        args[1],
        galleryBudget.ms === undefined ? args[2] : { ...(args[2] ?? {}), budgetMs: galleryBudget.ms },
      ),
  };
});

vi.mock("@/lib/storage", () => ({
  dealPhotoPath: (dealId: string, stamp: string, size: string) => `photos/${dealId}/${stamp}-${size}.jpg`,
  downloadDealFile: async (path: string) => store.files.get(path) ?? Buffer.alloc(0),
  downloadOmPdf: async (path: string) => {
    if (store.gate) await store.gate;
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
  DERIVED_VERSION,
  FULL_MAX_PX,
  GALLERY_VERSION,
  HERO_MAX_PX,
  MAX_CUT_READS,
  PHOTO_RULES_SINCE,
  PICTURE_SEARCH_VERSION,
  RETRY_AFTER_MS,
  backfillCard,
  backfillPreview,
  cardCopyDue,
  cardOf,
  cardPathOf,
  clearOmPicture,
  currentPicture,
  derivePicture,
  derivedOutdated,
  ensureDealPicture,
  pictureMayBeInMemorandum,
  picturePathFor,
  picturePaths,
  previewOf,
  readPictureBytes,
  retryWaiting,
  galleryRetryWaiting,
  searchedRecently,
} from "./deal-picture";
import { PREVIEW_PX, isPreview } from "./photo-preview";
import { CARD_PX } from "./photo-srcset";
import sharp from "sharp";

// These tests build real memoranda and read them through pdfjs and sharp: a
// second or two each alone, but on a loaded machine (the full suite beside
// other jobs, 2026-10-04) two ran past vitest's 5-second default and failed
// on the timer, not on what they assert. The waits below already allow 10 to
// 15 seconds, which that default had capped.
vi.setConfig({ testTimeout: 30_000 });

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
    // The hero, the thumbnail and the card copy (research pass 29).
    expect(store.uploads).toHaveLength(3);
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

  it("neither drops nor replaces a photograph lifted under older rules while reads are cut short, and drops it at the third", async () => {
    store.oms.set("u/d1.pdf", await locked());
    decodeBudget.ms = 0;
    const { client, db } = fakeDb(staleCache());
    expect(await ask(client, staleCache())).toEqual(OLD);
    expect(db.photo?.picture).toEqual(OLD);
    expect(db.photo?.pictureRetry?.n).toBe(1);
    // The card shows it as it is while the next read waits.
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache: db.photo })).toBe(false);
    for (let n = 2; n < MAX_CUT_READS; n++) {
      expect(await ask(client, waited(db.photo!))).toEqual(OLD);
    }
    // The third in a row is the verdict: a photograph lifted under rules
    // that could take a map for the building, never judged under today's,
    // goes — rather than stand as the building's under today's stamp for
    // good (the pre-ship audit of 2026-09-30).
    expect(await ask(client, waited(db.photo!))).toBeNull();
    expect(db.photo?.picture).toBeUndefined();
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(currentPicture(db.photo)).toBeNull();
    expect(store.removed).toEqual([OLD.hero, OLD.thumb]);
    expect(store.uploads).toEqual([]);
  });

  it("a cover lifted while the reader added a picture never replaces it: its own new files go instead", async () => {
    decodeBudget.ms = undefined;
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }]));
    const UPLOAD: DealPicture = { ...OLD, hero: "photos/d1/up-hero.jpg", thumb: "photos/d1/up-thumb.jpg", source: "upload" };
    // The search began from a row with no picture; the row holds the upload now.
    const { client, db } = fakeDb({ picture: UPLOAD, pictureSearchV: PICTURE_SEARCH_VERSION });
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000, gallery: false });
    expect(got).toEqual(UPLOAD);
    expect(db.photo?.picture).toEqual(UPLOAD);
    // The cover's files were put and taken away again; the upload's never touched.
    expect(store.uploads.length).toBeGreaterThanOrEqual(2);
    expect([...store.removed].sort()).toEqual([...store.uploads].sort());
    expect(store.removed).not.toContain(UPLOAD.hero);
  });

  it("never drops a picture the reader added while the third read ran", async () => {
    store.oms.set("u/d1.pdf", await locked());
    decodeBudget.ms = 0;
    const UPLOAD: DealPicture = { ...OLD, hero: "photos/d1/up-hero.jpg", thumb: "photos/d1/up-thumb.jpg", source: "upload" };
    const snapshot: DealVisualCache = {
      ...staleCache(),
      pictureRetry: { n: MAX_CUT_READS - 1, at: "2026-01-01T00:00:00Z", v: PICTURE_SEARCH_VERSION },
    };
    // The row holds the reader's upload; the search began from the old copy.
    const { client, db } = fakeDb({ ...snapshot, picture: UPLOAD });
    expect(await ask(client, snapshot)).toEqual(UPLOAD);
    expect(db.photo?.picture).toEqual(UPLOAD);
    expect(store.removed).toEqual([]);
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
    expect(store.uploads).toHaveLength(3);
  });
});

const resetStore = () => {
  store.oms.clear();
  store.files.clear();
  store.uploads = [];
  store.removed = [];
  store.gate = null;
  decodeBudget.ms = undefined;
};

describe("a full-size copy, where the source is larger than the hero", () => {
  beforeEach(resetStore);

  it("is made only where there is more of the photograph than the hero holds, and never enlarged", async () => {
    const big = await derivePicture(await testPicture(3200, 2000, "jpeg", 1));
    expect({ w: big.width, h: big.height }).toEqual({ w: HERO_MAX_PX, h: 1000 });
    expect(big.full && { w: big.full.width, h: big.full.height }).toEqual({ w: FULL_MAX_PX, h: 1600 });
    expect((await sharp(big.full!.bytes).metadata()).format).toBe("jpeg");
    // Larger than the hero, smaller than the full copy's cap: kept at its size.
    const mid = await derivePicture(await testPicture(2000, 1250, "jpeg", 1));
    expect(mid.full && { w: mid.full.width, h: mid.full.height }).toEqual({ w: 2000, h: 1250 });
    // No larger than the hero: no second copy of it.
    expect((await derivePicture(await testPicture(1300, 800, "jpeg", 1))).full).toBeNull();
    expect((await derivePicture(await testPicture(800, 500, "jpeg", 1))).full).toBeNull();
  });

  it("is stored beside the hero and the thumbnail, served as the `full` size, and swept with them", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(3200, 2000, "jpeg", 1)] }]));
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000, gallery: false });
    expect(got).toMatchObject({ width: 1600, height: 1000, fullWidth: 2560, fullHeight: 1600, derivedV: DERIVED_VERSION });
    expect(got!.full).toMatch(/^photos\/d1\/[a-z0-9]+-full\.jpg$/);
    expect(db.photo?.picture).toEqual(got);
    expect(store.uploads).toHaveLength(4);
    expect(picturePaths(db.photo)).toEqual([got!.hero, got!.thumb, got!.card, got!.full]);
    // What the route serves for each size: the full copy where one is
    // stored, the hero where none is.
    expect(picturePathFor(got!, "full")).toBe(got!.full);
    expect((await sharp(await readPictureBytes("d1", got!, "full")).metadata()).width).toBe(2560);
    expect(picturePathFor({ ...got!, full: undefined }, "full")).toBe(got!.hero);
    expect(picturePathFor(got!, "hero")).toBe(got!.hero);
    expect(picturePathFor(got!, "thumb")).toBe(got!.thumb);
  });
});

describe("a memorandum's photograph derived before the full-size copy, made again behind a view", () => {
  beforeEach(resetStore);

  const COVER = () => testPicture(3200, 2000, "jpeg", 1);
  /** As it was stored before: the same photograph's hero, no derivation rules. */
  const before = async (source: DealPicture["source"] = "om") => {
    store.files.set(OLD.hero, await sharp(await COVER()).resize(1600).jpeg({ quality: 82 }).toBuffer());
    const was: DealPicture = { ...OLD, height: 1000, source };
    const cache: DealVisualCache = { picture: was, pictureSearchV: PICTURE_SEARCH_VERSION, galleryV: GALLERY_VERSION };
    return { was, cache };
  };
  const ask = (client: SupabaseClient, cache: DealVisualCache | null) =>
    ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache });

  it("keeps showing the stored photograph, and replaces it behind the render with the full set", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await COVER()] }]));
    const { was, cache } = await before();
    expect(derivedOutdated(was)).toBe(true);
    // Current under today's search rules: shown, and never asked for as missing.
    expect(pictureMayBeInMemorandum({ omPath: "u/d1.pdf", isSample: false, cache })).toBe(false);
    const { client, db } = fakeDb(cache);
    expect(await ask(client, cache)).toEqual(was);
    await vi.waitFor(() => expect(db.photo?.picture?.derivedV).toBe(DERIVED_VERSION), { timeout: 15_000 });
    expect(db.photo?.picture).toMatchObject({ source: "om", width: 1600, height: 1000, fullWidth: 2560 });
    expect(db.photo?.picture?.hero).not.toBe(was.hero);
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(store.removed).toEqual([was.hero, was.thumb]);
    // Made again once: the next view reads nothing.
    const uploads = store.uploads.length;
    await ask(client, db.photo);
    await new Promise((r) => setTimeout(r, 300));
    expect(store.uploads).toHaveLength(uploads);
  });

  it("never swaps in another photograph: the stored one is kept, and marked so it is tried once", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(3200, 2000, "jpeg", 2)] }]));
    const { was, cache } = await before();
    const { client, db } = fakeDb(cache);
    await ask(client, cache);
    await vi.waitFor(() => expect(db.photo?.picture?.derivedV).toBe(DERIVED_VERSION), { timeout: 15_000 });
    expect(db.photo?.picture).toEqual({ ...was, derivedV: DERIVED_VERSION });
    expect(store.uploads).toEqual([]);
    expect(store.removed).toEqual([]);
  });

  it("never makes the reader's own upload again: its original is not kept", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await COVER()] }]));
    const { was, cache } = await before("upload");
    expect(derivedOutdated(was)).toBe(false);
    const { client, db } = fakeDb(cache);
    expect(await ask(client, cache)).toEqual(was);
    await new Promise((r) => setTimeout(r, 300));
    expect(db.photo?.picture).toEqual(was);
    expect(store.uploads).toEqual([]);
  });

  it("is never put over a picture the reader added while it ran: its own new files go instead", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await COVER()] }]));
    const { cache } = await before();
    const { client, db } = fakeDb(cache);
    let open!: () => void;
    store.gate = new Promise<void>((resolve) => (open = resolve));
    await ask(client, cache);
    // Meanwhile the reader puts a photograph of their own on the deal.
    const own: DealPicture = { ...OLD, hero: "photos/d1/own-hero.jpg", thumb: "photos/d1/own-thumb.jpg", source: "upload" };
    db.photo = { ...db.photo!, picture: own };
    open();
    await vi.waitFor(() => expect(store.removed).toHaveLength(4), { timeout: 15_000 });
    expect(db.photo?.picture).toEqual(own);
    expect([...store.removed].sort()).toEqual([...store.uploads].sort());
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
    // The cover, its thumbnail and its card copy, and the caller's buffer untouched.
    expect(store.uploads).toHaveLength(3);
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
    expect(store.uploads).toHaveLength(9);
    expect(picturePaths(db.photo)).toHaveLength(9);
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
    expect(store.removed).toEqual(before.flatMap((h) => [h, h.replace("-hero", "-thumb"), h.replace("-hero", "-card")]));
  });

  it("a gallery read the time cut short is counted and waits its turn, never stamped as the gallery until the third", async () => {
    store.oms.set("u/d1.pdf", await memorandum());
    const { client, db } = fakeDb(null);
    galleryBudget.ms = 0;
    try {
      await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000 });
      await vi.waitFor(() => expect(db.photo?.galleryRetry?.n).toBe(1), { timeout: 15_000 });
      // Read to no photograph at all in no time: nothing stored as the gallery.
      expect(db.photo?.galleryV).toBeUndefined();
      expect(db.photo?.gallery).toBeUndefined();
      expect(galleryRetryWaiting(db.photo)).toBe(true);
      // Held back while it waits: a view reads nothing again.
      const held = { ...db.photo! };
      await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: held });
      expect(db.photo?.galleryRetry?.n).toBe(1);
      // Past its wait, the second and the third; the third stands.
      for (let n = 2; n <= MAX_CUT_READS; n++) {
        const past = { ...db.photo!, galleryRetry: { ...db.photo!.galleryRetry!, at: new Date(Date.now() - RETRY_AFTER_MS[RETRY_AFTER_MS.length - 1] - 1_000).toISOString() } };
        db.photo = past;
        await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: past });
        if (n < MAX_CUT_READS) {
          await vi.waitFor(() => expect(db.photo?.galleryRetry?.n).toBe(n), { timeout: 15_000 });
        } else {
          await vi.waitFor(() => expect(db.photo?.galleryV).toBe(GALLERY_VERSION), { timeout: 15_000 });
        }
      }
      expect(db.photo?.galleryRetry).toBeUndefined();
    } finally {
      galleryBudget.ms = undefined;
    }
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
    // The cover, its thumb and its card copy, nothing else.
    expect(store.uploads).toHaveLength(3);
    // Current now, the cover is answered with no gallery started behind it.
    await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: db.photo, gallery: false });
    await new Promise((r) => setTimeout(r, 300));
    expect(store.uploads).toHaveLength(3);
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

describe("the card copy a pipeline card's srcset offers beside the hero (research pass 29)", () => {
  beforeEach(resetStore);

  it("is 800px on its long side wherever the hero is longer, made from the photograph itself and never enlarged", async () => {
    const big = await derivePicture(await testPicture(3200, 2000, "jpeg", 1));
    expect(big.card && { w: big.card.width, h: big.card.height }).toEqual({ w: CARD_PX, h: 500 });
    expect((await sharp(big.card!.bytes).metadata()).format).toBe("jpeg");
    // A portrait photograph's long side is its height.
    const tall = await derivePicture(await testPicture(2000, 3000, "jpeg", 2));
    expect(tall.card && { w: tall.card.width, h: tall.card.height }).toEqual({ w: 533, h: CARD_PX });
    // A small cover's hero is enlarged for the deal page (#446); its card
    // copy is its own pixels, never enlarged.
    const small = await derivePicture(await testPicture(700, 438, "jpeg", 3));
    expect(small.width).toBe(1200);
    expect(small.card && { w: small.card.width, h: small.card.height }).toEqual({ w: 700, h: 438 });
    // A hero no longer than a card copy is its own card.
    const tiny = await derivePicture(await testPicture(380, 240, "jpeg", 4));
    expect(tiny.width).toBe(760);
    expect(tiny.card).toBeNull();
  });

  it("is stored beside the hero under its stamp, served as the `card` size, and swept with the rest", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(3200, 2000, "jpeg", 1)] }]));
    const { client, db } = fakeDb(null);
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: null, waitMs: 5_000, gallery: false });
    expect(got).toMatchObject({ width: 1600, height: 1000, cardWidth: CARD_PX, cardHeight: 500 });
    expect(got!.card).toBe(got!.hero.replace("-hero.jpg", "-card.jpg"));
    expect(cardPathOf(got!)).toBe(got!.card);
    expect(cardCopyDue(got!)).toBe(false);
    expect(picturePathFor(got!, "card")).toBe(got!.card);
    expect((await sharp(await readPictureBytes("d1", got!, "card")).metadata()).width).toBe(CARD_PX);
    expect(picturePaths(db.photo)).toContain(got!.card);
  });

  it("is made from a stored hero for a photograph stored before, and stored onto it after the route's response", async () => {
    // OLD: a 1600 x 1100 hero, stored before card copies.
    expect(cardCopyDue(OLD)).toBe(true);
    expect(cardCopyDue({ ...OLD, width: 800, height: 550 })).toBe(false);
    // Until it is stored, the `card` size reads the hero.
    expect(picturePathFor(OLD, "card")).toBe(OLD.hero);
    const made = await cardOf(await testPicture(1600, 1100, "jpeg", 5));
    expect(made && { w: made.width, h: made.height }).toEqual({ w: CARD_PX, h: 550 });
    // Never enlarged: a hero no longer than a card copy makes none.
    expect(await cardOf(await testPicture(800, 550, "jpeg", 5))).toBeNull();
    expect(await cardOf(Buffer.from("not a picture"))).toBeNull();
    const cache: DealVisualCache = { picture: OLD, pictureSearchV: PICTURE_SEARCH_VERSION, galleryV: GALLERY_VERSION };
    const { client, db } = fakeDb(cache);
    await backfillCard(client, "d1", OLD, made!);
    expect(store.uploads).toEqual(["photos/d1/old-card.jpg"]);
    expect(db.photo?.picture).toEqual({ ...OLD, card: "photos/d1/old-card.jpg", cardWidth: CARD_PX, cardHeight: 550 });
    // Everything else in the cache as it was.
    expect(db.photo?.pictureSearchV).toBe(PICTURE_SEARCH_VERSION);
    expect(db.photo?.galleryV).toBe(GALLERY_VERSION);
    // Stored once: a second ask finds it in place and puts nothing.
    await backfillCard(client, "d1", OLD, made!);
    expect(store.uploads).toHaveLength(1);
    // A gallery photograph's copy goes onto its own place in the gallery.
    const g2: DealPicture = { ...OLD, hero: "photos/d1/oldg2-hero.jpg", thumb: "photos/d1/oldg2-thumb.jpg", page: 4 };
    const withGallery = fakeDb({ picture: OLD, gallery: [{ ...OLD, hero: "photos/d1/oldg1-hero.jpg", page: 2 }, g2] });
    await backfillCard(withGallery.client, "d1", g2, made!, 2);
    expect(withGallery.db.photo?.gallery?.[1]).toEqual({ ...g2, card: "photos/d1/oldg2-card.jpg", cardWidth: CARD_PX, cardHeight: 550 });
    expect(withGallery.db.photo?.gallery?.[0].card).toBeUndefined();
    expect(withGallery.db.photo?.picture).toEqual(OLD);
  });

  it("never puts the copy onto a photograph replaced meanwhile, and takes its own file away again", async () => {
    const made = (await cardOf(await testPicture(1600, 1100, "jpeg", 6)))!;
    // Replaced before the copy was put: nothing is put.
    const replaced: DealPicture = { ...OLD, hero: "photos/d1/new-hero.jpg", thumb: "photos/d1/new-thumb.jpg", source: "upload" };
    const gone = fakeDb({ picture: replaced });
    await backfillCard(gone.client, "d1", OLD, made);
    expect(gone.db.photo?.picture).toEqual(replaced);
    expect(store.uploads).toEqual([]);
    // Replaced while the copy was put: the copy is taken away again.
    const racing = fakeDb({ picture: OLD });
    const put = store.uploads.length;
    const real = racing.client.from;
    let reads = 0;
    (racing.client as unknown as { from: typeof real }).from = (...args: Parameters<typeof real>) => {
      const q = real(...args);
      return {
        ...q,
        select: (...s: Parameters<typeof q.select>) => {
          // The second read, just before the write, finds the photograph replaced.
          if (++reads === 2) racing.db.photo = { picture: replaced };
          return q.select(...s);
        },
      } as typeof q;
    };
    await backfillCard(racing.client, "d1", OLD, made);
    expect(store.uploads.slice(put)).toEqual(["photos/d1/old-card.jpg"]);
    expect(store.removed).toEqual(["photos/d1/old-card.jpg"]);
    expect(racing.db.photo?.picture).toEqual(replaced);
  });
});
