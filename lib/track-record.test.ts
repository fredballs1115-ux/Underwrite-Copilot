// The track record (lib/track-record): each stored challenge scored against
// evidence that arrived AFTER the screen, never against a document the
// screen read; the account's counts under the site's floor.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { StageChange } from "@/lib/stages";
import {
  RECORD_FLOOR,
  RECORD_NONE_LINE,
  TAX_INSURANCE_NOT_SCORED,
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
const AFTER = "2026-11-05T09:00:00Z";

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
const noi: Challenge = { assumption: "Pro forma NOI of $4.0M", severity: "medium", challenge: "", question: "", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000, altBasis: "the trailing year" };
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
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    expect(r.screenedAt).toBe(T);
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    expect(r.evidence[0].label).toBe("T-12 to Oct 31, 2026 (added Nov 5, 2026)");
    const row = r.rows[0];
    expect(row.key).toBe("vacancy");
    expect(row.landing).toBe("screen_side");
    // 650,500 over 7,150,000 is 9.1%: past the screen's 9.0%.
    expect(row.later?.value).toBe(9.1);
    expect(row.text).toBe(
      "Stabilized vacancy: the OM's 6.0%, the screen's 9.0% (a rule of thumb: a stabilized apartment building runs about 95% occupied); the T-12 to Oct 31, 2026 ran 9.1% economic vacancy (its vacancy loss over gross potential rent: the rent line plus the loss, since the stated EGI is the rent line plus other income) — on the screen's side.",
    );
    expect(r.notScored).toEqual([]);
  });

  it("a rent roll outranks the T-12 for vacancy, and a figure inside the two reads between", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [vacancy],
      rentRoll: { arrivedAt: AFTER, dated: "2026-10-31", summary: { ...roll, sfWeightedOccupancy: 0.925 } },
      t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 },
    });
    expect(r.rows[0].later?.source).toBe("rent_roll");
    expect(r.rows[0].later?.value).toBe(7.5);
    expect(r.rows[0].landing).toBe("between");
  });

  it("reads the roll's vacancy as the stress test does: by count on an apartment building, by area on an office", () => {
    const rentRoll = { arrivedAt: AFTER, dated: "2026-10-31", summary: roll };
    // 218 of 240 units is 9.2% by count; 90.6% of the area is 9.4%.
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll, assetClass: "multifamily" }).rows[0].later).toMatchObject({ value: 9.2, text: "the rent roll as of Oct 31, 2026 ran 9.2% vacant by units" });
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll, assetClass: "office" }).rows[0].later).toMatchObject({ value: 9.4, text: "the rent roll as of Oct 31, 2026 ran 9.4% vacant by area" });
  });

  it("a later document never scores a stabilized assumption the stress test holds to the market: its vacancy is today's", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, vacancyHeldToMarket: true });
    // Still on record as what came after, and the figure still shown.
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    const row = r.rows[0];
    expect(row.landing).toBe("unscored");
    expect(row.later?.value).toBe(9.1);
    expect(row.figures).toBeNull();
    expect(row.why).toBe(
      "the OM's vacancy is a stabilized assumption on a deal read as stabilized, which the stress test holds to the market's published figures where one is fresh; a document's vacancy is the building's today, the gap a lease-up has to close, not a test of it.",
    );
    expect(row.text).toMatch(/^Stabilized vacancy: the T-12 to Oct 31, 2026 ran 9\.1% economic vacancy .*, but the OM's vacancy is a stabilized assumption .* not a test of it, so it is not scored\.$/);
    // The shares count it nowhere.
    expect(accountRecord([r]).scored).toBe(0);
  });

  it("a T-12 the screen read is unscored, said as before the screen, and never evidence", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy, insurance], t12: { arrivedAt: BEFORE, dated: "2026-08-31", summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.refusedLater).toBe(false);
    expect(r.notScored).toEqual([
      "T-12 to Aug 31, 2026 was on the deal before the screen (added Sep 20, 2026): the screen read it, so it is not scored against it.",
    ]);
    for (const row of r.rows) expect(row.landing).toBe("unscored");
    expect(r.rows.map((x) => x.why)).toEqual([
      "nothing that arrived after the screen speaks to it.",
      "a seller's T-12 cannot show a new owner's premium, and no document on the deal is the buyer's own quote, so no document scores it.",
    ]);
  });

  it("a T-12 with no arrival on record is not scored either", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: null, dated: null, summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.notScored[0]).toContain("no arrival time on record");
    expect(r.rows[0].landing).toBe("unscored");
  });

  it("a T-12 uploaded after the screen whose period ended on or before the verdict is history, not news: refused and said so", () => {
    for (const periodEnd of ["2026-09-30", "2026-10-01"]) {
      const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: periodEnd, summary: t12 } });
      expect(r.evidence).toEqual([]);
      expect(r.refusedLater).toBe(true);
      expect(r.rows[0].landing).toBe("unscored");
      expect(accountRecord([r])).toMatchObject({ scored: 0, dealsWithLater: 0 });
    }
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } }).notScored).toEqual([
      "T-12 to Sep 30, 2026 was added Nov 5, 2026, after the screen, but its period ended on or before the verdict (Oct 1, 2026): it is history the screen could have been handed, only uploaded later, so it is not scored.",
    ]);
    // The day after the verdict's is after it.
    const next = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-02", summary: t12 } });
    expect(next.refusedLater).toBe(false);
    expect(next.rows[0].landing).toBe("screen_side");
    // A rent roll by its as-of date, the same rule.
    const early = scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll: { arrivedAt: AFTER, dated: "2026-09-15", summary: roll } });
    expect(early.notScored).toEqual([
      "Rent roll as of Sep 15, 2026 was added Nov 5, 2026, after the screen, but it is dated on or before the verdict (Oct 1, 2026): it is history the screen could have been handed, only uploaded later, so it is not scored.",
    ]);
  });

  it("a document uploaded after the screen with no date of its own on record is not scored, and says so", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll: { arrivedAt: AFTER, dated: null, summary: roll }, t12: { arrivedAt: AFTER, dated: null, summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.refusedLater).toBe(true);
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.notScored).toEqual([
      "T-12 (period not stated) was added Nov 5, 2026, after the screen, but with no period end on record nothing shows its figures postdate the verdict, so it is not scored.",
      "Rent roll (as-of not stated) was added Nov 5, 2026, after the screen, but with no as-of date on record nothing shows its figures postdate the verdict, so it is not scored.",
    ]);
  });

  it("a taxes or insurance challenge is never scored by a document: a seller's T-12 cannot show a new owner's bill or premium", () => {
    const taxes: Challenge = { ...insurance, assumption: "Taxes not reset", key: "taxes", omFigure: 900_000, altFigure: 1_300_000 };
    const noi: Challenge = { ...insurance, assumption: "Pro forma NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const r = scoreDeal({ screenedAt: T, challenges: [insurance, taxes, noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    // The T-12 is evidence (it scores the NOI, $3.71M between $3.6M and
    // $4.0M); its tax and insurance lines score nothing, and those rows
    // carry no later figure.
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    expect(r.rows.map((x) => [x.key, x.landing, x.later?.value ?? null])).toEqual([
      ["insurance", "unscored", null],
      ["taxes", "unscored", null],
      ["noi", "between", 3_706_500],
    ]);
    expect(r.rows[0].text).toBe("Insurance: a seller's T-12 cannot show a new owner's premium, and no document on the deal is the buyer's own quote, so no document scores it.");
    expect(r.rows[1].text).toBe("Real estate taxes: a seller's T-12 cannot show a new owner's tax bill, and no document on the deal is the buyer's own, so no document scores it.");
    expect(r.rows[2].text).toContain("the T-12 to Oct 31, 2026 earned $3.71M");
    expect(accountRecord([r]).byKey.map((k) => k.key)).toEqual(["noi"]);
    expect(TAX_INSURANCE_NOT_SCORED).toBe("A seller's T-12 cannot show a new owner's tax bill or premium, so taxes and insurance challenges are not scored by documents.");
    // Nothing reads a T-12's tax or insurance line to score a row.
    const src = readFileSync(join(process.cwd(), "lib/track-record.ts"), "utf8");
    expect(src).not.toMatch(/case "(?:taxes|insurance)":/);
    expect(src).not.toMatch(/T12_(?:TAX|INSURANCE)_NOT/);
  });

  it("on a plan deal a later T-12 scores no NOI challenge and a later document no stated stabilized vacancy: the building before the plan is done", () => {
    const noi: Challenge = { ...insurance, assumption: "Stabilized NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const later = { t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, rentRoll: { arrivedAt: AFTER, dated: "2026-10-31", summary: roll } };
    const r = scoreDeal({ screenedAt: T, challenges: [noi, vacancy], ...later, plan: true, vacancyIsPlanTarget: true });
    expect(r.rows.map((x) => x.landing)).toEqual(["unscored", "unscored"]);
    expect(r.rows[0].why).toBe("on a plan deal the OM's NOI is the finished project's, and a T-12 is the building's year before the plan is done, not a test of it.");
    expect(r.rows[0].text).toBe(
      "NOI: the T-12 to Oct 31, 2026 earned $3.71M, but on a plan deal the OM's NOI is the finished project's, and a T-12 is the building's year before the plan is done, not a test of it, so it is not scored.",
    );
    expect(r.rows[1].why).toBe("the OM's vacancy is the stabilized figure a plan deal is to reach; a document's vacancy is the building's today, before the plan is done, not a test of it.");
    expect(accountRecord([r]).scored).toBe(0);
    // A plan deal whose OM states today's occupancy, not an allowance: the
    // documents' vacancy is today's too, and scores it.
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], ...later, plan: true, vacancyIsPlanTarget: false }).rows[0].landing).not.toBe("unscored");
    // Off a plan deal the NOI is scored as before.
    expect(scoreDeal({ screenedAt: T, challenges: [noi], ...later }).rows[0].landing).toBe("between");
  });

  it("a figure at or past the OM's end lands on the OM's side", () => {
    const noi: Challenge = { ...insurance, assumption: "Pro forma NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const r = scoreDeal({ screenedAt: T, challenges: [noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: { ...t12, noi: 4_100_000 } } });
    expect(r.rows[0].landing).toBe("om_side");
    expect(r.rows[0].text).toContain("the T-12 to Oct 31, 2026 earned $4.10M — on the OM's side.");
  });

  it("a Dead-on-price decision after the screen scores the basis challenge as a decision on the screen's side; financing scores the debt", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis, debt, vacancy], ...dead("price") });
    expect(r.evidence[0].label).toBe("Moved to Dead on price (Nov 5, 2026)");
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
    expect(r.evidence[0].label).toBe("The building traded at $60.00M on Oct 3, 2026, reported by Jane (recorded Nov 5, 2026)");
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
    const r = scoreDeal({ screenedAt: T, challenges: [{ ...vacancy, altFigure: 6 }], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].why).toContain("the screen's figure is the OM's own");
  });

  it("a verdict with no stamp scores nothing: there is no after without a when", () => {
    const r = scoreDeal({ screenedAt: undefined, challenges: [vacancy, basis], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, ...dead("price") });
    expect(r.screenedAt).toBeNull();
    expect(r.evidence).toEqual([]);
    expect(r.notScored).toEqual([
      "T-12 to Oct 31, 2026 is on the deal, but the verdict carries no screen time to set it after.",
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

describe("scoreDeal — the previous screen's challenges, scored against what arrived between the two screens", () => {
  // The prior screen on Sep 10; the T-12 added Sep 25; the re-screen on Oct 1
  // read that T-12 and replaced the challenges it would be scored against.
  const PRIOR_T = "2026-09-10T12:00:00Z";
  const BETWEEN = "2026-09-25T09:00:00Z";
  const priorVacancy: Challenge = { ...vacancy, assumption: "Stabilized vacancy of 5%", omFigure: 5, altFigure: 8 };
  const priorScreen = { verdict: { verdict: "caution", generatedAt: PRIOR_T }, challenges: { challenges: [priorVacancy, basis] } };

  it("a T-12 arriving between the prior and the current verdict scores the prior screen's challenge, not the current one's", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [vacancy, insurance],
      priorScreen,
      t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 },
    });
    expect(r.prior).toEqual({ screenedAt: PRIOR_T, screenedOn: "Sep 10, 2026" });
    // The evidence is the earlier screen's, said so.
    expect(r.evidence.map((e) => e.label)).toEqual(["T-12 to Sep 20, 2026 (added Sep 25, 2026, after the screen of Sep 10, 2026 and before this one)"]);
    // One row a key: the prior's vacancy row in the current's unscored one's
    // place, on the prior's own figures (5% and 8%, not 6% and 9%).
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([
      ["vacancy", "screen_side", "Sep 10, 2026"],
      ["insurance", "unscored", null],
    ]);
    expect(r.rows[0].figures).toEqual({ om: "5.0%", alt: "8.0%", later: "9.1%" });
    expect(r.rows[0].text).toBe(
      "Stabilized vacancy (the screen of Sep 10, 2026): the OM's 5.0%, the screen's 8.0% (a rule of thumb: a stabilized apartment building runs about 95% occupied); the T-12 to Sep 20, 2026 ran 9.1% economic vacancy (its vacancy loss over gross potential rent: the rent line plus the loss, since the stated EGI is the rent line plus other income) — on the screen's side.",
    );
    // The current screen's refusal says where the T-12 is scored instead.
    expect(r.notScored).toEqual([
      "T-12 to Sep 20, 2026 was on the deal before this screen (added Sep 25, 2026): this screen read it, so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
    // The prior's basis challenge has nothing after it either, and an
    // unscored prior row is never added.
    expect(r.rows.some((x) => x.key === "basis")).toBe(false);
  });

  it("a T-12 uploaded after both screens but dated between them scores the prior screen's challenge, and says it is dated between", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, t12: { arrivedAt: AFTER, dated: "2026-09-20", summary: t12 } });
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["vacancy", "screen_side", "Sep 10, 2026"]]);
    expect(r.evidence.map((e) => e.label)).toEqual(["T-12 to Sep 20, 2026 (added Nov 5, 2026; dated after the screen of Sep 10, 2026 and before this one)"]);
    expect(r.notScored).toEqual([
      "T-12 to Sep 20, 2026 was added Nov 5, 2026, but its period ended on or before this screen's verdict (Oct 1, 2026), so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
  });

  it("a figure that arrived after BOTH screens scores the current challenge once, never the prior's of the same key", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    expect(r.evidence).toHaveLength(1);
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["vacancy", "screen_side", null]]);
    expect(r.rows[0].figures?.om).toBe("6.0%");
    expect(r.notScored).toEqual([]);
    // …while a key the current screen no longer challenges is the prior's.
    const basisOnly = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, askingPrice: 65_760_000, ...dead("price") });
    expect(basisOnly.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([
      ["vacancy", "unscored", null],
      ["basis", "screen_side", "Sep 10, 2026"],
    ]);
    expect(basisOnly.rows[1].text).toContain("Basis (the screen of Sep 10, 2026): the screen challenged it");
  });

  it("a decision between the two screens scores the prior's basis challenge, and the current screen's refusal says so", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis], priorScreen, ...dead("price", BETWEEN) });
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["basis", "screen_side", "Sep 10, 2026"]]);
    expect(r.evidence[0].label).toBe("Moved to Dead on price (Sep 25, 2026, after the screen of Sep 10, 2026 and before this one)");
    expect(r.notScored).toEqual(["The deal died on price before this screen's verdict (Sep 25, 2026), so the decision is scored against the screen of Sep 10, 2026 instead."]);
  });

  it("an older snapshot without challenges, one without a stamp, or one stamped after the current screen reads exactly as before", () => {
    const plain = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 } });
    for (const prior of [
      { verdict: { generatedAt: PRIOR_T } },
      { verdict: { generatedAt: PRIOR_T }, challenges: { challenges: [] } },
      { verdict: null, challenges: { challenges: [priorVacancy] } },
      { verdict: { generatedAt: "2026-10-02T00:00:00Z" }, challenges: { challenges: [priorVacancy] } },
      null,
    ]) {
      const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen: prior, t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 } });
      expect(r.prior).toBeNull();
      expect(r.rows).toEqual(plain.rows);
      expect(r.evidence).toEqual([]);
      expect(r.notScored).toEqual(plain.notScored);
    }
  });

  it("a manual deal's facts edit snapshots the challenges it replaces, as the pipeline's own re-screen does", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    const at = src.indexOf("export async function updateManualFacts");
    const body = src.slice(at, src.indexOf("\nexport async function", at + 10));
    expect(body).toMatch(/\.select\("[^"]*\bchallenges\b[^"]*"\)/);
    expect(body).toMatch(/prior_screen: \{[^}]*challenges: deal\.challenges \?\? null/);
  });

  it("the account's record counts a prior screen's scored row as the deal's", () => {
    const r = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 } })]);
    expect(r).toMatchObject({ dealsTested: 1, dealsWithLater: 1, scored: 1, screenSide: 1 });
  });
});

