import { describe, expect, it } from "vitest";
import type { ExtractedInterest, ExtractionResult } from "@/lib/anthropic/types";
import {
  INTEREST_LABEL,
  interestContextLine,
  interestNote,
  interestOf,
  interestShortLine,
  parseSharePct,
  readInterest,
} from "./interest";
import { askingPriceOf, assessPlausibility } from "./deal-strategy";
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
    expect(part.headline).toContain("Part of the site sits on a ground lease");
    expect(part.modelCaveat).toBeNull();
    expect(interestShortLine(part)).toBe("Fee simple, with a ground lease under part of the site");
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
  });
});
