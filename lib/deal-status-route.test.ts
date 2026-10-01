/**
 * GET /api/deals/[id]/status, driven with the server client faked: the job
 * row the deal page polls, now with when its run was asked for, so the
 * page's clock counts from the run's start and not from the page load.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  job: null as Record<string, unknown> | null,
  selected: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const q = {
        select: (cols: string) => {
          state.selected.push(cols);
          return q;
        },
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: state.job, error: null }),
      };
      return q;
    },
  }),
}));

import { GET } from "@/app/api/deals/[id]/status/route";

const DEAL = "11111111-1111-4111-8111-111111111111";
const get = (id = DEAL) =>
  GET(new Request(`https://app.test/api/deals/${id}/status`) as never, { params: Promise.resolve({ id }) });

describe("the deal's live job status", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.job = null;
    state.selected = [];
  });

  it("says when the run was asked for, beside its step", async () => {
    state.job = {
      status: "running",
      step: "challenge",
      progress: 40,
      error: null,
      updated_at: "2026-09-30T14:02:51.000000+00:00",
      created_at: "2026-09-30T14:00:05.000000+00:00",
    };
    const res = await get();
    expect(res.status).toBe(200);
    expect(state.selected[0].split(/,\s*/)).toContain("created_at");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.created_at).toBe("2026-09-30T14:00:05.000000+00:00");
    expect(body.step).toBe("challenge");
  });

  it("a deal with no job has no start, so the page's clock falls back to its own load", async () => {
    const body = (await (await get()).json()) as Record<string, unknown>;
    expect(body).toEqual({ status: "none", step: null, progress: 0, error: null, updated_at: null, created_at: null });
  });

  it("a malformed id or a signed-out visitor reads nothing", async () => {
    expect(await (await get("not-a-uuid")).json()).toEqual({ status: "none" });
    state.user = null;
    expect((await get()).status).toBe(401);
  });
});