describe("accountRecord — counts, by key, and the floor", () => {
  const scoredDeal = (...extra: Challenge[]): DealRecord =>
    scoreDeal({ screenedAt: T, challenges: [vacancy, ...extra], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });

  it("says no record and claims none with nothing scored, and names what it will be scored against", () => {
    const r = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy] }), scoreDeal({ screenedAt: null, challenges: [vacancy] })]);
    expect(r).toMatchObject({ dealsTested: 1, dealsWithLater: 0, scored: 0, byKey: [], shares: null });
    expect(recordState(r)).toBe("none");
    expect(recordLine(r)).toBe(RECORD_NONE_LINE);
    for (const thing of ["a T-12 or rent roll dated after the screen", "what you decided (dead, and why)", "what the building traded for"]) expect(RECORD_NONE_LINE).toContain(thing);
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
    const r = accountRecord([scoredDeal(noi), scoredDeal(), scoredDeal()]);
    expect(r.scored).toBe(4);
    expect(r.byKey.map((k) => [k.key, k.screenSide, k.omSide, k.between])).toEqual([
      ["vacancy", 3, 0, 0],
      ["noi", 0, 0, 1],
    ]);
    expect(r.shares).toEqual({ screenSidePct: 75, omSidePct: 0, betweenPct: 25 });
    expect(recordState(r)).toBe("record");
    expect(recordLine(r)).toBe("Of 4 scored rows, 3 landed on the screen's side (75%), 0 on the OM's (0%) and 1 between (25%).");
    expect(recordCountsLine(r)).toBe("3 deals tested · 3 with later evidence · 4 rows scored");
  });

  it("a decision is counted apart: never a scored row, never in a share or a key's bar", () => {
    const decided = scoreDeal({ screenedAt: T, challenges: [basis], ...dead("price") });
    expect(decided.rows[0]).toMatchObject({ landing: "screen_side", decision: true });
    const r = accountRecord([scoredDeal(noi), scoredDeal(), decided]);
    expect(r).toMatchObject({ scored: 3, decisions: 1, screenSide: 2, between: 1 });
    expect(r.byKey.map((k) => k.key)).toEqual(["vacancy", "noi"]);
    expect(r.shares).toEqual({ screenSidePct: 67, omSidePct: 0, betweenPct: 33 });
    expect(recordLine(r)).toBe(
      "Of 3 scored rows, 2 landed on the screen's side (67%), 0 on the OM's (0%) and 1 between (33%). 1 more row was a decision (Dead, and why), counted apart and in no share.",
    );
    expect(recordCountsLine(r)).toBe("3 deals tested · 3 with later evidence · 4 rows answered, 1 of them a decision · 3 scored");
    // A decision alone is no record: nothing is scored on a figure.
    const alone = accountRecord([decided]);
    expect(recordState(alone)).toBe("none");
    expect(recordLine(alone)).toBe(`${RECORD_NONE_LINE} 1 more row was a decision (Dead, and why), counted apart and in no share.`);
  });

  it("a trade with no asking price to put it on the OM figure's basis is named, never scored", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [basis],
      askingPrice: null,
      stage: "closed",
      history: [{ stage: "closed", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].text).toBe("Basis: the building traded at $60.00M, but it carries no figure on the OM figure's basis, so it is not scored.");
  });
});
