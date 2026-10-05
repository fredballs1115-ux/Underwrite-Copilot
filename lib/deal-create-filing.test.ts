// A team member's new deal goes into the team's pipeline while the team's
// plan or trial allows it, and into their own once the trial's deals are in
// use (app/(app)/deals/actions.ts `teamAllowed`). It went there with no word:
// the member landed on the deal, and the batch panel showed it queued, as if
// the team could see it. Each create action now says so where the member
// lands — `?filed=personal` on the deal, `personal` in the batch's result —
// and only then. Driven against a fake of the request's database client.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  billing: null as unknown,
  /** the deals rows the action inserted */
  inserted: [] as Record<string, unknown>[],
  /** the deal the 15-second double-submit check finds, if any */
  recent: null as { id: string; team_id: string | null } | null,
  /** the deals insert's refusal, as the database's cap trigger raises it */
  insertError: null as { message: string } | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/billing", () => ({ getBilling: async () => state.billing }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: async () => false, runRecordComps: async () => {} }));
vi.mock("@/lib/jobs", () => ({
  claimJob: async () => ({ outcome: "none" }),
  releaseClaim: async () => {},
  analysisWorkerEnabled: () => false,
  workerSchemaReady: async () => false,
  newJobRow: () => ({}),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({ runAnalysis: () => {}, runReconciliation: () => {} }));
vi.mock("@/lib/pdf-open", () => ({ checkPdfOpens: async () => ({ verdict: "ok" }) }));
vi.mock("@/lib/storage", () => ({
  uploadOmPdf: async () => {},
  removeStorageFiles: async () => {},
  uploadSupplement: async () => {},
  modelTmpPath: (p: string) => `${p}.model-tmp`,
  omStoragePath: (u: string, d: string) => `${u}/${d}.pdf`,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "member-1", email: "m@firm.example" } } }) },
    from(table: string) {
      let op = "select";
      const api = {
        select: () => api,
        eq: () => api,
        gte: () => api,
        order: () => api,
        limit: () => api,
        insert: (values: Record<string, unknown>) => {
          op = "insert";
          if (table === "deals") state.inserted.push(values);
          return api;
        },
        update: () => {
          op = "update";
          return api;
        },
        delete: () => {
          op = "delete";
          return api;
        },
        maybeSingle: async () => ({ data: table === "deals" && op === "select" ? state.recent : null, error: null }),
        single: async () =>
          state.insertError ? { data: null, error: state.insertError } : { data: { id: "new-deal" }, error: null },
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok, fail),
      };
      return api;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { createDeal, createDealFromBatch, createManualDeal } from "@/app/(app)/deals/actions";
import { TEAM_TRIAL_DEALS } from "./teams";
import { statusOf } from "./batch-run";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const billing = (team: { active: boolean; dealCount: number } | null) => ({
  plan: "free",
  isPro: false,
  canCreateDeal: true,
  dealCount: 0,
  team: team ? { id: "team-1", name: "Meridian", ...team } : null,
});

const TRIAL_SPENT = { active: false, dealCount: TEAM_TRIAL_DEALS };
const TRIAL_OPEN = { active: false, dealCount: TEAM_TRIAL_DEALS - 1 };
const PLAN = { active: true, dealCount: TEAM_TRIAL_DEALS + 9 };

async function landing(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
  throw new Error("expected a redirect");
}

const manualForm = () => {
  const fd = new FormData();
  fd.set("name", "Harbor View Apartments");
  fd.set("price", "$41,250,000");
  return fd;
};
const uploadForm = () => {
  const fd = new FormData();
  fd.set("name", "Harbor View Apartments");
  fd.set("om", new File([Buffer.from("%PDF-1.7\n% a memorandum\n")], "harbor-view.pdf", { type: "application/pdf" }));
  return fd;
};

beforeEach(() => {
  state.inserted.length = 0;
  state.recent = null;
  state.insertError = null;
});

