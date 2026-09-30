import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture, DealVisualCache } from "./deal-location";

// The deal's own picture route, driven with its reads faked: which stored
// photograph it serves, and what it leaves to run after the response — the
// backfill of a photograph stored before its preview and its point of
// interest were kept (lib/deal-picture `backfillPicture`).
const route = vi.hoisted(() => ({
  photo: null as DealVisualCache | null,
  after: [] as (() => unknown)[],
  backfills: [] as { picture: DealPicture; bytes: number | null; gallery: number | null }[],
  reads: [] as string[],
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    route.after.push(task);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "d1", photo: route.photo, om_storage_path: "u1/d1.pdf", is_sample: false } }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/deal-picture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./deal-picture")>()),
  ensureDealPicture: async (_s: unknown, _id: string, opts: { cache: DealVisualCache | null }) => opts.cache?.picture ?? null,
  readPictureBytes: async (_id: string, picture: DealPicture, size: string) => {
    route.reads.push(`${picture.hero}:${size}`);
    return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  },
  backfillPicture: async (_s: unknown, _id: string, picture: DealPicture, opts: { bytes?: Buffer; gallery?: number | null } = {}) => {
    route.backfills.push({ picture, bytes: opts.bytes ? opts.bytes.length : null, gallery: opts.gallery ?? null });
  },
}));

import { GET } from "@/app/api/deals/[id]/picture/route";

const COVER: DealPicture = {
  hero: "photos/d1/a-hero.jpg",
  thumb: "photos/d1/a-thumb.jpg",
  width: 1600,
  height: 1067,
  source: "om",
  at: "2026-09-01T00:00:00Z",
};
const PREVIEW = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAAAwAgCdASoYABAAPm0wkkWkIqGYBABABsSgCdMoRwBAbAhvCgAA/vy3qgA=";
const COMPLETE: DealPicture = { ...COVER, preview: PREVIEW, focus: { x: 0.7, y: 0.4 } };

const ask = (query: string, etag?: string) =>
  GET(new Request(`http://x/api/deals/d1/picture?${query}`, { headers: etag ? { "if-none-match": etag } : {} }), {
    params: Promise.resolve({ id: "d1" }),
  });
const runAfter = async () => {
  for (const task of route.after.splice(0)) await task();
};

describe("the deal's picture route fills in what a photograph stored before them lacks", () => {
  beforeEach(() => {
    route.photo = null;
    route.after = [];
    route.backfills = [];
    route.reads = [];
  });

  it("after serving the cover, from the bytes it just sent", async () => {
    route.photo = { picture: COVER };
    const res = await ask("size=hero");
    expect(res.status).toBe(200);
    await runAfter();
    expect(route.backfills).toEqual([{ picture: COVER, bytes: 4, gallery: null }]);
    // The full-size copy is the same frame, and serves as well.
    route.photo = { picture: { ...COVER, full: "photos/d1/a-full.jpg", fullWidth: 2560, fullHeight: 1707 } };
    await ask("size=full");
    await runAfter();
    expect(route.backfills.at(-1)).toMatchObject({ bytes: 4, gallery: null });
  });

  it("after a 304, from its hero read once from storage — the browser already had the photograph", async () => {
    route.photo = { picture: COVER };
    const res = await ask("size=hero", `W/"${COVER.hero}"`);
    expect(res.status).toBe(304);
    // The response itself read nothing.
    expect(route.reads).toEqual([]);
    await runAfter();
    expect(route.backfills).toEqual([{ picture: COVER, bytes: null, gallery: null }]);
    // Its point looked for, a preview still missing waits for a response
    // that holds the bytes: a 304 never reads storage for it alone.
    route.photo = { picture: { ...COVER, focus: null } };
    await ask("size=hero", `W/"${COVER.hero}"`);
    expect(route.after).toEqual([]);
    await ask("size=hero");
    await runAfter();
    expect(route.backfills.at(-1)).toMatchObject({ bytes: 4, gallery: null });
  });

  it("for the gallery photograph asked for, by its place in the gallery", async () => {
    const other: DealPicture = { ...COVER, hero: "photos/d1/b-hero.jpg", thumb: "photos/d1/b-thumb.jpg", page: 4 };
    route.photo = { picture: COMPLETE, gallery: [{ ...other, preview: PREVIEW, focus: null }, other] };
    await ask("size=hero&g=2");
    await runAfter();
    expect(route.backfills).toEqual([{ picture: other, bytes: 4, gallery: 2 }]);
    // The first is complete — its point looked for once and none found.
    await ask("size=hero&g=1");
    await runAfter();
    expect(route.backfills).toHaveLength(1);
  });

  it("never from a thumbnail, which is a crop and not the frame, and never for a photograph that has both", async () => {
    route.photo = { picture: COVER };
    await ask("size=thumb");
    await runAfter();
    expect(route.backfills).toEqual([]);
    route.photo = { picture: COMPLETE };
    await ask("size=hero");
    await ask("size=hero", `W/"${COMPLETE.hero}"`);
    expect(route.after).toEqual([]);
  });
});
