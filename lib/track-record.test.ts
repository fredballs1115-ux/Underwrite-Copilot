// The track record (lib/track-record): each stored challenge scored against
// evidence that arrived AFTER the screen, never against a document the
// screen read; the account's counts under the site's floor.
import { describe, expect, it } from "vitest";
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { StageChange } from "@/lib/stages";
import {
  RECORD_FLOOR,
  RECORD_NONE_LINE,
  accountRecord,
  arrivalOf,
  recordCountsLine,
  recordLine,
  recordState,
  scoreDeal,
  type DealRecord,
} from "./track-record";

const T = "2026-10-01T12:00:00Z";
const BEFORE = "2026-09-20T09:00:00Z";
const AFTER = "2026-10-05T09:00:00Z";

const vacancy: Challenge = {
  assumption: "Stabilized vacancy of 6%",
  severity: "high",
  challenge: "The rent roll runs 9% vacant.",
  question: "Why 6%?",
  page: "p. 12",
  key: "vacancy",
  omFigure: 6,
  altFigure: 9,
  altBasis: "a rule of thumb: a stabilized apartment building runs about 95% occupied",
};
const basis: Challenge = {
  assumption: "Asking price of $274k a unit",
  severity: "high",
  challenge: "The comps trade at $240k.",
  question: "What supports $274k?",
  page: "p. 3",
  key: "basis",
  omFigure: 274_000,
  altFigure: 240_000,
  altBasis: "the OM's own sale comps",
};
const debt: Challenge = { assumption: "A 5.0% all-in rate", severity: "medium", challenge: "Today's index plus spread is 6.8%.", question: "", key: "debt", omFigure: 5, altFigure: 6.8, altBasis: "the 5-yr Treasury plus the class spread" };
const insurance: Challenge = { assumption: "Insurance at the seller's $300k premium", severity: "medium", challenge: "", question: "", key: "insurance", omFigure: 300_000, altFigure: 400_000, altBasis: "the index's year" };
const older: Challenge = { assumption: "Exit cap of 5.25% inside the going-in cap", severity: "high", challenge: "", question: "" };

const t12: T12Summary = {
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: [
    { key: "taxes", label: "Real estate taxes", amount: 1_140_000, page: "p. 1" },
    { key: "insurance", label: "Insurance", amount: 385_000, page: "p. 1" },
  ],
  totalOpex: 1_525_000,
  noi: 3_706_500,
  noiDerived: false,
};
const roll: RentRollSummary = {
  unitCount: 240,
  occupiedUnits: 218,
  totalSf: 220_720,
  occupiedSf: 200_000,
  sfWeightedOccupancy: 0.906,
  waltYears: 0.6,
  weightedAvgRentPsf: 30,
  expiryBuckets: null,
  expiryCoveredSf: 0,
  truncated: false,
};

const dead = (reason: "price" | "financing", at = AFTER): { stage: string; history: StageChange[] } => ({
  stage: "dead",
  history: [
    { stage: "screening", at: BEFORE },
    { stage: "dead", at, outcome: { reason, trade: null } },
  ],
});