describe("a member's new deal says where it was filed", () => {
  it("typed in: lands with the flag where the team's trial deals are in use, and without it anywhere else", async () => {
    for (const [team, href, teamId] of [
      [TRIAL_SPENT, "/deals/new-deal?filed=personal", null],
      [TRIAL_OPEN, "/deals/new-deal", "team-1"],
      [PLAN, "/deals/new-deal", "team-1"],
      [null, "/deals/new-deal", null],
    ] as const) {
      state.billing = billing(team);
      state.inserted.length = 0;
      expect(await landing(() => createManualDeal(null, manualForm())), JSON.stringify(team)).toBe(href);
      expect(state.inserted[0]?.team_id, JSON.stringify(team)).toBe(teamId);
    }
  });

  it("uploaded: the single form lands with the flag, and the batch's result carries it", async () => {
    state.billing = billing(TRIAL_SPENT);
    expect(await landing(() => createDeal(uploadForm()))).toBe("/deals/new-deal?filed=personal");
    expect(state.inserted[0]?.team_id).toBeNull();
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: true, dealId: "new-deal", personal: true });
    state.billing = billing(TRIAL_OPEN);
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: true, dealId: "new-deal", personal: false });
    expect(await landing(() => createDeal(uploadForm()))).toBe("/deals/new-deal");
    // Off a team a personal deal is the only kind there is: nothing to say.
    state.billing = billing(null);
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: true, dealId: "new-deal", personal: false });
  });

  it("a double submit lands on the first deal, saying where that one went", async () => {
    state.billing = billing(TRIAL_SPENT);
    state.recent = { id: "earlier", team_id: null };
    expect(await landing(() => createManualDeal(null, manualForm()))).toBe("/deals/earlier?filed=personal");
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: true, dealId: "earlier", deduped: true, personal: true });
    state.recent = { id: "earlier", team_id: "team-1" };
    expect(await landing(() => createManualDeal(null, manualForm()))).toBe("/deals/earlier");
    expect(state.inserted).toEqual([]);
  });
});

// Research pass 30: a refusal says its own cause. The database's cap trigger
// (migration 0036) refuses a deal the app's read let through — a
// double-submit, a second tab — and that read as "Couldn't save the deal.
// Please try again", a retry into the same cap; a chosen file of 0 bytes
// read as "Please choose a PDF".
describe("a refused upload says why", () => {
  const uploadOf = (file: File) => {
    const fd = new FormData();
    fd.set("name", "Harbor View Apartments");
    fd.set("om", file);
    return fd;
  };

  it("the database's cap refusal is the plan's limit, never 'try again'", async () => {
    state.billing = billing(null);
    state.insertError = { message: "free_deal_limit_reached" };
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: false, error: "limit" });
    expect(await landing(() => createDeal(uploadForm()))).toBe("/deals?error=limit");
    expect(await createManualDeal(null, manualForm())).toEqual({
      error: "You’ve reached the free-plan deal limit. Upgrade to Pro for unlimited deals.",
    });
    state.insertError = { message: "team_plan_required" };
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: false, error: "teamlimit" });
    expect((await createManualDeal(null, manualForm()))?.error).toMatch(/^Your team’s trial deals and your personal free deals are all in use/);
    // Any other refusal is a save that failed.
    state.insertError = { message: "canceling statement due to statement timeout" };
    expect(await createDealFromBatch(uploadForm())).toEqual({ ok: false, error: "save" });
    expect(await createManualDeal(null, manualForm())).toEqual({ error: "Couldn’t save the deal. Please try again." });
  });

  it("a chosen file of 0 bytes is empty; no file chosen is no file", async () => {
    state.billing = billing(null);
    expect(await createDealFromBatch(uploadOf(new File([], "harbor-view.pdf", { type: "application/pdf" })))).toEqual({
      ok: false,
      error: "empty",
    });
    expect(await createDealFromBatch(uploadOf(new File([], "", { type: "application/octet-stream" })))).toEqual({
      ok: false,
      error: "file",
    });
    expect(state.inserted).toEqual([]);
  });

  it("every code the create action answers has its sentence on the upload page and in the batch panel", () => {
    const actions = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    const union = /export type CreateDealError =([^;]+);/.exec(actions)![1];
    const codes = [...union.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(codes).toContain("empty");
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/page.tsx"), "utf8");
    for (const code of codes) {
      expect(page, code).toMatch(new RegExp(`\\n  ${code}:`));
      // The batch says each one too (the limits as stopped by the plan).
      const status = statusOf({ ok: false, error: code });
      expect((status as { message: string }).message, code).not.toBe("Something went wrong.");
    }
  });
});
