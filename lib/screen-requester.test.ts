/**
 * Any member can re-screen a team deal, and the screen's emails go to the
 * person who asked (lib/email `screenEmailRecipient`). The run carries who
 * asked without a migration: in the worker payload's JSON in worker mode,
 * in the run's own arguments in-process. Driven through the real action
 * with the job helpers and the pipeline faked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER = "22222222-2222-4222-8222-222222222222";
const CREATOR = "11111111-1111-4111-8111-111111111111";
const DEAL = "55555555-5555-4555-8555-555555555555";

const h = vi.hoisted(() => ({
  worker: false,
  claims: [] as unknown[][],
  inserts: [] as unknown[],
  runs: [] as unknown[][],
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The work after the response runs at once, so the test sees the call.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/billing", () => ({ getBilling: async () => null, isPro: async () => true }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: async () => false, runRecordComps: async () => {} }));
vi.mock("@/lib/jobs", () => ({
  analysisWorkerEnabled: () => h.worker,
  workerSchemaReady: async () => true,
  claimJob: async (...args: unknown[]) => {
    h.claims.push(args);
    return { outcome: "claimed", priorStatus: "done" };
  },
  releaseClaim: async () => {},
  newJobRow: (...args: unknown[]) => {
    h.inserts.push(args);
    return {};
  },
}));
vi.mock("@/lib/anthropic/pipeline", () => ({
  runAnalysis: (...args: unknown[]) => void h.runs.push(args),
  runReconciliation: () => {},
}));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    // The member re-screening the creator's team deal.
    auth: { getUser: async () => ({ data: { user: { id: MEMBER, email: "member@firm.example" } } }) },
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { id: DEAL, om_storage_path: `${CREATOR}/${DEAL}.pdf`, extraction: null, is_sample: false },
          error: null,
        }),
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { rerunAnalysis } from "@/app/(app)/deals/actions";

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
  h.claims.length = 0;
  h.inserts.length = 0;
  h.runs.length = 0;
});

describe("a re-screen records who asked for it", () => {
  it("in-process, in the run's own arguments", async () => {
    h.worker = false;
    expect(await rerun()).toBe(`/deals/${DEAL}`);
    expect(h.runs).toEqual([[DEAL, { snapshotPrior: true, requestedBy: MEMBER }]]);
    // No payload is written in-process: the claim touches no worker column.
    expect(h.claims[0][3]).toBeUndefined();
  });

  it("in worker mode, in the payload the worker reads", async () => {
    h.worker = true;
    await rerun();
    expect(h.claims[0][3]).toEqual({ kind: "screen", requestedBy: MEMBER });
    expect(h.runs).toEqual([]);
  });

  it("every screen the actions start says who asked, in both modes", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    const screens = src.match(/kind: "screen"[^}]*\}/g) ?? [];
    expect(screens.length).toBeGreaterThanOrEqual(8);
    for (const s of screens) expect(s).toContain("requestedBy: user.id");
    const runs = src.match(/runAnalysis\(dealId[^)]*\)/g) ?? [];
    expect(runs.length).toBeGreaterThanOrEqual(5);
    for (const r of runs) expect(r).toContain("requestedBy: user.id");
  });
});
