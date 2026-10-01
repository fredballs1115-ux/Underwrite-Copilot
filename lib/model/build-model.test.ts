/**
 * The model generator's failure path, against a recording fake database: the
 * job row carries one sentence the analyst can act on, never the provider's
 * raw text, and our own guidance passes through as written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const jobs: Row[] = [];
/** what the run wrote to the deal row */
const dealWrites: Row[] = [];
let docs: Row[] = [];
let dealRow: Row | null = { is_sample: false };

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
        maybeSingle() {
          return q;
        },
        update(patch: Row) {
          q._patch = patch;
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (table === "deal_documents") return Promise.resolve({ data: docs, error: null }).then(resolve);
          if (table === "deals" && q._patch) dealWrites.push(q._patch);
          if (table === "deals") return Promise.resolve({ data: dealRow, error: null }).then(resolve);
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
// Today's rates, off a table with nothing fresh: the step is handed none.
vi.mock("@/lib/debt-index-read", () => ({
  liveDebtSeeds: vi.fn(async () => ({ permanent: null, floating: null, tenYear: null, survey30: null })),
}));

import { runModelGeneration } from "./build-model";
import type { UnderwritingModel } from "./types";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { extractDocFacts } from "@/lib/anthropic/model-extract";
import { reconcileDocs } from "@/lib/anthropic/model-reconcile";
import { liveDebtSeeds } from "@/lib/debt-index-read";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  jobs.length = 0;
  dealWrites.length = 0;
  docs = [{ id: "doc1", kind: "om", filename: "om.pdf", storage_path: "u/om.pdf" }];
  dealRow = { is_sample: false };
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

describe("runModelGeneration — what a built model keeps of its build", () => {
  it("is dated, and keeps the ids of the documents it was built from beside their labels", async () => {
    docs = [
      { id: "doc1", kind: "om", filename: "om.pdf", storage_path: "u/om.pdf" },
      { id: "doc2", kind: "rent_roll", filename: "rr.xlsx", storage_path: "u/rr.xlsx" },
    ];
    vi.mocked(extractDocFacts).mockResolvedValue({ docName: "om.pdf", kind: "om", facts: [] });
    vi.mocked(reconcileDocs)
      .mockReset()
      .mockResolvedValue({ metrics: [], inputs: SAMPLE_DEAL.model.inputs, summary: "", caveats: [] } as never);
    const before = Date.now();
    await runModelGeneration("d1");
    expect(lastJob().status).toBe("done");
    const model = dealWrites.map((w) => w.model as UnderwritingModel | undefined).find(Boolean)!;
    expect(model.generatedFrom).toEqual(["Offering memorandum: om.pdf", "Rent roll: rr.xlsx"]);
    expect(model.generatedFromIds).toEqual(["doc1", "doc2"]);
    expect(Date.parse(model.generatedAt!)).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("runModelGeneration — today's rates, never on the sample", () => {
  const fiveYear = { id: "DGS5", short: "5-yr", pct: 4.12, asOf: "2026-09-29", kind: "treasury" as const };
  const stop = Object.assign(new Error("stop after the reconcile's arguments are read"), { status: 400 });

  it("a real deal's reconciliation is handed today's index, dated", async () => {
    vi.mocked(liveDebtSeeds).mockResolvedValueOnce({ permanent: fiveYear, floating: null, tenYear: null, survey30: null });
    vi.mocked(extractDocFacts).mockResolvedValue({ docName: "om.pdf", kind: "om", facts: [] });
    vi.mocked(reconcileDocs).mockReset().mockRejectedValue(stop);
    await runModelGeneration("d1");
    expect(vi.mocked(reconcileDocs).mock.calls[0][1]).toMatch(/4\.12%/);
  });

  it("the line names the spread the site's model adds for the deal's class, as its screening default (research pass 18)", async () => {
    dealRow = { is_sample: false, extraction: { assetClass: "Multifamily" } };
    vi.mocked(liveDebtSeeds).mockResolvedValueOnce({ permanent: fiveYear, floating: null, tenYear: null, survey30: null });
    vi.mocked(extractDocFacts).mockResolvedValue({ docName: "om.pdf", kind: "om", facts: [] });
    vi.mocked(reconcileDocs).mockReset().mockRejectedValue(stop);
    await runModelGeneration("d1");
    expect(vi.mocked(reconcileDocs).mock.calls[0][1]).toContain("adding a 200 bps multifamily spread — the site's screening default");
  });

  it("the sample's is handed none, whatever the table holds — its figures are pinned (lib/model-market)", async () => {
    dealRow = { is_sample: true };
    vi.mocked(liveDebtSeeds).mockResolvedValueOnce({ permanent: fiveYear, floating: null, tenYear: null, survey30: null });
    vi.mocked(extractDocFacts).mockResolvedValue({ docName: "om.pdf", kind: "om", facts: [] });
    vi.mocked(reconcileDocs).mockReset().mockRejectedValue(stop);
    await runModelGeneration("d1");
    expect(vi.mocked(reconcileDocs).mock.calls[0][1]).toBeNull();
  });
});
