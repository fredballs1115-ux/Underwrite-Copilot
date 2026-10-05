import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedInterest, ExtractionResult } from "@/lib/anthropic/types";
import {
  INTEREST_LABEL,
  dealTypeLabel,
  dealTypeLabelFor,
  groundRentOf,
  incomeBeforeGroundRentOf,
  interestContextLine,
  interestNote,
  interestOf,
  interestShortLine,
  interestTag,
  isMasterLeasehold,
  isWholeShare,
  noteCaption,
  noteCollateralSentence,
  parseSharePct,
  readInterest,
} from "./interest";
import { gluedWords } from "./render-lint";
import { askingPriceOf, assessPlausibility, noiFigures } from "./deal-strategy";
import { dealContextFor } from "./deal-context";
import { deriveUnderwriteInputs } from "./underwrite/inputs";

const interest = (over: Partial<ExtractedInterest>): ExtractedInterest => ({
  kind: "fee_simple",
  summary: "",
  share: "",
  groundLease: "",
  loan: "",
  page: "",
  ...over,
});

const ex = (i: ExtractedInterest | undefined, metrics: ExtractionResult["metrics"] = []): ExtractionResult => ({
  dealName: "Harbor View Apartments",
  assetClass: "multifamily",
  interest: i,
  totalPages: 40,
  metrics: [
    { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 2", basis: "na" },
    { label: "Units", value: "240", flagged: false, page: "p. 2", basis: "na" },
    ...metrics,
  ],
});

describe("parseSharePct — a partial interest's share, off the OM's own words", () => {
  it("reads one percentage under 100, and nothing it cannot be sure of", () => {
    expect(parseSharePct("49% limited partnership interest")).toBe(49);
    expect(parseSharePct("a 90 percent stake in the owning LLC")).toBe(90);
    expect(parseSharePct("12.5% tenant-in-common interest")).toBe(12.5);
    // Two different percentages is not one share.
    expect(parseSharePct("a 49% LP interest and a 2% GP interest")).toBeNull();
    // The same percentage twice is still one.
    expect(parseSharePct("49% interest (49% of the LLC)")).toBe(49);
    // A stated 100% is all of the entity's interests (research pass 28).
    expect(parseSharePct("100% of the membership interests")).toBe(100);
    expect(parseSharePct("the majority interest")).toBeNull();
    expect(parseSharePct("")).toBeNull();
    expect(parseSharePct(undefined)).toBeNull();
  });

  it("reads only a percentage its own words call an ownership share — never a return, a rate or an occupancy", () => {
    // The bug: any lone percentage was the share, so a $15M preferred-equity
    // price grossed up to $125M on its 12% preferred return.
    expect(parseSharePct("Preferred equity, 12% preferred return")).toBeNull();
    expect(parseSharePct("a 49% tenant-in-common interest")).toBe(49);
    expect(parseSharePct("a 90% interest in the partnership with an 8% preferred return")).toBe(90);
    // Each kind of ownership share, by its own words, after the figure or
    // before it in its clause.
    expect(parseSharePct("a 51% membership interest in the owning LLC")).toBe(51);
    expect(parseSharePct("49% of the LLC")).toBe(49);
    expect(parseSharePct("a 25% ownership stake")).toBe(25);
    expect(parseSharePct("a 33.3% undivided tenancy in common")).toBe(33.3);
    expect(parseSharePct("Ownership interest: 49%")).toBe(49);
    expect(parseSharePct("TIC interest (49%)")).toBe(49);
    expect(parseSharePct("a 49% interest in the fee simple")).toBe(49);
    // A return, a pref, a rate, a coupon, a yield, a cap, an IRR, a fee, a
    // promote or an occupancy is never the share, whatever sits beside it.
    for (const text of [
      "8% pref",
      "Preferred return of 8%",
      "5.25% interest rate",
      "a 6.5% coupon",
      "7% current yield",
      "a 5.5% cap",
      "15% IRR",
      "2% acquisition fee",
      "a 20% promote",
      "20% carried interest",
      "95% occupied",
      "a 12% preferred equity interest",
    ]) {
      expect(parseSharePct(text), text).toBeNull();
    }
    // The non-share percentages beside a share drop out, and the share stands.
    expect(parseSharePct("a 49% LP interest; 8% preferred return; 20% promote over a 12% IRR")).toBe(49);
    expect(parseSharePct("a 49% interest in a property that is 95% leased")).toBe(49);
    expect(parseSharePct("a 90% stake (10% retained by the sponsor)")).toBe(90);
    // A percentage among words that name nothing, or a range, is no share.
    expect(parseSharePct("roughly 49% of it")).toBeNull();
    expect(parseSharePct("a 49%–51% interest")).toBeNull();
    // The field is the share's: one percentage and nothing else is the share
    // (a table's "Interest offered: 49%" cell), and a range still is not.
    expect(parseSharePct("49%")).toBe(49);
    expect(parseSharePct(" 12.5 percent ")).toBe(12.5);
    expect(parseSharePct("49–51%")).toBeNull();
    expect(parseSharePct("100%")).toBe(100);
    // Two different shares remain two: withheld.
    expect(parseSharePct("a 49% LP interest (the sponsor keeps a 51% GP interest)")).toBeNull();
  });

  // The audit of 2026-10-05: admitting a stated 100% as a share left a share
  // stated beside the entity's 100% holding with no percentage at all, so
  // the model ran the whole building at the share's $24.5M.
  it("reads the share sold beside the 100% the entity holds, and a 100% only alone", () => {
    for (const text of [
      "49% limited partnership interest in the entity that owns 100% of the fee simple interest",
      "49% LP interest; the partnership owns 100% of the property",
      "100% of the Class A membership interests, representing 49% of the LLC",
    ]) {
      expect(parseSharePct(text), text).toBe(49);
    }
    expect(parseSharePct("100% of the beneficial interests, offered in $100,000 units")).toBe(100);
    // Two shares under 100 are still two.
    expect(parseSharePct("a 49% LP interest and a 2% GP interest in the partnership that owns 100% of the property")).toBeNull();
    const lp = ex(
      interest({ kind: "partial_interest", summary: "A 49% limited partnership interest.", share: "49% limited partnership interest in the partnership that owns 100% of the fee simple interest" }),
      [{ label: "NOI (in-place)", value: "$2,800,000", flagged: false, page: "p. 3", basis: "in_place" }],
    );
    const withPrice = { ...lp, metrics: lp.metrics.map((m) => (m.label === "Asking price" ? { ...m, value: "$24,500,000" } : m)) };
    const r = readInterest(withPrice, 24_500_000)!;
    expect(r.sharePct).toBe(49);
    expect(r.impliedWhole).toBeCloseTo(50_000_000, 0);
    expect(r.headline).not.toContain("states no single percentage");
    expect(interestTag(withPrice)).toBe("49% share");
    expect(interestShortLine(r)).toBe("A 49% share of the owning entity — $24.5M for the share is $50.0M for the whole");
    expect(deriveUnderwriteInputs(withPrice, "S").inputs.purchasePrice).toBeCloseTo(50_000_000, 0);
  });

  it("a preferred-equity price is never grossed up on its return", () => {
    const pref = ex(interest({ kind: "partial_interest", share: "Preferred equity, 12% preferred return" }));
    expect(interestOf(pref)).toEqual({ kind: "partial_interest", sharePct: null, entityLoan: null });
    const r = readInterest(pref, 15_000_000)!;
    expect(r.impliedWhole).toBeNull();
    expect(r.headline).toContain("states no single percentage for it");
  });

  it("interestOf reads an older extraction as fee simple, and a share only on a partial interest", () => {
    expect(interestOf(ex(undefined))).toEqual({ kind: "fee_simple", sharePct: null, entityLoan: null });
    expect(interestOf(null)).toEqual({ kind: "fee_simple", sharePct: null, entityLoan: null });
    expect(interestOf(ex(interest({ kind: "partial_interest", share: "49% LP interest" })))).toEqual({ kind: "partial_interest", sharePct: 49, entityLoan: null });
    expect(interestOf(ex(interest({ kind: "note", share: "49%" })))).toEqual({ kind: "note", sharePct: null, entityLoan: null });
  });
});

describe("dealTypeLabel — the header's deal type says whose strategy it is (2026-09-30)", () => {
  it("names the collateral on a note and the leaseholder's building on a leased fee", () => {
    // The research pass: the header said "Deal type: Stabilized" over a note
    // and a leased fee, a word for a building the price does not buy.
    expect(dealTypeLabel("Stabilized", ex(interest({ kind: "note" })))).toBe("Stabilized (the collateral)");
    expect(dealTypeLabel("Stabilized", ex(interest({ kind: "leased_fee" })))).toBe("Stabilized (the leaseholder's building)");
  });

  it("says the same from the interest's kind alone, for the workbook's cover", () => {
    expect(dealTypeLabelFor("Stabilized", "note")).toBe("Stabilized (the collateral)");
    expect(dealTypeLabelFor("Stabilized", "leased_fee")).toBe("Stabilized (the leaseholder's building)");
    expect(dealTypeLabelFor("Value-add", "fee_simple")).toBe("Value-add");
    expect(dealTypeLabelFor("Value-add", undefined)).toBe("Value-add");
  });

  it("leaves every interest that buys the building, or a share of it, as it was", () => {
    for (const kind of ["fee_simple", "leasehold", "partial_interest", "unknown"] as const) {
      expect(dealTypeLabel("Value-add", ex(interest({ kind })))).toBe("Value-add");
    }
    expect(dealTypeLabel("Stabilized", ex(undefined))).toBe("Stabilized");
    expect(dealTypeLabel("Stabilized", null)).toBe("Stabilized");
  });

  // Research pass 23 said the land comes back under a tower, a billboard or
  // a solar array, and left the header reading "(the leaseholder's
  // building)" over one: there is no building, only the lessee's equipment.
  it("names the lessee's tower, sign or array on a leased fee under one, off the lease's own words", () => {
    const leasedFee = (over: Partial<ExtractedInterest>) => ex(interest({ kind: "leased_fee", ...over }));
    expect(
      dealTypeLabel(
        "Stabilized",
        leasedFee({ summary: "Sale of the fee interest in a cell tower site", groundLease: "Ground lease to a tower company for a 150-foot monopole" }),
      ),
    ).toBe("Stabilized (the lessee's wireless tower)");
    expect(dealTypeLabel("Stabilized", leasedFee({ summary: "Land leased to an outdoor advertising company for a billboard" }))).toBe(
      "Stabilized (the lessee's billboard)",
    );
    expect(dealTypeLabel("Stabilized", leasedFee({ groundLease: "Ground lease to a solar developer for a 5 MW solar farm" }))).toBe(
      "Stabilized (the lessee's solar array)",
    );
    // From the kind and the equipment the reader found, for the workbook.
    expect(dealTypeLabelFor("Stabilized", "leased_fee", { what: "a billboard", gear: "the sign and its structure" })).toBe(
      "Stabilized (the lessee's billboard)",
    );
    // The deal's name is a brand, never the lease's use: a building's
    // leased fee reads as before.
    const lofts = { ...leasedFee({ summary: "The land under a 200-unit apartment building" }), dealName: "Solar Farm Lofts" };
    expect(dealTypeLabel("Stabilized", lofts)).toBe("Stabilized (the leaseholder's building)");
    // Only a leased fee: a fee simple letting part of its site to a tower
    // owns its building, and its label is the building's.
    expect(dealTypeLabel("Value-add", ex(interest({ kind: "fee_simple", groundLease: "A cell tower on the parking lot is let on a ground lease" })))).toBe(
      "Value-add",
    );
    expect(dealTypeLabelFor("Value-add", "fee_simple", { what: "a wireless tower", gear: "the tower and its equipment" })).toBe("Value-add");
  });
});

describe("readInterest — what the price buys, said", () => {
  it("is null for a plain fee simple and for an extraction saved before the interest was read", () => {
    expect(readInterest(ex(undefined), 20_000_000)).toBeNull();
    expect(readInterest(ex(interest({ kind: "fee_simple" })), 20_000_000)).toBeNull();
    expect(readInterest(ex(interest({ kind: "unknown" })), 20_000_000)).toBeNull();
    expect(readInterest(null, 20_000_000)).toBeNull();
  });

  it("a note: the price against the balance, and the model named as the collateral's", () => {
    const e = ex(
      interest({ kind: "note", summary: "Sale of the first mortgage note", loan: "$24.4M UPB, 5.25% coupon, matures 2027, 90 days delinquent", page: "p. 5" }),
      [{ label: "Unpaid principal balance", value: "$24,400,000", flagged: false, page: "p. 5", basis: "na" }],
    );
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.kind).toBe("note");
    expect(r.label).toBe(INTEREST_LABEL.note);
    expect(r.balance).toBe(24_400_000);
    expect(r.discountPct).toBeCloseTo(((24.4 - 20) / 24.4) * 100, 6);
    expect(r.headline).toContain("This memorandum sells a LOAN secured by the property, not the property");
    expect(r.headline).toContain("The $20.0M price is an 18.0% discount to the $24.4M unpaid balance.");
    expect(r.modelCaveat).toContain("not the note's return");
    expect(r.page).toBe("p. 5");
    expect(interestShortLine(r)).toBe("A loan secured by the property, not the property — the $20.0M price is an 18.0% discount to the $24.4M balance");
    // A note bought above its balance is said as a premium.
    const over = readInterest(e, 25_000_000)!;
    expect(over.headline).toContain("a 2.5% premium over the $24.4M unpaid balance");
  });

  it("a share: the price grossed up to the whole, and said as the share's price, never a value", () => {
    const e = ex(interest({ kind: "partial_interest", share: "49% limited partnership interest", summary: "A 49% LP interest in the owning partnership" }));
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.sharePct).toBe(49);
    expect(r.impliedWhole).toBeCloseTo(20_000_000 / 0.49, 2);
    expect(r.headline).toContain("This memorandum sells a 49% share of the owning entity, not the whole asset: $20.0M for the share is $40.8M for the whole, grossed up");
    expect(r.headline).toContain("a minority share is worth less than its slice");
    expect(interestShortLine(r)).toBe("A 49% share of the owning entity — $20.0M for the share is $40.8M for the whole");
    // No single percentage stated: nothing grossed up, and it says so.
    const vague = readInterest(ex(interest({ kind: "partial_interest", share: "a majority interest" })), 20_000_000)!;
    expect(vague.sharePct).toBeNull();
    expect(vague.impliedWhole).toBeNull();
    expect(vague.headline).toContain("states no single percentage for it");
    expect(interestShortLine(vague)).toBe("A share of the owning entity, its percentage not stated");
  });

  it("a leasehold: a wasting asset, the ground lease as stated, and a fee simple with a ground lease under part of the site", () => {
    const r = readInterest(ex(interest({ kind: "leasehold", groundLease: "62 years remaining; ground rent $310,000/yr, resets to 6% of land value in 2031" })), 20_000_000)!;
    expect(r.headline).toContain("This memorandum sells a LEASEHOLD");
    expect(r.groundLease).toContain("62 years remaining");
    expect(r.modelCaveat).toContain("run the ground lease calculator");
    const part = readInterest(ex(interest({ kind: "fee_simple", groundLease: "The parking deck sits on a 40-year ground lease" })), 20_000_000)!;
    expect(part.kind).toBe("fee_simple");
    expect(part.headline).toContain("Part of the site is under a ground lease. Whether this owner pays the ground rent");
    expect(part.modelCaveat).toBeNull();
    expect(interestShortLine(part)).toBe("Fee simple, with a ground lease on part of the site");
  });

  it("a leased fee: the ground rent is the income, the building's income before it is the cover, and the traps are the lessor's", () => {
    const e = ex(
      interest({
        kind: "leased_fee",
        summary: "Sale of the fee interest in the land beneath the tower",
        groundLease: "99-year ground lease, 71 years remaining; ground rent $1,200,000 a year with 2% annual bumps; unsubordinated",
        page: "p. 4",
      }),
      [
        { label: "Ground rent", value: "$1,200,000", flagged: false, page: "p. 4", basis: "in_place" },
        { label: "Income before ground rent", value: "$6,000,000", flagged: false, page: "p. 6", basis: "in_place" },
        { label: "NOI (in-place)", value: "$1,200,000", flagged: false, page: "p. 4", basis: "in_place" },
      ],
    );
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.kind).toBe("leased_fee");
    expect(r.label).toBe("The leased fee — the land under a ground lease");
    expect(r.groundRent).toBe(1_200_000);
    expect(r.incomeBeforeGroundRent).toBe(6_000_000);
    expect(r.groundRentCoverage).toBeCloseTo(5, 9);
    expect(r.headline).toContain("This memorandum sells a LEASED FEE: the land under a building someone else owns, with its ground lease.");
    expect(r.headline).toContain("the income here, not an expense and never the building's NOI");
    expect(r.headline).toContain("and the building's $6.0M of income before the ground rent covers the $1.2M rent 5.0×.");
    expect(r.modelCaveat).toContain("the ground lease calculator's leased-fee side");
    expect(interestShortLine(r)).toBe("The leased fee — the land under a building someone else owns, and its ground rent, covered 5.0× by the building's income");
    expect(interestContextLine(r).startsWith("What is being sold: the leased fee — the land under a ground lease.")).toBe(true);
    const note = interestNote(r);
    for (const trap of ["THE RENT IS THE INCOME", "COVERAGE", "SUBORDINATION", "THE RESETS", "THE REVERSION", "PURCHASE OPTIONS"]) {
      expect(note, trap).toContain(trap);
    }
    // The building's income is never an NOI to the screen's readers.
    expect(noiFigures(e.metrics).map((f) => f.label)).toEqual(["NOI (in-place)"]);
    // Without the building's income there is no cover to state.
    const bare = readInterest(ex(interest({ kind: "leased_fee" }), [{ label: "Ground rent", value: "$1,200,000", flagged: false, page: "p. 4", basis: "in_place" }]), 20_000_000)!;
    expect(bare.groundRentCoverage).toBeNull();
    expect(bare.headline).toContain("The rent is safe while the building's own income covers it.");
    expect(interestShortLine(bare)).toBe("The leased fee — the land under a building someone else owns, and its ground rent");
  });

  // Research pass 28: a master lease of a building, sublet to its tenants (a
  // sandwich position), was told it sells "the building and a lease on the
  // land" — the buyer owns neither.
  it("a master leasehold, by the memorandum's own words, is a lease of the building, never the building and a lease on the land", () => {
    const sandwich = ex(
      interest({
        kind: "leasehold",
        summary: "Leasehold interest under a master lease of the building through 2041, sublet to 14 office tenants",
        groundLease: "Master lease through December 31, 2041; master rent $1,100,000 a year",
      }),
    );
    expect(isMasterLeasehold(sandwich)).toBe(true);
    const r = readInterest(sandwich, 20_000_000)!;
    expect(r.masterLease).toBe(true);
    expect(r.leadSentences.slice(0, 2)).toEqual([
      "This memorandum sells a LEASEHOLD: a master lease of the building, sublet to its tenants — not the building, and not the land.",
      "The master rent is owed whatever the subtenants pay, and when the master lease ends the position ends with it — a capitalised NOI values a perpetuity that ends.",
    ]);
    expect(r.headline).not.toContain("a lease on the land");
    expect(r.headline).not.toContain("ground rent");
    expect(interestShortLine(r)).toBe("A leasehold — a master lease of the building, sublet to its tenants, not the building or the land");
    expect(interestContextLine(r)).toContain("The master lease as stated: Master lease through December 31, 2041");
    expect(interestContextLine(r)).not.toContain("The ground lease as stated");
    expect(gluedWords(`${r.headline} ${interestShortLine(r)}`)).toEqual([]);
    // Its words, however put: a sandwich lease, the master lessee's position.
    for (const summary of ["Sandwich leasehold position in a 120,000 SF office building", "The master lessee's position, subleased to the tenants"]) {
      expect(isMasterLeasehold(ex(interest({ kind: "leasehold", summary }))), summary).toBe(true);
    }
    // A cover stated beside it is the master rent's, never a ground rent's.
    const covered = readInterest(
      { ...sandwich, metrics: [...sandwich.metrics, { label: "Ground rent", value: "$1,100,000", flagged: false, page: "p. 4", basis: "in_place" }, { label: "Income before ground rent", value: "$1,820,000", flagged: false, page: "p. 6", basis: "in_place" }] },
      20_000_000,
    )!;
    expect(covered.headline).toContain("Here the building's $1.8M of income before the master rent covers the $1.1M rent 1.7×.");
  });

  it("a plain leasehold keeps its sentence: a ground lease named, a seller's master lease of vacant space, or no master lease at all", () => {
    const LEAD = "This memorandum sells a LEASEHOLD: the building and a lease on the land, not the land.";
    for (const over of [
      { summary: "Leasehold interest under a 99-year ground lease" },
      // A master lease beside a ground lease is not a sandwich read off the words alone.
      { summary: "Leasehold under a ground lease; the building is held under a master lease of the building to an affiliate" },
      // A seller's master lease of vacant suites is a rent guarantee.
      { summary: "Leasehold interest; the seller will master lease the vacant suites for 24 months" },
      {},
    ]) {
      const e = ex(interest({ kind: "leasehold", ...over }));
      expect(isMasterLeasehold(e), JSON.stringify(over)).toBe(false);
      const r = readInterest(e, 20_000_000)!;
      expect(r.leadSentences[0], JSON.stringify(over)).toBe(LEAD);
      expect(interestShortLine(r), JSON.stringify(over)).toBe("A leasehold — the building and a lease on the land, not the land");
    }
    // Only a leasehold: the words on any other interest change nothing.
    expect(isMasterLeasehold(ex(interest({ kind: "fee_simple", summary: "Sandwich leasehold position" })))).toBe(false);
  });

  it("a leasehold states its cover where both figures are given, and a fee simple with a ground rent row still says so", () => {
    const rows = [
      { label: "Ground rent", value: "$1,200,000", flagged: false, page: "p. 4", basis: "in_place" as const },
      { label: "Income before ground rent", value: "$6,000,000", flagged: false, page: "p. 6", basis: "in_place" as const },
    ];
    const lease = readInterest(ex(interest({ kind: "leasehold" }), rows), 20_000_000)!;
    expect(lease.headline).toContain("Here the building's $6.0M of income before the ground rent covers the $1.2M rent 5.0×.");
    const fee = readInterest(ex(interest({ kind: "fee_simple" }), rows.slice(0, 1)), 20_000_000)!;
    expect(fee.headline).toContain("Part of the site is under a ground lease");
  });

  it("the extraction asks for the building's income under a label no NOI reader takes for the deal's", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    const prompt = extractionInstruction("multifamily");
    expect(prompt).toContain('"Income before ground rent"');
    expect(prompt).toContain('"Ground rent"');
    expect(prompt).not.toContain("Leasehold NOI");
    // The label the prompt asks for is read as the building's income, and
    // never as an NOI.
    const row = { label: "Income before ground rent", value: "$6,000,000", flagged: false, page: "", basis: "in_place" as const };
    expect(incomeBeforeGroundRentOf(ex(undefined, [row]))).toBe(6_000_000);
    expect(noiFigures([row])).toEqual([]);
  });

  it("reads the year's ground rent and the building's income only from rows that state them", () => {
    const m = (label: string, value = "$1,200,000") => ex(undefined, [{ label, value, flagged: false, page: "", basis: "na" }]);
    expect(groundRentOf(m("Ground rent"))).toBe(1_200_000);
    expect(groundRentOf(m("Annual ground rent"))).toBe(1_200_000);
    expect(groundRentOf(m("Ground lease rent"))).toBe(1_200_000);
    for (const label of ["Ground rent per SF", "Ground rent / SF", "Monthly ground rent", "Ground rent coverage", "Ground rent escalations", "Ground rent reset (2031)", "Ground rent as % of NOI"]) {
      expect(groundRentOf(m(label)), label).toBeNull();
    }
    expect(groundRentOf(m("Ground rent", "0"))).toBeNull();
    expect(incomeBeforeGroundRentOf(m("Income before ground rent", "$6,000,000"))).toBe(6_000_000);
    expect(incomeBeforeGroundRentOf(m("Leasehold operating income", "$6,000,000"))).toBe(6_000_000);
    expect(incomeBeforeGroundRentOf(m("Ground rent"))).toBeNull();
  });

  it("cites the interest's page only inside the memorandum", () => {
    expect(readInterest(ex(interest({ kind: "note", page: "p. 88" })), 20_000_000)!.page).toBe("");
    expect(readInterest({ ...ex(interest({ kind: "note", page: "p. 5" })), totalPages: undefined }, 20_000_000)!.page).toBe("");
  });

  it("the context line and the challenger's note say the interest first, then its traps by name", () => {
    const r = readInterest(ex(interest({ kind: "note", loan: "$24.4M UPB, 5.25% coupon" })), 20_000_000)!;
    expect(interestContextLine(r).startsWith("What is being sold: a loan secured by the property.")).toBe(true);
    expect(interestContextLine(r)).toContain("The loan as stated: $24.4M UPB, 5.25% coupon.");
    const note = interestNote(r);
    for (const trap of ["THE COLLATERAL IS NOT THE RETURN", "THE DISCOUNT IS THE RETURN", "DEFAULT AND FORECLOSURE", "THE DOCUMENTS"]) {
      expect(note, trap).toContain(trap);
    }
    const share = interestNote(readInterest(ex(interest({ kind: "partial_interest", share: "49%" })), 20_000_000)!);
    for (const trap of ["THE PRICE IS FOR A SHARE", "CONTROL", "THE WATERFALL", "EXIT RIGHTS", "CAPITAL CALLS"]) {
      expect(share, trap).toContain(trap);
    }
    const lease = interestNote(readInterest(ex(interest({ kind: "leasehold" })), 20_000_000)!);
    for (const trap of ["THE TERM LEFT", "THE RESETS", "SUBORDINATION", "COVERAGE", "THE REVERSION"]) {
      expect(lease, trap).toContain(trap);
    }
  });

  // Research pass 18: the leasehold's coverage trap said "the NOI over the
  // ground rent" where the code divides the building's income before the
  // ground rent — a trap reading 4.5× where the panel says 5.5×.
  it("the leasehold's coverage trap is the code's division: the income before the ground rent over the rent", () => {
    const lease = interestNote(readInterest(ex(interest({ kind: "leasehold" })), 20_000_000)!);
    expect(lease).toContain("(d) COVERAGE — the building's income before the ground rent over the ground rent, the lender's first test");
    expect(lease).not.toContain("the NOI over the ground rent");
  });

  // Research pass 18: the challenger's two shared traps — the tax line reset
  // on the sale, the seller's legacy insurance premium — reached every deal,
  // and do not fit a note, a share or a leased fee as written.
  it("reads the two shared traps for a note, a share and a leased fee, conditionally where the law varies; a fee simple and a leasehold keep them", () => {
    const note = interestNote(readInterest(ex(interest({ kind: "note" })), 20_000_000)!);
    expect(note).toContain("THE TWO SHARED TRAPS, read for a note in place of the tax reset and the legacy insurance premium");
    expect(note).toContain("a note's sale transfers no property — the borrower still owns the collateral");
    expect(note).toContain("whether that transfer resets the assessment is the jurisdiction's rule to say");
    const share = interestNote(readInterest(ex(interest({ kind: "partial_interest", share: "49%" })), 20_000_000)!);
    expect(share).toContain("THE TWO SHARED TRAPS, read for a share");
    expect(share).toContain("depends on the jurisdiction's change-of-ownership rule");
    expect(share).toContain("never assume a reset or its absence");
    // A share of no stated percentage is still a share: the entity keeps the property.
    expect(interestNote(readInterest(ex(interest({ kind: "partial_interest" })), 20_000_000)!)).toContain("THE TWO SHARED TRAPS, read for a share");
    const fee = interestNote(readInterest(ex(interest({ kind: "leased_fee" })), 20_000_000)!);
    expect(fee).toContain("THE TWO SHARED TRAPS, read for a leased fee");
    expect(fee).toContain("rarely carries either line — the ground lease decides who pays the property's taxes and insures the building");
    for (const kept of [
      interestNote(readInterest(ex(interest({ kind: "leasehold" })), 20_000_000)!),
      interestNote(readInterest(ex(interest({ kind: "fee_simple", groundLease: "Pad 3 is let on a ground lease" })), 20_000_000)!),
    ]) {
      expect(kept).not.toContain("THE TWO SHARED TRAPS");
    }
  });
});