describe("scoreDeal — only what arrived after the screen scores a challenge", () => {
  it("a T-12 added after the screen scores vacancy on the screen's side, by its economic vacancy", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } });
    expect(r.screenedAt).toBe(T);
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    expect(r.evidence[0].label).toBe("T-12 to Sep 30, 2026 (added Oct 5, 2026)");
    const row = r.rows[0];
    expect(row.key).toBe("vacancy");
    expect(row.landing).toBe("screen_side");
    // 650,500 over 7,150,000 is 9.1%: past the screen's 9.0%.
    expect(row.later?.value).toBe(9.1);
    expect(row.text).toBe(
      "Stabilized vacancy: the OM's 6.0%, the screen's 9.0% (a rule of thumb: a stabilized apartment building runs about 95% occupied); the T-12 to Sep 30, 2026 ran 9.1% economic vacancy (its vacancy loss over gross potential rent) — on the screen's side.",
    );
    expect(r.notScored).toEqual([]);
  });

  it("a rent roll outranks the T-12 for vacancy, and a figure inside the two reads between", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [vacancy],
      rentRoll: { arrivedAt: AFTER, dated: "2026-09-30", summary: { ...roll, sfWeightedOccupancy: 0.925 } },
      t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 },
    });
    expect(r.rows[0].later?.source).toBe("rent_roll");
    expect(r.rows[0].later?.value).toBe(7.5);
    expect(r.rows[0].landing).toBe("between");
  });

  it("a T-12 the screen read is unscored, said as before the screen, and never evidence", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy, insurance], t12: { arrivedAt: BEFORE, dated: "2026-08-31", summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.notScored).toEqual([
      "T-12 to Aug 31, 2026 was on the deal before the screen (added Sep 20, 2026): the screen read it, so it is not scored against it.",
    ]);
    for (const row of r.rows) {
      expect(row.landing).toBe("unscored");
      expect(row.why).toBe("nothing that arrived after the screen speaks to it.");
    }
  });

  it("a T-12 with no arrival on record is not scored either", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [insurance], t12: { arrivedAt: null, dated: null, summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.notScored[0]).toContain("no arrival time on record");
    expect(r.rows[0].landing).toBe("unscored");
  });

  it("the T-12's insurance and tax lines and its NOI each score their own key", () => {
    const taxes: Challenge = { ...insurance, assumption: "Taxes not reset", key: "taxes", omFigure: 900_000, altFigure: 1_300_000 };
    const noi: Challenge = { ...insurance, assumption: "Pro forma NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const r = scoreDeal({ screenedAt: T, challenges: [insurance, taxes, noi], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } });
    // Insurance $385k sits between $300k and $400k; taxes $1.14M between
    // $900k and $1.3M; NOI $3.71M is past the screen's $3.6M? No: $3.71M
    // sits between $3.6M and $4.0M.
    expect(r.rows.map((x) => [x.key, x.landing, x.later?.value])).toEqual([
      ["insurance", "between", 385_000],
      ["taxes", "between", 1_140_000],
      ["noi", "between", 3_706_500],
    ]);
    expect(r.rows[2].text).toContain("the T-12 to Sep 30, 2026 earned $3.71M");
  });

  it("a figure at or past the OM's end lands on the OM's side", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [insurance],
      t12: { arrivedAt: AFTER, dated: null, summary: { ...t12, opex: [{ key: "insurance", label: "Insurance", amount: 290_000, page: "" }] } },
    });
    expect(r.rows[0].landing).toBe("om_side");
    expect(r.rows[0].text).toContain("the T-12 paid $290k of insurance — on the OM's side.");
  });

  it("a Dead-on-price decision after the screen scores the basis challenge as a decision on the screen's side; financing scores the debt", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis, debt, vacancy], ...dead("price") });
    expect(r.evidence[0].label).toBe("Moved to Dead on price (Oct 5, 2026)");
    expect(r.rows.map((x) => [x.key, x.landing])).toEqual([
      ["basis", "screen_side"],
      ["debt", "unscored"],
      ["vacancy", "unscored"],
    ]);
    expect(r.rows[0].later).toEqual({ source: "outcome", value: null, text: "walked away on price" });
    expect(r.rows[0].text).toContain("a decision on the screen's side, not a figure");
    const f = scoreDeal({ screenedAt: T, challenges: [basis, debt], ...dead("financing") });
    expect(f.rows.map((x) => [x.key, x.landing])).toEqual([
      ["basis", "unscored"],
      ["debt", "screen_side"],
    ]);
  });

  it("a decision recorded before the screen's verdict is named and not scored", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis], ...dead("price", BEFORE) });
    expect(r.evidence).toEqual([]);
    expect(r.notScored[0]).toBe("The deal died on price before the screen's verdict (Sep 20, 2026), so the decision is not scored.");
    expect(r.rows[0].landing).toBe("unscored");
  });

  it("a reported trade scores the basis on the OM figure's own basis — the trade over the ask applied to the per-unit figure", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [basis],
      askingPrice: 65_760_000,
      stage: "closed",
      history: [
        { stage: "screening", at: BEFORE },
        { stage: "closed", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: "2026-10-03", reportedBy: "Jane", reportedAt: AFTER } } },
      ],
    });
    expect(r.evidence[0].label).toBe("The building traded at $60.00M on Oct 3, 2026, reported by Jane (recorded Oct 5, 2026)");
    const row = r.rows[0];
    expect(row.later?.source).toBe("trade");
    // $60.0M over the $65.76M ask is 0.9124; on $274k a unit, $250k a unit.
    expect(Math.round(row.later!.value!)).toBe(250_000);
    expect(row.landing).toBe("between");
    expect(row.text).toContain("$250k on the OM figure's basis");
  });

  it("a trade beats a decision for the basis, and a whole-price OM figure is compared whole", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [{ ...basis, omFigure: 65_760_000, altFigure: 58_000_000 }],
      askingPrice: 65_760_000,
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: "price", trade: { price: 57_000_000, buyer: "Another buyer", date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(r.evidence.map((e) => e.source)).toEqual(["outcome", "trade"]);
    expect(r.rows[0].later?.source).toBe("trade");
    expect(r.rows[0].later?.value).toBe(57_000_000);
    expect(r.rows[0].landing).toBe("screen_side");
  });

  it("a challenge stored before the challenger wrote figures is unscored with why, keyed off its words", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [older], ...dead("price") });
    expect(r.rows[0].key).toBe("exit_cap");
    expect(r.rows[0].omFigure).toBeNull();
    expect(r.rows[0].landing).toBe("unscored");
    // A basis challenge with no OM figure, against a trade: the trade is named, the row stays unscored.
    const noFig = scoreDeal({
      screenedAt: T,
      challenges: [{ ...basis, omFigure: null, altFigure: null }],
      askingPrice: 65_760_000,
      stage: "closed",
      history: [{ stage: "closed", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(noFig.rows[0].landing).toBe("unscored");
    expect(noFig.rows[0].why).toBe("the challenger gave no OM figure to score it on.");
    expect(noFig.rows[0].later?.text).toBe("the building traded at $60.00M");
  });

  it("a screen's figure equal to the OM's has no side to land on", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [{ ...vacancy, altFigure: 6 }], t12: { arrivedAt: AFTER, dated: null, summary: t12 } });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].why).toContain("the screen's figure is the OM's own");
  });

  it("a verdict with no stamp scores nothing: there is no after without a when", () => {
    const r = scoreDeal({ screenedAt: undefined, challenges: [vacancy, basis], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 }, ...dead("price") });
    expect(r.screenedAt).toBeNull();
    expect(r.evidence).toEqual([]);
    expect(r.notScored).toEqual([
      "T-12 to Sep 30, 2026 is on the deal, but the verdict carries no screen time to set it after.",
      "The deal died on price, but the verdict carries no screen time to set the decision after.",
    ]);
    for (const row of r.rows) expect(row.why).toBe("the verdict carries no screen time, so nothing can be said to have come after it.");
    expect(scoreDeal({ screenedAt: "not a date", challenges: [vacancy] }).screenedAt).toBeNull();
  });

  it("arrivalOf takes the document's upload over the extraction row's own write", () => {
    const docs = [{ id: "doc-1", created_at: "2026-10-02T00:00:00Z" }];
    expect(arrivalOf({ created_at: "2026-10-09T00:00:00Z", source_document_id: "doc-1" }, docs)).toBe("2026-10-02T00:00:00Z");
    expect(arrivalOf({ created_at: "2026-10-09T00:00:00Z", source_document_id: "doc-9" }, docs)).toBe("2026-10-09T00:00:00Z");
    expect(arrivalOf({ created_at: null, source_document_id: null }, docs)).toBeNull();
    expect(arrivalOf(null, docs)).toBeNull();
  });
});

