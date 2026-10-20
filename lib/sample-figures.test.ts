// The sample deal's stress test, row by row, and the fixture's figures held
// to one another: the memorandum's tax bill is the T-12's tax line, its
// program's rents average the rent roll's, and the verdict's "breaks if"
// quotes the stress test's own re-run of the exit.
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL, SAMPLE_EXIT_RERUN } from "@/lib/sample-deal";
import { sampleStressTest } from "@/lib/sample-stress";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { readValueAdd } from "@/lib/value-add";
import { parseUsd } from "@/lib/money";

const metric = (label: string) => {
  const m = SAMPLE_DEAL.extraction.metrics.find((x) => x.label === label);
  if (!m) throw new Error(`no "${label}"`);
  return m;
};
const usd = (label: string) => parseUsd(metric(label).value)!;

describe("the sample's stress test", () => {
  const test = sampleStressTest({ today: "2026-10-20" });
  const row = (key: string) => test.rows.find((r) => r.key === key)!;
  const irr = (key: string) => {
    const i = row(key).impact;
    return i ? [Number(i.baseIrrPct!.toFixed(1)), Number(i.altIrrPct!.toFixed(1))] : null;
  };

  it("tests seven of its nine assumptions; the two unchecked are the loan rate no document states and a rent growth no figure was read for", () => {
    expect(test.impactsWithheld).toBeNull();
    expect(test.rows.map((r) => [r.key, r.verdict])).toEqual([
      ["basis", "stretched"],
      ["exit_cap", "stretched"],
      ["debt", "unchecked"],
      // 4.7% over the T-12, inside the band, but the re-run moves the
      // levered IRR 239 bps: never a holds.
      ["noi", "stretched"],
      ["vacancy", "unsupported"],
      ["rent_growth", "unchecked"],
      // The reset is conditional on the jurisdiction: stretched at most.
      ["taxes", "stretched"],
      ["insurance", "unsupported"],
      ["renovation_premium", "unsupported"],
    ]);
    expect(row("debt").unchecked).toBe("The OM states no loan rate.");
  });

  it("re-runs the engine one input apart on every row whose figure is a model input", () => {
    // At the one comp the comps step graded supports, The Brixton's $252k:
    // Parkside, graded favorable, leans the seller's way and is left out.
    expect(irr("basis")).toEqual([9.3, 13.6]);
    expect(irr("exit_cap")).toEqual([10.8, 9.3]);
    expect(irr("noi")).toEqual([11.7, 9.3]);
    // At the rent roll's 9.3% by count (225 of 248 doors): with no published
    // figure read, the documents decide the stabilized assumption, said so.
    expect(irr("vacancy")).toEqual([12.4, 9.1]);
    expect(row("vacancy").gap?.text).toBe(
      "The OM's 6.0% is 3.3 points under the evidence's 9.3%. No fresh published vacancy figure for this market could be held to the stabilized assumption, so the deal's own documents decide.",
    );
    expect(irr("taxes")).toEqual([9.3, 5.9]);
    expect(irr("insurance")).toEqual([9.3, 8.2]);
    // The premium is in none of the model's inputs: a gap, no re-run.
    expect(row("renovation_premium").impact).toBeNull();
    expect(row("renovation_premium").gap?.text).toBe(
      "The projected $200 is $60 a month (42.9%) over the achieved $140. An $18,000 door needs $82 a month to pay for itself at the model's 5.45% exit cap: the break-even, what the program needs, not evidence of what a door earns.",
    );
    // The break-even is said beside the row, never filed as its evidence.
    expect(row("renovation_premium").evidence.map((e) => e.kind)).not.toContain("rule_of_thumb");
  });

  it("strikes the taxes on the price at the rate the memorandum's own two figures imply, never a rate of its own", () => {
    const bill = usd("Real estate taxes (2026)");
    const assessed = usd("Assessed value (2026)");
    const price = usd("Asking price");
    const reset = Math.round((bill / assessed) * price);
    const taxes = row("taxes");
    expect(taxes.omSays.value).toBe(bill);
    expect(taxes.omSays.page).toBe(27);
    expect(taxes.evidence[0].value).toBe(reset);
    expect(taxes.gap?.value).toBe(reset - bill);
    // The step-up is past the unsupported threshold, yet the reset is the
    // jurisdiction's to make: the row reads stretched, and says the condition.
    expect((reset - bill) / reset).toBeGreaterThan(0.15);
    expect(taxes.verdict).toBe("stretched");
    expect(taxes.gap?.text).toMatch(/^If the sale resets the assessment to the price, the bill is/);
  });

  it("holds the pro forma's insurance to the T-12's line", () => {
    const t12 = SAMPLE_DEAL.t12.summary.opex.find((l) => l.key === "insurance")!.amount;
    expect(row("insurance").omSays.value).toBe(usd("Insurance (pro forma)"));
    expect(row("insurance").evidence[0].value).toBe(t12);
    expect(row("insurance").omSays.page).toBe(28);
  });

  it("quotes the stress test's own exit re-run in the verdict's breaks-if, never the first-draft model's", () => {
    const exit = row("exit_cap").impact!;
    expect(exit.omValue).toBeCloseTo(SAMPLE_EXIT_RERUN.omExitPct / 100, 10);
    expect(exit.altValue).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInExitPct / 100, 10);
    expect(exit.baseIrrPct!).toBeCloseTo(SAMPLE_EXIT_RERUN.omIrrPct, 2);
    expect(exit.altIrrPct!).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInIrrPct, 2);
    const killer = SAMPLE_DEAL.verdict.screen!.dealKillers.find((k) => k.lever === "exit")!;
    expect(killer.risk).toBe("At the 5.45% going-in cap, the stress test's IRR falls 10.8% to 9.3%.");
    expect(killer.risk.length).toBeLessThanOrEqual(72);
  });
});