describe("a note, underwritten as a note (#416)", () => {
  // The worked example (lib/note-yield): $20.0M for a $24.4M balance at
  // 5.25%, interest-only to the end of March 2028, read on Sep 30, 2025.
  const AS_OF = new Date(Date.UTC(2025, 8, 30));
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 5", basis: "na" as const });
  const TERMS = [
    row("Unpaid principal balance", "$24,400,000"),
    row("Note rate", "5.25%"),
    row("Maturity date", "March 31, 2028"),
    row("Amortization", "Interest-only"),
    row("Whole-asset value", "$34,000,000"),
  ];
  const note = (status: string | null, rows = TERMS) =>
    ex(interest({ kind: "note", page: "p. 5" }), [...rows, ...(status ? [row("Payment status", status)] : [])]);
  const LEAD =
    "This memorandum sells a LOAN secured by the property, not the property: the buyer steps into the lender's position, and the return is the note's coupon and its discount to the balance — or, on a default, what the collateral fetches after foreclosure. The $20.0M price is an 18.0% discount to the $24.4M unpaid balance.";
  const CUSHION = "The collateral's stated $34.0M puts the balance at 72% of its value and the price at 59%.";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a performing note: the yield to maturity with the current yield inside it, then the cushion", () => {
    const r = readInterest(note("Performing — current through August"), 20_000_000, AS_OF)!;
    expect(r.note!.ytmPct).toBeCloseTo(13.822, 2);
    expect(r.lead).toBe(LEAD);
    expect(r.headline).toBe(
      `${LEAD} Held to its Mar 2028 maturity it yields 13.8% on the price (interest-only as stated): 6.4% of current yield on the price, the rest the discount accreting. ${CUSHION}`,
    );
    expect(interestShortLine(r)).toBe(
      "A loan secured by the property, not the property — the $20.0M price is an 18.0% discount to the $24.4M balance, 13.8% to its Mar 2028 maturity",
    );
    expect(noteCaption(r.note)).toBe("30 months to its Mar 2028 maturity, interest-only as stated.");
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("a note the OM does not call performing is said as paid as agreed", () => {
    const r = readInterest(note(null), 20_000_000, AS_OF)!;
    expect(r.headline).toContain(
      "Paid as agreed to its Mar 2028 maturity it yields 13.8% on the price (interest-only as stated): 6.4% of current yield on the price, the rest the discount accreting — the memorandum does not say whether it is performing.",
    );
    expect(interestShortLine(r)).toMatch(/, 13\.8% to its Mar 2028 maturity if paid as agreed$/);
  });

  it("a non-performing note: the contract yield said as what it would earn if it paid", () => {
    const r = readInterest(note("90+ days delinquent; foreclosure filed"), 20_000_000, AS_OF)!;
    expect(r.headline).toContain(
      "If it paid to its Mar 2028 maturity it would yield 13.8% (interest-only as stated) — it is not paying, so what it earns turns on the time and cost of taking the property.",
    );
    expect(r.headline).not.toContain("Held to its");
    expect(interestShortLine(r)).toMatch(/balance, and not paying$/);
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("a matured note has no contract yield; a note with no maturity has a current yield and says why no more", () => {
    const matured = readInterest(note("Matured and unpaid", [...TERMS.slice(0, 2), row("Maturity date", "June 30, 2025"), ...TERMS.slice(3)]), 20_000_000, AS_OF)!;
    expect(matured.headline).toContain(
      "It is past its Jun 2025 maturity — a matured loan still outstanding is in default or extended, and there is no contract yield to state.",
    );
    expect(interestShortLine(matured)).toMatch(/balance, past its maturity$/);
    const open = readInterest(note("Performing", TERMS.filter((m) => m.label !== "Maturity date")), 20_000_000, AS_OF)!;
    expect(open.headline).toContain(
      "A year's interest is 6.4% of the price; the memorandum states no maturity, so there is no yield to maturity to give.",
    );
    expect(noteCaption(open.note)).toBe("The memorandum states no maturity, so there is no yield to maturity to give.");
  });

  it("at a premium the yield is under the current yield, and said so; at par neither is said", () => {
    const premium = readInterest(note("Performing"), 25_000_000, AS_OF)!;
    expect(premium.headline).toContain("The $25.0M price is a 2.5% premium over the $24.4M unpaid balance.");
    expect(premium.headline).toMatch(/it yields 4\.\d% on the price \(interest-only as stated\): under its 5\.1% of current yield, the premium over the balance lost at maturity\./);
    const par = readInterest(note("Performing"), 24_400_000, AS_OF)!;
    expect(par.headline).toContain("Held to its Mar 2028 maturity it yields 5.3% on the price (interest-only as stated).");
    // A premium larger than the interest left to collect is a loss: $28.0M
    // for $24.4M at 5.25% with thirty months left returns $3.2M of interest
    // against a $3.6M premium.
    const loss = readInterest(note("Performing"), 28_000_000, AS_OF)!;
    expect(loss.note!.ytmPct!).toBeLessThan(0);
    expect(loss.headline).toMatch(
      /it yields -0\.\d% on the price \(interest-only as stated\): the \$3\.6M premium over the balance is more than the interest left to collect\./,
    );
    expect(gluedWords(loss.headline)).toEqual([]);
  });

  it("only the rows the OM states: a balance alone says the discount and nothing more", () => {
    const bare = readInterest(note(null, TERMS.slice(0, 1)), 20_000_000, AS_OF)!;
    expect(bare.headline).toBe(LEAD);
    expect(bare.note!.ytmPct).toBeNull();
    expect(interestShortLine(bare)).toBe(
      "A loan secured by the property, not the property — the $20.0M price is an 18.0% discount to the $24.4M balance",
    );
  });

  it("a note behind a senior loan: no loan-to-value, and every surface says why", () => {
    // $15M of mezzanine behind a $60M senior loan on a $70M value read "21%"
    // when the stack is 107%. The screen read no senior balance as a row.
    const mezz = ex(
      interest({ kind: "note", summary: "Sale of a $15M mezzanine loan", loan: "$15M mezzanine loan behind a $60M senior loan", page: "p. 5" }),
      [row("Unpaid principal balance", "$15,000,000"), row("Note rate", "11.0%"), row("Maturity date", "March 31, 2028"), row("Whole-asset value", "$70,000,000"), row("Payment status", "Performing")],
    );
    const r = readInterest(mezz, 15_000_000, AS_OF)!;
    expect(r.note!.terms.subordinate).toBe(true);
    expect(r.note!.ltvAtBalancePct).toBeNull();
    expect(r.note!.ltvAtPricePct).toBeNull();
    // Research pass 28 (C4): the memorandum's own loan sentence states the
    // $60M, so "which the memorandum does not state" was not true of it —
    // what is true is that the screen did not read it as a figure.
    const WITHHELD =
      "The collateral's stated $70.0M is not set against this note alone: it sits behind a senior loan, and its loan-to-value at its last dollar needs that loan's balance, which the screen did not read as a figure of its own.";
    expect(r.headline).not.toContain("which the memorandum does not state");
    expect(noteCollateralSentence(r.note)).toBe(WITHHELD);
    expect(r.headline).toContain(WITHHELD);
    expect(r.headline).not.toMatch(/puts the balance at \d+%/);
    expect(r.headline).not.toContain("21%");
    // The memo's and the workbook cover's short line never carried the
    // loan-to-value, and carries none now.
    expect(interestShortLine(r)).not.toMatch(/\d+% of/);
    expect(gluedWords(r.headline)).toEqual([]);
    // The deal context and the challenger read the headline.
    vi.useFakeTimers({ now: AS_OF, toFake: ["Date"] });
    expect(dealContextFor(mezz)).toContain(WITHHELD);
    expect(interestNote(readInterest(mezz, askingPriceOf(mezz))!)).toContain(WITHHELD);
  });

  it("a note behind a senior loan whose balance the memorandum states: the stack, read off the stated figures", () => {
    // $15M of mezzanine behind a $52M senior mortgage on a $70M value,
    // bought for $12M: the senior is 74% of the value, the senior and the
    // note's balance 96%, the senior and the price 91%.
    const base = ex(
      interest({ kind: "note", summary: "Sale of a $15M mezzanine loan", loan: "$15M mezzanine loan behind a $52M senior mortgage", page: "p. 5" }),
      [
        row("Senior loan balance", "$52,000,000"),
        row("Unpaid principal balance", "$15,000,000"),
        row("Note rate", "11.0%"),
        row("Maturity date", "March 31, 2028"),
        row("Whole-asset value", "$70,000,000"),
        row("Payment status", "Performing"),
      ],
    );
    const mezz = { ...base, metrics: [row("Asking price", "$12,000,000"), ...base.metrics.filter((m) => m.label !== "Asking price")] };
    expect(askingPriceOf(mezz)).toBe(12_000_000);
    const r = readInterest(mezz, 12_000_000, AS_OF)!;
    expect(r.balance).toBe(15_000_000);
    const STACK =
      "The collateral's stated $70.0M, with the senior loan's stated $52.0M ahead of this note, puts the senior loan at 74% of its value, the senior loan and the balance at 96%, and the senior loan and the price at 91%.";
    expect(noteCollateralSentence(r.note)).toBe(STACK);
    expect(r.headline).toContain(STACK);
    expect(r.headline).not.toContain("needs that loan's balance");
    expect(gluedWords(r.headline)).toEqual([]);
    vi.useFakeTimers({ now: AS_OF, toFake: ["Date"] });
    expect(dealContextFor(mezz)).toContain(STACK);
    expect(interestNote(readInterest(mezz, askingPriceOf(mezz))!)).toContain(STACK);
  });

  it("a note named beside other debt with no order stated says so, and asserts no senior loan (the audit of 2026-10-01)", () => {
    const unclear = ex(
      interest({ kind: "note", summary: "Sale of a performing note", loan: "The property also carries $5M of mezzanine financing", page: "p. 5" }),
      [row("Unpaid principal balance", "$15,000,000"), row("Note rate", "11.0%"), row("Maturity date", "March 31, 2028"), row("Whole-asset value", "$70,000,000"), row("Payment status", "Performing")],
    );
    const r = readInterest(unclear, 15_000_000, AS_OF)!;
    expect(r.note!.ltvAtBalancePct).toBeNull();
    const s = noteCollateralSentence(r.note);
    expect(s).toContain("names other debt on the property without saying which loan comes first");
    expect(s).not.toContain("sits behind a senior loan");
    expect(r.headline).toContain(s);
    // A first-lien note four months behind on its payments is still first.
    const late = ex(
      interest({ kind: "note", summary: "First-lien mortgage note", loan: "", page: "p. 5" }),
      [row("Unpaid principal balance", "$15,000,000"), row("Note rate", "6.0%"), row("Maturity date", "March 31, 2028"), row("Whole-asset value", "$30,000,000"), row("Payment status", "Non-performing; borrower 4 months behind on payments")],
    );
    const l = readInterest(late, 12_000_000, AS_OF)!;
    expect(l.note!.terms.subordinate).toBe(false);
    expect(noteCollateralSentence(l.note)).toMatch(/puts the balance at 50% of its value and the price at 40%/);
  });

  it("a first-lien note keeps its loan-to-value exactly as before", () => {
    const first = note("Performing", [...TERMS]);
    const withWords = { ...first, interest: { ...first.interest!, summary: "Sale of the first mortgage note", loan: "$24.4M first mortgage, 5.25% coupon" } };
    const r = readInterest(withWords, 20_000_000, AS_OF)!;
    expect(r.note!.terms.subordinate).toBe(false);
    expect(noteCollateralSentence(r.note)).toBe(CUSHION);
    expect(r.headline).toContain(CUSHION);
  });

  it("the deal context and the challenger read the note's yield on the day they run", () => {
    vi.useFakeTimers({ now: AS_OF, toFake: ["Date"] });
    const e = note("Performing");
    const context = dealContextFor(e)!;
    expect(context).toContain("Held to its Mar 2028 maturity it yields 13.8% on the price");
    expect(context).toContain(CUSHION);
    expect(interestNote(readInterest(e, askingPriceOf(e))!)).toContain("it yields 13.8% on the price");
  });
});

describe("what the price buys, read by the plausibility check, the deal context and the model", () => {
  const noi = { label: "NOI (in-place)", value: "$5,500,000", flagged: false, page: "p. 9", basis: "in_place" as const };

  it("the plausibility check grosses a share's price up to the whole, and makes no price finding on a note", () => {
    // The whole building's $5.5M against the $20M share price is a 27.5%
    // "cap" — a misread on a fee simple.
    const plain = assessPlausibility(ex(undefined, [noi]));
    expect(plain.map((f) => f.code)).toContain("implied_cap_impossible");
    // Against the $40.8M the 49% share implies it is 13.5%: no finding.
    const share = assessPlausibility(ex(interest({ kind: "partial_interest", share: "49% LP interest" }), [noi]));
    expect(share.map((f) => f.code)).not.toContain("implied_cap_impossible");
    // A share with no stated percentage and a note: no price finding at all.
    expect(assessPlausibility(ex(interest({ kind: "partial_interest", share: "a majority stake" }), [noi]))).toEqual([]);
    expect(assessPlausibility(ex(interest({ kind: "note" }), [noi]))).toEqual([]);
  });

  it("a finding on a share names the price it measured: the whole the share implies", () => {
    // A stated 6.00% cap against $1.4M over the $40.8M whole is 3.43%: the
    // mismatch is measured on — and says — the whole the share implies.
    const f = assessPlausibility(
      ex(interest({ kind: "partial_interest", share: "49% LP interest" }), [
        { ...noi, value: "$1,400,000" },
        { label: "Going-in cap rate", value: "6.0%", flagged: false, page: "p. 9", basis: "in_place" },
      ]),
    );
    expect(f.map((x) => x.code)).toEqual(["cap_mismatch"]);
    expect(f[0].title).toBe("Stated 6.00% cap vs 3.43% from NOI (in-place) ÷ whole-asset price the share implies");
  });

  it("a leased fee: the building's income taken for the NOI is named, and the land's price is no building basis", () => {
    const rent = { label: "Ground rent", value: "$1,200,000", flagged: false, page: "p. 4", basis: "in_place" as const };
    // The NOI row carries the building's $6.0M, five times the rent the
    // buyer collects.
    const wrong = assessPlausibility(ex(interest({ kind: "leased_fee" }), [rent, { ...noi, value: "$6,000,000" }]));
    expect(wrong.map((f) => f.code)).toContain("ground_rent_mismatch");
    expect(wrong.find((f) => f.code === "ground_rent_mismatch")!.title).toBe(
      "NOI (in-place) of $6.0M is 5.0× the $1.2M ground rent on a leased fee",
    );
    // The rent as the NOI: nothing to say.
    expect(assessPlausibility(ex(interest({ kind: "leased_fee" }), [rent, { ...noi, value: "$1,200,000" }]))).toEqual([]);
    // $2M of land over the building's 240 units is $8,333 a unit — a misread
    // on a fee simple, and simply the land's price on a leased fee.
    const land = (i: ExtractedInterest | undefined): ExtractionResult => ({
      ...ex(i),
      metrics: [
        { label: "Asking price", value: "$2,000,000", flagged: false, page: "p. 2", basis: "na" },
        { label: "Units", value: "240", flagged: false, page: "p. 2", basis: "na" },
      ],
    });
    expect(assessPlausibility(land(undefined)).map((f) => f.code)).toContain("basis_out_of_band");
    expect(assessPlausibility(land(interest({ kind: "leased_fee" })))).toEqual([]);
  });

  it("the deal context says what is being sold first, whatever the strategy", () => {
    const ctx = dealContextFor(ex(interest({ kind: "note" })))!;
    expect(ctx.startsWith("What is being sold: a loan secured by the property.")).toBe(true);
    expect(dealContextFor(ex(undefined)) ?? "").not.toContain("What is being sold");
  });

  it("the model runs a share at the whole it implies, and names a note's price for what it is", () => {
    const share = deriveUnderwriteInputs(ex(interest({ kind: "partial_interest", share: "49% LP interest" }), [noi]), "x");
    expect(share.inputs.purchasePrice).toBeCloseTo(20_000_000 / 0.49, 0);
    expect(share.sources.purchasePrice?.provenance).toBe("derived");
    expect(share.sources.purchasePrice?.note).toContain("for a 49% share, grossed up to the whole asset");
    expect(share.meta.interest?.line).toBe("A 49% share of the owning entity — $20.0M for the share is $40.8M for the whole");
    const note = deriveUnderwriteInputs(ex(interest({ kind: "note" }), [noi]), "x");
    expect(note.inputs.purchasePrice).toBe(20_000_000);
    expect(note.sources.purchasePrice?.note).toContain("NOTE secured by the property");
    expect(note.meta.interest?.modelCaveat).toContain("not the note's return");
    const fee = deriveUnderwriteInputs(ex(interest({ kind: "leased_fee" }), [noi]), "x");
    expect(fee.sources.purchasePrice?.note).toContain("the LEASED FEE — the land under a building someone else owns");
    expect(fee.meta.interest?.modelCaveat).toContain("leased-fee side");
    const plain = deriveUnderwriteInputs(ex(undefined, [noi]), "x");
    expect(plain.sources.purchasePrice?.note).toBe("OM asking / purchase price");
    expect(plain.meta.interest).toBeNull();
  });
});

// Research pass 28: a DST offering "100% of the beneficial interests,
// offered in $100,000 units" read as no share at all — the panel said the
// memorandum "states no single percentage", the model's note that it could
// not gross the price up, and the report that there was no max bid.
describe("a stated 100% is all of the entity's interests: the whole, nothing grossed up", () => {
  const noi = { label: "NOI (in-place)", value: "$2,900,000", flagged: false, page: "p. 9", basis: "in_place" as const };
  const dst = (over: Partial<ExtractedInterest> = {}, metrics: ExtractionResult["metrics"] = []): ExtractionResult => ({
    ...ex(
      interest({
        kind: "partial_interest",
        share: "100% of the beneficial interests, offered in $100,000 units",
        summary: "Beneficial interests in Harbor View DST",
        ...over,
      }),
    ),
    metrics: [
      { label: "Asking price", value: "$52,450,000", flagged: false, page: "p. 2", basis: "na" },
      { label: "Units", value: "240", flagged: false, page: "p. 2", basis: "na" },
      ...metrics,
    ],
  });

  it("reads 100% as the whole and says so on every line, never as no percentage", () => {
    const e = dst();
    expect(interestOf(e)).toEqual({ kind: "partial_interest", sharePct: 100, entityLoan: null });
    expect([isWholeShare(100), isWholeShare(49), isWholeShare(null)]).toEqual([true, false, false]);
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.impliedWhole).toBe(52_450_000);
    expect(r.label).toBe("All of the owning entity's interests");
    expect(r.inUnits).toBe(true);
    expect(r.headline).toBe(
      "This memorandum sells all of the owning entity's interests — 100% as stated, offered in units — so its $52.5M price is the whole's, with nothing to gross up, and the whole building's income is set against it.",
    );
    expect(r.modelCaveat).toBe(
      "The screening model runs the whole asset at the $52.5M price, which buys all of the entity's interests, so nothing is grossed up; what the interests earn is the entity's cash flow after its own costs and fees, which the model does not carry.",
    );
    expect(interestTag(e)).toBe("All entity interests");
    expect(interestShortLine(r)).toBe("All of the owning entity's interests, offered in units — $52.5M for the whole, nothing grossed up");
    expect(interestNote(r)).toContain(
      "(a) THE PRICE IS FOR ALL OF THE ENTITY'S INTERESTS — hold the whole asset's income against the price itself, with nothing to gross up;",
    );
    const said = `${r.headline} ${r.modelCaveat} ${interestShortLine(r)} ${interestNote(r)} ${dealContextFor(e)}`;
    expect(said).toContain("What is being sold: all of the owning entity's interests.");
    expect(said).not.toContain("no single percentage");
    expect(said).not.toMatch(/grossed up to|100% share|share grossed up/);
    expect(gluedWords(said)).toEqual([]);
  });

  it("says units only where the memorandum's own words offer the interests in them", () => {
    const llc = dst({ share: "100% of the membership interests in Harbor View LLC", summary: "The sale of the LLC that owns the 240 units" });
    const r = readInterest(llc, askingPriceOf(llc))!;
    expect(r.inUnits).toBe(false);
    expect(r.headline).toContain("sells all of the owning entity's interests — 100% as stated — so its $52.5M price is the whole's");
    expect(interestShortLine(r)).toBe("All of the owning entity's interests — $52.5M for the whole, nothing grossed up");
    // No price stated: still the whole, and still never "no single percentage".
    const unpriced = readInterest(llc, null)!;
    expect(unpriced.headline).toBe("This memorandum sells all of the owning entity's interests — 100% as stated — so its price is the whole's, with nothing to gross up.");
    expect(interestShortLine(unpriced)).toBe("All of the owning entity's interests");
  });

  it("beside the entity's stated loan, the price is the equity's whole and the loan sits on top of it", async () => {
    const { buildingPriceOf, planSummary } = await import("./deal-strategy");
    const loan = { label: "Entity loan balance", value: "$43,600,000", flagged: false, page: "p. 9", basis: "in_place" as const };
    const e = dst({}, [loan]);
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.headline).toBe(
      "This memorandum sells all of the owning entity's interests — 100% as stated, offered in units — so its $52.5M price is the equity's whole, with nothing to gross up, not the asset's: the entity's stated $43.6M loan sits on top of it, and the screen sets the whole building's income against the $52.5M alone.",
    );
    expect(interestShortLine(r)).toBe(
      "All of the owning entity's interests, offered in units — $52.5M for the equity's whole; the entity's stated $43.6M loan sits on top of it",
    );
    expect(r.modelCaveat).toContain("the entity's stated $43.6M loan sits on top of it, and the model neither adds it to the price nor carries it");
    expect(interestNote(r)).toContain("read that price as the equity's whole, not the asset's: the entity's stated $43.6M loan sits on top of it");
    // The building's price is the equity's whole plus a loan nothing adds: no basis, as on any share beside its loan.
    expect(buildingPriceOf(e, 52_450_000)).toBeNull();
    const plan = planSummary({ ...e, strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" } })!;
    expect(plan.priceLabel).toBe("Equity's whole, all the entity's interests");
    expect(plan.equityWhole).toBe(52_450_000);
    const plain = planSummary({ ...dst(), strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" } })!;
    expect(plain.priceLabel).toBe("Price");
    expect(plain.price).toBe(52_450_000);
  });

  it("the model runs at the stated price, as it would on the building bought outright, and its note says what it buys", async () => {
    const { buildingPriceOf } = await import("./deal-strategy");
    const e = dst({}, [noi]);
    const d = deriveUnderwriteInputs(e, "x");
    // Nothing grossed up: the model's figures are the fee simple's at the same price.
    expect(d.inputs).toEqual(deriveUnderwriteInputs({ ...e, interest: undefined }, "x").inputs);
    expect(d.inputs.purchasePrice).toBe(52_450_000);
    expect(d.sources.purchasePrice?.provenance).toBe("extracted");
    expect(d.sources.purchasePrice?.note).toBe(
      "The OM's $52,450,000 for all of the owning entity's interests — the whole, nothing grossed up; the model runs the whole building's cash flows, before the entity's own costs and fees",
    );
    expect(d.meta.interest?.line).toBe("All of the owning entity's interests, offered in units — $52.5M for the whole, nothing grossed up");
    expect(buildingPriceOf(e, 52_450_000)).toBe(52_450_000);
    // A share under 100% reads exactly as before.
    const share = deriveUnderwriteInputs(ex(interest({ kind: "partial_interest", share: "49% LP interest" }), [noi]), "x");
    expect(share.sources.purchasePrice?.note).toContain("for a 49% share, grossed up to the whole asset");
    expect(interestTag(ex(interest({ kind: "partial_interest", share: "49% LP interest" })))).toBe("49% share");
  });
});

// Research pass 23: a 4.5% share at $1.8M beside a stated $56.5M loan on the
// entity read "$1.8M for the share is $40.0M for the whole" — the equity's
// whole, with the entity's debt on top of it, said as the asset's.
describe("a share beside the loan its entity carries: the grossed-up figure is the equity's whole", () => {
  const noi = { label: "NOI (in-place)", value: "$4,900,000", flagged: false, page: "p. 9", basis: "in_place" as const };
  const recap = (metrics: ExtractionResult["metrics"] = [], loan = "$56,500,000"): ExtractionResult => ({
    ...ex(interest({ kind: "partial_interest", share: "4.5% limited partnership interest", summary: "A 4.5% LP interest in the owning partnership" })),
    metrics: [
      { label: "Asking price", value: "$1,800,000", flagged: false, page: "p. 2", basis: "na" },
      { label: "Units", value: "240", flagged: false, page: "p. 2", basis: "na" },
      { label: "Entity loan balance", value: loan, flagged: false, page: "p. 9", basis: "in_place" },
      ...metrics,
    ],
  });

  it("entityLoanOf reads the stated balance on a share alone, and a blank as null", async () => {
    const { entityLoanOf } = await import("./interest");
    expect(entityLoanOf(recap())).toBe(56_500_000);
    // Only on a share: the same row beside a fee simple or a note is not read.
    expect(entityLoanOf({ ...recap(), interest: interest({ kind: "fee_simple" }) })).toBeNull();
    expect(entityLoanOf({ ...recap(), interest: interest({ kind: "note" }) })).toBeNull();
    // A percentage is no balance, and no row is no loan.
    expect(entityLoanOf(recap([], "65% LTV"))).toBeNull();
    expect(entityLoanOf(ex(interest({ kind: "partial_interest", share: "4.5% LP interest" })))).toBeNull();
    expect(entityLoanOf(null)).toBeNull();
  });

  it("the panel's sentence, the short line, the caveat and the traps name both figures", () => {
    const e = recap();
    const r = readInterest(e, askingPriceOf(e))!;
    expect(r.impliedWhole).toBe(40_000_000);
    expect(r.entityLoan).toBe(56_500_000);
    expect(r.leadSentences[0]).toBe(
      "This memorandum sells a 4.5% share of the owning entity, not the whole asset: $1.8M for the share is $40.0M grossed up — the equity's whole, not the asset's, since the entity's stated $56.5M loan sits on top of it, and the screen sets the whole building's income against the $40.0M alone.",
    );
    expect(r.leadSentences[1]).toBe("A minority share is worth less than its slice once control, the promote and the exit rights are priced.");
    expect(interestShortLine(r)).toBe(
      "A 4.5% share of the owning entity — $1.8M for the share is $40.0M for the equity's whole; the entity's stated $56.5M loan sits on top of it",
    );
    expect(r.modelCaveat).toContain("the equity's whole: the entity's stated $56.5M loan sits on top of it, and the model neither adds it to the price nor carries it");
    expect(interestNote(r)).toContain("read that grossed-up figure as the equity's whole, not the asset's: the entity's stated $56.5M loan sits on top of it");
    expect(dealContextFor(e)).toContain("the entity's stated $56.5M loan sits on top of it");
    expect(gluedWords(`${r.headline} ${r.modelCaveat} ${interestShortLine(r)}`)).toEqual([]);
    // No loan stated: the share reads exactly as before.
    const plain = readInterest(ex(interest({ kind: "partial_interest", share: "49% limited partnership interest" })), 20_000_000)!;
    expect(plain.entityLoan).toBeNull();
    expect(interestShortLine(plain)).toBe("A 49% share of the owning entity — $20.0M for the share is $40.8M for the whole");
  });

  it("the model's price note and the plausibility check name both, and the model's price is unchanged", () => {
    const e = recap([noi, { label: "Going-in cap rate", value: "5.1%", flagged: false, page: "p. 9", basis: "in_place" }]);
    const d = deriveUnderwriteInputs(e, "x");
    // The model still runs at the equity's whole: adding the loan is the owner's call.
    expect(d.inputs.purchasePrice).toBe(40_000_000);
    expect(d.sources.purchasePrice?.note).toContain(
      "The OM's $1,800,000 for a 4.5% share, grossed up to $40,000,000 — the equity's whole, not the asset's: the entity's stated $56,500,000 loan sits on top of it, and the model neither adds it to the price nor carries it",
    );
    expect(d.meta.interest?.line).toContain("the entity's stated $56.5M loan sits on top of it");
    const f = assessPlausibility(e);
    expect(f.map((x) => x.code)).toEqual(["cap_mismatch"]);
    expect(f[0].title).toBe("Stated 5.10% cap vs 12.25% from NOI (in-place) ÷ whole equity the share implies");
    expect(f[0].detail).toContain(
      "The $40.0M is the equity's whole, grossed up from the share's price — not the asset's: the entity's stated $56.5M loan sits on top of it.",
    );
  });

  it("the plan line says it where a share's grossed-up price enters a plan", async () => {
    const { planSummary, plausibilityNote, inferStrategy: infer } = await import("./deal-strategy");
    const e: ExtractionResult = {
      ...recap([
        { label: "Renovation budget", value: "$5,000,000", flagged: false, page: "p. 7", basis: "pro_forma" },
        { label: "NOI (stabilized, pro forma)", value: "$6,000,000", flagged: false, page: "p. 8", basis: "pro_forma" },
      ]),
      strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" },
    };
    const plan = planSummary(e)!;
    expect(plan.entityLoan).toBe(56_500_000);
    expect(plausibilityNote([], infer(e), plan, e)).toContain(
      "whole price, the share's grossed up, $40.0M (the equity's whole, not the asset's: the entity's stated $56.5M loan sits on top of it)",
    );
  });

  // The plan's facts — the deal page's strip, the shared screen and the
  // report's plan page — still labelled the figure "Whole price, the share
  // grossed up" beside the entity's loan.
  it("the plan's facts label the figure the equity's whole and name the loan beside it, never adding it in", async () => {
    const { planSummary } = await import("./deal-strategy");
    const { planFacts } = await import("./plan-facts");
    const e: ExtractionResult = {
      ...recap([
        { label: "Renovation budget", value: "$5,000,000", flagged: false, page: "p. 7" },
        { label: "NOI (stabilized, pro forma)", value: "$6,000,000", flagged: false, page: "p. 8" },
      ]),
      strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" },
    };
    const plan = planSummary(e)!;
    expect(plan.priceLabel).toBe("Equity's whole, the share grossed up");
    expect(planFacts(plan)[1]).toEqual(["Equity's whole, the share grossed up", "$40.0M, the entity's $56.5M loan on top"]);
    // The loan is named, never added — and the equity's whole is no
    // building's cost, so no total cost is struck on it (it read $45.0M: the
    // equity's whole and the budget, as if the loan were not there).
    expect(plan.price).toBeNull();
    expect(plan.equityWhole).toBe(40_000_000);
    expect(plan.totalCost).toBeNull();
  });
});

// Research pass 23: a cell tower's leased fee read "Leased fee, reverts in
// 22 yrs" and "the building reverts to the buyer" — there is no building,
// the equipment is the tenant's, and such tenants often hold a right to end
// the lease early.
describe("a leased fee under a tower, a billboard or a solar array: the land comes back, not a building", () => {
  const ASOF = new Date(Date.UTC(2026, 8, 30));
  const rent = { label: "Ground rent", value: "$26,000", flagged: false, page: "p. 3", basis: "in_place" as const };
  const ends = { label: "Ground lease expiration", value: "December 31, 2048", flagged: false, page: "p. 3", basis: "na" as const };
  const site = (over: Partial<ExtractedInterest>, metrics: ExtractionResult["metrics"] = [rent, ends], deck: Partial<ExtractionResult> = {}): ExtractionResult => ({
    ...ex(interest({ kind: "leased_fee", page: "p. 3", ...over }), metrics),
    dealName: "Route 9 Tower Site",
    assetClass: "net_lease",
    ...deck,
  });
  const tower = site({
    summary: "Sale of the fee interest in a cell tower site",
    groundLease: "Ground lease to a tower company for a 150-foot monopole; $26,000 a year with 3% annual escalations",
  });

  it("reads the use off the memorandum's own words, and an office tower is a building", async () => {
    const { groundLeaseEquipment } = await import("./interest");
    expect(groundLeaseEquipment(tower)).toEqual({ what: "a wireless tower", gear: "the tower and its equipment" });
    expect(groundLeaseEquipment(site({ summary: "Land leased to an outdoor advertising company for a billboard" }))).toEqual({
      what: "a billboard",
      gear: "the sign and its structure",
    });
    expect(groundLeaseEquipment(site({ groundLease: "Ground lease to a solar developer for a 5 MW solar farm" }))?.what).toBe("a solar array");
    // The leased fee under an office tower is the land under a building.
    expect(groundLeaseEquipment(site({ summary: "Sale of the fee interest in the land beneath the tower" }, undefined, { dealName: "One Harbor Tower", assetClass: "office" }))).toBeNull();
    expect(groundLeaseEquipment(site({ summary: "The land under a 40-story office tower" }))).toBeNull();
    // A deal's name is a brand, never the lease's use.
    expect(groundLeaseEquipment(site({ summary: "The land under a 200-unit apartment building" }, undefined, { dealName: "Solar Farm Lofts", assetClass: "multifamily" }))).toBeNull();
  });

  // The reader matched gear anywhere in the lease's words, so the leased fee
  // under an office building whose lessee keeps its rooftop antenna licenses
  // read "Stabilized (the lessee's wireless tower)" on every surface, and a
  // lease forbidding towers read as one. The gear counts only where it is
  // what the ground lease is for: a denial is struck first (as lib/site-
  // reports strikes "no RECs"), and gear on a building's roof is the
  // building's.
  it("reads no equipment from gear on a building's roof, a bare antenna or a lease that forbids it", async () => {
    const { groundLeaseEquipment, dealTypeLabel, dealTypeLabelFor } = await import("./interest");
    const office = (groundLease: string, summary = "Sale of the fee interest in the land beneath a 12-story office building") =>
      site({ summary, groundLease }, undefined, { dealName: "One Harbor Plaza", assetClass: "office" });
    const cases = [
      office("Ground lease to the building's owner through 2080; rooftop antenna licenses are retained by the ground lessee"),
      office("Ground lease through 2080, with the wireless carrier leases on the roof assigned to the ground lessee"),
      office("Ground lease through 2080; the ground lessee installed rooftop solar panels in 2023"),
      office("Ground lease through 2080; the lease prohibits billboards and cell towers on the site"),
      office("Ground lease through 2080; no billboards, cell towers or solar arrays may be erected on the land"),
      office("Ground lease through 2080; the ground lessee keeps the antenna licenses"),
    ];
    for (const e of cases) {
      const what = e.interest?.groundLease;
      expect(groundLeaseEquipment(e), what).toBeNull();
      // The deal type on every surface, and the workbook's three cells.
      expect(dealTypeLabel("Stabilized", e), what).toBe("Stabilized (the leaseholder's building)");
      const meta = deriveUnderwriteInputs(e, "x").meta.interest;
      expect(meta?.equipment ?? null, what).toBeNull();
      expect(dealTypeLabelFor("Stabilized", meta?.kind, meta?.equipment), what).toBe("Stabilized (the leaseholder's building)");
      // The tag and the panel: the building reverts.
      expect(interestTag(e, ASOF), what).toBe("Leased fee, reverts in 22 yrs");
      expect(readInterest(e, askingPriceOf(e), ASOF)!.headline, what).toContain("the building reverts to the buyer");
    }
    // The real ones read as before: a tower site, a billboard site, a
    // ground-mounted solar array — and the land under a tower whose lease
    // also bars billboards is still a tower's.
    expect(groundLeaseEquipment(tower)?.what).toBe("a wireless tower");
    expect(dealTypeLabel("Stabilized", tower)).toBe("Stabilized (the lessee's wireless tower)");
    expect(groundLeaseEquipment(site({ summary: "Land leased to an outdoor advertising company for a billboard" }))?.what).toBe("a billboard");
    expect(groundLeaseEquipment(site({ groundLease: "Ground lease to a solar developer for a 5 MW ground-mounted solar array" }))?.what).toBe("a solar array");
    expect(
      groundLeaseEquipment(site({ summary: "Sale of the fee interest in a cell tower site", groundLease: "Ground lease for a 150-foot monopole; billboards are prohibited" }))?.what,
    ).toBe("a wireless tower");
    expect(groundLeaseEquipment(site({ summary: "The land under an antenna tower" }))?.what).toBe("a wireless tower");
  });

  it("the tag, the panel's sentences, the caveat, the short line and the traps say the land comes back", () => {
    expect(interestTag(tower, ASOF)).toBe("Leased fee, lease ends in 22 yrs");
    const r = readInterest(tower, askingPriceOf(tower), ASOF)!;
    expect(r.equipment?.what).toBe("a wireless tower");
    expect(r.leadSentences[0]).toBe("This memorandum sells a LEASED FEE: the land under a wireless tower someone else owns, with its ground lease.");
    expect(r.headline).toContain(
      "when the lease ends the land comes back, not a building: the tower and its equipment are the tenant's own, as such leases usually provide, so read the lease for what the tenant must remove and restore at its end.",
    );
    expect(r.headline).toContain("Such tenants often hold a right to end the lease early: read the lease for one before trusting its term.");
    expect(r.headline).not.toContain("the building reverts");
    expect(r.modelCaveat).toContain("ends with the land coming back, not a building — the tenant's equipment is its own");
    const short = interestShortLine(r);
    expect(short.startsWith("The leased fee — the land under a wireless tower someone else owns, and its ground rent; the lease ends Dec 2048")).toBe(true);
    expect(short).not.toContain("reverts");
    const note = interestNote(r);
    expect(note).toContain("(e) THE LAND COMES BACK, NOT A BUILDING — the tower and its equipment are the tenant's own, as such leases usually provide");
    expect(note).toContain("(g) A TERMINATION RIGHT — such tenants often hold one, and the memorandum states none");
    expect(note).not.toContain("the years until the building reverts");
    expect(gluedWords(`${r.headline} ${r.modelCaveat} ${short} ${note}`)).toEqual([]);
    // A building's leased fee reads as before.
    const building = site({ summary: "Sale of the fee interest in the land beneath the tower" }, undefined, { dealName: "One Harbor Tower", assetClass: "office" });
    expect(interestTag(building, ASOF)).toBe("Leased fee, reverts in 22 yrs");
    expect(readInterest(building, askingPriceOf(building), ASOF)!.headline).toContain("the building reverts to the buyer");
  });

  it("a stated termination right is read as stated, said wherever the lease is, and never taken for the lease's end", () => {
    const right = { label: "Ground lease termination right", value: "Tenant may terminate on 12 months' notice at any time after 2030", flagged: false, page: "p. 3", basis: "na" as const };
    // The right is listed first, so the term reader would meet it first.
    const e = site({ summary: "Sale of the fee interest in a cell tower site" }, [right, rent, ends]);
    const r = readInterest(e, askingPriceOf(e), ASOF)!;
    expect(r.term?.ends).toBe("2048-12-31");
    expect(r.terminationRight).toBe("Tenant may terminate on 12 months' notice at any time after 2030");
    expect(r.headline).toContain(
      "The memorandum states a right to end the ground lease early: Tenant may terminate on 12 months' notice at any time after 2030 — read who holds it, from when and on what notice before trusting the term.",
    );
    expect(r.headline).not.toContain("Such tenants often hold");
    expect(interestShortLine(r)).toContain("; the ground lease states a right to end it early");
    expect(interestNote(r)).toContain("(g) A TERMINATION RIGHT — as stated: Tenant may terminate on 12 months' notice at any time after 2030");
    // On a leasehold too, by its own words.
    const lease = readInterest(ex(interest({ kind: "leasehold" }), [right, ends]), 20_000_000, ASOF)!;
    expect(lease.headline).toContain("The memorandum states a right to end the ground lease early");
    expect(interestNote(lease)).toContain(" A TERMINATION RIGHT — as stated: Tenant may terminate");
    // A row that states nothing is no right.
    const none = readInterest(site({}, [{ ...right, value: "None" }, rent, ends]), 20_000_000, ASOF)!;
    expect(none.terminationRight).toBe("");
  });

  it("a fee simple letting part of its site to a tower collects a rent whose equipment is the tenant's", () => {
    const fee = readInterest(
      ex(interest({ kind: "fee_simple", groundLease: "A cell tower on the parking lot is let on a ground lease at $30,000 a year" })),
      20_000_000,
      ASOF,
    )!;
    expect(interestNote(fee)).toContain(
      "collecting it (the ground tenant's credit, any right it holds to end the lease early, and what it must remove at the end — the tower and its equipment are its own, as such leases usually provide)",
    );
  });

  it("the extraction asks for the right under its own label", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    expect(extractionInstruction("multifamily")).toContain('"Ground lease termination right"');
  });
});

describe("the comps' subject basis reads what the price buys", () => {
  it("grosses a share up to the whole's per-unit basis, and draws no subject tick on a note", async () => {
    const { subjectBasis } = await import("./comp-detail");
    const { screenYearOf } = await import("./criteria");
    const deal = ex(undefined);
    const metrics = deal.metrics;
    const year = screenYearOf(deal);
    // $20M over 240 units is $83,333 a unit on a fee simple…
    expect(subjectBasis(metrics, "stabilized", year).perUnit).toBe(83_333);
    // …and $170,068 on the whole a 49% share implies.
    expect(subjectBasis(metrics, "stabilized", year, { kind: "partial_interest", sharePct: 49 }).perUnit).toBe(170_068);
    expect(subjectBasis(metrics, "stabilized", year, { kind: "partial_interest", sharePct: null }).perUnit).toBeNull();
    expect(subjectBasis(metrics, "stabilized", year, { kind: "note", sharePct: null })).toEqual({ perUnit: null, perSf: null });
    // A leased fee's price buys the land alone: no building basis to draw.
    expect(subjectBasis(metrics, "stabilized", year, { kind: "leased_fee", sharePct: null })).toEqual({ perUnit: null, perSf: null });
  });
});

describe("the price the building's figures describe, read by every reader that divides it (#415)", () => {
  const rows = (i: ExtractedInterest | undefined, extra: ExtractionResult["metrics"] = []): ExtractionResult => ({
    dealName: "Harbor View Apartments",
    assetClass: "multifamily",
    market: "Baltimore, MD",
    interest: i,
    totalPages: 40,
    metrics: [
      { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 2", basis: "na" },
      { label: "Units", value: "240", flagged: false, page: "p. 2", basis: "na" },
      { label: "Going-in cap rate", value: "5.5%", flagged: false, page: "p. 2", basis: "in_place" },
      { label: "Price per unit", value: "$83,333", flagged: false, page: "p. 2", basis: "na" },
      ...extra,
    ],
  });
  const share = interest({ kind: "partial_interest", share: "49% LP interest" });

  it("buildingPriceOf: the price on a fee simple or a leasehold, a share's grossed up, none for a note, a leased fee or an unstated share", async () => {
    const { buildingPriceOf, statedBasisIsBuildings } = await import("./deal-strategy");
    expect(buildingPriceOf(rows(undefined), 20_000_000)).toBe(20_000_000);
    expect(buildingPriceOf(rows(interest({ kind: "leasehold" })), 20_000_000)).toBe(20_000_000);
    expect(buildingPriceOf(rows(share), 20_000_000)).toBeCloseTo(20_000_000 / 0.49, 2);
    expect(buildingPriceOf(rows(interest({ kind: "partial_interest", share: "a majority stake" })), 20_000_000)).toBeNull();
    expect(buildingPriceOf(rows(interest({ kind: "note" })), 20_000_000)).toBeNull();
    expect(buildingPriceOf(rows(interest({ kind: "leased_fee" })), 20_000_000)).toBeNull();
    // No extraction yet (the first signal's ask): the price as asked.
    expect(buildingPriceOf(null, 20_000_000)).toBe(20_000_000);
    expect(buildingPriceOf(rows(share), null)).toBeNull();
    expect(statedBasisIsBuildings(rows(undefined))).toBe(true);
    expect(statedBasisIsBuildings(rows(interest({ kind: "leasehold" })))).toBe(true);
    for (const kind of ["note", "leased_fee", "partial_interest"] as const) {
      expect(statedBasisIsBuildings(rows(interest({ kind }))), kind).toBe(false);
    }
  });

  it("the market memory pools a share at the whole's basis, and never a note's or a leased fee's price or cap", async () => {
    const { buildComps } = await import("./market-memory");
    const row = (id: string, extraction: ExtractionResult) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      verdict: null,
      extraction,
    });
    const comps = buildComps([
      row("fee", rows(undefined)),
      row("share", rows(share)),
      row("note", rows(interest({ kind: "note" }))),
      row("land", rows(interest({ kind: "leased_fee" }))),
    ]);
    const by = Object.fromEntries(comps.map((c) => [c.dealId, c]));
    expect(by.fee.perUnit).toBe(83_333);
    expect(by.fee.capPct).toBe(5.5);
    // The share's own per-unit line is on a basis the row never says; the
    // whole the 49% implies is $170,068 a unit.
    expect(by.share.perUnit).toBeCloseTo(20_000_000 / 0.49 / 240, 2);
    expect(by.share.capPct).toBe(5.5);
    // A note and a leased fee carry neither a building's basis nor its cap.
    expect(by.note).toBeUndefined();
    expect(by.land).toBeUndefined();
  });

  it("the internal comps say what a sibling's price bought, and strike its basis on the building's price alone", async () => {
    const { deriveInternalComps } = await import("./internal-comps");
    const sib = (id: string, extraction: ExtractionResult) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      verdict: { verdict: "pass" },
      extraction,
    });
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      sib("share", rows(share)),
      sib("note", rows(interest({ kind: "note" }))),
    ]);
    const by = Object.fromEntries(comps.map((c) => [c.dealId, c]));
    expect(by.share.priceLabel).toBe("$20.0M · 49% share");
    expect(by.share.basisLabel).toBe("$170k/unit");
    expect(by.note.priceLabel).toBe("$20.0M · note");
    expect(by.note.basisLabel).toBeNull();
    expect(by.note.capLabel).toBeNull();
  });

  it("the analytics plot a share at the whole's per-unit basis and leave a note's and a leased fee's off the charts", async () => {
    const { deriveAnalytics } = await import("./analytics");
    const row = (id: string, extraction: ExtractionResult) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: `2026-09-0${id.length}T12:00:00Z`,
      is_sample: false,
      stage: "screening",
      verdict: { verdict: "pass" },
      extraction,
    });
    const out = deriveAnalytics([row("share", rows(share)), row("note", rows(interest({ kind: "note" }))), row("leasedfee", rows(interest({ kind: "leased_fee" })))]);
    const by = Object.fromEntries(out.map((d) => [d.id, d]));
    expect(by.share.perUnit).toBeCloseTo(20_000_000 / 0.49 / 240, 2);
    expect(by.note.perUnit).toBeNull();
    expect(by.note.capPct).toBeNull();
    expect(by.leasedfee.perUnit).toBeNull();
    expect(by.leasedfee.capPct).toBeNull();
  });

  it("a plan: a share's price grossed up into the project's cost, a note's and a leased fee's said and kept out of it", async () => {
    const { planSummary } = await import("./deal-strategy");
    const { planFacts } = await import("./plan-facts");
    const plan = (i: ExtractedInterest | undefined) =>
      planSummary({
        ...rows(i, [
          { label: "Renovation budget", value: "$5,000,000", flagged: false, page: "p. 7", basis: "pro_forma" },
          { label: "NOI (stabilized, pro forma)", value: "$4,000,000", flagged: false, page: "p. 8", basis: "pro_forma" },
        ]),
        strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" },
      })!;
    const whole = plan(share);
    expect(whole.price).toBeCloseTo(20_000_000 / 0.49, 2);
    expect(whole.priceLabel).toBe("Whole price, the share grossed up");
    expect(whole.totalCost).toBeCloseTo(20_000_000 / 0.49 + 5_000_000, 2);
    expect(whole.yieldOnCost).toBeCloseTo(4_000_000 / (20_000_000 / 0.49 + 5_000_000), 9);
    expect(planFacts(whole)[1]).toEqual(["Whole price, the share grossed up", "$40.8M"]);
    const note = plan(interest({ kind: "note" }));
    expect(note.price).toBeNull();
    expect(note.totalCost).toBeNull();
    expect(note.yieldOnCost).toBeNull();
    expect(planFacts(note)[1]).toEqual(["Price", "$20.0M for the note — a loan's price, not the project's"]);
    const land = plan(interest({ kind: "leased_fee" }));
    expect(land.budget).toBeNull();
    expect(land.totalCost).toBeNull();
    expect(land.yieldOnCost).toBeNull();
    expect(planFacts(land)[1][1]).toBe("$20.0M for the land under the ground lease — not the project's");
    // A fee simple's plan is exactly as before.
    const fee = plan(undefined);
    expect(fee.price).toBe(20_000_000);
    expect(fee.priceLabel).toBe("Price");
    expect(fee.priceWithheld).toBeNull();
  });
});

