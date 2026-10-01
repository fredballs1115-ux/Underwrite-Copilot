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
  /** the `rates` table, for the market check's live figures */
  rates?: Row[];
  /** the `benchmarks` table, likewise */
  benchmarks?: Row[];
}

/** A chainable, thenable query like supabase-js's, over an in-memory store. */
class FakeQuery {
  private op: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row = {};
  private filters: [string, unknown][] = [];
  /** `.is(col, null)` guards: an update applies only where they hold */
  private nulls: string[] = [];
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
  is(col: string, val: unknown) {
    if (val === null) this.nulls.push(col);
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
      if (this.op === "update" && row && this.nulls.every((c) => row[c] == null)) Object.assign(row, this.patch);
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
    // The two public-figure tables the market check reads, filtered the one
    // way the read filters them: a series by its id, a metro by its name.
    if (table === "rates") {
      const id = this.where("series_id");
      return { data: (state.rates ?? []).filter((r) => r.series_id === id), error: null };
    }
    if (table === "benchmarks") {
      const metro = this.where("metro");
      return { data: (state.benchmarks ?? []).filter((r) => r.metro === metro), error: null };
    }
    return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  downloadOmPdf: vi.fn(async () => Buffer.from("%PDF-1.4\n")),
}));
vi.mock("@/lib/email", () => ({ notifyAnalysisReady: vi.fn(async () => {}), notifyAnalysisFailed: vi.fn(async () => {}) }));
// The memorandum's cover, lifted beside the steps after the extraction
// (lib/deal-picture's search is its own test's; here, what the screen asks).
vi.mock("@/lib/deal-picture", () => ({
  ensureDealPicture: vi.fn(async () => null),
  pictureMayBeInMemorandum: vi.fn(() => true),
}));
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
// The FEMA / census-tract lookup (lib/site-flags): the screen looks itself
// where the page has not (#447). Faked here, so no test reaches a geocoder;
// a claim that is won returns at once, and a test that needs the lookup to
// store something says what.
vi.mock("@/lib/site-flags/run", () => ({
  claimSiteFlags: vi.fn(async () => true),
  runSiteFlags: vi.fn(async () => {}),
}));
vi.mock("./om-source", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./om-source")>();
  return {
    ...orig,
    omSourceFor: vi.fn(async () => orig.omFromBuffer(Buffer.alloc(0))),
    releaseOmSource: vi.fn(async () => {}),
  };
});

import { SCREEN_PICTURE_WAIT_MS, runAnalysis, textLayerMissed } from "./pipeline";
import { ensureDealPicture, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { recordUsage, type CallUsage, type UsageSummary } from "./usage";
import { PRICES } from "./models";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readFirstSignal } from "./first-signal";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { checkMarket } from "./market";
import { synthesizeVerdict } from "./verdict";
import { omSourceFor, releaseOmSource } from "./om-source";
import { claimSiteFlags, runSiteFlags } from "@/lib/site-flags/run";

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

describe("textLayerMissed — what sends a text-layer read back to the pages", () => {
  const metric = (label: string, value: string) => ({ ...EXTRACTION.metrics[0], label, value });
  const ex = (metrics: unknown[]) => ({ ...EXTRACTION, metrics } as unknown as ExtractionResult);

  it("no figures at all, or figures but no NOI of any kind", () => {
    expect(textLayerMissed(ex([]))).toBe("no figures");
    expect(textLayerMissed(ex([metric("Asking price", "$20,000,000")]))).toBe("no NOI");
    expect(textLayerMissed(ex([metric("Asking price", "$20,000,000"), metric("NOI (Year 1)", "TBD")]))).toBe("no NOI");
    expect(textLayerMissed(EXTRACTION)).toBeNull();
  });

  it("an NOI stated under a label with a slash that is not a rate is an NOI — the deck is not re-read", () => {
    expect(textLayerMissed(ex([metric("Asking price", "$20,000,000"), metric("NOI (T-12 / TTM)", "$1,200,000")]))).toBeNull();
    expect(textLayerMissed(ex([metric("NOI / cash flow (in place)", "$1.2M")]))).toBeNull();
    // …while a per-SF or per-unit NOI alone is still not the NOI.
    expect(textLayerMissed(ex([metric("Asking price", "$20,000,000"), metric("NOI / SF", "$12.10")]))).toBe("no NOI");
  });
});

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
  vi.mocked(ensureDealPicture).mockResolvedValue(null);
  vi.mocked(pictureMayBeInMemorandum).mockReturnValue(true);
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

describe("runAnalysis — what the run spent lands on its job row", () => {
  const meter = (what: string, over: Partial<CallUsage> = {}) =>
    recordUsage({ what, model: PRICES[0].prefix, input: 1_000, cacheWrite: 0, cacheRead: 0, output: 500, ms: 100, ...over });

  it("writes the ledger with its totals and a list-price estimate when the screen finishes", async () => {
    vi.mocked(readFirstSignal).mockImplementation(async () => {
      meter("The first signal", { cacheWrite: 300_000 });
      return SIGNAL;
    });
    vi.mocked(extractTerms).mockImplementation(async () => {
      meter("Extraction", { cacheRead: 300_000, output: 6_000 });
      // A run that takes time, so its own start-to-finish time is measurable.
      await new Promise((r) => setTimeout(r, 25));
      return EXTRACTION;
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const usage = (state.jobs[0] as { usage?: UsageSummary }).usage;
    expect(usage?.calls.map((c) => c.what)).toEqual(["The first signal", "Extraction"]);
    expect(usage?.totals).toEqual({ input: 2_000, cacheWrite: 300_000, cacheRead: 300_000, output: 6_500 });
    expect(usage?.usd).toBeGreaterThan(0);
    expect(usage?.unpriced).toEqual([]);
    // The run's own time, start to finish — what "your screens usually take"
    // reads (lib/screen-duration) — never the calls' metered times summed.
    expect(usage?.wallMs).toBeGreaterThanOrEqual(15);
    expect(usage?.wallMs).not.toBe(usage?.ms);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[pipeline\] screen usage for deal d1: 2 calls/));
    logSpy.mockRestore();
  });

  it("a screen that stops emails its owner the deal page's own sentence; one that finishes does not (pass 14)", async () => {
    const { notifyAnalysisFailed } = await import("@/lib/email");
    vi.mocked(notifyAnalysisFailed).mockClear();
    vi.mocked(extractTerms).mockImplementation(async () => {
      throw apiError(529, "overloaded_error", "Overloaded");
    });
    await runAnalysis("d1");
    expect(job().status).toBe("error");
    expect(notifyAnalysisFailed).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyAnalysisFailed).mock.calls[0]?.[1]).toBe("d1");
    expect(vi.mocked(notifyAnalysisFailed).mock.calls[0]?.[2]).toBe(job().error);

    state = freshState();
    vi.mocked(notifyAnalysisFailed).mockClear();
    vi.mocked(extractTerms).mockResolvedValue(EXTRACTION);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(notifyAnalysisFailed).not.toHaveBeenCalled();
  });

  it("a failed screen still records what it spent; a run with no model calls records nothing", async () => {
    vi.mocked(extractTerms).mockImplementation(async () => {
      meter("Extraction");
      throw apiError(529, "overloaded_error", "Overloaded");
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAnalysis("d1");
    logSpy.mockRestore();
    expect(job().status).toBe("error");
    expect((state.jobs[0] as { usage?: UsageSummary }).usage?.calls.map((c) => c.what)).toEqual(["Extraction"]);

    state = freshState();
    vi.mocked(extractTerms).mockResolvedValue(EXTRACTION);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect((state.jobs[0] as { usage?: unknown }).usage).toBeUndefined();
    expect(state.writes.some((w) => w.table === "analysis_jobs" && "usage" in w.patch)).toBe(false);
  });

  it("the screen's own time goes only on a run that finished in one attempt: a failed run and a resumed one carry none (the audit of 2026-10-01)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // A failed run's time is no screen's: "your screens usually take" would
    // average in a run that stopped in three seconds, or timed out.
    vi.mocked(extractTerms).mockImplementation(async () => {
      meter("Extraction");
      throw apiError(529, "overloaded_error", "Overloaded");
    });
    await runAnalysis("d1");
    expect(job().status).toBe("error");
    const failed = (state.jobs[0] as { usage?: UsageSummary }).usage;
    expect(failed?.calls.map((c) => c.what)).toEqual(["Extraction"]);
    expect(failed?.wallMs).toBeUndefined();

    // A resumed attempt ran only the steps an earlier one left it.
    state = freshState();
    state.deals.d1.extraction = EXTRACTION;
    state.jobs[0].payload = { kind: "screen", completed: ["signal", "extract", "reconcile_docs", "ingest_actuals"] };
    vi.mocked(challengeAssumptions).mockImplementation(async () => {
      meter("Challenge");
      return CHALLENGES;
    });
    await runAnalysis("d1", { resume: true });
    expect(job().status).toBe("done");
    const resumed = (state.jobs[0] as { usage?: UsageSummary }).usage;
    expect(resumed?.calls.map((c) => c.what)).toEqual(["Challenge"]);
    expect(resumed?.wallMs).toBeUndefined();
    logSpy.mockRestore();
  });
});