describe("the sample's documents tie to one another", () => {
  it("the memorandum's 2026 tax bill is the T-12's tax line, and the T-12's lines sum to its total", () => {
    const t12 = SAMPLE_DEAL.t12.summary;
    expect(t12.opex.find((l) => l.key === "taxes")!.amount).toBe(usd("Real estate taxes (2026)"));
    expect(t12.opex.reduce((s, l) => s + l.amount, 0)).toBe(t12.totalOpex);
    expect(t12.egi! - t12.totalOpex!).toBe(t12.noi);
  });

  it("the program's doors are the building's, and its rents average the rent roll's in-place rent", () => {
    const r = readValueAdd(SAMPLE_DEAL.extraction)!;
    expect(r.doors! + r.renovated!).toBe(SAMPLE_DEAL.rentRoll.summary.unitCount);
    expect(r.premium).toBe(200);
    expect(r.achievedPremium).toBeLessThan(r.premium!);
    // The pro forma's premium over the in-place rent is the program's.
    const rent = (label: string) => Number(metric(label).value.replace(/[^\d.]/g, ""));
    expect(rent("Pro forma rent") - rent("Avg in-place rent")).toBe(r.premium);
    expect(r.renovatedRent! - r.classicRent!).toBe(r.premium);
    const blended = (r.doors! * r.classicRent! + r.renovated! * (r.classicRent! + r.achievedPremium!)) / (r.doors! + r.renovated!);
    expect(Math.abs(blended - SAMPLE_DEAL.rentRoll.summary.avgRentMonthly!)).toBeLessThan(2);
    // The renovated doors in place rent within $10 of the renovated lease comp.
    const comp = Number(SAMPLE_DEAL.comps.leaseComps[0].detail.match(/\$([\d,]+)/)![1].replace(/,/g, ""));
    expect(Math.abs(r.classicRent! + r.achievedPremium! - comp)).toBeLessThanOrEqual(10);
  });

  it("is read as stabilized, so the model carries none of the program and its capital line says the program is there", () => {
    const { inputs, sources } = sampleDerivedInputs();
    expect(inputs.capitalImprovementsYr1).toBe(0);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("assumption");
    expect(sources.capitalImprovementsYr1?.note).toMatch(/^Not charged — the OM states a renovation program \(192 doors × \$18,000 a door/);
  });

  it("the first-draft model's rate is a screening default, and its loan-to-value the memorandum's own p. 44 figure", () => {
    const rate = SAMPLE_DEAL.model.metrics.find((m) => m.key === "rate")!;
    expect(rate.authority).toBe("Screening default");
    expect(JSON.stringify(rate)).not.toMatch(/term sheet|quoted/i);
    const ltv = SAMPLE_DEAL.model.metrics.find((m) => m.key === "ltv")!;
    expect(ltv.sources).toEqual([{ doc: "OM", value: metric("Loan-to-value").value, locator: "p.44", basis: "pro forma" }]);
    expect(JSON.stringify(SAMPLE_DEAL.model.metrics)).not.toMatch(/term sheet/i);
  });

  it("names no trade the memorandum does not state, and the basis range's low end is its lowest clean trade", () => {
    // Every per-unit figure the comps step and the verdict's basis range
    // name is one of the memorandum's own sale comps (p. 14).
    const stated = SAMPLE_DEAL.comps.saleComps.map((c) => c.detail.match(/^\$(\d+)k\/unit/)![1]);
    const named = (s: string) => [...s.matchAll(/\$(\d+)k(?:\/unit| a unit)?/g)].map((m) => m[1]);
    const comps = [...SAMPLE_DEAL.comps.redFlags, SAMPLE_DEAL.comps.summary].join(" ");
    for (const k of named(comps).filter((k) => k !== "274")) expect(stated, `$${k}k`).toContain(k);
    const basis = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Basis / unit")!;
    const clean = SAMPLE_DEAL.comps.saleComps.filter((c) => c.support === "supports" || c.support === "favorable").map((c) => Number(c.detail.match(/^\$(\d+)k/)![1]));
    expect(basis.low).toBe(`$${Math.min(...clean)}k`);
    for (const k of named(`${basis.source}`)) expect(stated, `$${k}k`).toContain(k);
  });

  it("the first-draft model's reserve is a rule of thumb, never a lender's norm", () => {
    const reserve = SAMPLE_DEAL.model.metrics.find((m) => m.key === "capexReserve")!;
    expect(reserve.authority).toBe("Rule of thumb");
    expect(JSON.stringify(reserve) + SAMPLE_DEAL.model.summary).not.toMatch(/lender norm|lender's \$/i);
  });
});
