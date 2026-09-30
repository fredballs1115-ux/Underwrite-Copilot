/**
 * The share token's one resolution, driven against a fake admin client: the
 * six refusals in order, the deal handed back whole when the link is good —
 * and the token-scoped aerial and picture routes, which must answer a dead
 * link with a bare 404 before they ask any source for a picture.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN = "0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const NOW = Date.parse("2026-09-08T16:00:00Z");
// A good link's expiry. The resolver's own tests pass NOW, but the aerial
// and picture routes read the real clock, so this must lie past any day the
// suite runs on: it was noon on 2026-09-30, and every run after that noon
// read the good link as expired.
const LATER = "2099-09-30T12:00:00Z";
const EARLIER = "2026-09-01T12:00:00Z";

type Row = Record<string, unknown>;

/** Tables of rows; `maybeSingle` answers the first row matching every eq. */
function fakeDb(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          const row =
            (tables[table] ?? []).find((r) => filters.every(([k, v]) => r[k] === v)) ?? null;
          return Promise.resolve({ data: row, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, reads };
}

const share = (over: Row = {}): Row => ({
  id: TOKEN,
  deal_id: "deal-1",
  expires_at: LATER,
  revoked: false,
  created_by: "creator",
  ...over,
});
const deal = (over: Row = {}): Row => ({
  id: "deal-1",
  name: "The Maddox at Brewerytown",
  asset_class: "multifamily",
  address: { label: "Brewerytown, Philadelphia, PA", street: "" },
  photo: null,
  extraction: null,
  comps: null,
  market: null,
  verdict: { verdict: "caution", reason: "…", topRisks: [], nextSteps: [] },
  updated_at: null,
  user_id: "creator",
  team_id: "team-1",
  ...over,
});

const state = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  imageryCalls: 0,
  imageryAnswers: true,
  pictureReads: [] as string[],
  pictureAnswers: true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => state.client,
}));
vi.mock("@/lib/imagery", () => ({
  IMAGE_CREDIT: { aerial: "USGS The National Map (public domain)" },
  fetchOneImage: async (source: string) => {
    state.imageryCalls += 1;
    if (!state.imageryAnswers) return null;
    return {
      source,
      response: new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    };
  },
}));

vi.mock("@/lib/deal-picture", () => ({
  PICTURE_CREDIT: { om: "From the offering memorandum", upload: "Photograph added to the deal" },
  readPictureBytes: async (dealId: string, _picture: unknown, size: string) => {
    state.pictureReads.push(`${dealId}:${size}`);
    if (!state.pictureAnswers) throw new Error("the stored file is gone");
    return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  },
}));

import { SHARE_REFUSAL_COPY, resolveShare } from "./share-resolve";
import { GET } from "@/app/api/share/[token]/aerial/route";
import { GET as GET_PICTURE } from "@/app/api/share/[token]/picture/route";

describe("resolveShare — the six refusals, then the deal", () => {
  it("refuses a malformed token before touching the database", async () => {
    const { client, reads } = fakeDb({});
    expect(await resolveShare(client, "not-a-uuid", NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(await resolveShare(client, "", NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(reads).toEqual([]);
  });

  it("missing, revoked and expired links each name their reason", async () => {
    const missing = fakeDb({ deal_shares: [] });
    expect(await resolveShare(missing.client, TOKEN, NOW)).toEqual({ ok: false, reason: "missing" });

    const revoked = fakeDb({ deal_shares: [share({ revoked: true })] });
    expect(await resolveShare(revoked.client, TOKEN, NOW)).toEqual({ ok: false, reason: "revoked" });

    const expired = fakeDb({ deal_shares: [share({ expires_at: EARLIER })], deals: [deal()] });
    expect(await resolveShare(expired.client, TOKEN, NOW)).toEqual({ ok: false, reason: "expired" });
    // The same link is good an hour before it expires.
    expect((await resolveShare(expired.client, TOKEN, Date.parse(EARLIER) - 3_600_000)).ok).toBe(true);
    // None of the three read the deal.
    expect(revoked.reads).toEqual(["deal_shares"]);
  });

  it("a deal that is gone or never reached a verdict is unavailable", async () => {
    const gone = fakeDb({ deal_shares: [share()], deals: [] });
    expect(await resolveShare(gone.client, TOKEN, NOW)).toEqual({ ok: false, reason: "unavailable" });
    const unscreened = fakeDb({ deal_shares: [share()], deals: [deal({ verdict: null })] });
    expect(await resolveShare(unscreened.client, TOKEN, NOW)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a sender who left the team no longer opens the door; a current member and the creator do", async () => {
    const left = fakeDb({
      deal_shares: [share({ created_by: "member-gone" })],
      deals: [deal()],
      team_members: [{ team_id: "team-1", user_id: "member-current" }],
    });
    expect(await resolveShare(left.client, TOKEN, NOW)).toEqual({ ok: false, reason: "sender_lost_access" });

    const member = fakeDb({
      deal_shares: [share({ created_by: "member-current" })],
      deals: [deal()],
      team_members: [{ team_id: "team-1", user_id: "member-current" }],
    });
    expect((await resolveShare(member.client, TOKEN, NOW)).ok).toBe(true);

    const creator = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null })] });
    const res = await resolveShare(creator.client, TOKEN, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.share.dealId).toBe("deal-1");
      expect(res.share.expiresAt).toBe(LATER);
      expect(res.share.deal.name).toBe("The Maddox at Brewerytown");
      expect(res.share.deal.address).toEqual({ label: "Brewerytown, Philadelphia, PA", street: "" });
    }
  });

  it("every refusal has one sentence the holder can act on", () => {
    for (const reason of ["malformed", "missing", "revoked", "expired", "unavailable", "sender_lost_access"] as const) {
      expect(SHARE_REFUSAL_COPY[reason]).toMatch(/[.]$/);
    }
  });
});

