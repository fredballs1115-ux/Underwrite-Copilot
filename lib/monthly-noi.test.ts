// Research pass 40, H1(a): an NOI the memorandum states a month at a time
// ("NOI (monthly) $85,000" against a $17,000,000 ask) was read as a year's
// $85,000 by every NOI reader: the plausibility check found a 0.50% cap and
// the page withheld the returns, while the report's base case and the
// workbook's tiles printed a 0.11x DSCR. A row whose words say a month is
// read as twelve times it now, by the rule lib/mixed-use reads a monthly
// income by (lib/stated-period), and the model's NOI note says so. Every
// name is invented.
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { misreadPageLine } from "@/lib/underwrite/report-grid";
import { assessPlausibility, classifyNoi, inferStrategy, noiFigures, noiOfRow, planSummary } from "@/lib/deal-strategy";
import { monthFigureOf, statedIncomeOf } from "@/lib/stated-period";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 3"): Row => ({ label, value, flagged: false, page });

// The pass's own fixture, row for row.
const MONTHLY: ExtractionResult = {
  dealName: "M",
  assetClass: "multifamily",
  market: "",
  address: "",
  metrics: [row("Asking price", "$17,000,000", "p. 2"), row("NOI (monthly)", "$85,000"), row("Units", "80", "p. 2")],
};