// The share beside its entity's loan, read by every reader that divides a
// price (research pass 23's case, carried to the readers): a 4.5% share at
// $1.8M beside a stated $56.5M loan on the entity, with 200 units and $5.0M
// of NOI, printed "$200k/unit" and a 12.5% cap — the equity's whole, $40.0M,
// divided as if it were the building's price, where the building's cost is
// that plus the loan. Where the loan is stated, no building figure is struck
// on the equity's whole, as none is on a note's price.
describe("a share beside the loan its entity carries: no building figure is struck on the equity's whole", () => {
  const share = interest({ kind: "partial_interest", share: "4.5% limited partnership interest" });
  const m = (label: string, value: string, page = "p. 2") => ({ label, value, flagged: false, page, basis: "na" as const });
  const LOAN = m("Entity loan balance", "$56,500,000", "p. 9");
  /** The recapitalization: the share, 200 units, $5.0M of NOI and the loan. */
  const recap = (extra: ExtractionResult["metrics"] = [], over: Partial<ExtractionResult> = {}, loan = true): ExtractionResult => ({
    dealName: "Harbor View Apartments",
    assetClass: "multifamily",
    market: "Baltimore, MD",
    interest: share,
    totalPages: 40,
    metrics: [
      m("Asking price", "$1,800,000"),
      m("Units", "200"),
      { label: "NOI (in-place)", value: "$5,000,000", flagged: false, page: "p. 9", basis: "in_place" },
      ...(loan ? [LOAN] : []),
      ...extra,
    ],
    ...over,
  });

  it("the building's price and the comps' subject basis answer nothing; without the loan the share grosses up as before", async () => {
    const { buildingPriceOf } = await import("./deal-strategy");
    const { subjectBasis } = await import("./comp-detail");
    const { screenYearOf } = await import("./criteria");
    expect(interestOf(recap()).entityLoan).toBe(56_500_000);
    expect(buildingPriceOf(recap(), 1_800_000)).toBeNull();
    const e = recap();
    expect(subjectBasis(e.metrics, "stabilized", screenYearOf(e), interestOf(e))).toEqual({ perUnit: null, perSf: null });
    // No loan stated: the whole the 4.5% implies, $40.0M, $200k a unit.
    const plain = recap([], {}, false);
    expect(interestOf(plain).entityLoan).toBeNull();
    expect(buildingPriceOf(plain, 1_800_000)).toBeCloseTo(40_000_000, 2);
    expect(subjectBasis(plain.metrics, "stabilized", screenYearOf(plain), interestOf(plain)).perUnit).toBe(200_000);
  });

  it("the pipeline card prints no basis, and the compare table and the Model tab withhold the cap, saying why", async () => {
    const { pickSlots } = await import("./pipeline-slots");
    const { compareInterest, modelReturnsRead } = await import("./compare-interest");
    expect(pickSlots(recap(), null).basis).toBeNull();
    expect(pickSlots(recap([], {}, false), null).basis).toBe("$200k/unit");
    // The model runs at the equity's whole (the owner's call); the table's
    // cap is struck on the building's price, which there is none of here.
    const model = { purchasePrice: 40_000_000, year1Noi: 5_000_000, goingInCapPct: 12.5 };
    expect(compareInterest(recap(), model)).toMatchObject({ cap: null, withheld: "share" });
    expect(compareInterest(recap([], {}, false), model)).toMatchObject({ cap: 12.5, withheld: null });
    expect(modelReturnsRead(recap(), model).line).toBe(
      "A share's price is for the share, and grossed up beside the loan its entity carries it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld.",
    );
  });

  it("the exit check sets no implied going-in cap against the equity's whole", async () => {
    const { impliedGoingInCap, dealGoingInCap } = await import("./model-vs-market");
    expect(impliedGoingInCap(recap())).toBeNull();
    expect(dealGoingInCap(recap())).toBeNull();
    expect(impliedGoingInCap(recap([], {}, false))).toEqual({ pct: 12.5, whole: true });
  });

  it("the internal comps, the market memory and the analytics pool no basis and no cap off it", async () => {
    const { deriveInternalComps } = await import("./internal-comps");
    const { buildComps } = await import("./market-memory");
    const { deriveAnalytics } = await import("./analytics");
    const row = (id: string, extraction: ExtractionResult) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      stage: "screening",
      verdict: { verdict: "pass" },
      extraction,
    });
    const withLoan = recap([m("Price per unit", "$9,000")]);
    const without = recap([m("Price per unit", "$9,000")], {}, false);
    const internal = Object.fromEntries(
      deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [row("loan", withLoan), row("plain", without)]).map((c) => [c.dealId, c]),
    );
    expect(internal.loan.priceLabel).toBe("$1.8M · 4.5% share");
    expect(internal.loan.basisLabel).toBeNull();
    expect(internal.plain.basisLabel).toBe("$200k/unit");
    const memory = Object.fromEntries(buildComps([row("loan", withLoan), row("plain", without)]).map((c) => [c.dealId, c]));
    expect(memory.loan?.perUnit ?? null).toBeNull();
    expect(memory.plain.perUnit).toBe(200_000);
    const charts = Object.fromEntries(deriveAnalytics([row("loan", withLoan), row("plain", without)]).map((d) => [d.id, d]));
    expect(charts.loan.perUnit).toBeNull();
    expect(charts.plain.perUnit).toBe(200_000);
  });

  it("a hotel's price a key, a student building's a bed and a park's a pad are blank", async () => {
    const { readHotelDeal } = await import("./hotel-deal");
    const { readStudentHousing } = await import("./student-housing");
    const { readManufacturedHousing } = await import("./manufactured-housing");
    const hotel = recap([m("Keys", "200"), m("PIP cost", "$4,200,000", "p. 6")], {
      assetClass: "hospitality_str",
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "unknown", pip: "", page: "p. 6" },
    });
    expect(readHotelDeal(hotel)!.pricePerKey).toBeNull();
    expect(readHotelDeal({ ...hotel, metrics: hotel.metrics.filter((r) => r !== LOAN) })!.pricePerKey).toBe(200_000);
    const student = recap([m("Beds", "400"), m("Pre-leased", "87% for Fall 2026")], { assetClass: "student_housing" });
    expect(readStudentHousing(student)!.pricePerBed).toBeNull();
    expect(readStudentHousing({ ...student, metrics: student.metrics.filter((r) => r !== LOAN) })!.pricePerBed).toBe(100_000);
    const park = recap([m("Pads", "200"), m("Lot rent", "$430 per month")], { assetClass: "manufactured_housing" });
    expect(readManufacturedHousing(park)!.pricePerPad).toBeNull();
    expect(readManufacturedHousing({ ...park, metrics: park.metrics.filter((r) => r !== LOAN) })!.pricePerPad).toBe(200_000);
  });

  it("the debt sizer seeds no price off the equity's whole", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DebtSizer } = await import("@/app/(app)/deals/[id]/debt-sizer");
    // The price field: its `value` renders after its label.
    const priceField = (e: ExtractionResult) =>
      /<input[^>]*aria-label="Purchase price"[^>]*value="([^"]*)"/.exec(renderToStaticMarkup(createElement(DebtSizer, { model: null, extraction: e })))?.[1];
    expect(priceField(recap())).toBe("");
    expect(priceField(recap([], {}, false))).toBe("$40,000,000");
  });

  it("the verdict's brief says there is no building basis, and why", async () => {
    const { buildBrief } = await import("./anthropic/verdict");
    const brief = (extraction: ExtractionResult) => buildBrief({ extraction, challenges: null, comps: null, reconciliation: null, market: null });
    expect(brief(recap())).toContain(
      "THE BUILDING'S BASIS: none — the share's price grossed up is the equity's whole, not the building's: the building's cost is that plus the entity's stated $56.5M loan, which the model does not add, so no price per unit or per SF and no cap is struck on it.",
    );
    expect(brief(recap([], {}, false))).toContain("THE BUILDING'S BASIS, computed in code: $200k/unit");
  });

  it("the plan shows the equity's whole with the loan beside it, and strikes no total cost or yield on cost, saying why", async () => {
    const { planSummary } = await import("./deal-strategy");
    const { planFacts } = await import("./plan-facts");
    const planDeal = (loan: boolean) =>
      recap(
        [
          m("Renovation budget", "$5,000,000", "p. 7"),
          { label: "NOI (stabilized, pro forma)", value: "$6,000,000", flagged: false, page: "p. 8", basis: "pro_forma" },
        ],
        { strategy: { kind: "value_add", summary: "Renovate 200 units", capitalBudget: "", timeline: "" } },
        loan,
      );
    const plan = (loan: boolean) => planSummary(planDeal(loan))!;
    const p = plan(true);
    // The price the plan builds on is the building's: none here. The figure
    // shown is the equity's whole.
    expect(p.price).toBeNull();
    expect(p.equityWhole).toBeCloseTo(40_000_000, 2);
    expect(p.priceLabel).toBe("Equity's whole, the share grossed up");
    expect(p.entityLoan).toBe(56_500_000);
    expect(p.budget?.budget).toBe(5_000_000);
    expect(p.totalCost).toBeNull();
    expect(p.yieldOnCost).toBeNull();
    expect(p.costPerUnit).toBeNull();
    expect(p.costWithheld).toBe(
      "No total cost or yield on cost is struck on the equity's whole: the building's cost is that plus the entity's $56.5M loan, which the model does not add.",
    );
    const facts = Object.fromEntries(planFacts(p));
    expect(facts["Equity's whole, the share grossed up"]).toBe("$40.0M, the entity's $56.5M loan on top");
    expect(facts["Total cost"]).toBe("—");
    expect(facts["Yield on cost"]).toBe("—");
    // The steps that read the deal context are told the same sentence.
    expect(dealContextFor(planDeal(true)) ?? "").toContain(p.costWithheld!);
    // …and so are the challenger's plan line and the verdict's basis line.
    const { plausibilityNote, inferStrategy: infer } = await import("./deal-strategy");
    expect(plausibilityNote([], infer(planDeal(true)), p, planDeal(true))).toContain(
      "; $5.0M (Renovation budget); no total cost or yield on cost is struck on the equity's whole: the building's cost is that plus the entity's $56.5M loan, which the model does not add; timeline",
    );
    const { buildBrief } = await import("./anthropic/verdict");
    expect(buildBrief({ extraction: planDeal(true), challenges: null, comps: null, reconciliation: null, market: null })).toContain(
      `THE BUILDING'S BASIS: on this value-add deal it is total cost. ${p.costWithheld}`,
    );
    // Without the loan the plan is exactly as before.
    const plain = plan(false);
    expect(plain.totalCost).toBeCloseTo(45_000_000, 2);
    expect(plain.costWithheld).toBeNull();
    expect(dealContextFor(planDeal(false)) ?? "").not.toContain("No total cost");
  });

  // A total the memorandum states all-in is its own figure, not one struck
  // on the equity's whole: it stands as the total cost, and nothing is taken
  // out of it — where the equity's whole had been subtracted from it as if
  // it were the building's price inside the total.
  it("a stated all-in total stands as the memorandum's own total cost, with nothing taken out of it", async () => {
    const { planSummary, plausibilityNote, inferStrategy: infer } = await import("./deal-strategy");
    const { planFacts } = await import("./plan-facts");
    const e = recap(
      [
        m("Total project cost", "$100,000,000", "p. 7"),
        { label: "NOI (stabilized, pro forma)", value: "$6,000,000", flagged: false, page: "p. 8", basis: "pro_forma" },
      ],
      { strategy: { kind: "value_add", summary: "Renovate 200 units", capitalBudget: "", timeline: "" } },
    );
    const p = planSummary(e)!;
    expect(p.equityWhole).toBeCloseTo(40_000_000, 2);
    expect(p.budget).toMatchObject({ budget: 100_000_000, allIn: false, isTotal: true });
    expect(p.totalCost).toBe(100_000_000);
    expect(p.yieldOnCost).toBeCloseTo(0.06, 10);
    expect(p.costWithheld).toBeNull();
    const facts = Object.fromEntries(planFacts(p));
    expect(facts["Equity's whole, the share grossed up"]).toBe("$40.0M, the entity's $56.5M loan on top");
    expect(facts.Budget).toBe("inside the stated total");
    expect(facts["Total cost"]).toBe("$100.0M");
    // The brief says why the acquisition inside the total is not separable,
    // and never that the memorandum states no price: it states the share's.
    const note = plausibilityNote([], infer(e), p, e);
    expect(note).toContain(
      "$100.0M all-in (Total project cost; the share's price grossed up is the equity's whole, not the building's, so the acquisition inside it is not separable)",
    );
    expect(note).not.toContain("the OM states no price");
  });
});
