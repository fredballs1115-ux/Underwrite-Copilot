// A price label dated the year the memorandum was screened in — "Asking
// price (2026)", "Pricing guidance (Q4 2026)", "Revised asking price (March
// 2026)" — is the ask, and it stays the ask once the calendar turns. The
// price reader once judged a label's year against the clock when its module
// loaded, so after the first restart of 2027 every stored deal with such a
// label lost its price on the pipeline, the model, the buy box and the memo.
// The year is the extraction's own now (lib/criteria `screenYearOf`, from
// the `screenedOn` stamp the screen writes), and an extraction stored before
// the stamp reads as a 2026 screen.
//
// The clock is faked to January 2, 2027 BEFORE the modules load (they are
// re-imported after `vi.resetModules()`), so a reader that consults the
// clock — at load or at call — fails here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "./anthropic/types";

const m = (label: string, value: string, basis: ExtractedMetric["basis"] = "na"): ExtractedMetric => ({
  label,
  value,
  flagged: false,
  page: "",
  basis,
});

/** A stabilized 240-unit building priced under `label`, screened on `screenedOn`. */
const deal = (label: string, screenedOn?: string): ExtractionResult => ({
  dealName: "Test Deal",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1 Test St, Washington, DC",
  ...(screenedOn ? { screenedOn } : {}),
  metrics: [m(label, "$42,000,000"), m("Going-in cap rate", "6.00%", "in_place"), m("NOI (in-place)", "$2,520,000", "in_place"), m("Units", "240")],
});

const THIS_YEARS_LABELS = ["Asking price (2026)", "Pricing guidance (Q4 2026)", "Revised asking price (March 2026)"];

async function surfaces() {
  const criteria = await import("./criteria");
  const strategy = await import("./deal-strategy");
  const { keyTermRows } = await import("./key-terms");
  const { scoreMandateFit } = await import("./mandate");
  const { pickSlots } = await import("./pipeline-slots");
  const { deriveUnderwriteInputs } = await import("./underwrite/inputs");
  const { computeScreenDiff } = await import("./screen-diff");
  /** The price each surface reads off one extraction. */
  const read = (ex: ExtractionResult) => {
    const kind = strategy.inferStrategy(ex).kind;
    const source = criteria.buyBoxCheckSource(ex, null, null, kind);
    const band = criteria.evaluateBuyBox("multifamily", source, { priceMaxM: 50 }).find((c) => c.label === "Price");
    const mandate = scoreMandateFit("multifamily", source, { dealbreakers: { maxPriceM: 50 } });
    return {
      year: criteria.screenYearOf(ex),
      /** the plausibility check's, the interest panel's and the model's price */
      asking: strategy.askingPriceOf(ex),
      /** the pipeline row's price slot */
      pipeline: pickSlots(ex, null).price,
      /** the buy box's price band */
      band: band?.status,
      /** the mandate's hard ceiling: evaluated, or still waiting on a price */
      ceilingUnresolved: mandate.unresolvedDealbreakers,
      /** the memo's and the shared screen's key terms, first row */
      keyTerm: keyTermRows(ex.metrics, kind, criteria.screenYearOf(ex), 8)[0]?.label,
      /** the workbook's purchase price, and where it came from */
      model: deriveUnderwriteInputs(ex, "Test Deal").sources.purchasePrice?.provenance,
    };
  };
  return { criteria, strategy, computeScreenDiff, read };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(Date.UTC(2027, 0, 2, 15)), toFake: ["Date"] });
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a price label dated the screen's year stays the ask after January 1", () => {
  it("is the ask on a 2026 screen read on January 2, 2027 — on every surface", async () => {
    const { read } = await surfaces();
    expect(new Date().getUTCFullYear()).toBe(2027);
    for (const label of THIS_YEARS_LABELS) {
      expect(read(deal(label, "2026-12-15")), label).toEqual({
        year: 2026,
        asking: 42_000_000,
        pipeline: "$42,000,000",
        band: "pass",
        ceilingUnresolved: 0,
        keyTerm: label,
        model: "extracted",
      });
    }
  });

  it("an extraction stored before the stamp reads as a 2026 screen, not as the clock's year", async () => {
    const { read } = await surfaces();
    for (const label of THIS_YEARS_LABELS) {
      const r = read(deal(label));
      expect(r.year, label).toBe(2026);
      expect(r.asking, label).toBe(42_000_000);
      expect(r.pipeline, label).toBe("$42,000,000");
      expect(r.band, label).toBe("pass");
      expect(r.keyTerm, label).toBe(label);
    }
  });

  it("'Purchase price (2025)' is what the building last traded for, not the ask — stamped or not", async () => {
    const { read } = await surfaces();
    for (const ex of [deal("Purchase price (2025)", "2026-12-15"), deal("Purchase price (2025)")]) {
      const r = read(ex);
      expect(r.asking).toBeNull();
      expect(r.pipeline).toBeNull();
      expect(r.band).toBe("unknown");
      expect(r.ceilingUnresolved).toBe(1);
      expect(r.keyTerm).not.toBe("Purchase price (2025)");
      expect(r.model).not.toBe("extracted");
    }
  });

  it("a screen of 2027 reads 2026's label as a prior trade and its own year's as the ask", async () => {
    const { read } = await surfaces();
    expect(read(deal("Purchase price (2026)", "2027-01-02")).asking).toBeNull();
    expect(read(deal("Asking price (2027)", "2027-01-02")).asking).toBe(42_000_000);
  });

  it("the retrade diff reads each screen's rows against that screen's own year", async () => {
    const { computeScreenDiff } = await surfaces();
    const before = { metrics: [m("Asking price (2026)", "$42,000,000")], screenedOn: "2026-12-15" };
    const after = { metrics: [m("Asking price (2027)", "$40,000,000")], screenedOn: "2027-01-20" };
    const diff = computeScreenDiff({ at: "2026-12-15T12:00:00Z", extraction: before, verdict: null }, after, null);
    expect(diff?.rows.find((r) => r.label === "Asking price")).toMatchObject({
      before: "$42,000,000",
      after: "$40,000,000",
      direction: "better",
    });
  });
});

describe("a re-screen of the same memorandum keeps the day it was first read", () => {
  it("keeps the stamp for the same bytes, and stamps a reissued deck or an unfingerprinted one anew", async () => {
    const { screenStampFor } = await import("./criteria");
    const now = new Date(Date.UTC(2027, 0, 2));
    const prior = { screenedOn: "2026-11-20", omFingerprint: "abc123def4567890" };
    // The same deck screened again in 2027: still a 2026 reading.
    expect(screenStampFor(prior, "abc123def4567890", now)).toBe("2026-11-20");
    // A reissued deck is a new reading.
    expect(screenStampFor(prior, "0000000000000000", now)).toBe("2027-01-02");
    // Nothing on file says it was this deck: an extraction with no
    // fingerprint, no extraction at all, or a deal with no memorandum.
    expect(screenStampFor({ screenedOn: "2026-11-20" }, "abc123def4567890", now)).toBe("2027-01-02");
    expect(screenStampFor(null, "abc123def4567890", now)).toBe("2027-01-02");
    expect(screenStampFor(prior, undefined, now)).toBe("2027-01-02");
    // A malformed stamp on file is no stamp.
    expect(screenStampFor({ screenedOn: "soon", omFingerprint: "abc123def4567890" }, "abc123def4567890", now)).toBe("2027-01-02");
  });
});