describe("runAnalysis — the happy path", () => {
  it("runs the six steps in order, writes every result and finishes done", async () => {
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(job().step).toBe("verdict");
    expect(state.deals.d1.extraction).toEqual(EXTRACTION);
    expect(state.deals.d1.challenges).toEqual(CHALLENGES);
    expect(state.deals.d1.comps).toEqual(COMPS);
    // A deal with no address sits in no covered market: the check ran on
    // typical ranges alone and the result says so with a null brief.
    expect(state.deals.d1.market).toEqual({ ...MARKET, liveBrief: null });
    expect(vi.mocked(checkMarket).mock.calls[0][3]).toBeNull();
    expect(state.deals.d1.verdict).toMatchObject({ verdict: "caution" });
    expect(staleAfterFailure(job()).size).toBe(0);
    // A pipeline step never sees the provider's raw error on this path.
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("hands the challenger today's rates, dated, from the table the model is seeded from (the audit of 2026-09-30)", async () => {
    state.rates = [
      { series_id: "DGS5", obs_date: "2026-09-22", value: 3.9 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.2 },
      { series_id: "SOFR30DAYAVG", obs_date: "2026-09-22", value: 4.05 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    // The day before the screen's: said as the latest published, dated, never as today's.
    expect(note).toContain("LATEST PUBLISHED RATES (FRED, each dated the day it is for): the 5-yr Treasury 3.90% (Sep 22, 2026)");
    expect(note).toContain("the 10-yr Treasury 4.20% (Sep 22, 2026)");
    expect(note).toContain("30-day avg SOFR 4.05% (Sep 22, 2026)");
  });

  it("hands the challenger and the verdict one rates line, naming the class's screening spread — and on land, no permanent loan (research pass 18)", async () => {
    state.rates = [
      { series_id: "DGS5", obs_date: "2026-09-22", value: 3.9 },
      { series_id: "SOFR30DAYAVG", obs_date: "2026-09-22", value: 4.05 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
      expect(job().status).toBe("done");
      const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
      expect(note).toContain(
        "the 5-yr Treasury 3.90% (Sep 22, 2026), which the site's model prices a fixed-rate permanent loan off for its hold of 5 years, adding a 200 bps multifamily spread — the site's screening default",
      );
      const input = vi.mocked(synthesizeVerdict).mock.calls[0][0];
      expect(input.ratesLine).toBeTruthy();
      expect(note).toContain(input.ratesLine!);
      const { buildBrief } = await vi.importActual<typeof import("./verdict")>("./verdict");
      expect(buildBrief(input)).toContain(`## The latest published rates\n\n${input.ratesLine}`);

      // Land: the model carries no permanent loan, and the line says so.
      vi.mocked(challengeAssumptions).mockClear();
      vi.mocked(synthesizeVerdict).mockClear();
      vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, assetClass: "Land" } as unknown as ExtractionResult);
      await runAnalysis("d1");
      const land = vi.mocked(synthesizeVerdict).mock.calls[0][0].ratesLine ?? "";
      expect(land).toContain("the site's model carries no permanent loan on land, so it prices none off it");
      expect(land).not.toContain("prices a fixed-rate permanent loan off");
      expect(vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "").toContain(land);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hands the challenger the class the deck turned out to be where the deal was filed Auto, so it reads that class's traps alone (research pass 18)", async () => {
    state.deals.d1.asset_class = "auto";
    vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, assetClass: "Hospitality" } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(vi.mocked(challengeAssumptions).mock.calls[0][1]).toBe("hospitality_str");

    // A phrase no class resolves keeps every list, as before.
    vi.mocked(challengeAssumptions).mockClear();
    vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, assetClass: "Specialty asset" } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(vi.mocked(challengeAssumptions).mock.calls[0][1]).toBe("auto");

    // A class the analyst filed stays theirs, whatever the deck says.
    vi.mocked(challengeAssumptions).mockClear();
    state.deals.d1.asset_class = "office";
    vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, assetClass: "Multifamily" } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(vi.mocked(challengeAssumptions).mock.calls[0][1]).toBe("office");
  });

  it("hands the challenger no rates where the table holds nothing fresh — nothing is claimed as current", async () => {
    state.rates = [{ series_id: "DGS5", obs_date: "2026-01-02", value: 3.9 }];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    expect(vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "").not.toContain("PUBLISHED RATES");
  });

  it("a deal in a covered market hands the market check the metro's published figures, dated, and stores what it read", async () => {
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [
      { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
      { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.2 },
      { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
      { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
      // The debt market, national: the 10-year and the multifamily standards.
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
      { series_id: "SUBLPDRCSM", obs_date: "2026-07-01", value: -5.7 },
    ];
    // The Zillow pull keys its rows by the covered metro's own name (data/research/metros.json).
    state.benchmarks = [
      { metric: "zori_rent", metro: "Washington DC", low: 2310, as_of: "2026-08-31", note: "Washington, DC", source: "Zillow" },
      { metric: "zori_rent_yoy", metro: "Washington DC", low: 2.1, as_of: "2026-08-31", note: "", source: "Zillow" },
    ];
    // Freshness is judged against today, so pin the clock to the day the fixture's figures are current on.
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3];
    expect(handed).toContain("Published figures for the Washington DC market the deal sits in, read on 2026-09-23");
    expect(handed).toContain("- Unemployment 3.4% (Jul 2026, Washington MSA; FRED), +0.2 pt on the month before");
    expect(handed).toContain("- Rental vacancy, metro area, Washington MSA: 6.2% with a ±2.2 pt margin of error");
    expect(handed).toContain("- Asking rent, all home types: $2,310/mo, +2.1% from a year ago (Aug 2026; Zillow Research");
    // The debt market rides last: the 10-year, and the standards for a multifamily loan (the deal is an apartment).
    expect(handed).toContain("- Debt market — 10-year Treasury 4.90% (Sep 22, 2026; FRED)");
    expect(handed).toContain("- Debt market — banks tightening standards for multifamily loans: a net -5.7% of banks (Q3 2026;");
    const stored = state.deals.d1.market as {
      liveBrief?: { metro: string; readOn: string; lines: string[]; figures: { key: string; value: number }[] } | null;
    };
    expect(stored.liveBrief?.metro).toBe("Washington DC");
    expect(stored.liveBrief?.readOn).toBe("2026-09-23");
    expect(stored.liveBrief?.lines).toHaveLength(5);
    expect(stored.liveBrief?.figures.map((f) => [f.key, f.value])).toEqual([
      ["unemployment", 3.4],
      ["rental_vacancy_msa", 6.2],
      ["zori_rent", 2310],
      ["dgs10", 4.9],
      ["sloos_multifamily", -5.7],
    ]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("an office in a covered metro is handed the metro's jobs and no housing figure; an apartment building the same day still is (research pass 18)", async () => {
    state.deals.d1.asset_class = "office";
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [
      { series_id: "WASH911URN", obs_date: "2026-08-01", value: 3.4 },
      { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: -1.2 },
      { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
      { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
    ];
    state.benchmarks = [
      { metric: "zori_rent", metro: "Washington DC", low: 2310, as_of: "2026-08-31", note: "Washington, DC", source: "Zillow" },
      { metric: "zori_rent_yoy", metro: "Washington DC", low: 2.1, as_of: "2026-08-31", note: "", source: "Zillow" },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
      expect(job().status).toBe("done");
      const office = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
      expect(office).toContain("- Unemployment 3.4% (Aug 2026, Washington MSA; FRED)");
      expect(office).toContain("- Payrolls in professional and business services, the sector that fills offices: -1.2% from a year ago");
      expect(office).toContain("- Debt market — 10-year Treasury 4.90%");
      expect(office).not.toContain("Rental vacancy");
      expect(office).not.toContain("Asking rent");
      expect(office).not.toContain("Zillow");
      const stored = state.deals.d1.market as { liveBrief?: { figures: { key: string }[] } | null };
      expect(stored.liveBrief?.figures.map((f) => f.key)).toEqual(["unemployment", "sector_jobs_yoy", "dgs10"]);

      // The same metro, the same day, an apartment building: every housing line.
      vi.mocked(checkMarket).mockClear();
      state.deals.d1.asset_class = "multifamily";
      await runAnalysis("d1");
      const apartments = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
      expect(apartments).toContain("- Rental vacancy, metro area, Washington MSA: 6.2% with a ±2.2 pt margin of error");
      expect(apartments).toContain("- Asking rent, all home types: $2,310/mo, +2.1% from a year ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the debt market for the class the deal is filed as, not the deck's word for it", async () => {
    // The analyst filed an office; the deck calls itself multifamily. Every
    // page shows the office (shownAssetClass), so the check reads a
    // nonresidential loan's standards, never a multifamily loan's.
    state.deals.d1.asset_class = "office";
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
      { series_id: "SUBLPDRCSM", obs_date: "2026-07-01", value: -5.7 },
      { series_id: "SUBLPDRCSN", obs_date: "2026-07-01", value: 3.1 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3];
    expect(handed).toContain("banks tightening standards for nonfarm nonresidential loans");
    expect(handed).not.toContain("banks tightening standards for multifamily loans");
  });

  it("reads the plan the first signal names, as the deal page does: a conversion reads what building costs (the audit of 2026-09-30)", async () => {
    // Nothing in the extraction names a plan (its strategy is unknown); the
    // first signal calls it a conversion. The deal page reads the signal
    // beside the extraction, and the screen's market check now does too.
    state.deals.d1.asset_class = "office";
    state.deals.d1.address = { city: "Washington", state: "DC" };
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    } as unknown as ExtractionResult);
    vi.mocked(readFirstSignal).mockResolvedValue({
      ...SIGNAL,
      assetClass: "office",
      take: "A conversion of a vacant office tower to apartments — check the budget against the floor plates.",
    } as unknown as FirstSignal);
    state.rates = [
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
      { series_id: "SUBLPDRCSC", obs_date: "2026-07-01", value: 8.2 },
      { series_id: "WPUIP2312001_YOY", obs_date: "2026-08-01", value: 2.4 },
      { series_id: "CES2000000003_YOY", obs_date: "2026-08-01", value: 4.1 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3];
    expect(handed).toContain("construction and land development loans");
    expect(handed).toContain("Construction costs —");
  });

  it("every step names the kind the first signal names: the challenger, the comps, the market check and the verdict read one kind (research pass 18)", async () => {
    // The same deal as above: the extraction names no plan, the first
    // signal calls it a conversion. The market figures read the signal; the
    // deal context, the challenger and the verdict had read the extraction
    // alone and called it stabilized beside construction-cost lines.
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    } as unknown as ExtractionResult);
    const signal = {
      ...SIGNAL,
      take: "A conversion of a vacant office tower to apartments — check the budget against the floor plates.",
    } as unknown as FirstSignal;
    vi.mocked(readFirstSignal).mockResolvedValue(signal);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const challenger = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    const comps = vi.mocked(scrutinizeComps).mock.calls[0][1] ?? "";
    const market = vi.mocked(checkMarket).mock.calls[0][2] ?? "";
    expect(challenger).toContain("DEAL STRATEGY: Conversion");
    expect(comps).toContain("Deal type: Conversion");
    expect(market).toContain("Deal type: Conversion");
    for (const text of [challenger, comps, market]) expect(text).not.toContain("Stabilized");
    // The verdict is handed the signal, and its brief reads the same kind.
    const input = vi.mocked(synthesizeVerdict).mock.calls[0][0];
    expect(input.firstSignal).toEqual(signal);
    const { buildBrief } = await vi.importActual<typeof import("./verdict")>("./verdict");
    const brief = buildBrief(input);
    expect(brief).toContain("DEAL STRATEGY: Conversion");
    expect(brief).not.toContain("Stabilized");
  });

  it("the verdict is handed the deal page's own buy-box checks and the red lines tripped, not the bare criteria (research pass 18)", async () => {
    const { getBuyBoxForDeal } = await import("@/lib/criteria-server");
    const box = { priceMaxM: 15, minCapPct: 6.5, dealbreakers: { maxPriceM: 18 } };
    const signal = { ...SIGNAL, askPrice: "$20,000,000", size: "", goingInCap: "", perUnit: "", take: "A stabilized asset." } as FirstSignal;
    vi.mocked(readFirstSignal).mockResolvedValue(signal);
    vi.mocked(getBuyBoxForDeal).mockResolvedValueOnce(box);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const input = vi.mocked(synthesizeVerdict).mock.calls[0][0];
    expect(input.buyBox).toEqual(["Price: $15.0M max", "Min going-in cap: 6.5%", "Dealbreakers: price ≤ $18M"]);
    // The page's read: the extraction, the first signal, the address — the same checks the chip folds.
    const { evaluateBuyBox } = await import("@/lib/criteria");
    const { dealCheckSource } = await import("@/lib/buy-box-chip");
    expect(input.buyBoxChecks?.checks).toEqual(evaluateBuyBox("multifamily", dealCheckSource(EXTRACTION, signal, null), box));
    expect(input.buyBoxChecks?.checks.find((c) => c.label === "Price")).toEqual({
      label: "Price",
      status: "miss",
      detail: "Mandate is $15.0M max — the ask is $20.0M. Beyond the mandate.",
    });
    expect(input.buyBoxChecks?.tripped).toEqual(["price $20.0M over the $18.0M ceiling"]);

    // A read of the checks that fails (here, a first signal stored without
    // its going-in cap) leaves the criteria in the brief, as before.
    vi.mocked(synthesizeVerdict).mockClear();
    vi.mocked(readFirstSignal).mockResolvedValue(SIGNAL);
    vi.mocked(getBuyBoxForDeal).mockResolvedValueOnce(box);
    await runAnalysis("d1");
    const again = vi.mocked(synthesizeVerdict).mock.calls[0][0];
    expect(again.buyBox).toEqual(input.buyBox);
    expect(again.buyBoxChecks).toBeNull();
  });

  it("the verdict is handed the deal context the comps and the market check read, built once — on a resumed run too (research pass 18)", async () => {
    const share = {
      ...EXTRACTION,
      interest: { kind: "partial_interest", summary: "", share: "49% limited partnership interest", groundLease: "", loan: "", page: "p. 3" },
      metrics: [...EXTRACTION.metrics, { label: "Units", value: "240", flagged: false, page: "p. 3", basis: "na", locatorSnippet: "" }],
    } as unknown as ExtractionResult;
    vi.mocked(extractTerms).mockResolvedValue(share);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const comps = vi.mocked(scrutinizeComps).mock.calls[0][1];
    expect(comps).toContain("What is being sold: a share of the owning entity.");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toBe(comps);
    const input = vi.mocked(synthesizeVerdict).mock.calls[0][0];
    expect(input.dealContext).toBe(comps);
    expect(input.assetClass).toBe("multifamily");
    const { buildBrief } = await vi.importActual<typeof import("./verdict")>("./verdict");
    const brief = buildBrief(input);
    expect(brief).toContain(`## What the screen established about the deal, checked in code\n\n${comps}`);
    expect(brief).toContain("THE BUILDING'S BASIS, computed in code: $170k/unit");

    // An attempt resumed past the comps and the market check still tells the verdict.
    vi.clearAllMocks();
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => ({ from: (t: string) => new FakeQuery(state, t) }) as never);
    vi.mocked(synthesizeVerdict).mockResolvedValue(VERDICT);
    state.jobs[0].payload = {
      kind: "screen",
      completed: ["signal", "extract", "reconcile_docs", "ingest_actuals", "challenge", "comps", "market"],
    };
    await runAnalysis("d1", { resume: true });
    expect(job().status).toBe("done");
    expect(vi.mocked(scrutinizeComps)).not.toHaveBeenCalled();
    expect(vi.mocked(checkMarket)).not.toHaveBeenCalled();
    // The stored flags were read, never looked up again.
    expect(vi.mocked(claimSiteFlags)).not.toHaveBeenCalled();
    expect(vi.mocked(synthesizeVerdict).mock.calls[0][0].dealContext).toBe(comps);
  });

  it("a suburb its address's words miss reads its metro area's figures, placed by its tract's county and said so (#447)", async () => {
    const label = "5000 Main St, Frisco, TX 75034";
    state.deals.d1.address = { label, street: "5000 Main St", city: "Frisco", state: "TX", zip: "75034", county: "", submarket: "" };
    // The deal page's lookup has answered: the building's tract is in Collin County.
    state.deals.d1.site_flags = {
      status: "ok",
      subject: { lat: 33.15, lng: -96.82, label },
      tractGeoid: "48085030100",
      opportunityZone: null,
      flood: null,
      retrievedAt: "2026-09-23T11:00:00Z",
      note: "",
    };
    state.rates = [
      { series_id: "DALL148URN", obs_date: "2026-07-01", value: 4.1 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
    expect(handed).toContain(
      "Published figures for the Dallas-Fort Worth market the deal sits in — placed there by its county: Collin County, TX, which the Census Bureau files in the Dallas-Fort Worth-Arlington, TX metro area, and the address names no place the site's list for this market does — read on 2026-09-23",
    );
    expect(handed).toContain("each is the metro area's — not the county's, not the submarket's and not the building's.");
    expect(handed).toContain("- Unemployment 4.1% (Jul 2026, Dallas–Fort Worth MSA; FRED)");
    const stored = state.deals.d1.market as { liveBrief?: { metro: string; placedBy?: unknown } | null };
    expect(stored.liveBrief?.metro).toBe("Dallas-Fort Worth");
    expect(stored.liveBrief?.placedBy).toEqual({ county: "Collin County, TX", area: "Dallas-Fort Worth-Arlington, TX" });
    // The page had looked: the screen did not look again.
    expect(vi.mocked(claimSiteFlags)).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("looks the site flags up itself where the page has not, and again where they were looked up for an edited address (#447)", async () => {
    const label = "5000 Main St, Frisco, TX 75034";
    state.deals.d1.address = { label, street: "5000 Main St", city: "Frisco", state: "TX", zip: "75034", county: "", submarket: "" };
    // Flags from the address the deal had before an edit: the old building's.
    state.deals.d1.site_flags = {
      status: "ok",
      subject: { lat: 29.76, lng: -95.37, label: "900 Travis St, Houston, TX 77002" },
      tractGeoid: "48201100000",
      opportunityZone: null,
      flood: null,
      retrievedAt: "2026-09-01T00:00:00Z",
      note: "",
    };
    vi.mocked(runSiteFlags).mockImplementationOnce(async () => {
      state.deals.d1.site_flags = {
        status: "ok",
        subject: { lat: 33.15, lng: -96.82, label },
        tractGeoid: "48085030100",
        opportunityZone: null,
        flood: { zone: "AE", subtype: null, isHighRisk: true },
        retrievedAt: "2026-09-23T11:59:00Z",
        note: "",
      };
    });
    state.rates = [{ series_id: "DALL148URN", obs_date: "2026-07-01", value: 4.1 }];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    // Claimed over the stale answer (forced), run, and read.
    expect(vi.mocked(claimSiteFlags)).toHaveBeenCalledWith("d1", true);
    expect(vi.mocked(runSiteFlags)).toHaveBeenCalledWith("d1");
    const handed = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
    expect(handed).toContain("Published figures for the Dallas-Fort Worth market the deal sits in — placed there by its county: Collin County, TX");
    // The flood zone the fresh lookup found reaches the deal context too.
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toMatch(/Zone AE/);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a portfolio across two markets: the challenger gets the portfolio traps, and the market check's header says whose figures it read", async () => {
    const prop = (name: string, address: string, count: string) => ({
      name, address, count, area: "", noi: "", occupancy: "", yearBuilt: "", allocatedPrice: "", page: "",
    });
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      properties: [
        prop("Navy Yard Flats", "1100 First St SE, Washington, DC 20003", "180"),
        prop("Canton Square", "2800 Boston St, Baltimore, MD 21224", "120"),
      ],
    } as unknown as ExtractionResult);
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [
      { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
      { series_id: "BALT524URN", obs_date: "2026-07-01", value: 3.9 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("This OM offers a portfolio of 2 properties across 2 markets — Washington DC (1) and Baltimore MD (1).");
    expect(note).toContain("PORTFOLIO TRAPS, checked by name");
    expect(note).toContain("No property states an NOI of its own");
    const handed = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
    expect(handed).toContain(
      "The deal is a portfolio of 2 properties across 2 markets — Washington DC (1) and Baltimore MD (1); these figures are for the 1 property in Washington DC — the figures for Baltimore MD follow in blocks of their own, and a figure is never the portfolio's.",
    );
    // The other market's own block (#413): its header, its figure, and no
    // second copy of the national lines, which ride in the first block.
    const [dcBlock, baltBlock] = handed.split("\n\n");
    expect(dcBlock).toContain("- Unemployment 3.4% (Jul 2026, Washington MSA; FRED)");
    expect(dcBlock).toContain("10-year Treasury");
    expect(baltBlock.split("\n")[0]).toBe(
      "Published figures for the Baltimore MD market, where 1 of the portfolio's 2 properties sits, read on 2026-09-23 from FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com. Each is dated, and each is the metro area's — not the submarket's, not those properties' own and never the portfolio's.",
    );
    expect(baltBlock).toContain("- Unemployment 3.9% (Jul 2026, Baltimore MSA; FRED)");
    expect(baltBlock).not.toContain("10-year Treasury");
    // Both are stored, each saying how many of the properties sit there.
    const stored = state.deals.d1.market as {
      liveBrief?: { metro: string; portfolio?: { here: number; of: number } } | null;
      otherBriefs?: Array<{ metro: string; grain?: string; lines: string[]; portfolio?: { here: number; of: number } }>;
    };
    expect(stored.liveBrief?.metro).toBe("Washington DC");
    expect(stored.liveBrief?.portfolio).toEqual({ here: 1, of: 2 });
    // The national lines ride last in the address's block and are counted,
    // so no surface calls the 10-year the metro's; the other block has none.
    const primaryRec = stored.liveBrief as unknown as { lines: string[]; national?: number };
    expect(primaryRec.national).toBeGreaterThan(0);
    expect(primaryRec.lines.at(-1)).toMatch(/10-year Treasury/);
    expect((stored.otherBriefs![0] as { national?: number }).national).toBeUndefined();
    expect(stored.otherBriefs).toHaveLength(1);
    expect(stored.otherBriefs![0]).toMatchObject({ metro: "Baltimore MD", grain: "metro", portfolio: { here: 1, of: 2 } });
    expect(stored.otherBriefs![0].lines).toContain("Unemployment 3.9% (Jul 2026, Baltimore MSA; FRED)");
    // The deal context names it too, for the comp scrutiny and the market check.
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("Portfolio: 2 properties across 2 markets");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a portfolio market with nothing fresh is never promised, and with no market on the address the first block read carries the national lines (#413)", async () => {
    const prop = (name: string, address: string) => ({
      name, address, count: "100", area: "", noi: "", occupancy: "", yearBuilt: "", allocatedPrice: "", page: "",
    });
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      properties: [
        prop("Navy Yard Flats", "1100 First St SE, Washington, DC 20003"),
        prop("Canton Square", "2800 Boston St, Baltimore, MD 21224"),
      ],
    } as unknown as ExtractionResult);
    // Baltimore's only row is years old: nothing fresh to say.
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [
      { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
      { series_id: "BALT524URN", obs_date: "2019-07-01", value: 3.9 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    const handed = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
    expect(handed).not.toContain("follow in blocks of their own");
    expect(handed).toContain("the other markets' properties are not read here");
    expect((state.deals.d1.market as { otherBriefs?: unknown }).otherBriefs).toBeUndefined();

    // The address names no state at all: the portfolio's own markets are
    // read, and the first block that reads anything carries the 10-year.
    vi.mocked(checkMarket).mockClear();
    state.deals.d1.address = null;
    state.deals.d1.market = null;
    state.rates = [
      { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
      { series_id: "BALT524URN", obs_date: "2026-07-01", value: 3.9 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
    ];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    const blocks = (vi.mocked(checkMarket).mock.calls[0][3] ?? "").split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("Published figures for the Washington DC market, where 1 of the portfolio's 2 properties sits");
    expect(blocks[0]).toContain("10-year Treasury");
    expect(blocks[1]).toContain("Published figures for the Baltimore MD market, where 1 of the portfolio's 2 properties sits");
    expect(blocks[1]).not.toContain("10-year Treasury");
    const stored = state.deals.d1.market as { liveBrief?: unknown; otherBriefs?: Array<{ metro: string }> };
    expect(stored.liveBrief).toBeNull();
    expect(stored.otherBriefs?.map((b) => b.metro)).toEqual(["Washington DC", "Baltimore MD"]);
  });

  it("a note sale: the challenger reads the note's traps first, and the deal context says what is being sold (#414)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      interest: { kind: "note", summary: "Sale of the first mortgage note", share: "", groundLease: "", loan: "$24.4M UPB, 5.25% coupon, 90 days delinquent", page: "" },
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note.startsWith("What is being sold: a loan secured by the property.")).toBe(true);
    expect(note).toContain("The loan as stated: $24.4M UPB, 5.25% coupon, 90 days delinquent.");
    expect(note).toContain("NOTE TRAPS, checked by name");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("What is being sold: a loan secured by the property.");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a LIHTC building: the challenger reads the restriction's traps, and the deal context says the rents are capped (#453)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      affordable: {
        programs: ["lihtc"],
        summary: "A 2011 tax-credit property",
        agreement: "Extended Use Agreement with the state housing finance agency",
        assistance: "",
        tiers: [],
        page: "",
      },
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Restricted units", value: "120", flagged: false, page: "", basis: "na" },
        { label: "Affordability expiration", value: "December 31, 2054", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("Affordability: This is an affordable-housing deal:");
    expect(note).toContain("rent-restricted under a LIHTC regulatory agreement until Dec 2054");
    expect(note).toContain("LIHTC TRAPS, checked by name");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("Affordability: This is an affordable-housing deal:");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a single-tenant building: the challenger reads the lease's traps, and the deal context names the tenant (#454)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      singleTenant: {
        tenant: "Walgreens Co.",
        guarantor: "",
        leaseType: "Absolute NNN",
        landlordObligations: "",
        tenantRights: "Tenant holds a right of first refusal on any sale",
        page: "",
      },
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Lease expiration", value: "December 31, 2046", flagged: false, page: "", basis: "na" },
        { label: "Rent increases", value: "Flat", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("Single tenant: Walgreens Co. leases the whole property, and the memorandum names no guarantor.");
    expect(note).toContain("SINGLE-TENANT TRAPS, checked by name");
    expect(note).toContain("a right of first refusal on a sale: every bid at the exit can be matched by the tenant");
    expect(note).toContain("(e) A FLAT RENT");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("Single tenant: Walgreens Co. leases the whole property");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a hotel: the challenger reads the contract traps, and the deal context says what it is sold with (#455)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      assetClass: "hospitality_str",
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management", pip: "", page: "" },
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Keys", value: "120", flagged: false, page: "", basis: "na" },
        { label: "PIP cost", value: "$4,200,000", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("Hotel: The hotel is flagged Courtyard by Marriott, as stated.");
    expect(note).toContain("HOTEL CONTRACT TRAPS, checked by name");
    expect(note).toContain("(b) THE MANAGEMENT ENCUMBRANCE");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("Hotel: The hotel is flagged Courtyard by Marriott");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("an auction: the challenger reads the sale's traps, and the deal context says the starting bid is not a price (#456)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      sale: { method: "auction", terms: "", condition: "As-is, where-is", page: "" },
      metrics: [
        ...EXTRACTION.metrics.filter((m) => !/price/i.test(m.label)),
        { label: "Starting bid", value: "$2,500,000", flagged: false, page: "", basis: "na" },
        { label: "Buyer's premium", value: "5%", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("How it is sold: The property is sold at auction: bidding opens at $2.5M");
    expect(note).toContain("SALE TRAPS, checked by name");
    expect(note).toContain("(a) THE STARTING BID IS NOT THE PRICE");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("How it is sold: The property is sold at auction");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a shopping center: the challenger reads the listed tenants and the multi-tenant traps (#457)", async () => {
    const t = (name: string, over: Record<string, string> = {}) => ({
      name, role: "inline", inSale: "yes", sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      assetClass: "retail",
      tenants: [
        t("Kroger", { role: "anchor", sf: "58,000 SF", rent: "$725,000", leaseExpiration: "January 31, 2124", rights: "Right to go dark" }),
        t("Staples", { sf: "20,000 SF", rent: "$360,000", leaseExpiration: "June 30, 2124", rights: "Co-tenancy tied to Kroger" }),
        { ...t("Target", { sf: "125,000 SF" }), role: "anchor", inSale: "no" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("The tenants: The memorandum lists two tenants");
    expect(note).toContain("MULTI-TENANT TRAPS, checked by name");
    expect(note).toContain("(g) THE SHADOW ANCHOR — Target is not bought");
    expect(note).toContain("(h) CO-TENANCY AND GO-DARK");
    expect(vi.mocked(checkMarket).mock.calls[0][2]).toContain("The tenants: The memorandum lists two tenants");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a value-add program: the challenger reads the program and the value-add traps (#460)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" },
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Units to renovate", value: "192", flagged: false, page: "", basis: "na" },
        { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "", basis: "na" },
        { label: "Renovation premium", value: "$250", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("The renovation program: The program renovates 192 doors");
    expect(note).toContain("VALUE-ADD TRAPS, checked by name");
    expect(note).toContain("(b) THE PREMIUM IS TWO NUMBERS");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a tax abatement: the challenger reads when it ends and the tax-abatement traps (#461)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false, page: "", basis: "na" },
        { label: "Tax abatement expiration", value: "2099", flagged: false, page: "", basis: "na" },
        { label: "Unabated real estate taxes", value: "$520,000", flagged: false, page: "", basis: "na" },
        { label: "Abated real estate taxes", value: "$70,000", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("THE TAX ABATEMENT AS STATED: The property's taxes are abated under its 10-year Philadelphia tax abatement until 2099");
    expect(note).toContain("TAX-ABATEMENT TRAPS, checked by name");
    expect(note).toContain("(c) THE TRANSFER");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a student building: the challenger reads its pre-leasing and what to check by name (#468)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      assetClass: "student_housing",
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Beds", value: "612", flagged: false, page: "", basis: "na" },
        { label: "Pre-leased", value: "74% for Fall 2026 vs. 81% a year ago", flagged: false, page: "", basis: "na" },
        { label: "Distance to campus", value: "1.6 miles", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("STUDENT HOUSING AS STATED: The building is 74% pre-leased for Fall 2026, 7 points behind last year's 81% at the same point");
    expect(note).toContain("past the half mile a student walks");
    expect(note).toContain("the pre-lease pace against last year's at the same date");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a manufactured-housing park: the challenger reads its lot rent, homes and utilities and what to check by name (#470)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      assetClass: "manufactured_housing",
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Pads", value: "150", flagged: false, page: "", basis: "na" },
        { label: "Lot rent", value: "$430", flagged: false, page: "", basis: "in_place" },
        { label: "Market lot rent", value: "$525", flagged: true, page: "", basis: "pro_forma" },
        { label: "Park-owned homes", value: "18", flagged: false, page: "", basis: "na" },
        { label: "Water and sewer", value: "Private well and septic", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("MANUFACTURED HOUSING AS STATED: It has 150 pads");
    expect(note).toContain("The average lot rent is $430 a month against the memorandum's market $525");
    expect(note).toContain("who owns the water and sewer systems, how old they are");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a self-storage facility: the challenger reads its occupancies and rates and what to check by name (#471)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      assetClass: "self_storage",
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Economic occupancy", value: "84%", flagged: false, page: "", basis: "in_place" },
        { label: "In-place rent", value: "$1.38/SF/month", flagged: false, page: "", basis: "in_place" },
        { label: "Street rate", value: "$1.14/SF/month", flagged: false, page: "", basis: "in_place" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("SELF-STORAGE AS STATED:");
    expect(note).toContain("21.1% over it, the premium years of rate increases built");
    expect(note).toContain("the street rate against the rates the facility's own recent move-ins signed at");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("the third-party reports: the challenger reads what they found and the site-report traps (#465)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Phase I ESA date", value: "June 2019", flagged: false, page: "", basis: "na" },
        { label: "Phase I ESA findings", value: "One REC: former dry cleaner on the adjacent parcel", flagged: false, page: "", basis: "na" },
        { label: "PCA immediate repairs", value: "$630,000", flagged: false, page: "", basis: "na" },
        { label: "Seismic PML", value: "24%", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("THE THIRD-PARTY REPORTS AS STATED: The seller's Phase I, dated Jun 2019, found a recognized environmental condition");
    expect(note).toContain("past the year a Phase I is good for before a purchase");
    expect(note).toContain("SITE-REPORT TRAPS, checked by name");
    expect(note).toContain("(e) SEISMIC AND ZONING");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a seller's note: the challenger reads the note and the seller-financing traps (#462)", async () => {
    vi.mocked(extractTerms).mockResolvedValue({
      ...EXTRACTION,
      metrics: [
        ...EXTRACTION.metrics,
        { label: "Seller financing amount", value: "$10,000,000", flagged: false, page: "", basis: "na" },
        { label: "Seller financing rate", value: "5.00%", flagged: false, page: "", basis: "na" },
        { label: "Seller financing term", value: "5 years", flagged: false, page: "", basis: "na" },
      ],
    } as unknown as ExtractionResult);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    const note = vi.mocked(challengeAssumptions).mock.calls[0][2] ?? "";
    expect(note).toContain("The memorandum says the seller will carry financing: $10.0M at 5.00% for 5 years.");
    expect(note).toContain("SELLER-FINANCING TRAPS, checked by name");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a single-market deal stores no other markets' figures", async () => {
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [{ series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 }];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    const stored = state.deals.d1.market as { liveBrief?: { portfolio?: unknown } | null; otherBriefs?: unknown };
    expect(stored.otherBriefs).toBeUndefined();
    expect(stored.liveBrief?.portfolio).toBeUndefined();
    expect(vi.mocked(checkMarket).mock.calls[0][3]).not.toContain("\n\n");
  });

  it("a covered-market deal whose tables hold nothing fresh gets a check on typical ranges alone, never a failed screen", async () => {
    state.deals.d1.address = { city: "Washington", state: "DC" };
    state.rates = [{ series_id: "WASH911URN", obs_date: "2019-07-01", value: 3.4 }];
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(vi.mocked(checkMarket).mock.calls[0][3]).toBeNull();
    expect((state.deals.d1.market as { liveBrief?: unknown }).liveBrief).toBeNull();
  });

  it("a deal in a metro area the site reads without a brief is handed the metro's figures, as the metro's, with the header saying there is no brief behind them", async () => {
    state.deals.d1.address = { city: "Pittsburgh", state: "PA" };
    state.rates = [
      { series_id: "PITT342URN", obs_date: "2026-07-01", value: 4.1 },
      { series_id: "PITT342URN", obs_date: "2026-06-01", value: 4.3 },
      { series_id: "PITT342NA_YOY", obs_date: "2026-08-01", value: 0.6 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
      // Pennsylvania's own row must NOT be read: the deal sits in a metro the table covers.
      { series_id: "PAUR", obs_date: "2026-08-01", value: 3.7 },
    ];
    state.benchmarks = [];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3];
    expect(handed).toContain(
      "Published figures for the Pittsburgh PA metro area the deal sits in — a market the site reads but does not brief, so these figures are all it holds for it — read on 2026-09-23",
    );
    expect(handed).toContain("- Unemployment 4.1% (Jul 2026, Pittsburgh MSA; FRED), -0.2 pt on the month before");
    expect(handed).toContain("- Nonfarm payrolls +0.6% from a year ago (Aug 2026, Pittsburgh MSA; FRED)");
    expect(handed).not.toContain("Pennsylvania");
    const stored = state.deals.d1.market as { liveBrief?: { metro: string; grain?: string; lines: string[] } | null };
    expect(stored.liveBrief?.metro).toBe("Pittsburgh PA");
    expect(stored.liveBrief?.grain).toBe("metro");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("a deal outside the covered metros is handed its state's figures, said as the state's, and stores the grain", async () => {
    // Harrisburg is in no briefed market and no metro the site reads without
    // one; Pennsylvania's own series are filed under state:PA.
    state.deals.d1.address = { city: "Harrisburg", state: "PA" };
    state.rates = [
      { series_id: "PAUR", obs_date: "2026-08-01", value: 3.7 },
      { series_id: "PAUR", obs_date: "2026-07-01", value: 3.6 },
      { series_id: "PARVAC", obs_date: "2025-01-01", value: 6.6 },
      { series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 },
    ];
    state.benchmarks = [];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    const handed = vi.mocked(checkMarket).mock.calls[0][3];
    expect(handed).toContain(
      "Published figures for the state of Pennsylvania the deal sits in — the address lies outside the metros the site tracks, so these are the state's own figures — read on 2026-09-23",
    );
    expect(handed).toContain("- Unemployment 3.7% (Aug 2026, Pennsylvania; FRED), +0.1 pt on the month before");
    expect(handed).toContain("- Rental vacancy, Pennsylvania, the state's annual figure: 6.6% (2025;");
    expect(handed).toContain("- Debt market — 10-year Treasury 4.90% (Sep 22, 2026; FRED)");
    expect(handed).not.toContain("metro area's");
    const stored = state.deals.d1.market as { liveBrief?: { metro: string; grain?: string; lines: string[] } | null };
    expect(stored.liveBrief?.metro).toBe("Pennsylvania");
    expect(stored.liveBrief?.grain).toBe("state");
    expect(stored.liveBrief?.lines).toHaveLength(3);
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — a deal placed by its address (#441)", () => {
  it("takes the address its memorandum states where none was typed, and the market check reads that market", async () => {
    // Uploaded with the address box empty: nothing placed the deal, although
    // the memorandum names its street ("100 Main St, Dallas, TX").
    state.deals.d1.address = null;
    state.rates = [{ series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 }];
    state.benchmarks = [];
    vi.useFakeTimers({ now: new Date("2026-09-23T12:00:00Z"), toFake: ["Date"] });
    try {
      await runAnalysis("d1");
    } finally {
      vi.useRealTimers();
    }
    expect(job().status).toBe("done");
    expect(state.deals.d1.address).toMatchObject({
      label: "100 Main St, Dallas, TX",
      street: "100 Main St",
      city: "Dallas",
      state: "TX",
      from: "memorandum",
    });
    const handed = vi.mocked(checkMarket).mock.calls[0][3] ?? "";
    expect(handed).toContain("Published figures for the Dallas-Fort Worth market the deal sits in");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("fills a typed line from itself, and never replaces an address someone gave", async () => {
    state.deals.d1.address = { label: "1200 Liberty Ave, Pittsburgh, PA 15222", street: "", city: "", state: "", zip: "", county: "", submarket: "" };
    state.rates = [{ series_id: "DGS10", obs_date: "2026-09-22", value: 4.9 }];
    state.benchmarks = [];
    await runAnalysis("d1");
    expect(state.deals.d1.address).toMatchObject({ street: "1200 Liberty Ave", city: "Pittsburgh", state: "PA", zip: "15222" });
    expect((state.deals.d1.address as { from?: string }).from).toBeUndefined();
    // A picked suggestion stays exactly as it was picked.
    const picked = { label: "1400 Market St, Philadelphia, PA 19102", street: "1400 Market St", city: "Philadelphia", state: "PA", zip: "19102", county: "Philadelphia County", submarket: "" };
    state.deals.d1.address = { ...picked };
    await runAnalysis("d1");
    expect(state.deals.d1.address).toEqual(picked);
  });
});

describe("runAnalysis — the memorandum's call for offers (#467)", () => {
  const withDue = (value: string) =>
    ({
      ...EXTRACTION,
      metrics: [...EXTRACTION.metrics, { label: "Offers due", value, flagged: false, page: "p. 2", basis: "na", locatorSnippet: "" }],
    }) as unknown as ExtractionResult;

  it("fills the deal's deadline where nobody has set one", async () => {
    vi.mocked(extractTerms).mockResolvedValue(withDue("Thursday, October 15, 2026 at 5:00 PM ET"));
    state.deals.d1.offers_due = null;
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(state.deals.d1.offers_due).toBe("2026-10-15");
  });

  it("never replaces a date the reader set, and never stores a date with no year", async () => {
    vi.mocked(extractTerms).mockResolvedValue(withDue("October 15, 2026"));
    state.deals.d1.offers_due = "2026-10-20";
    await runAnalysis("d1");
    expect(state.deals.d1.offers_due).toBe("2026-10-20");

    vi.mocked(extractTerms).mockResolvedValue(withDue("October 15th"));
    state.deals.d1.offers_due = null;
    await runAnalysis("d1");
    expect(state.deals.d1.offers_due).toBeNull();
  });
});

describe("runAnalysis — the building's photograph, lifted beside the screen", () => {
  it("looks for the memorandum's cover right after the extraction, in the bytes the screen already downloaded, the cover alone", async () => {
    const { downloadOmPdf } = await import("@/lib/storage");
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(ensureDealPicture).toHaveBeenCalledTimes(1);
    const [, id, opts] = vi.mocked(ensureDealPicture).mock.calls[0];
    expect(id).toBe("d1");
    // The gallery's sixteen pages are left to the deal's first view.
    expect(opts).toMatchObject({ omPath: "u/d1.pdf", isSample: false, cache: null, gallery: false, waitMs: SCREEN_PICTURE_WAIT_MS });
    // One download for the whole run: the search reads the screen's own copy.
    expect(downloadOmPdf).toHaveBeenCalledTimes(1);
    expect(opts.pdf).toBe(await vi.mocked(downloadOmPdf).mock.results[0].value);
    // Asked only once the extraction had landed, and only where a search is due.
    expect(vi.mocked(extractTerms).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ensureDealPicture).mock.invocationCallOrder[0],
    );
    expect(pictureMayBeInMemorandum).toHaveBeenCalledWith({ omPath: "u/d1.pdf", isSample: false, cache: null });
  });

  it("reads beside the steps after the extraction, never in front of them", async () => {
    // The lift cannot finish until the challenger has run: a screen that
    // waited on it before its next step would never get there.
    let challenged!: () => void;
    const reached = new Promise<void>((resolve) => (challenged = resolve));
    vi.mocked(challengeAssumptions).mockImplementation(async () => {
      challenged();
      return CHALLENGES;
    });
    vi.mocked(ensureDealPicture).mockImplementation(async () => {
      await reached;
      return null;
    });
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(state.deals.d1.verdict).toMatchObject({ verdict: "caution" });
  });

  it("a lift that fails leaves the screen exactly as it was: done, every result written, the failure logged and never shown", async () => {
    vi.mocked(ensureDealPicture).mockRejectedValue(new Error("storage is down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(job().error).toBeNull();
    expect(state.deals.d1.challenges).toEqual(CHALLENGES);
    expect(state.deals.d1.comps).toEqual(COMPS);
    expect(state.deals.d1.verdict).toMatchObject({ verdict: "caution" });
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("was not lifted for deal d1"), "storage is down");
    warnSpy.mockRestore();
  });

  it("never lifts for the sample deal, a deal whose photograph needs no search, or a deal typed in by hand", async () => {
    state.deals.d1.is_sample = true;
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(ensureDealPicture).not.toHaveBeenCalled();

    state = freshState();
    vi.mocked(pictureMayBeInMemorandum).mockReturnValue(false);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(pictureMayBeInMemorandum).toHaveBeenCalled();
    expect(ensureDealPicture).not.toHaveBeenCalled();

    // A manual deal has no memorandum to read.
    state = freshState();
    vi.mocked(pictureMayBeInMemorandum).mockReturnValue(true);
    state.deals.d1.om_storage_path = null;
    state.deals.d1.extraction = EXTRACTION;
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(ensureDealPicture).not.toHaveBeenCalled();
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
    expect(job().error).toMatch(/from its text or its pages/);
    expect(state.deals.d1.extraction).toEqual({ old: true });
    expect(challengeAssumptions).not.toHaveBeenCalled();
    expect(synthesizeVerdict).not.toHaveBeenCalled();
  });

  it("a text layer that reads to no figures is re-read as pages before the screen gives up", async () => {
    const pages = { kind: "pages" as const, text: "[[page 1]]\nnoise", pages: 1, sparsePages: 0 };
    const buffer = { kind: "buffer" as const, data: Buffer.alloc(0) };
    vi.mocked(omSourceFor).mockResolvedValueOnce(pages).mockResolvedValueOnce(buffer);
    vi.mocked(extractTerms).mockResolvedValueOnce({ ...EXTRACTION, metrics: [] }).mockResolvedValueOnce(EXTRACTION);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(state.deals.d1.extraction).toEqual(EXTRACTION);
    expect(extractTerms).toHaveBeenCalledTimes(2);
    expect(vi.mocked(extractTerms).mock.calls[0][0]).toBe(pages);
    expect(vi.mocked(extractTerms).mock.calls[1][0]).toBe(buffer);
    expect(omSourceFor).toHaveBeenNthCalledWith(2, expect.anything(), "om.pdf", { textFirst: false });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("re-reading the pages"));
    logSpy.mockRestore();
    // …and every step after the extraction reads the pages too.
    expect(vi.mocked(challengeAssumptions).mock.calls[0][0]).toBe(buffer);
    expect(vi.mocked(checkMarket).mock.calls[0][0]).toBe(buffer);

    // Both reads empty: the honest stop, as before.
    state = freshState();
    vi.mocked(omSourceFor).mockResolvedValueOnce(pages).mockResolvedValueOnce(buffer);
    vi.mocked(extractTerms).mockResolvedValue({ ...EXTRACTION, metrics: [] });
    await runAnalysis("d1");
    expect(job().status).toBe("error");
    expect(job().error).toMatch(/from its text or its pages/);
    expect(state.deals.d1.extraction).toEqual({ old: true });
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
    // A step long enough for two beats even when the whole suite loads the
    // machine: at 80 ms, one beat landed under a full run (2026-10-01).
    vi.mocked(extractTerms).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(EXTRACTION), 250)),
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

  it("a text layer that reads to figures but no NOI is re-read as pages — the money was in pictures", async () => {
    const pages = { kind: "pages" as const, text: "[[page 1]]\nnarrative", pages: 1, sparsePages: 0 };
    const buffer = { kind: "buffer" as const, data: Buffer.alloc(0) };
    vi.mocked(omSourceFor).mockResolvedValueOnce(pages).mockResolvedValueOnce(buffer);
    const noMoney = { ...EXTRACTION, metrics: [EXTRACTION.metrics[0]] }; // the asking price alone
    vi.mocked(extractTerms).mockResolvedValueOnce(noMoney).mockResolvedValueOnce(EXTRACTION);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAnalysis("d1");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("read to no NOI — re-reading the pages"));
    logSpy.mockRestore();
    expect(job().status).toBe("done");
    expect(extractTerms).toHaveBeenCalledTimes(2);
    expect(vi.mocked(extractTerms).mock.calls[1][0]).toBe(buffer);
    expect(state.deals.d1.extraction).toEqual(EXTRACTION);
    expect(vi.mocked(challengeAssumptions).mock.calls[0][0]).toBe(buffer);

    // A layer that read the NOI is the deck: one read, no fallback.
    state = freshState();
    const extractsBefore = vi.mocked(extractTerms).mock.calls.length;
    const sourcesBefore = vi.mocked(omSourceFor).mock.calls.length;
    vi.mocked(omSourceFor).mockResolvedValueOnce(pages);
    vi.mocked(extractTerms).mockResolvedValue(EXTRACTION);
    await runAnalysis("d1");
    expect(job().status).toBe("done");
    expect(vi.mocked(extractTerms).mock.calls.length).toBe(extractsBefore + 1);
    expect(vi.mocked(omSourceFor).mock.calls.length).toBe(sourcesBefore + 1);
    expect(vi.mocked(challengeAssumptions).mock.calls.at(-1)?.[0]).toBe(pages);
  });

  it("an attempt resumed after the fallback to the pages reads the pages from the start — the payload remembers", async () => {
    // Attempt 1, resumed mode: the layer reads to nothing, the pages are
    // read, and the checkpoint written right then says so.
    const pages = { kind: "pages" as const, text: "[[page 1]]\nnoise", pages: 1, sparsePages: 0 };
    const buffer = { kind: "buffer" as const, data: Buffer.alloc(0) };
    vi.mocked(omSourceFor).mockResolvedValueOnce(pages).mockResolvedValueOnce(buffer);
    vi.mocked(extractTerms).mockResolvedValueOnce({ ...EXTRACTION, metrics: [] }).mockResolvedValueOnce(EXTRACTION);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAnalysis("d1", { resume: true });
    logSpy.mockRestore();
    expect(job().status).toBe("done");
    const remembered = state.writes.filter(
      (w) => w.table === "analysis_jobs" && (w.patch.payload as { omPages?: boolean } | undefined)?.omPages === true,
    );
    expect(remembered.length).toBeGreaterThan(0);
    // …and every checkpoint after it keeps the mark, the job's kind and the earlier steps.
    const last = remembered.at(-1)!.patch.payload as { kind: string; completed: string[]; omPages: boolean };
    expect(last.kind).toBe("screen");
    expect(last.completed).toEqual(expect.arrayContaining(["signal", "extract", "challenge"]));

    // Attempt 2: the worker restarted after the extraction landed. The
    // payload says the pages were read, so this attempt builds the pages
    // source first and never hands the challenger the layer.
    state = freshState();
    state.deals.d1.extraction = EXTRACTION;
    state.jobs[0].payload = {
      kind: "screen",
      completed: ["signal", "extract", "reconcile_docs", "ingest_actuals"],
      omPages: true,
    };
    vi.mocked(omSourceFor).mockClear();
    vi.mocked(omSourceFor).mockResolvedValueOnce(buffer);
    vi.mocked(extractTerms).mockClear();
    await runAnalysis("d1", { resume: true });
    expect(job().status).toBe("done");
    expect(extractTerms).not.toHaveBeenCalled();
    expect(omSourceFor).toHaveBeenCalledTimes(1);
    expect(omSourceFor).toHaveBeenCalledWith(expect.anything(), "om.pdf", { textFirst: false });
    expect(vi.mocked(challengeAssumptions).mock.calls.at(-1)?.[0]).toBe(buffer);
    expect(vi.mocked(scrutinizeComps).mock.calls.at(-1)?.[0]).toBe(buffer);
    expect(vi.mocked(checkMarket).mock.calls.at(-1)?.[0]).toBe(buffer);
  });
});