describe("an NOI stated a month at a time is read as the year it makes (research pass 40, H1(a))", () => {
  it("runs the pass's deal on $1,020,000, finds no misread, and says the month in the model's NOI note", () => {
    const findings = assessPlausibility(MONTHLY, inferStrategy(MONTHLY));
    // The page had withheld the returns: "NOI (monthly) of $85k implies a
    // 0.50% cap rate on the $17.0M price".
    expect(findings).toEqual([]);
    expect(misreadPageLine(findings, { maxBid: false })).toBeNull();
    const d = deriveUnderwriteInputs(MONTHLY, "x");
    const run = computeUnderwrite(d.inputs);
    expect(run.cashFlow[0].noi).toBeCloseTo(1_020_000, 4);
    expect(d.sources.inPlaceRentAnnual?.note).toBe(
      "Grossed up from the OM's NOI (monthly) — twelve times the $85,000 a month the OM states — at an assumed expense ratio",
    );
    // The coverage the report's base case printed as 0.11x is the year's.
    expect(run.cashFlow[0].dscrNoi!).toBeGreaterThan(1.3);
    expect(noiFigures(MONTHLY.metrics)).toEqual([{ kind: "year1", label: "NOI (monthly)", value: 1_020_000, page: "p. 3", month: 85_000 }]);
  });

  it("reads the month from the figure's own words or, where they state none, the label's", () => {
    for (const [label, value] of [
      ["NOI", "$85,000/mo"],
      ["NOI", "$85,000 per month"],
      ["NOI", "$85,000 monthly"],
      ["Monthly NOI", "$85,000"],
    ] as const) {
      expect(classifyNoi({ label, value }), label).toBe("year1");
      expect(noiOfRow({ label, value }), `${label}: ${value}`).toEqual({ value: 1_020_000, month: 85_000 });
    }
    // A loss stated a month at a time is a year's loss.
    expect(noiOfRow({ label: "NOI (monthly)", value: "($5,000)" })).toEqual({ value: -60_000, month: -5_000 });
  });

  it("reads the year where a row states both and they agree, and no figure where they do not", () => {
    expect(noiOfRow({ label: "NOI (monthly)", value: "$85,000 ($1,020,000 a year)" })).toEqual({ value: 1_020_000 });
    expect(noiOfRow({ label: "NOI", value: "$1,020,000 ($85,000/mo)" })).toEqual({ value: 1_020_000 });
    expect(monthFigureOf("NOI (monthly)", "$85,000 ($1,500,000 a year)")).toBe("disagree");
    expect(noiOfRow({ label: "NOI (monthly)", value: "$85,000 ($1,500,000 a year)" })).toBeNull();
    // The figure's own year words win over the label's month.
    expect(noiOfRow({ label: "NOI (monthly)", value: "$1,020,000 annually" })).toEqual({ value: 1_020_000 });
  });

  it("never annualises a figure whose words say no month", () => {
    expect(noiOfRow({ label: "NOI", value: "$85,000" })).toEqual({ value: 85_000 });
    expect(noiOfRow({ label: "NOI (in-place)", value: "$1,200,000 (T-12)" })).toEqual({ value: 1_200_000 });
    expect(noiOfRow({ label: "NOI (T-12, annualized from monthly statements)", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
    // A label whose month is a denominator stays no NOI at all, as before.
    expect(classifyNoi({ label: "NOI / month", value: "$85,000" })).toBeNull();
    expect(classifyNoi({ label: "NOI per unit per month", value: "$850" })).toBeNull();
  });

  it("reads a monthly label's T-12 or average as a month, and annualized words as a year (audit C4, M1 and L11)", () => {
    // A "T-12" or "trailing" beside the label's own month word is the
    // period the months were averaged over, not a year's figure.
    for (const [label, value] of [
      ["Average monthly NOI (T-12)", "$85,000"],
      ["NOI (T-12, monthly average)", "$85,000"],
      ["NOI", "$85,000/mo average"],
    ] as const) {
      expect(noiOfRow({ label, value }), `${label}: ${value}`).toEqual({ value: 1_020_000, month: 85_000 });
    }
    // The pass's own deal under the label the pass did not catch: no 0.50%
    // cap, and the model runs the year the month makes.
    const t12: ExtractionResult = {
      ...MONTHLY,
      metrics: [row("Asking price", "$17,000,000", "p. 2"), row("Average monthly NOI (T-12)", "$85,000"), row("Units", "80", "p. 2")],
    };
    expect(assessPlausibility(t12, inferStrategy(t12))).toEqual([]);
    expect(computeUnderwrite(deriveUnderwriteInputs(t12, "x").inputs).cashFlow[0].noi).toBeCloseTo(1_020_000, 4);
    // Annualized, or a total, in the label is the year's; so is
    // "annualized" in the figure's own words under a monthly label.
    expect(noiOfRow({ label: "NOI (T-12, annualized from monthly)", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
    expect(noiOfRow({ label: "Total NOI, T-12 (monthly statements)", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
    expect(noiOfRow({ label: "NOI (monthly)", value: "$1,020,000 annualized" })).toEqual({ value: 1_020_000 });
    // A bare T-12 with no month word stays the year it always was.
    expect(noiOfRow({ label: "NOI (T-12)", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
  });

  it("reads a total beside the label's month word, and an average under a monthly label, as a month (audit C6, MED-1)", () => {
    // "Total" names the building's figure, not a year: beside a month word
    // it is the month's total. An average under a label that already says
    // monthly is the building's average month, never one unit's.
    for (const [label, value] of [
      ["Total NOI (monthly)", "$85,000"],
      ["Total monthly NOI", "$85,000"],
      ["NOI (monthly)", "$85,000 average"],
    ] as const) {
      expect(noiOfRow({ label, value }), `${label}: ${value}`).toEqual({ value: 1_020_000, month: 85_000 });
      const deal: ExtractionResult = {
        ...MONTHLY,
        metrics: [row("Asking price", "$17,000,000", "p. 2"), row(label, value), row("Units", "100", "p. 2")],
      };
      // No 0.50% cap on the $17.0M price, and the model runs the year.
      expect(assessPlausibility(deal, inferStrategy(deal)), label).toEqual([]);
      expect(computeUnderwrite(deriveUnderwriteInputs(deal, "x").inputs).cashFlow[0].noi).toBeCloseTo(1_020_000, 4);
    }
    // A total with no month word, or beside "annual", stays the year.
    expect(noiOfRow({ label: "Total NOI", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
    expect(noiOfRow({ label: "Total annual NOI", value: "$1,020,000" })).toEqual({ value: 1_020_000 });
    // An average with no month word anywhere is still one unit's.
    expect(noiOfRow({ label: "NOI", value: "$850 average" })).toEqual({ value: 850 });
  });

  it("holds the plan to the same rule, and leaves a monthly income read as lib/mixed-use read it", () => {
    const conversion: ExtractionResult = {
      dealName: "C",
      assetClass: "multifamily",
      market: "",
      address: "",
      strategy: { kind: "conversion", summary: "Office to apartments", capitalBudget: "", timeline: "" },
      metrics: [row("Asking price", "$20,000,000"), row("Stabilized NOI (monthly)", "$200,000"), row("Conversion budget", "$15,000,000")],
    } as ExtractionResult;
    const plan = planSummary(conversion, inferStrategy(conversion))!;
    expect(plan.stabilizedNoi).toMatchObject({ value: 2_400_000, month: 200_000 });
    expect(plan.yieldOnCost!).toBeCloseTo(2_400_000 / 35_000_000, 10);
    expect(statedIncomeOf("$50,000 per month")).toEqual({ annual: 600_000, fromMonth: true });
    expect(statedIncomeOf("$1,100,000 per annum ($91,667/month)")).toEqual({ annual: 1_100_000, fromMonth: false });
  });
});
