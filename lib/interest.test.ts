import { describe, expect, it } from "vitest";
import type { ExtractedInterest, ExtractionResult } from "@/lib/anthropic/types";
import {
  INTEREST_LABEL,
  groundRentOf,
  incomeBeforeGroundRentOf,
  interestContextLine,
  interestNote,
  interestOf,
  interestShortLine,
  parseSharePct,
  readInterest,
} from "./interest";
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
    expect(parseSharePct("100% of the membership interests")).toBeNull();
    expect(parseSharePct("the majority interest")).toBeNull();
    expect(parseSharePct("")).toBeNull();
    expect(parseSharePct(undefined)).toBeNull();
  });

  it("interestOf reads an older extraction as fee simple, and a share only on a partial interest", () => {
    expect(interestOf(ex(undefined))).toEqual({ kind: "fee_simple", sharePct: null });
    expect(interestOf(null)).toEqual({ kind: "fee_simple", sharePct: null });
    expect(interestOf(ex(interest({ kind: "partial_interest", share: "49% LP interest" })))).toEqual({ kind: "partial_interest", sharePct: 49 });
    expect(interestOf(ex(interest({ kind: "note", share: "49%" })))).toEqual({ kind: "note", sharePct: null });
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

describe("the comps' subject basis reads what the price buys", () => {
  it("grosses a share up to the whole's per-unit basis, and draws no subject tick on a note", async () => {
    const { subjectBasis } = await import("./comp-detail");
    const metrics = ex(undefined).metrics;
    // $20M over 240 units is $83,333 a unit on a fee simple…
    expect(subjectBasis(metrics, "stabilized").perUnit).toBe(83_333);
    // …and $170,068 on the whole a 49% share implies.
    expect(subjectBasis(metrics, "stabilized", { kind: "partial_interest", sharePct: 49 }).perUnit).toBe(170_068);
    expect(subjectBasis(metrics, "stabilized", { kind: "partial_interest", sharePct: null }).perUnit).toBeNull();
    expect(subjectBasis(metrics, "stabilized", { kind: "note", sharePct: null })).toEqual({ perUnit: null, perSf: null });
    // A leased fee's price buys the land alone: no building basis to draw.
    expect(subjectBasis(metrics, "stabilized", { kind: "leased_fee", sharePct: null })).toEqual({ perUnit: null, perSf: null });
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
