/**
 * The shared screen's aerial (the security review of 2026-10-01), driven
 * through the REAL route, the real kept copy (lib/deal-aerial) and the real
 * USGS fetch with its gate (lib/imagery) — only the database and the network
 * are faked. The reviewer's harness, turned around: one link asked many
 * times, at many sizes and all at once, is one USGS export.
 */
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEO_VERSION, geoKey } from "./deal-location";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

/** Tables of rows; `maybeSingle` answers the first row matching every eq. */
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () =>
    ({
      from(table: string) {
        const filters: [string, unknown][] = [];
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => {
            filters.push([k, v]);
            return q;
          },
          update: () => q,
          maybeSingle: async () => ({
            data: (state.tables[table] ?? []).find((r) => filters.every(([k, v]) => r[k] === v)) ?? null,
            error: null,
          }),
        };
        return q;
      },
    }) as unknown as SupabaseClient,
}));

import { GET } from "@/app/api/share/[token]/aerial/route";
import { MAX_HELD_AERIALS, forgetDealAerials } from "./deal-aerial";
import { AERIAL_IN_FLIGHT } from "./imagery";
import { SHARE_AERIAL } from "./image-frames";

const LATER = "2099-09-30T12:00:00Z";
const address = {
  label: "1 Main St, Philadelphia, PA 19106",
  street: "1 Main St",
  city: "Philadelphia",
  state: "PA",
};

/** A deal with its place already resolved, so no geocoder is asked. */
function dealRow(id: string, lat = 39.95, lng = -75.15): Row {
  return {
    id,
    name: `Deal ${id}`,
    asset_class: "multifamily",
    address,
    extraction: null,
    first_signal: null,
    comps: null,
    market: null,
    verdict: { verdict: "pass" },
    updated_at: null,
    user_id: "u1",
    team_id: null,
    site_flags: null,
    photo: {
      lat,
      lng,
      geoPrecision: "street",
      geoAt: new Date().toISOString(),
      geoV: GEO_VERSION,
      geoFor: geoKey(address as never),
    },
  };
}

/** A share link's token, made from a number so each deal has its own. */
const tokenFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const shareRow = (n: number, dealId: string, over: Row = {}): Row => ({
  id: tokenFor(n),
  deal_id: dealId,
  expires_at: LATER,
  revoked: false,
  created_by: "u1",
  ...over,
});

const ask = (token: string, query = `?w=${SHARE_AERIAL.w}&h=${SHARE_AERIAL.h}`) =>
  GET(new Request(`https://app.test/api/share/${token}/aerial${query}`), {
    params: Promise.resolve({ token }),
  });

/** USGS answering after `ms` with a real JPEG, recording each export asked. */
async function usgs(opts: { ms?: number; fail?: () => boolean } = {}) {
  const body = await sharp({ create: { width: 96, height: 40, channels: 3, background: "#6b7d5c" } }).jpeg().toBuffer();
  const asked: URL[] = [];
  const seen = { active: 0, peak: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (!u.hostname.includes("nationalmap.gov")) throw new Error(`unexpected fetch ${u}`);
      asked.push(u);
      seen.active++;
      seen.peak = Math.max(seen.peak, seen.active);
      await new Promise((r) => setTimeout(r, opts.ms ?? 20));
      seen.active--;
      if (opts.fail?.()) {
        return new Response(JSON.stringify({ error: { code: 500 } }), { headers: { "content-type": "application/json" } });
      }
      return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg" } });
    }),
  );
  return { asked, seen };
}

describe("the shared screen's aerial: one link is one drawing, not one a request", () => {
  beforeEach(() => {
    forgetDealAerials();
    state.tables = { deal_shares: [shareRow(1, "d1")], deals: [dealRow("d1")] };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("answers forty asks at forty sizes, all at once, and two more after, with one USGS export at the page's frame", async () => {
    const { asked, seen } = await usgs();
    const token = tokenFor(1);
    const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => ask(token, `?w=${300 + i}&h=${200 + i}`)));
    const after = [await ask(token), await ask(token, "?w=1280&h=1280")];
    const all = [...burst, ...after];
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(asked).toHaveLength(1);
    expect(seen.peak).toBe(1);
    expect(asked[0].searchParams.get("size")).toBe(`${SHARE_AERIAL.w},${SHARE_AERIAL.h}`);
    // Every answer is the one drawing, finished (a JPEG) and credited.
    const bodies = await Promise.all(all.map(async (r) => Buffer.from(await r.arrayBuffer()).toString("base64")));
    expect(new Set(bodies).size).toBe(1);
    expect(all[0].headers.get("content-type")).toBe("image/jpeg");
    expect(all[0].headers.get("x-image-credit")).toContain("USGS");
  });

  it("draws a deal again once it has moved, never showing it at its old place", async () => {
    const { asked } = await usgs();
    const token = tokenFor(1);
    expect((await ask(token)).status).toBe(200);
    state.tables.deals = [dealRow("d1", 40.75, -73.99)];
    expect((await ask(token)).status).toBe(200);
    expect((await ask(token)).status).toBe(200);
    expect(asked).toHaveLength(2);
    expect(asked[0].searchParams.get("bbox")).not.toBe(asked[1].searchParams.get("bbox"));
  });

  it("keeps nothing from a failed export, so the next ask tries again", async () => {
    let failing = true;
    const { asked } = await usgs({ fail: () => failing });
    const token = tokenFor(1);
    expect((await ask(token)).status).toBe(404);
    failing = false;
    expect((await ask(token)).status).toBe(200);
    expect((await ask(token)).status).toBe(200);
    expect(asked).toHaveLength(2);
  });

  it("serves a dead link nothing, though its deal's aerial is kept", async () => {
    await usgs();
    const token = tokenFor(1);
    expect((await ask(token)).status).toBe(200);
    state.tables.deal_shares = [shareRow(1, "d1", { revoked: true })];
    expect((await ask(token)).status).toBe(404);
  });

  it(`asks USGS for at most ${AERIAL_IN_FLIGHT} exports at once, and answers every ask`, async () => {
    const { asked, seen } = await usgs({ ms: 15 });
    const n = AERIAL_IN_FLIGHT * 3;
    state.tables = {
      deal_shares: Array.from({ length: n }, (_, i) => shareRow(i + 1, `d${i + 1}`)),
      deals: Array.from({ length: n }, (_, i) => dealRow(`d${i + 1}`, 39 + i / 100, -75)),
    };
    const got = await Promise.all(Array.from({ length: n }, (_, i) => ask(tokenFor(i + 1))));
    expect(got.every((r) => r.status === 200)).toBe(true);
    expect(asked).toHaveLength(n);
    expect(seen.peak).toBe(AERIAL_IN_FLIGHT);
  });

  it(`keeps at most ${MAX_HELD_AERIALS} deals' aerials, the oldest out first`, async () => {
    const { asked } = await usgs({ ms: 1 });
    const n = MAX_HELD_AERIALS + 1;
    state.tables = {
      deal_shares: Array.from({ length: n }, (_, i) => shareRow(i + 1, `d${i + 1}`)),
      deals: Array.from({ length: n }, (_, i) => dealRow(`d${i + 1}`, 39 + i / 100, -75)),
    };
    for (let i = 1; i <= n; i++) expect((await ask(tokenFor(i))).status).toBe(200);
    expect(asked).toHaveLength(n);
    // The newest is still kept; the first was let go and is drawn again.
    await ask(tokenFor(n));
    expect(asked).toHaveLength(n);
    await ask(tokenFor(1));
    expect(asked).toHaveLength(n + 1);
  });
});