describe("GET /api/share/[token]/aerial — the picture lives exactly as long as the link", () => {
  beforeEach(() => {
    state.imageryCalls = 0;
    state.imageryAnswers = true;
  });
  const get = (token: string, query = "?w=960&h=400") =>
    GET(new NextRequest(`https://app.test/api/share/${token}/aerial${query}`), {
      params: Promise.resolve({ token }),
    });

  it("serves the aerial for a good link, credited to USGS", async () => {
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null })] }).client;
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-image-credit")).toContain("USGS");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(state.imageryCalls).toBe(1);
  });

  it("a revoked, expired or malformed link is a bare 404 and asks no source for a picture", async () => {
    state.client = fakeDb({ deal_shares: [share({ revoked: true })], deals: [deal({ team_id: null })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    state.client = fakeDb({ deal_shares: [share({ expires_at: EARLIER })], deals: [deal({ team_id: null })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
    expect(state.imageryCalls).toBe(0);
  });

  it("a deal with no address, and a frame no source can produce, are 404 too", async () => {
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null, address: null })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    expect(state.imageryCalls).toBe(0);

    state.imageryAnswers = false;
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    expect(state.imageryCalls).toBe(1);
  });
});

describe("GET /api/share/[token]/picture — the deal's own photograph, as long as the link lives (#434)", () => {
  const PICTURE = {
    hero: "photos/deal-1/1700000000000-hero.jpg",
    thumb: "photos/deal-1/1700000000000-thumb.jpg",
    width: 1600,
    height: 1067,
    source: "upload",
    at: "2026-09-20T12:00:00Z",
  };
  beforeEach(() => {
    state.pictureReads = [];
    state.pictureAnswers = true;
  });
  const get = (token: string, query = "?size=hero", headers?: Record<string, string>) =>
    GET_PICTURE(new NextRequest(`https://app.test/api/share/${token}/picture${query}`, { headers }), {
      params: Promise.resolve({ token }),
    });

  it("serves the stored photograph for a good link, credited by its own source and revalidated every view", async () => {
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null, photo: { picture: PICTURE } })] }).client;
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-image-credit")).toBe("Photograph added to the deal");
    // Revalidated rather than cached for a day, so a revoked link's
    // picture stops with the link and a replaced one shows at once.
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toBe(`W/"${PICTURE.hero}"`);
    expect(state.pictureReads).toEqual(["deal-1:hero"]);
    // An unchanged picture costs a 304 and no read.
    const again = await get(TOKEN, "?size=hero", { "if-none-match": `W/"${PICTURE.hero}"` });
    expect(again.status).toBe(304);
    expect(state.pictureReads).toEqual(["deal-1:hero"]);
    // The thumbnail is its own derivative.
    expect((await get(TOKEN, "?size=thumb")).status).toBe(200);
    expect(state.pictureReads).toEqual(["deal-1:hero", "deal-1:thumb"]);
  });

  it("a dead link is a bare 404 and reads nothing", async () => {
    state.client = fakeDb({ deal_shares: [share({ revoked: true })], deals: [deal({ team_id: null, photo: { picture: PICTURE } })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
    expect(state.pictureReads).toEqual([]);
  });

  it("no stored photograph is a 404 without a read — a share never lifts one out of the memorandum — and a missing file is a 404 too", async () => {
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null, photo: null })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
    expect(state.pictureReads).toEqual([]);

    state.pictureAnswers = false;
    state.client = fakeDb({ deal_shares: [share()], deals: [deal({ team_id: null, photo: { picture: PICTURE } })] }).client;
    expect((await get(TOKEN)).status).toBe(404);
  });
});
