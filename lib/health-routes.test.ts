/**
 * The diagnostic routes (research pass 22), each driven as a caller with no
 * session, a signed-in account that is not one of the site's operators,
 * and an operator (OPERATOR_EMAILS, lib/operator-server). The costly part
 * of each runs for the operator alone: the Google probes on the site's own
 * key (the Static Maps one billed), the news route's refresh of every feed,
 * and the probes of every public-records portal. live-verify's read of the
 * news route, made with no session, keeps working as it was. The flood
 * route's process id and uptime are the operator's alone (research pass 39;
 * live-verify never printed them, while it prints the news route's).
 * Only the session and the network are faked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, reads: 0, fails: false }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => {
    session.reads++;
    if (session.fails) throw new Error("the auth service did not answer");
    return session.user;
  },
}));

const news = vi.hoisted(() => ({ forgets: 0 }));
vi.mock("@/lib/news/live", () => ({
  fetchLiveHeadlines: async () => ({
    fetchedAt: "2026-10-04T06:00:00Z",
    sources: [{ name: "Example Wire", ok: true, ms: 12, count: 3 }],
    headlines: [],
  }),
  forgetLiveHeadlines: () => {
    news.forgets++;
  },
  heldHosts: () => [],
  lastWarmUp: () => null,
}));

// The flood check's own work is FEMA's and USGS's, kept ten minutes a
// process; here it answers at once, as a kept answer does.
vi.mock("@/lib/flood-map", () => ({
  floodHealth: async () => ({
    checkedAt: "2026-10-05T06:00:00Z",
    summary: "every step answered",
    layer: { ok: true, ms: 10, id: 28 },
    legend: { ok: true, ms: 10, entries: 3, values: 3, matchesCopy: true, added: [], removed: [] },
    overlay: { ok: true, ms: 10, bytes: 2048, scale: 1, classes: [] },
    aerial: { ok: true, ms: 10, bytes: 4096 },
  }),
}));

import { GET as imageryHealth } from "@/app/api/imagery/health/route";
import { GET as newsHealth } from "@/app/api/news/health/route";
import { GET as compsHealth } from "@/app/api/comps/health/route";
import { GET as floodHealthRoute } from "@/app/api/flood/health/route";
import { PROVIDERS } from "./public-comps/core";

const OPERATOR = { id: "op", email: "ops@underwrite.example", email_confirmed_at: "2026-01-02T00:00:00Z" };
const CUSTOMER = { id: "cu", email: "buyer@example.com", email_confirmed_at: "2026-01-02T00:00:00Z" };
/** An operator's address on an account that never confirmed it is no operator's. */
const UNCONFIRMED = { id: "un", email: "ops@underwrite.example", email_confirmed_at: null };

const fetched: URL[] = [];
const env: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OPERATOR_EMAILS", "GOOGLE_MAPS_API_KEY"]) env[k] = process.env[k];
  process.env.OPERATOR_EMAILS = "ops@underwrite.example";
  process.env.GOOGLE_MAPS_API_KEY = "test-maps-key";
  session.user = null;
  session.reads = 0;
  session.fails = false;
  news.forgets = 0;
  fetched.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      fetched.push(u);
      // Google's metadata and every portal answer JSON; every picture an image.
      return u.pathname.endsWith("/metadata") || !/staticmap|export|tile|MapServer\/tile/i.test(u.href)
        ? new Response(JSON.stringify({ status: "OK", layers: [{ id: 0, name: "Parcels" }] }), {
            headers: { "content-type": "application/json" },
          })
        : new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } });
    }),
  );
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

const toGoogle = () => fetched.filter((u) => u.hostname === "maps.googleapis.com");

describe("/api/imagery/health", () => {
  it("answers no one without a session, and asks nothing", async () => {
    const res = await imageryHealth();
    expect(res.status).toBe(401);
    expect(fetched).toEqual([]);
  });

  it("gives a signed-in customer the free probes, and makes no call on the site's Google key", async () => {
    for (const user of [CUSTOMER, UNCONFIRMED]) {
      session.user = user;
      fetched.length = 0;
      const res = await imageryHealth();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.googleConfigured).toBe(true);
      expect(body.googleProbed).toBe(false);
      expect(body.sources.streetView.detail).toMatch(/operators only/);
      expect(body.sources.satellite.detail).toMatch(/operators only/);
      expect(toGoogle()).toEqual([]);
      // …while the free ones still run: USGS's export.
      expect(fetched.some((u) => u.hostname.endsWith("nationalmap.gov"))).toBe(true);
    }
  });

  it("probes Google for an operator: the Street View metadata and the billed Static Maps call", async () => {
    session.user = OPERATOR;
    const res = await imageryHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.googleProbed).toBe(true);
    expect(toGoogle().map((u) => u.pathname).sort()).toEqual(["/maps/api/staticmap", "/maps/api/streetview/metadata"]);
    expect(body.sources.satellite.ok).toBe(true);
    // The key is never echoed.
    expect(JSON.stringify(body)).not.toContain("test-maps-key");
  });
});

