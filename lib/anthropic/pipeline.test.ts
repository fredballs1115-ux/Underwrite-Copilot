/**
 * The screening pipeline, driven end to end against a recording fake of the
 * database with every model step mocked: what a run writes, what a failure
 * tells the analyst, what stays behind from the previous screen, and what
 * the run does when the deal disappears under it. The ninth adversarial
 * review reproduced each of these on the real code before the fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BrokerCompsResult,
  ChallengerResult,
  ExtractionResult,
  FirstSignal,
  MarketResult,
  VerdictResult,
} from "./types";
import { staleAfterFailure, type JobLike } from "@/lib/screen-run";

type Row = Record<string, unknown>;
interface State {
  deals: Record<string, Row>;
  jobs: Row[];
  writes: { table: string; op: string; patch: Row }[];
  /** simulate a pre-0016 schema: reading `payload` errors (never throws) */
  payloadReadFails?: boolean;
}

/** A chainable, thenable query like supabase-js's, over an in-memory store. */
class FakeQuery {
  private op: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row = {};
  private filters: [string, unknown][] = [];
  private cols = "";
  private wantsRows = false;
  private wantsSingle = false;
  constructor(
    private readonly state: State,
    private readonly table: string,
  ) {}
  select(cols = "*") {
    if (this.op === "select") this.cols = cols;
    else this.wantsRows = true;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.patch = { rows };
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  in() {
    return this;
  }
  not() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.wantsSingle = true;
    return this;
  }
  maybeSingle() {
    return this;
  }
  then<T>(
    resolve: (v: { data: unknown; error: { message: string } | null }) => T,
    reject?: (e: unknown) => T,
  ) {
    return Promise.resolve()
      .then(() => this.exec())
      .then(resolve, reject);
  }
  private where(col: string) {
    return this.filters.find((f) => f[0] === col)?.[1];
  }
  private exec(): { data: unknown; error: { message: string } | null } {
    const { state, table } = this;
    if (this.op !== "select") state.writes.push({ table, op: this.op, patch: this.patch });
    if (table === "deals") {
      const id = String(this.where("id"));
      const row = state.deals[id];
      if (this.op === "select") {
        if (!row) {
          return this.wantsSingle
            ? { data: null, error: { message: "Row not found" } }
            : { data: null, error: null };
        }
        return { data: row, error: null };
      }
      if (this.op === "update" && row) Object.assign(row, this.patch);
      return { data: this.wantsRows ? (row ? [row] : []) : null, error: null };
    }
    if (table === "analysis_jobs") {
      const dealId = String(this.where("deal_id"));
      // A deleted deal takes its job rows with it (ON DELETE CASCADE).
      const rows = state.jobs.filter((j) => j.deal_id === dealId && state.deals[dealId]);
      if (this.op === "select") {
        if (state.payloadReadFails && /payload/.test(this.cols)) {
          return { data: null, error: { message: "column analysis_jobs.payload does not exist" } };
        }
        return { data: rows[0] ?? null, error: null };
      }
      if (this.op === "update") for (const j of rows) Object.assign(j, this.patch);
      return { data: this.wantsRows ? rows.map((j) => ({ id: j.id })) : null, error: null };
    }
    return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  downloadOmPdf: vi.fn(async () => Buffer.from("%PDF-1.4\n")),
}));
vi.mock("@/lib/email", () => ({ notifyAnalysisReady: vi.fn(async () => {}) }));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: vi.fn(async () => null) }));
vi.mock("@/lib/model-parse", () => ({ parseModelFile: vi.fn() }));
vi.mock("./first-signal", () => ({ readFirstSignal: vi.fn() }));
vi.mock("./extract", () => ({ extractTerms: vi.fn() }));
vi.mock("./challenge", () => ({ challengeAssumptions: vi.fn() }));
vi.mock("./comps", () => ({ scrutinizeComps: vi.fn() }));
vi.mock("./market", () => ({ checkMarket: vi.fn() }));
vi.mock("./verdict", () => ({ synthesizeVerdict: vi.fn() }));
vi.mock("./reconcile", () => ({ reconcileModel: vi.fn() }));
vi.mock("./reconcile-facts", () => ({ runDocReconciliation: vi.fn(async () => {}) }));
vi.mock("./actuals-ingest", () => ({ runActualsIngestion: vi.fn(async () => {}) }));
vi.mock("./om-source", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./om-source")>();
  return {
    ...orig,
    omSourceFor: vi.fn(async () => orig.omFromBuffer(Buffer.alloc(0))),
    releaseOmSource: vi.fn(async () => {}),
  };
});

