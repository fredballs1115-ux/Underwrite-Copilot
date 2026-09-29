import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture, DealVisualCache } from "./deal-location";
import { testMap, testMemorandum, testPicture } from "./test-memorandum";

// Storage faked: the memorandum each deal holds, what is written, what is removed.
const store = vi.hoisted(() => ({
  oms: new Map<string, Uint8Array | Error>(),
  uploads: [] as string[],
  removed: [] as string[],
}));

vi.mock("@/lib/storage", () => ({
  dealPhotoPath: (dealId: string, stamp: string, size: string) => `photos/${dealId}/${stamp}-${size}.jpg`,
  downloadDealFile: async () => Buffer.alloc(0),
  downloadOmPdf: async (path: string) => {
    const om = store.oms.get(path);
    if (!om) throw new Error("no such object");
    if (om instanceof Error) throw om;
    return om;
  },
  uploadDealPhoto: async (path: string) => {
    store.uploads.push(path);
  },
  removeStorageFiles: async (paths: string[]) => {
    store.removed.push(...paths);
  },
}));

import { PICTURE_SEARCH_VERSION, ensureDealPicture } from "./deal-picture";

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
    store.uploads = [];
    store.removed = [];
  });

  it("is replaced by the cover page's photograph, and the old pair removed", async () => {
    store.oms.set("u/d1.pdf", await testMemorandum([{ images: [await testPicture(800, 500, "jpeg")] }]));
    const { client, db } = fakeDb(staleCache());
    const got = await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache: staleCache(), waitMs: 5_000 });
    expect(got).not.toBeNull();
    expect(got!.hero).not.toBe(OLD.hero);
    expect({ w: got!.width, h: got!.height, source: got!.source }).toEqual({ w: 800, h: 500, source: "om" });
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
    expect(db.photo?.picture?.width).toBe(800);
  });

  it("never touches the reader's own picture, whatever rules it was stored under", async () => {
    const own: DealPicture = { ...OLD, source: "upload" };
    const cache: DealVisualCache = { picture: own, pictureSearchV: 1 };
    const { client } = fakeDb(cache);
    expect(await ensureDealPicture(client, "d1", { omPath: "u/d1.pdf", isSample: false, cache, waitMs: 5_000 })).toBe(own);
    expect(store.uploads).toEqual([]);
  });
});
