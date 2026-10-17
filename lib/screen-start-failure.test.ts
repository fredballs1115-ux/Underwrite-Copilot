/**
 * "A screen is already running on this deal" only when one is (research
 * pass 30): a claim whose write the database refused, and a job row it would
 * not insert, had both answered "busy". Driven through the real re-screen
 * action with the job helpers and the database faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEAL = "55555555-5555-4555-8555-555555555555";
const USER = "11111111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => ({
  claim: { outcome: "claimed", priorStatus: "done" } as { outcome: string; priorStatus: string | null },
  insertError: null as { message: string } | null,
  runs: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/billing", () => ({ getBilling: async () => null, isPro: async () => true }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: async () => false, runRecordComps: async () => {} }));
vi.mock("@/lib/jobs", () => ({
  analysisWorkerEnabled: () => false,
  workerSchemaReady: async () => false,
  claimJob: async () => h.claim,
  releaseClaim: async () => {},
  newJobRow: () => ({}),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({
  runAnalysis: () => void h.runs++,
  runReconciliation: () => {},
}));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER, email: "a@firm.example" } } }) },
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { id: DEAL, om_storage_path: `${USER}/${DEAL}.pdf`, extraction: null, is_sample: false },
          error: null,
        }),
        insert: async () => ({ data: null, error: h.insertError }),
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { rerunAnalysis } from "@/app/(app)/deals/actions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function rerun(): Promise<string> {
  const fd = new FormData();
  fd.set("dealId", DEAL);
  try {
    await rerunAnalysis(fd);
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  h.claim = { outcome: "claimed", priorStatus: "done" };
  h.insertError = null;
  h.runs = 0;
});

describe("starting a screen says what happened", () => {
  it("a live run is busy; a claim the database refused is a failed start, and nothing runs", async () => {
    h.claim = { outcome: "busy", priorStatus: "running" };
    expect(await rerun()).toBe(`/deals/${DEAL}?error=busy`);
    h.claim = { outcome: "error", priorStatus: "error" };
    expect(await rerun()).toBe(`/deals/${DEAL}?error=startfail`);
    expect(h.runs).toBe(0);
  });

  it("a job row the database would not insert is a failed start, never 'busy'", async () => {
    h.claim = { outcome: "none", priorStatus: null };
    h.insertError = { message: "canceling statement due to statement timeout" };
    expect(await rerun()).toBe(`/deals/${DEAL}?error=startfail`);
    expect(h.runs).toBe(0);
    h.insertError = null;
    expect(await rerun()).toBe(`/deals/${DEAL}`);
    expect(h.runs).toBe(1);
  });

  it("no action answers a failed write with 'busy', and the deal page has a sentence for each code it sends", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    expect(src).not.toMatch(/if \(insErr\) redirect\([^)]*error=busy/);
    const view = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-view.tsx"), "utf8");
    for (const code of ["startfail", "reconcilestartfail"]) {
      expect(src).toContain(`error=${code}`);
      expect(view).toMatch(new RegExp(`\\n  ${code}:`));
    }
  });
});