import { runAnalysis } from "./pipeline";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readFirstSignal } from "./first-signal";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { checkMarket } from "./market";
import { synthesizeVerdict } from "./verdict";
import { omSourceFor, releaseOmSource } from "./om-source";

const EXTRACTION = {
  dealName: "Oakwood Flats",
  assetClass: "multifamily",
  market: "Dallas, TX",
  address: "100 Main St, Dallas, TX",
  totalPages: 12,
  strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
  metrics: [
    { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 3", basis: "na", locatorSnippet: "" },
    { label: "NOI (in place)", value: "$1,200,000", flagged: false, page: "p. 5", basis: "in_place", locatorSnippet: "" },
  ],
} as unknown as ExtractionResult;
const SIGNAL = { dealName: "Oakwood Flats", assetClass: "multifamily", market: "Dallas, TX" } as unknown as FirstSignal;
const CHALLENGES = { challenges: [], summary: "" } as unknown as ChallengerResult;
const COMPS = { saleComps: [], leaseComps: [], redFlags: [], summary: "" } as unknown as BrokerCompsResult;
const MARKET = { checks: [], summary: "" } as unknown as MarketResult;
const VERDICT = { verdict: "caution", reason: "", topRisks: [], nextSteps: [], screen: null } as unknown as VerdictResult;

/** The SDK's APIError, by shape: an HTTP status and its "529 {…}" message. */
function apiError(status: number, type: string, message: string): Error {
  return Object.assign(
    new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`),
    { status, name: "APIError" },
  );
}

function freshState(): State {
  const old = { old: true };
  return {
    deals: {
      d1: {
        id: "d1",
        name: "Oakwood Flats",
        asset_class: "multifamily",
        om_storage_path: "u/d1.pdf",
        extraction: old,
        challenges: old,
        comps: old,
        market: old,
        verdict: old,
        first_signal: old,
        discrepancies: null,
      },
    },
    jobs: [
      {
        id: "j1",
        deal_id: "d1",
        status: "queued",
        step: "signal",
        progress: 0,
        error: null,
        updated_at: new Date().toISOString(),
        payload: null,
      },
    ],
    writes: [],
  };
}

let state: State;
let errSpy: ReturnType<typeof vi.spyOn>;
const job = () => state.jobs[0] as unknown as JobLike & { error: string | null };

beforeEach(() => {
  vi.clearAllMocks();
  state = freshState();
  vi.mocked(createSupabaseAdminClient).mockImplementation(
    () => ({ from: (t: string) => new FakeQuery(state, t) }) as never,
  );
  vi.mocked(readFirstSignal).mockResolvedValue(SIGNAL);
  vi.mocked(extractTerms).mockResolvedValue(EXTRACTION);
  vi.mocked(challengeAssumptions).mockResolvedValue(CHALLENGES);
  vi.mocked(scrutinizeComps).mockResolvedValue(COMPS);
  vi.mocked(checkMarket).mockResolvedValue(MARKET);
  vi.mocked(synthesizeVerdict).mockResolvedValue(VERDICT);
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
  delete process.env.ANALYSIS_HEARTBEAT_MS;
  delete process.env.ANALYSIS_CONCURRENCY;
});

/** A second and third deal beside d1, each with its own queued job row. */
function addDeals(...ids: string[]) {
  for (const id of ids) {
    state.deals[id] = { ...freshState().deals.d1, id, name: `Deal ${id}` };
    state.jobs.push({ ...freshState().jobs[0], id: `j-${id}`, deal_id: id });
  }
}

describe("runAnalysis — the happy path", () => {
  it("runs the six steps in order, writes every result and finishes done", async () => {
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(job().step).toBe("verdict");
    expect(state.deals.d1.extraction).toEqual(EXTRACTION);
    expect(state.deals.d1.challenges).toEqual(CHALLENGES);
    expect(state.deals.d1.comps).toEqual(COMPS);
    expect(state.deals.d1.market).toEqual(MARKET);
    expect(state.deals.d1.verdict).toMatchObject({ verdict: "caution" });
    expect(staleAfterFailure(job()).size).toBe(0);
    // A pipeline step never sees the provider's raw error on this path.
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — what a failure leaves behind, and what it tells the analyst", () => {
  it("a provider overload becomes one sentence; the raw text goes to the log; the results it never reached stay the previous screen's", async () => {
    vi.mocked(scrutinizeComps).mockRejectedValue(apiError(529, "overloaded_error", "Overloaded"));
    await runAnalysis("d1");

    expect(job().status).toBe("error");
    expect(job().step).toBe("comps");
    expect(job().error).toMatch(/overloaded right now/);
    expect(job().error).not.toMatch(/overloaded_error|529|\{/);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("overloaded_error"));

    // The mixed generation: this run's extraction and challenges beside the
    // previous screen's comps, market and verdict.
    expect(state.deals.d1.extraction).toEqual(EXTRACTION);
    expect(state.deals.d1.challenges).toEqual(CHALLENGES);
    expect(state.deals.d1.comps).toEqual({ old: true });
    expect(state.deals.d1.verdict).toEqual({ old: true });
    expect(checkMarket).not.toHaveBeenCalled();
    expect(synthesizeVerdict).not.toHaveBeenCalled();
    // …and the reader every surface uses names exactly those three.
    expect([...staleAfterFailure(job())]).toEqual(["comps", "market", "verdict"]);
  });

  it("a missing key and a bad key both read as our configuration, never as the operator's instructions", async () => {
    vi.mocked(extractTerms).mockRejectedValue(
      new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local for local dev, or to your Render service's environment variables in production."),
    );
    await runAnalysis("d1");
    expect(job().error).toMatch(/configuration problem on our side/);
    expect(job().error).not.toMatch(/\.env|Render|ANTHROPIC/);

    state = freshState();
    vi.mocked(extractTerms).mockRejectedValue(apiError(401, "authentication_error", "invalid x-api-key"));
    await runAnalysis("d1");
    expect(job().error).toMatch(/configuration problem on our side/);
    expect(job().error).not.toMatch(/x-api-key/);
  });

  it("a PDF that yields no figures stops before the empty extraction is stored", async () => {
    vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, metrics: [] });
    await runAnalysis("d1");
    expect(job().status).toBe("error");
    expect(job().error).toMatch(/scan or password-protected/);
    expect(state.deals.d1.extraction).toEqual({ old: true });
    expect(challengeAssumptions).not.toHaveBeenCalled();
    expect(synthesizeVerdict).not.toHaveBeenCalled();
  });

  it("the previous first signal survives a failed first read (it is no longer cleared ahead of the call)", async () => {
    vi.mocked(readFirstSignal).mockRejectedValue(new Error("boom"));
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(state.deals.d1.first_signal).toEqual({ old: true });
    expect(
      state.writes.some((w) => w.table === "deals" && "first_signal" in w.patch && w.patch.first_signal === null),
    ).toBe(false);
  });

  it("a deal deleted mid-run stops the pipeline at the next step boundary instead of paying for every remaining step", async () => {
    vi.mocked(challengeAssumptions).mockImplementation(async () => {
      delete state.deals.d1;
      return CHALLENGES;
    });
    await runAnalysis("d1");
    expect(scrutinizeComps).not.toHaveBeenCalled();
    expect(checkMarket).not.toHaveBeenCalled();
    expect(synthesizeVerdict).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("deleted while its screen was running"));
  });
});

describe("runAnalysis — the run keeps its claim alive and cleans up after itself", () => {
  it("heartbeats the job row between step boundaries, and stops when the run ends", async () => {
    process.env.ANALYSIS_HEARTBEAT_MS = "10";
    vi.mocked(extractTerms).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(EXTRACTION), 80)),
    );
    await runAnalysis("d1");
    const beats = () =>
      state.writes.filter(
        (w) => w.table === "analysis_jobs" && w.op === "update" && Object.keys(w.patch).join() === "updated_at",
      ).length;
    expect(beats()).toBeGreaterThanOrEqual(2);
    expect(job().status).toBe("done");
    const after = beats();
    await new Promise((r) => setTimeout(r, 40));
    expect(beats()).toBe(after);
  });

  it("releases a Files-API copy of the OM when the run ends, on success and on failure alike", async () => {
    const file = { kind: "file" as const, fileId: "file_abc" };
    vi.mocked(omSourceFor).mockResolvedValue(file);
    await runAnalysis("d1");
    expect(releaseOmSource).toHaveBeenCalledWith(file);

    vi.mocked(releaseOmSource).mockClear();
    state = freshState();
    vi.mocked(scrutinizeComps).mockRejectedValue(new Error("fetch failed"));
    await runAnalysis("d1");
    expect(releaseOmSource).toHaveBeenCalledWith(file);
    expect(job().error).toMatch(/couldn't reach the analysis service/);
  });

  it("runs at most ANALYSIS_CONCURRENCY screens at once; the rest wait with their claim heartbeating", async () => {
    process.env.ANALYSIS_CONCURRENCY = "2";
    addDeals("d2", "d3", "d4");
    let inFlight = 0;
    let peak = 0;
    vi.mocked(extractTerms).mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 25));
      inFlight--;
      return EXTRACTION;
    });
    await Promise.all(["d1", "d2", "d3", "d4"].map((id) => runAnalysis(id)));
    expect(peak).toBe(2);
    for (const j of state.jobs) expect(j.status).toBe("done");

    // One at a time when asked; a run that fails still frees its slot.
    process.env.ANALYSIS_CONCURRENCY = "1";
    state = freshState();
    addDeals("d2");
    peak = 0;
    vi.mocked(scrutinizeComps).mockRejectedValueOnce(new Error("fetch failed"));
    await Promise.all(["d1", "d2"].map((id) => runAnalysis(id)));
    expect(peak).toBe(1);
    expect(state.jobs.map((j) => j.status).sort()).toEqual(["done", "error"]);
  });

  it("an OM past the provider's page cap stops before any model call, with the count in the message", async () => {
    const { downloadOmPdf } = await import("@/lib/storage");
    vi.mocked(downloadOmPdf).mockResolvedValueOnce(
      Buffer.from("%PDF-1.4\n" + "<< /Type /Page >>\n".repeat(700)),
    );
    await runAnalysis("d1");
    expect(job().status).toBe("error");
    expect(job().error).toMatch(/runs 700 pages/);
    expect(readFirstSignal).not.toHaveBeenCalled();
    expect(extractTerms).not.toHaveBeenCalled();
  });

  it("a resumed run whose checkpoint read fails still writes checkpoints that carry the job's kind", async () => {
    state.payloadReadFails = true;
    await runAnalysis("d1", { resume: true });
    expect(job().status).toBe("done");
    const checkpoints = state.writes.filter((w) => w.table === "analysis_jobs" && "payload" in w.patch);
    expect(checkpoints.length).toBeGreaterThan(0);
    for (const c of checkpoints) {
      const payload = c.patch.payload as { kind?: string; completed?: string[] };
      expect(payload.kind).toBe("screen");
      expect(payload.completed).toContain("signal");
    }
  });
});
