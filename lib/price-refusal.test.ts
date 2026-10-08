// Research pass 38, item 3: a price row's value that is no price — a
// percentage, a share of a loan's balance, a figure per unit, per foot or
// per acre — read as the whole price had put a $6.25 ask on a 410,000 SF
// warehouse and a $75 one on a $20M note. The one price reader refuses it,
// the row stays in the key terms as written, and the deal reads as unpriced.
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { figureRange, findPriceRow, parsePrice, priceRange, priceRefusal } from "@/lib/criteria";
import { askingPriceOf, assessPlausibility, basisOutsideBand, inferStrategy, signalAskPrice } from "@/lib/deal-strategy";
import { keyTermRows } from "@/lib/key-terms";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { noteYieldSentence, readInterest } from "@/lib/interest";
import { basisTag, pickSlots } from "@/lib/pipeline-slots";
import { buildBrief } from "@/lib/anthropic/verdict";
import { dealContextFor } from "@/lib/deal-context";
import {
  ASOF,
  ex,
  m,
  notePctUpb,
  priceIsCap,
  pricePerAcreInValue,
  pricePerUnitInValue,
  pricePsfInValue,
  sandwich,
} from "@/lib/pass38.fixture";

describe("a price row's value that is no price (research pass 38)", () => {
  it("is refused by the one reader, with what it is instead", () => {
    const refused: [string, string][] = [
      ["6.25% cap rate", "a percentage"],
      ["~6.25% cap", "a percentage"],
      ["5.25% - 5.75% cap rate", "a percentage"],
      ["75% of UPB", "a percentage"],
      ["80 cents on the dollar", "a share of the loan's balance"],
      ["92 of par", "a share of the loan's balance"],
      ["6.5x EBITDA", "a multiple"],
      ["185,000 per unit", "a figure per unit, per foot or per acre"],
      ["$185k/door", "a figure per unit, per foot or per acre"],
      ["425/SF", "a figure per unit, per foot or per acre"],
      ["$425 PSF", "a figure per unit, per foot or per acre"],
      ["$425 per square foot", "a figure per unit, per foot or per acre"],
      ["1,850,000 per acre", "a figure per unit, per foot or per acre"],
      ["$1.2M each", "a figure per unit, per foot or per acre"],
      ["$185,000 – $195,000 per unit", "a figure per unit, per foot or per acre"],
      ["$480,000/yr", "a figure per year or per month"],
    ];
    for (const [raw, why] of refused) {
      expect(priceRefusal(raw), raw).toBe(why);
      expect(parsePrice(raw), raw).toBeNull();
      expect(priceRange(raw), raw).toBeNull();
    }
  });

  it("reads a dollar price with its cap, its share or its source in words after it, as before", () => {
    const priced: [string, number][] = [
      ["$42,000,000", 42e6],
      ["$42,000,000 (5.25% cap)", 42e6],
      ["$42M at a 5.25% cap", 42e6],
      ["$42,000,000 – 5.25% cap", 42e6],
      ["$42,000,000 / 5.25% cap rate", 42e6],
      ["$15,000,000 (75% of UPB)", 15e6],
      ["$42,000,000 ($233k/unit)", 42e6],
      ["$42,000,000 per the OM", 42e6],
      ["$42M per broker", 42e6],
      ["$4,250,000 per appraisal", 4.25e6],
      ["$40,000,000 to $42,000,000 per the OM", 42e6],
      ["$42,000,000 - $500,000 seller credit", 42e6],
      ["$42.5 million", 42.5e6],
    ];
    for (const [raw, n] of priced) {
      expect(priceRefusal(raw), raw).toBeNull();
      expect(parsePrice(raw), raw).toBe(n);
    }
    // A market lot rent's range is read by the generic range reader, whatever
    // it is counted per (lib/manufactured-housing).
    expect(figureRange("$500 – $550 per pad")).toEqual({ low: 500, high: 550 });
    expect(priceRange("$500 – $550 per pad")).toBeNull();
  });

  it("leaves the deal unpriced, the row in the key terms as written", () => {
    for (const deal of [priceIsCap, notePctUpb, pricePerUnitInValue, pricePsfInValue, pricePerAcreInValue]) {
      expect(askingPriceOf(deal), deal.dealName ?? "").toBeNull();
      const row = deal.metrics.find((r) => r.label === "Asking price")!;
      const strategy = inferStrategy(deal);
      expect(findPriceRow(deal.metrics, strategy.kind, 2026)?.value).toBe(row.value);
      const kt = keyTermRows(deal.metrics, strategy.kind, 2026, 10, deal.interest?.kind);
      expect(kt.find((r) => r.label === "Asking price")?.value, deal.dealName ?? "").toBe(row.value);
    }
    // A first signal's cap is no price for the slot either.
    expect(signalAskPrice({ askPrice: "6.25% cap rate" })).toBeNull();
    expect(signalAskPrice({ askPrice: "$42M" })).toBe("$42M");
  });

  it("yields to a development's land cost, as a word does", () => {
    const dev = [m("Asking price", "185,000 per unit"), m("Land cost", "$6,000,000"), m("Units (proposed)", "240")];
    expect(findPriceRow(dev, "development", 2026)?.value).toBe("$6,000,000");
  });

  it("strikes no finding on a price nobody stated — no 50000000% cap, no $0.00 per SF", () => {
    expect(assessPlausibility(priceIsCap)).toEqual([]);
    expect(assessPlausibility(pricePsfInValue)).toEqual([]);
  });

  it("names the row in the model's price note, which stays the placeholder's", () => {
    const d = deriveUnderwriteInputs(priceIsCap, "x");
    expect(d.sources.purchasePrice?.provenance).toBe("assumption");
    expect(d.sources.purchasePrice?.note).toBe(
      "The OM's asking price reads “6.25% cap rate” — a percentage, not a price; enter the purchase price",
    );
    expect(d.sources.inPlaceRentAnnual?.note).not.toContain("50000000%");
  });

  it("never says a note states no maturity where it states one", () => {
    // Unpriced by the refusal, the note reads no yield at all…
    expect(readInterest(notePctUpb, askingPriceOf(notePctUpb), ASOF)?.headline).not.toContain("no maturity");
    // …and where a price is stated that no yield solves on, it says why.
    const tiny = ex({ ...notePctUpb, metrics: notePctUpb.metrics.map((r) => (r.label === "Asking price" ? m("Asking price", "$75") : r)) });
    const read = readInterest(tiny, 75, ASOF)!;
    const sentence = noteYieldSentence(read.note!);
    expect(sentence).not.toContain("states no maturity");
    expect(sentence).toContain("no yield to its Mar 2028 maturity solves on the $75 price against the $20.0M balance");
  });
});

