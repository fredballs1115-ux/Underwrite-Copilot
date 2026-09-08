/**
 * The public-web comp search's failure path: the job row carries one sentence
 * the analyst can act on, never the provider's raw text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const jobs: Row[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const q = {
        _patch: null as Row | null,
        select() {
          return q;
        },
        eq() {
          return q;
        },
        single() {
          return q;
        },
        update(patch: Row) {
          q._patch = patch;
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (table === "deals" && !q._patch) {
            return Promise.resolve({
              data: { name: "Oakwood", asset_class: "multifamily", extraction: null },
              error: null,
            }).then(resolve);
          }
          if (table === "analysis_jobs" && q._patch) jobs.push(q._patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));
vi.mock("./client", () => ({
  getAnthropic: () => ({
    messages: {
      create: vi.fn(async () => {
        throw Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
      }),
    },
  }),
}));

import { runCompSearch } from "./comps-search";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  jobs.length = 0;
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("runCompSearch — what a failure tells the analyst", () => {
  it("a connection failure reads as a sentence, with the raw text logged", async () => {
    await runCompSearch("d1");
    const last = jobs[jobs.length - 1];
    expect(last.status).toBe("error");
    expect(last.error).toMatch(/couldn't reach the analysis service/);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("APIConnectionError"));
  });
});