describe("/api/news/health", () => {
  const ask = (query = "") => newsHealth(new Request(`https://site.test/api/news/health${query}`));

  it("serves live-verify's read with no session as it was, and asks the auth service nothing", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("1 of 1 sources answered; 0 headlines ranked.");
    expect(body.sources).toHaveLength(1);
    expect(body.refreshed).toBe(false);
    expect(session.reads).toBe(0);
    expect(news.forgets).toBe(0);
  });

  it("reads `refresh=1` as no refresh from anyone but an operator", async () => {
    for (const user of [null, CUSTOMER, UNCONFIRMED]) {
      session.user = user;
      const res = await ask("?refresh=1");
      expect(res.status).toBe(200);
      expect((await res.json()).refreshed).toBe(false);
    }
    expect(news.forgets).toBe(0);
  });

  it("drops this process's copies and asks every feed again for an operator", async () => {
    session.user = OPERATOR;
    const res = await ask("?refresh=1");
    expect((await res.json()).refreshed).toBe(true);
    expect(news.forgets).toBe(1);
    // Without `refresh=1`, not even an operator's read drops them.
    await ask();
    expect(news.forgets).toBe(1);
  });
});

describe("/api/flood/health", () => {
  it("answers everyone the check, the process that answered only to an operator", async () => {
    for (const user of [null, CUSTOMER, UNCONFIRMED]) {
      session.user = user;
      const res = await floodHealthRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = await res.json();
      // What live-verify prints is there for every caller.
      expect(body.summary).toBe("every step answered");
      expect(body.layer.id).toBe(28);
      expect(body).not.toHaveProperty("process");
    }
    session.user = OPERATOR;
    const body = await (await floodHealthRoute()).json();
    expect(body.summary).toBe("every step answered");
    expect(body.process).toEqual({ pid: process.pid, uptimeS: expect.any(Number) });
  });

  it("serves a caller whose session cannot be read as no operator, and still answers", async () => {
    session.user = OPERATOR;
    session.fails = true;
    const res = await floodHealthRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("every step answered");
    expect(body).not.toHaveProperty("process");
  });
});

describe("whose read prints a health route's process line", () => {
  // live-verify prints the news route's process from its read with no
  // session, so that one stays public; it never reads the flood route's,
  // which is the operator's now. A step that starts or stops reading one
  // fails here first.
  const lv = readFileSync(join(__dirname, "..", ".github/workflows/live-verify.yml"), "utf8");
  const stepOf = (route: string) => {
    const at = lv.indexOf(route);
    expect(at, route).toBeGreaterThan(-1);
    const next = lv.indexOf("- name:", at);
    return lv.slice(at, next === -1 ? undefined : next);
  };

  it("the news route's is public, as live-verify prints it; the flood route's is not read there", async () => {
    expect(stepOf("/api/news/health")).toMatch(/j\.process\.pid/);
    expect(stepOf("/api/flood/health")).not.toMatch(/j\.process/);
    const body = await (await newsHealth(new Request("https://site.test/api/news/health"))).json();
    expect(body.process).toEqual({ pid: process.pid, uptimeS: expect.any(Number) });
  });
});

describe("/api/comps/health", () => {
  it("answers no one without a session, and asks nothing", async () => {
    expect((await compsHealth()).status).toBe(401);
    expect(fetched).toEqual([]);
  });

  it("gives a signed-in customer each provider's configuration, and probes no portal", async () => {
    session.user = CUSTOMER;
    const res = await compsHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.probed).toBe(false);
    expect(body.note).toMatch(/operators only/);
    expect(body.results.map((r: { provider: string }) => r.provider)).toEqual(PROVIDERS.map((p) => p.id));
    expect(body.results.every((r: Record<string, unknown>) => !("httpStatus" in r))).toBe(true);
    expect(fetched).toEqual([]);
  });

  it("probes every provider for an operator", async () => {
    session.user = OPERATOR;
    const res = await compsHealth();
    const body = await res.json();
    expect(body.probed).toBe(true);
    expect(fetched.map((u) => u.href).sort()).toEqual(PROVIDERS.map((p) => new URL(p.healthUrl).href).sort());
    expect(body.results.every((r: { httpStatus: number }) => r.httpStatus === 200)).toBe(true);
  });
});
