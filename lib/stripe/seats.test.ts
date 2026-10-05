// A seat sync that fails is best-effort — the join, the removal or the
// account deletion it follows must not fail with it — but it had left no
// trace: the catch swallowed Stripe's error whole, so a team billed for the
// wrong number of seats had nothing in the log to say when or why. It now
// leaves one line naming the team and Stripe's message, with anything
// key-shaped struck out.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** what Stripe answers a read of the subscription: a status, or a throw */
  retrieve: null as null | { status: string } | Error,
  subscriptionId: "sub_team" as string | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: { stripe_subscription_id: state.subscriptionId, plan: "active" }, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: table === "team_members" ? 3 : null }).then(ok),
      };
      return api;
    },
  }),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: async () => {
        if (state.retrieve instanceof Error) throw state.retrieve;
        return { ...state.retrieve, items: { data: [] } };
      },
    },
  }),
}));

import { seatSyncFailureLine, syncTeamSeats } from "./seats";

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  state.retrieve = { status: "active" };
  state.subscriptionId = "sub_team";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a seat sync that fails says so, once, without a key", () => {
  it("logs one line naming the team and Stripe's message, and still never throws", async () => {
    state.retrieve = Object.assign(new Error("Invalid API Key provided: sk_live_****************************a1B2"), {
      type: "StripeAuthenticationError",
    });
    await expect(syncTeamSeats("team-1")).resolves.toBeUndefined();
    expect(logged).toEqual(["[seats] syncing team team-1's seats with Stripe failed: Invalid API Key provided: [redacted]"]);
  });

  it("strikes out every key- or credential-shaped value a message may carry", () => {
    const line = seatSyncFailureLine(
      "team-9",
      new Error("Request to https://api.stripe.com/v1/subscriptions/sub_1?key=abc failed for rk_test_51Habc and whsec_xyz; api_key=sk_test_51H"),
    );
    expect(line.startsWith("[seats] syncing team team-9's seats with Stripe failed: ")).toBe(true);
    for (const leak of ["sk_test", "rk_test_51Habc", "whsec_xyz", "key=abc"]) expect(line).not.toContain(leak);
    expect(seatSyncFailureLine("team-9", "a thrown string")).toBe("[seats] syncing team team-9's seats with Stripe failed: a thrown string");
  });

  it("a sync that goes through, or has no subscription to sync, logs nothing", async () => {
    await syncTeamSeats("team-1");
    state.subscriptionId = null;
    await syncTeamSeats("team-1");
    expect(logged).toEqual([]);
  });
});
