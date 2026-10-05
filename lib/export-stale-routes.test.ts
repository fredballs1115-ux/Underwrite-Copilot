/**
 * The memo and the full report refuse a call the latest screen has not
 * re-run (lib/screen-run `verdictBehind`), and each refusal says why — a
 * failed run, one still running toward its verdict, or one that stopped
 * making progress on the way. The stalled run had read as running, so the
 * refusal said the memo "waits for it": it waited for a run nothing was
 * running (research pass 30). Both routes driven against a fake of the
 * request's database client; the refusal comes before any PDF is built.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STALE_MS } from "./screen-run";

const state = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  /** the columns each read of the job row asked for */
  jobColumns: [] as string[],
}));

vi.mock("@/lib/billing", () => ({ isPro: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const q = {
        select: (cols: string) => {
          if (table === "analysis_jobs") state.jobColumns.push(cols);
          return q;
        },
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () =>
          table === "deals"
            ? { data: { id: "d1", name: "Oakwood Flats", verdict: { verdict: "caution", reason: "" } }, error: null }
            : { data: state.job, error: null },
      };
      return q;
    },
  }),
}));

import { GET as memo } from "@/app/api/deals/[id]/memo/route";
import { GET as report } from "@/app/api/deals/[id]/report/route";

const DEAL = "11111111-1111-4111-8111-111111111111";
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const where = async (route: typeof memo) => {
  const res = await route(new Request(`https://app.test/api/deals/${DEAL}/x`), { params: Promise.resolve({ id: DEAL }) });
  return res.headers.get("location") ?? "";
};

describe("the memo and the report say why they wait", () => {
  beforeEach(() => {
    state.job = null;
    state.jobColumns = [];
  });

  it("a run still writing progress is running; one that stopped is stalled; a failure is stale", async () => {
    state.job = { status: "running", step: "challenge", updated_at: ago(30_000) };
    expect(await where(memo)).toMatch(/\?error=memorunning$/);
    expect(await where(report)).toMatch(/\?error=reportrunning$/);

    state.job = { status: "running", step: "challenge", updated_at: ago(STALE_MS + 60_000) };
    expect(await where(memo)).toMatch(/\?error=memostalled$/);
    expect(await where(report)).toMatch(/\?error=reportstalled$/);

    state.job = { status: "error", step: "comps", updated_at: ago(STALE_MS * 3) };
    expect(await where(memo)).toMatch(/\?error=memostale$/);
    expect(await where(report)).toMatch(/\?error=reportstale$/);

    // Both read the row's last write, which the stall rule needs.
    for (const cols of state.jobColumns) expect(cols.split(/,\s*/)).toContain("updated_at");
  });
});
