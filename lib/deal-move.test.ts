/**
 * Moving a deal between the reader's own pipeline and the team's (`moveDeal`
 * in app/(app)/deals/actions.ts, words in lib/personal-deal), driven over a
 * fake database that answers as row-level security would:
 *
 *   - only the deal's creator moves it, and never the sample;
 *   - a move into the team is refused, in plain words, where the team's
 *     trial is spent — by the app's own read, and by migration 0036's
 *     trigger where the read let it through;
 *   - a move out is counted against the reader's own free cap the same way;
 *   - a move that lands writes only team_id (and the touch), and says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Billing } from "@/lib/billing";

const DEAL = "22222222-2222-4222-8222-222222222222";
const CREATOR = "11111111-1111-4111-8111-111111111111";
const TEAM = "team-1";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: vi.fn(), runRecordComps: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  claimJob: vi.fn(),
  releaseClaim: vi.fn(),
  analysisWorkerEnabled: () => false,
  workerSchemaReady: vi.fn(async () => false),
  newJobRow: vi.fn(() => ({})),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({ runAnalysis: vi.fn(), runReconciliation: vi.fn() }));

const billing: { value: Billing } = { value: null as unknown as Billing };
vi.mock("@/lib/billing", () => ({ getBilling: vi.fn(async () => billing.value), isPro: async () => false }));

type Row = Record<string, unknown>;
const db = {
  caller: CREATOR,
  deal: {} as Row,
  updates: [] as Row[],
  /** the error the update answers with — 0036's trigger's refusal */
  updateError: null as { message: string } | null,
  /** rows the update matched (RLS) */
  updateMatches: 1,
};

vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: db.caller } } }) },
    from(table: string) {
      const q = {
        _op: "select" as "select" | "update",
        select: () => q,
        eq: () => q,
        maybeSingle: () => q,
        update: (patch: Row) => {
          q._op = "update";
          db.updates.push(patch);
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (q._op === "update") {
            const data = db.updateError ? null : Array.from({ length: db.updateMatches }, () => ({ id: DEAL }));
            return Promise.resolve({ data, error: db.updateError }).then(resolve);
          }
          if (table === "deals") return Promise.resolve({ data: db.deal, error: null }).then(resolve);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client, getCurrentUser: async () => ({ id: db.caller }) };
});

import { moveDeal } from "@/app/(app)/deals/actions";
import { isMoveRefusal, MOVE_ITEM, moveNotice, moveQuestion } from "@/lib/personal-deal";

function bill(over: Partial<Billing> = {}, team: Billing["team"] = { id: TEAM, name: "Acme", active: false, dealCount: 1 }): Billing {
  return {
    plan: "free",
    isPro: false,
    status: null,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    dealCount: 1,
    dealLimit: 3,
    canCreateDeal: true,
    team,
    ...over,
  };
}

async function landing(to: string): Promise<string> {
  const fd = new FormData();
  fd.set("dealId", DEAL);
  fd.set("to", to);
  try {
    await moveDeal(fd);
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  return "(no redirect)";
}

beforeEach(() => {
  db.caller = CREATOR;
  db.deal = { id: DEAL, user_id: CREATOR, team_id: null, is_sample: false };
  db.updates.length = 0;
  db.updateError = null;
  db.updateMatches = 1;
  billing.value = bill();
});

describe("moveDeal — Share with team", () => {
  it("moves the creator's personal deal onto their team and says so", async () => {
    expect(await landing("team")).toBe(`/deals/${DEAL}?moved=team`);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].team_id).toBe(TEAM);
    expect(Object.keys(db.updates[0]).sort()).toEqual(["team_id", "updated_at"]);
  });

  it("refuses where the team's trial is spent, before any write", async () => {
    billing.value = bill({}, { id: TEAM, name: "Acme", active: false, dealCount: 3 });
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=moveteamlimit`);
    expect(db.updates).toEqual([]);
  });

  it("an active Team plan has no cap", async () => {
    billing.value = bill({}, { id: TEAM, name: "Acme", active: true, dealCount: 40 });
    expect(await landing("team")).toBe(`/deals/${DEAL}?moved=team`);
  });

  it("the database's own cap refusal (0036's trigger) reads as the team's limit", async () => {
    db.updateError = { message: 'new row violates: team_plan_required' };
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=moveteamlimit`);
  });

  it("a write that matched nothing is a failure, never a move", async () => {
    db.updateMatches = 0;
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movefail`);
  });

  it("a reader on no team has no team pipeline to share into", async () => {
    billing.value = bill({}, null);
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movenoteam`);
    expect(db.updates).toEqual([]);
  });

  it("a teammate is refused — the creator's alone", async () => {
    db.caller = "teammate";
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movepermission`);
    expect(db.updates).toEqual([]);
  });

  it("the sample stays where it is", async () => {
    db.deal = { ...db.deal, is_sample: true };
    expect(await landing("team")).toBe(`/deals/${DEAL}`);
    expect(db.updates).toEqual([]);
  });

  it("a deal already on the team is left alone", async () => {
    db.deal = { ...db.deal, team_id: TEAM };
    expect(await landing("team")).toBe(`/deals/${DEAL}`);
    expect(db.updates).toEqual([]);
  });
});

describe("moveDeal — Make personal", () => {
  beforeEach(() => {
    db.deal = { ...db.deal, team_id: TEAM };
  });

  it("takes the creator's team deal into their own pipeline", async () => {
    expect(await landing("personal")).toBe(`/deals/${DEAL}?moved=personal`);
    expect(db.updates[0].team_id).toBeNull();
  });

  it("refuses where the reader's own free deals are in use", async () => {
    billing.value = bill({ dealCount: 3 });
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movelimit`);
    expect(db.updates).toEqual([]);
  });

  it("a personal Pro plan has no cap, and the trigger's refusal still reads as the limit", async () => {
    billing.value = bill({ plan: "pro", dealCount: 30 });
    expect(await landing("personal")).toBe(`/deals/${DEAL}?moved=personal`);
    db.updateError = { message: "free_deal_limit_reached" };
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movelimit`);
  });
});

describe("the words (lib/personal-deal)", () => {
  const caps = { trialDeals: 3, freeDeals: 3 };
  it("says the team's cap in plain words", () => {
    const n = moveNotice({ refused: "moveteamlimit" }, caps);
    expect(n.tone).toBe("caution");
    expect(n.text).toMatch(/^Your team’s free plan holds 3 deals/);
    expect(moveNotice({ refused: "movelimit" }, caps).text).toMatch(/^Your free plan holds 3 deals of your own/);
  });
  it("names the team where it is known, and says what a move changes", () => {
    expect(moveNotice({ moved: "team", teamName: "Acme" }, caps).text).toContain("Acme’s pipeline");
    expect(moveQuestion("team", null)).toContain("your team’s pipeline");
    expect(moveQuestion("personal", "Acme")).toContain("Your teammates stop seeing it");
    expect(MOVE_ITEM.team).toBe("Share with team");
  });
  it("knows its own codes and no other", () => {
    expect(isMoveRefusal("movelimit")).toBe(true);
    expect(isMoveRefusal("deletepermission")).toBe(false);
    expect(isMoveRefusal(undefined)).toBe(false);
  });
});