describe("accountRecord — counts, by key, and the floor", () => {
  const scoredDeal = (...extra: Challenge[]): DealRecord =>
    scoreDeal({ screenedAt: T, challenges: [vacancy, ...extra], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } });

  it("says no record and claims none with nothing scored, and names what it will be scored against", () => {
    const r = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy] }), scoreDeal({ screenedAt: null, challenges: [vacancy] })]);
    expect(r).toMatchObject({ dealsTested: 1, dealsWithLater: 0, scored: 0, byKey: [], shares: null });
    expect(recordState(r)).toBe("none");
    expect(recordLine(r)).toBe(RECORD_NONE_LINE);
    for (const thing of ["the T-12 or rent roll you add after the screen", "what you decided (dead, and why)", "what the building traded for"]) expect(RECORD_NONE_LINE).toContain(thing);
    expect(recordCountsLine(r)).toBe("1 deal tested · 0 with later evidence · 0 rows scored");
  });

  it("under the floor the rows are a start, not a record, and no share is printed", () => {
    expect(RECORD_FLOOR).toBe(3);
    const r = accountRecord([scoredDeal(), scoredDeal()]);
    expect(r).toMatchObject({ dealsTested: 2, dealsWithLater: 2, scored: 2, screenSide: 2, omSide: 0, between: 0, shares: null });
    expect(recordState(r)).toBe("start");
    expect(recordLine(r)).toBe("2 scored rows are a start, not a record.");
    expect(recordLine(accountRecord([scoredDeal()]))).toBe("1 scored row is a start, not a record.");
    expect(recordLine(accountRecord([scoredDeal()]))).not.toMatch(/%/);
  });

  it("at the floor the shares are said, and the keys ranked by rows scored", () => {
    const r = accountRecord([scoredDeal(insurance), scoredDeal(), scoreDeal({ screenedAt: T, challenges: [basis], ...dead("price") })]);
    expect(r.scored).toBe(4);
    expect(r.byKey.map((k) => [k.key, k.screenSide, k.omSide, k.between])).toEqual([
      ["vacancy", 2, 0, 0],
      ["basis", 1, 0, 0],
      ["insurance", 0, 0, 1],
    ]);
    expect(r.shares).toEqual({ screenSidePct: 75, omSidePct: 0, betweenPct: 25 });
    expect(recordState(r)).toBe("record");
    expect(recordLine(r)).toBe("Of 4 scored rows, 3 landed on the screen's side (75%), 0 on the OM's (0%) and 1 between (25%).");
    expect(recordCountsLine(r)).toBe("3 deals tested · 3 with later evidence · 4 rows scored");
  });
});
