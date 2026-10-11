import { afterEach, describe, expect, it, vi } from "vitest";

// A deal's refresh against a fake database: a pull that fails keeps the
// last set that answered, said as the earlier pull's, and the source's own
// words never reach what is stored (the comps research pass's M1 and M3).

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/deal-location", () => ({
  resolveDealLocation: vi.fn(async () => ({ lat: 39.95, lng: -75.16, precision: "street" })),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimRecordComps, runRecordComps } from "./run";
import { failureSentence, lastGoodOf, refreshFailedLine, type RecordCompsResult } from "./core";

const good: RecordCompsResult = {
  status: "ok",
  providerId: "philly_opa",
  providerName: "Philadelphia OPA (Carto SQL API)",
  comps: [],
  retrievedAt: "2026-10-01T09:00:00Z",
  note: "Public records.",
};

/** One deal row; `updates` records each public_comps written. */
function fakeAdmin(row: Record<string, unknown>) {
  const updates: RecordCompsResult[] = [];
  const client = {
    updates,
    rpc: async () => ({ data: null, error: { message: "absent here" } }),
    from(table: string) {
      expect(table).toBe("deals");
      const b = {
        select: () => b,
        eq: () => b,
        is: () => b,
        maybeSingle: async () => ({ data: row, error: null }),
        update(v: { public_comps: RecordCompsResult }) {
          updates.push(v.public_comps);
          row.public_comps = v.public_comps;
          return b;
        },
        then: (r: (v: unknown) => void) => r({ data: [{ id: "d1" }], error: null }),
      };
      return b;
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createSupabaseAdminClient).mockReset();
});

describe("a deal's refresh", () => {
  it("keeps the last set on the pending sentinel, and stores it back when the source fails", async () => {
    const row: Record<string, unknown> = {
      id: "d1",
      address: { label: "1500 Walnut St, Philadelphia, PA", street: "1500 Walnut St", city: "Philadelphia", state: "PA", county: "Philadelphia" },
      asset_class: "multifamily",
      public_comps: good,
    };
    const admin = fakeAdmin(row);
    await claimRecordComps("d1", true);
    expect(admin.updates[0].status).toBe("pending");
    expect(admin.updates[0].previous?.retrievedAt).toBe(good.retrievedAt);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>upstream trace 42</html>", { status: 502 })));
    await runRecordComps("d1");
    log.mockRestore();
    const stored = admin.updates[admin.updates.length - 1];
    expect(stored.status).toBe("ok");
    expect(stored.retrievedAt).toBe(good.retrievedAt);
    expect(stored.refreshFailed?.status).toBe("provider_error");
    expect(JSON.stringify(stored)).not.toContain("upstream trace");
    expect(refreshFailedLine(stored)).toMatch(/^The refresh on .+ did not answer; these are the sales pulled Oct 1, 2026\.$/);
  });

  it("stores a failure where there was no earlier set, its words the page's own", async () => {
    const row: Record<string, unknown> = {
      id: "d1",
      address: { label: "1500 Walnut St, Philadelphia, PA", street: "1500 Walnut St", city: "Philadelphia", state: "PA", county: "Philadelphia" },
      asset_class: "multifamily",
      public_comps: null,
    };
    const admin = fakeAdmin(row);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>upstream trace 42</html>", { status: 502 })));
    await runRecordComps("d1");
    log.mockRestore();
    const stored = admin.updates[admin.updates.length - 1];
    expect(stored.status).toBe("provider_error");
    expect(JSON.stringify(stored)).not.toContain("upstream trace");
    expect(failureSentence("provider_error", true)).not.toMatch(/health|wider|widen/);
  });

  it("reads the last good set off a pending sentinel or a kept set", () => {
    expect(lastGoodOf({ ...good, status: "pending", previous: good })?.retrievedAt).toBe(good.retrievedAt);
    expect(lastGoodOf({ ...good, status: "provider_error" })).toBeNull();
    expect(lastGoodOf({ ...good, previous: good })).not.toHaveProperty("previous");
  });
});
