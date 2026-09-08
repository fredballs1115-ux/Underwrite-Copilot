/**
 * The model generator's failure path, against a recording fake database: the
 * job row carries one sentence the analyst can act on, never the provider's
 * raw text, and our own guidance passes through as written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const jobs: Row[] = [];
let docs: Row[] = [];

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
        order() {
          return q;
        },
        update(patch: Row) {
          q._patch = patch;
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (table === "deal_documents") return Promise.resolve({ data: docs, error: null }).then(resolve);
          if (table === "analysis_jobs" && q._patch) jobs.push(q._patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/storage", () => ({ downloadDealFile: vi.fn(async () => Buffer.from("x")) }));
vi.mock("@/lib/model-parse", () => ({ parseModelFile: vi.fn(async () => ({ kind: "text", text: "rows" })) }));
vi.mock("@/lib/anthropic/model-extract", () => ({ extractDocFacts: vi.fn() }));
vi.mock("@/lib/anthropic/model-reconcile", () => ({ reconcileDocs: vi.fn() }));

import { runModelGeneration } from "./build-model";
import { extractDocFacts } from "@/lib/anthropic/model-extract";
import { reconcileDocs } from "@/lib/anthropic/model-reconcile";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  jobs.length = 0;
  docs = [{ id: "doc1", kind: "om", filename: "om.pdf", storage_path: "u/om.pdf" }];
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

const lastJob = () => jobs[jobs.length - 1];

describe("runModelGeneration — what a failure tells the analyst", () => {
  it("a provider overload during the reconcile reads as a sentence, with the raw text logged", async () => {
    vi.mocked(extractDocFacts).mockResolvedValue({ docName: "om.pdf", kind: "om", facts: [] });
    vi.mocked(reconcileDocs).mockRejectedValue(
      Object.assign(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), {
        status: 529,
        name: "APIError",
      }),
    );
    await runModelGeneration("d1");
    expect(lastJob().status).toBe("error");
    expect(lastJob().error).toMatch(/overloaded right now/);
    expect(lastJob().error).not.toMatch(/overloaded_error|529/);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("overloaded_error"));
  });

  it("our own guidance passes through as written", async () => {
    docs = [];
    await runModelGeneration("d1");
    expect(lastJob().status).toBe("error");
    expect(lastJob().error).toMatch(/Add at least one document/);
  });
});