describe("the basis the card and the verdict hand on (research pass 38, C8, C9, C21)", () => {
  const basisOf = (deal: ExtractionResult) => {
    const brief = buildBrief({ extraction: deal, dealContext: dealContextFor(deal, null, null, null), assetClass: "auto" } as never);
    const at = brief.indexOf("THE BUILDING'S BASIS");
    const end = brief.indexOf("\n", at);
    return brief.slice(at, end < 0 ? undefined : end);
  };

  it("names a refused price row as written, and never tells the verdict to build on it", () => {
    expect(basisOf(priceIsCap)).toBe(
      "THE BUILDING'S BASIS: none — the OM's asking price reads “6.25% cap rate”, a percentage, not the price, so the deal reads as unpriced and no basis is computed from it.",
    );
    expect(basisOf(pricePerUnitInValue)).toContain("reads “185,000 per unit”, a figure per unit, per foot or per acre, not the price");
    expect(basisOf(pricePerUnitInValue)).not.toContain("Build the basis range");
    expect(basisTag(pricePerUnitInValue, "stabilized")).toBeNull();
  });

  it("hands on no basis the plausibility check finds outside the band, and never says a stated area is missing", () => {
    // A price in thousands: $240k over 120 units is $2k a unit.
    const thousands = ex({ assetClass: "Multifamily", dealName: "Cedar Flats", metrics: [m("Asking price", "240,000"), m("Units", "120"), m("NOI (in-place)", "1,380,000", "in_place")] });
    expect(assessPlausibility(thousands).some((f) => f.code === "basis_out_of_band")).toBe(true);
    expect(basisTag(thousands, "stabilized")).toBeNull();
    expect(pickSlots(thousands, null).basis ?? null).toBeNull();
    const line = basisOf(thousands);
    expect(line).toContain("none handed on");
    expect(line).not.toContain("Build the basis range");
    expect(line).not.toContain("$2k");
    // An office whose price is a tenth of a cent a foot states its area: the
    // line never says it does not.
    const office = ex({ assetClass: "Office", dealName: "Tower", metrics: [m("Asking price", "$6,250"), m("Total SF", "410,000 SF")] });
    expect(basisOf(office)).not.toContain("states no building area");
    expect(basisOf(office)).toContain("none handed on");
  });

  it("strikes no basis on a master lease of the building", () => {
    expect(basisTag(sandwich, "stabilized")).toBeNull();
    expect(basisOf(sandwich)).toContain("this sells a master lease of the building");
  });

  it("keeps a basis inside the band, and the band is the plausibility check's", () => {
    const fine = ex({ assetClass: "Multifamily", dealName: "Elm", metrics: [m("Asking price", "$22,200,000"), m("Units", "120"), m("NOI (in-place)", "1,380,000", "in_place")] });
    expect(basisTag(fine, "stabilized")).toBe("$185k/unit");
    expect(basisOf(fine)).toContain("Build the basis range on this figure");
    expect(basisOutsideBand(2_000, "unit", "multifamily")).toBe(true);
    expect(basisOutsideBand(185_000, "unit", "multifamily")).toBe(false);
    expect(basisOutsideBand(4_000, "sf", "data center")).toBe(false);
    expect(basisOutsideBand(4_000, "sf", "office")).toBe(true);
  });
});
