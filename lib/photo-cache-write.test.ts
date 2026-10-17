/**
 * Every write of a deal's photo cache lands only on the record it read
 * (research pass 39): a photograph replaced between a writer's read and its
 * write is never put back to the one before, and its files never end up
 * recorded nowhere. The table is faked as PostgREST filters a jsonb column;
 * the pictures are real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const removed = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  removeStorageFiles: async (paths: string[]) => {
    removed.push(...paths);
  },
}));

import { backfillPreview, clearOmPicture } from "./deal-picture";
import { onPhotoRecord, photoRecordKeys, writeCache, type DealPicture, type DealVisualCache } from "./deal-location";

const DEAL = "11111111-2222-4333-8444-555555555555";
const pic = (stamp: string, source: DealPicture["source"]): DealPicture => ({
  hero: `photos/${DEAL}/${stamp}-hero.jpg`,
  thumb: `photos/${DEAL}/${stamp}-thumb.jpg`,
  width: 1600,
  height: 900,
  source,
  at: "2026-10-01T00:00:00Z",
});
const OM = pic("old1", "om");
const UPLOAD = pic("new2", "upload");

/**
 * One deals row's photo column, read and written as PostgREST does: a jsonb
 * path filter reads the value at that path, `is null` holds where there is
 * none. `between` runs after each read — another writer, landing between a
 * read and the write that follows it.
 */
function table(photo: DealVisualCache | null) {
  const row = { photo: photo as DealVisualCache | null };
  let between: (() => void) | null = null;
  const at = (path: string): unknown => {
    let v: unknown = { photo: row.photo };
    for (const k of path.split(/->>?/)) v = v == null ? undefined : (v as Record<string, unknown>)[k];
    return v;
  };
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const snap = JSON.parse(JSON.stringify({ photo: row.photo }));
            const run = between;
            between = null;
            run?.();
            return { data: snap, error: null };
          },
        }),
      }),
      update: (patch: { photo: DealVisualCache }) => {
        const filters: (() => boolean)[] = [];
        const write = async () => {
          if (filters.some((meets) => !meets())) return { data: [], error: null };
          row.photo = JSON.parse(JSON.stringify(patch.photo));
          return { data: [{ id: DEAL }], error: null };
        };
        const chain = {
          eq: (col: string, v: unknown) => {
            if (col !== "id") filters.push(() => at(col) === v);
            return chain;
          },
          is: (col: string, v: null) => {
            filters.push(() => (v === null ? at(col) == null : at(col) === v));
            return chain;
          },
          select: () => write(),
          then: (ok: (r: unknown) => unknown, fail?: (e: unknown) => unknown) => write().then(ok, fail),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return {
    client,
    row,
    /** another writer, after the next read */
    meanwhile: (change: () => void) => {
      between = change;
    },
  };
}

beforeEach(() => {
  removed.length = 0;
});

describe("the record a write is held to", () => {
  it("names the photograph, the gallery's first photograph and the flood frame by their stored paths, or none", () => {
    expect(photoRecordKeys(null)).toEqual({ picture: null, gallery: null, flood: null });
    const cache = { picture: OM, gallery: [UPLOAD], floodFrame: { path: `flood/${DEAL}/f1.jpg` } } as DealVisualCache;
    expect(photoRecordKeys(cache)).toEqual({ picture: OM.hero, gallery: UPLOAD.hero, flood: `flood/${DEAL}/f1.jpg` });
    const calls: string[] = [];
    const q = {
      eq: (c: string, v: string) => (calls.push(`${c}=eq.${v}`), q),
      is: (c: string) => (calls.push(`${c}=is.null`), q),
    };
    onPhotoRecord(q, { picture: OM });
    expect(calls).toEqual([`photo->picture->>hero=eq.${OM.hero}`, "photo->gallery->0->>hero=is.null", "photo->floodFrame->>path=is.null"]);
  });
});

describe("a photograph replaced between a writer's read and its write is never undone", () => {
  it("backfillPreview: the replacement stands, and takes no preview made of another photograph's bytes", async () => {
    const t = table({ picture: OM });
    t.meanwhile(() => {
      t.row.photo = { picture: UPLOAD };
    });
    const hero = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer();
    await backfillPreview(t.client, DEAL, OM, hero);
    expect(t.row.photo?.picture?.hero).toBe(UPLOAD.hero);
    expect(t.row.photo?.picture?.preview).toBeUndefined();
  });

  it("backfillPreview: with nothing replaced, the preview lands on the photograph it was made of", async () => {
    const t = table({ picture: OM });
    const hero = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer();
    await backfillPreview(t.client, DEAL, OM, hero);
    expect(t.row.photo?.picture?.hero).toBe(OM.hero);
    expect(t.row.photo?.picture?.preview).toMatch(/^data:image\//);
  });

  it("writeCache: a geocode lands over the replacement, never with the photograph before it", async () => {
    const t = table({ picture: OM });
    t.meanwhile(() => {
      t.row.photo = { picture: UPLOAD };
    });
    expect(await writeCache(t.client, DEAL, { picture: OM }, { lat: 39.95, lng: -75.16 })).toBe(true);
    expect(t.row.photo).toMatchObject({ picture: { hero: UPLOAD.hero }, lat: 39.95, lng: -75.16 });
  });

  it("writeCache: a flood frame recorded while a photograph is stored keeps both", async () => {
    const t = table({});
    t.meanwhile(() => {
      t.row.photo = { picture: UPLOAD };
    });
    const floodFrame = { path: `flood/${DEAL}/f2.jpg` } as DealVisualCache["floodFrame"];
    expect(await writeCache(t.client, DEAL, null, { floodFrame })).toBe(true);
    expect(t.row.photo?.picture?.hero).toBe(UPLOAD.hero);
    expect(t.row.photo?.floodFrame?.path).toBe(`flood/${DEAL}/f2.jpg`);
  });

  it("clearOmPicture: a reader's photograph stored since the caller read the row stays, and its files are not removed", async () => {
    // The caller read the memorandum's cover; the reader's upload is what
    // the row holds by the time the clear is written.
    const t = table({ picture: UPLOAD });
    await clearOmPicture(t.client, DEAL, { picture: OM });
    expect(t.row.photo?.picture?.hero).toBe(UPLOAD.hero);
    expect(removed).not.toContain(UPLOAD.hero);
  });

  it("clearOmPicture: the memorandum's cover the row holds is cleared, and its files go", async () => {
    const t = table({ picture: OM, pictureCheckedAt: "2026-10-01T00:00:00Z" });
    await clearOmPicture(t.client, DEAL, { picture: OM });
    expect(t.row.photo?.picture).toBeUndefined();
    expect(removed).toEqual(expect.arrayContaining([OM.hero, OM.thumb]));
  });
});
