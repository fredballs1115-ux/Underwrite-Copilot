// The sample deal's stress test, row by row, and the fixture's figures held
// to one another: the memorandum's tax bill is the T-12's tax line, its
// program's rents average the rent roll's, and the verdict's "breaks if"
// quotes the stress test's own re-run of the exit.
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL, SAMPLE_EXIT_RERUN } from "@/lib/sample-deal";
import { sampleModelReads, sampleStressTest } from "@/lib/sample-stress";
import { computeUnderwrite } from "@/lib/underwrite/engine";
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
  // The engine run on the sample's own model with ONE input swapped — the
  // figures every re-run is held to, computed here, never typed (the model's
  // inputs move with its rules: the reserve, 2026-10-21).
  const { derived: model } = sampleModelReads({ today: "2026-10-20", reads: null });
  const engineAt = (input: string, value: number) => {
    const inputs = { ...model.inputs } as Record<string, unknown>;
    if (input === "expenseLines") {
      expect(model.inputs.expenseLines).toHaveLength(1);
      inputs.expenseLines = [{ ...model.inputs.expenseLines[0], annual: value }];
    } else inputs[input] = value;
    return Number((computeUnderwrite(inputs as unknown as typeof model.inputs).returns.leveredIrrPct! * 100).toFixed(1));
  };
  const rerun = (key: string) => {
    const i = row(key).impact!;
    return [engineAt(i.input, i.omValue), engineAt(i.input, i.altValue)];
  };
  const own = Number((computeUnderwrite(model.inputs).returns.leveredIrrPct! * 100).toFixed(1));

  it("tests six of its eleven assumptions, the vacancy holding on the class's norm; the five unchecked are a price two clean comps cannot set a median for, the loan rate no document states, a rent growth no figure was read for, a market rent its one lease comp, graded favorable, cannot decide, and the operating expenses it states no total for", () => {
    expect(test.impactsWithheld).toBeNull();
    expect(test.rows.map((r) => [r.key, r.verdict])).toEqual([
      // Two comps graded clean, The Brixton and Parkside: too few for a
      // median, so no verdict on the price (the review of 2026-10-23).
      ["basis", "unchecked"],
      // 20 bps under the OM's 5.45% going-in cap, the one figure that decides
      // (its 5.70% pro forma cap beside it, never deciding: a yield on price
      // that counts the OM's projected NOI growth, the second review of 2026-10-28).
      ["exit_cap", "stretched"],
      ["debt", "unchecked"],
      // 4.7% over the T-12, inside the band, but the re-run moves the
      // levered IRR 239 bps: never a holds.
      ["noi", "stretched"],
      // The pro forma's vacancy line is a stabilized figure: with no read,
      // the class's norm decides it (never the T-12, today's building).
      ["vacancy", "holds"],
      ["rent_growth", "unchecked"],
      // One lease comp, graded favorable: no median of three graded clean.
      ["market_rent", "unchecked"],
      // The reset is conditional on the jurisdiction: stretched at most.
      ["taxes", "stretched"],
      // The pro forma's premium sits under the seller's own T-12 premium:
      // the OM against its own building's history, the T-12's a working
      // floor and a rule of thumb, never a quote, so stretched at most (the
      // review of 2026-10-21).
      ["insurance", "stretched"],
      // The memorandum states no expense total or ratio: the T-12's lines
      // stand beside the row, and nothing is held to them.
      ["opex", "unchecked"],
      ["renovation_premium", "unsupported"],
    ]);
    expect(row("debt").unchecked).toBe("The OM states no loan rate.");
    expect(row("basis").unchecked).toBe(
      "Fewer than 3 of the memorandum's sale comps graded clean (comparable) state a figure /unit (2 of 3), and no recorded sales' median stands beside them, so no median is struck: the comps' own floor.",
    );
  });

  it("re-runs the engine one input apart on every row whose figure is a model input", () => {
    // Two comps graded clean are no median: the price is re-run on nothing.
    expect(row("basis").impact).toBeNull();
    // The exit at the OM's 5.45% going-in cap, the model's own exit.
    expect(irr("exit_cap")).toEqual(rerun("exit_cap"));
    expect(irr("exit_cap")![1]).toBe(own);
    expect(irr("noi")).toEqual(rerun("noi"));
    expect(irr("noi")![1]).toBe(own);
    // "Vacancy (pro forma)" is the pro forma's deduction from gross
    // potential rent, dollars, and a stabilized figure: with no published
    // figure read, the class's norm decides it, a rule of thumb; the T-12's
    // 9.1% is the building today, mid-renovation, beside it as today's gap,
    // never the test of the building stabilized (the review of 2026-10-23);
    // the rent roll's 9.3% by count (225 of 248 doors) is doors, beside it.
    const t12 = SAMPLE_DEAL.t12.summary;
    const t12Pct = ((t12.vacancyLoss! / (t12.collectedRent! + t12.vacancyLoss!)) * 100).toFixed(1);
    expect(irr("vacancy")).toEqual(rerun("vacancy"));
    expect(row("vacancy").measure).toBe("economic");
    expect(row("vacancy").ruleOfThumbOnly).toBe(true);
    expect(row("vacancy").gap?.text).toBe(
      `The OM's 6.0% is 1.0 point over the evidence's 5.0% — the conservative side. The OM's figure is its pro forma's vacancy line, a deduction from gross potential rent: dollars, not doors, and no fresh published vacancy figure for this market could be held to the stabilized assumption as a floor, so the class's norm decides; the deal's T-12 is the building today, never the test of a stabilized figure: the deal's T-12 ran ${t12Pct}% economic vacancy over its trailing year, 3.1 points over the assumption — the gap a lease-up has to close. The lease-up from today's ${t12Pct}% to the stabilized 6.0% is not modelled in either case: each runs its vacancy from year one. The deal's rent roll runs 9.3% vacant by its doors: the building today, which a lease-up starts from, so it is shown beside the stabilized assumption and never decides it. Against a rule of thumb only.`,
    );
    expect(irr("taxes")).toEqual(rerun("taxes"));
    expect(irr("taxes")![0]).toBe(own);
    expect(irr("taxes")![1]).toBeLessThan(own);
    // The premium is re-run at the seller's own T-12 premium, the floor a new
    // owner can expect: swapped into the model's expense line, which is the
    // T-12's and already carries it, so the evidence's run is the model's own.
    const ins = row("insurance").impact!;
    const premium = SAMPLE_DEAL.t12.summary.opex.find((l) => l.key === "insurance")!.amount;
    expect(ins.input).toBe("expenseLines");
    expect(ins.altValue - ins.omValue).toBeCloseTo(premium - usd("Insurance (pro forma)"), 6);
    const { derived } = sampleModelReads({ today: "2026-10-20", reads: null });
    expect(ins.altIrrPct!).toBeCloseTo(computeUnderwrite(derived.inputs).returns.leveredIrrPct! * 100, 9);
    expect(ins.baseIrrPct!).toBeGreaterThan(ins.altIrrPct!);
    expect(ins.note).toContain("the seller's actual $385k T-12 premium (the building's own history, not a new owner's quote)");
    expect(ins.note).not.toMatch(/rule of thumb|rarely/);
    // The premium is in none of the model's inputs: a gap, no re-run.
    expect(row("renovation_premium").impact).toBeNull();
    expect(row("renovation_premium").gap?.text).toBe(
      "The projected $200 is $60 a month (42.9%) over the achieved $140. An $18,000 door needs $82 a month to pay for itself at the model's 5.45% exit cap: the break-even, what the program needs, not evidence of what a door earns. At the achieved $140 the program still pays for itself: it clears the $82 break-even, so the gap is in how much it earns, not whether.",
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

  it("holds the pro forma's premium to the seller's own T-12 premium it sits under, a floor, never a quote", () => {
    const t12 = SAMPLE_DEAL.t12.summary.opex.find((l) => l.key === "insurance")!.amount;
    const om = usd("Insurance (pro forma)");
    expect(row("insurance").omSays.value).toBe(om);
    expect(row("insurance").evidence[0].value).toBe(t12);
    expect(row("insurance").decidedBy).toBe(0);
    expect(row("insurance").verdict).toBe("stretched");
    expect(row("insurance").gap).toMatchObject({ value: t12 - om, unit: "usd" });
    expect(row("insurance").gap!.text).toContain("A new owner's quote is what finally decides the premium, and none is on file");
    expect(row("insurance").omSays.page).toBe(28);
  });

  it("quotes the stress test's own exit re-run in the verdict's breaks-if, never the first-draft model's", () => {
    const exit = row("exit_cap").impact!;
    expect(exit.omValue).toBeCloseTo(SAMPLE_EXIT_RERUN.omExitPct / 100, 10);
    expect(exit.altValue).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInExitPct / 100, 10);
    expect(exit.baseIrrPct!).toBeCloseTo(SAMPLE_EXIT_RERUN.omIrrPct, 2);
    expect(exit.altIrrPct!).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInIrrPct, 2);
    // The model's own case, the exit at the going-in cap it runs: the row's
    // re-run is the model's own.
    expect(model.inputs.exitCapPct).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInExitPct / 100, 10);
    expect(computeUnderwrite(model.inputs).returns.leveredIrrPct! * 100).toBeCloseTo(SAMPLE_EXIT_RERUN.goingInIrrPct, 2);
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
    // The rate's note and the verdict's debt read say one schedule, the
    // model's own: 30 years amortizing from the first month, no IO.
    const { inputs } = sampleDerivedInputs();
    expect(inputs.ioMonths).toBe(0);
    expect(inputs.amortMonths).toBe(360);
    expect(rate.rationale).toContain("30-yr amortizing from the first month, no interest-only period");
    const debt = SAMPLE_DEAL.verdict.screen!.dealKillers.find((p) => p.lever === "debt")!;
    expect(debt.read).toContain("30-yr amortizing");
    expect(JSON.stringify(SAMPLE_DEAL)).not.toMatch(/after one IO year|one year of IO/i);
  });

  it("says the comps, the vacancy and the exit as the stress test reads them", () => {
    const test = sampleStressTest({ today: "2026-10-20" });
    const row = (key: string) => test.rows.find((r) => r.key === key)!;
    const { inputs } = sampleDerivedInputs();
    // The price: two comps graded `supports`, graded by comparability, never
    // by their price against the ask (Parkside, the closest and newest, had
    // been left out for trading richer than The Brixton — the review of
    // 2026-10-23); two are too few for a median, so the row stands unchecked
    // and the summary says the ask against each.
    const clean = SAMPLE_DEAL.comps.saleComps.filter((c) => c.support === "supports");
    expect(clean.map((c) => c.name)).toEqual(["The Brixton — 2.1 mi", "Parkside — 1.4 mi"]);
    expect(clean.map((c) => c.note).join(" ")).not.toMatch(/richer|leans the seller/);
    expect(row("basis").verdict).toBe("unchecked");
    expect(row("basis").evidence[0].text).toContain("two graded clean, too few for a median (3 or more)");
    const ask = usd("Asking price") / Number(metric("Units").value.replace(/[^\d]/g, ""));
    const over = (perUnit: number) => ((ask / perUnit - 1) * 100).toFixed(1);
    expect(SAMPLE_DEAL.comps.summary).toContain(`The $274k ask is ${over(252_000)}% over The Brixton's $252k a unit and ${over(261_000)}% over Parkside's $261k`);
    expect(SAMPLE_DEAL.comps.summary).toContain("too few for a median");
    const basis = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Basis / unit")!;
    expect([basis.low, basis.high]).toEqual(["$252k", "$261k"]);
    expect(basis.basis).toContain(`${over(261_000)}% over the closer, newer clean comp and ${over(252_000)}% over the other`);
    // The exit: the range's base is the exit the model runs, the going-in cap.
    const exit = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Exit cap")!;
    expect(exit.base).toBe(`${(inputs.exitCapPct * 100).toFixed(2)}%`);
    // The vacancy: the base is the building's in place, the figure the model
    // runs and the T-12's; the high, the rent roll's units empty.
    const vacancy = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Vacancy")!;
    const t12 = SAMPLE_DEAL.t12.summary;
    expect(vacancy.base).toBe(`${(inputs.vacancyPct * 100).toFixed(1)}%`);
    expect(vacancy.base).toBe(`${((t12.vacancyLoss! / (t12.collectedRent! + t12.vacancyLoss!)) * 100).toFixed(1)}%`);
    const roll = row("vacancy").evidence.find((e) => e.label === "The deal's rent roll: the occupancy it runs at")!;
    expect(roll.text.startsWith(`${vacancy.high} vacant (by count`)).toBe(true);
    // No next step asks for a re-run the model already makes.
    expect(SAMPLE_DEAL.verdict.nextSteps.join(" ")).not.toMatch(/re-run/i);
    // The scenarios are one set (audit of PR #482, L9c): the base case is the
    // model's own, its levered IRR the engine's at the going-in exit, which
    // the model runs; the conservative case is under it; the sponsor's says
    // the model's returns carry neither the OM's exit nor the premium.
    const scenario = (k: string) => SAMPLE_DEAL.verdict.screen!.sensitivity.find((x) => x.scenario === k)!;
    const modelIrr = (computeUnderwrite(inputs).returns.leveredIrrPct! * 100).toFixed(1);
    expect(modelIrr).toBe(SAMPLE_EXIT_RERUN.goingInIrrPct.toFixed(1));
    expect(scenario("base").note).toContain(`is a ${modelIrr}% levered IRR`);
    expect(scenario("base").note).toContain(`the T-12's ${vacancy.base} vacancy`);
    expect(scenario("conservative").note).toContain(`under the model's ${modelIrr}%`);
    expect(scenario("sponsor").note).toContain("the model's returns carry neither");
    // The premium is in none of the model's returns: no sentence says the
    // returns lean on it (M5).
    expect(SAMPLE_DEAL.verdict.reason).toContain("the pro forma's rents lean on an unproven $200 premium");
    expect(SAMPLE_DEAL.verdict.reason).not.toMatch(/returns lean/);
    // "Today" is the rent roll's; the T-12's 9.1% is a trailing year's (M6).
    const said = [...SAMPLE_DEAL.verdict.topRisks, ...SAMPLE_DEAL.verdict.nextSteps, ...SAMPLE_DEAL.market.checks.map((c) => c.note), ...SAMPLE_DEAL.challenges.challenges.map((c) => c.challenge), SAMPLE_DEAL.challenges.stressTest];
    const v = vacancy.base.replace(".", "\\.");
    for (const s of said) expect(s, s).not.toMatch(new RegExp(`runs ${v}|${v}(?: vacant)? (?:today|in place)`));
    // The tax reset is said as a condition, as the row says it.
    expect(SAMPLE_DEAL.verdict.topRisks.find((r) => r.includes("bill"))).toMatch(/^If the sale resets/);
  });

  it("names no trade the memorandum does not state, and the basis range's low end is the lower comp graded clean", () => {
    // Every per-unit figure the comps step and the verdict's basis range
    // name is one of the memorandum's own sale comps (p. 14).
    const stated = SAMPLE_DEAL.comps.saleComps.map((c) => c.detail.match(/^\$(\d+)k\/unit/)![1]);
    const named = (s: string) => [...s.matchAll(/\$(\d+)k(?:\/unit| a unit)?/g)].map((m) => m[1]);
    const comps = [...SAMPLE_DEAL.comps.redFlags, SAMPLE_DEAL.comps.summary].join(" ");
    for (const k of named(comps).filter((k) => k !== "274")) expect(stated, `$${k}k`).toContain(k);
    const basis = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Basis / unit")!;
    const clean = SAMPLE_DEAL.comps.saleComps.filter((c) => c.support === "supports").map((c) => Number(c.detail.match(/^\$(\d+)k/)![1]));
    expect(basis.low).toBe(`$${Math.min(...clean)}k`);
    for (const k of named(`${basis.source}`)) expect(stated, `$${k}k`).toContain(k);
  });

  it("lays the reconciliation's NOI gap on the vacancy gap that more than covers it, never on an expense load the OM does not state", () => {
    // The investor's walkthrough (2026-10-20): the row said "heavier expense
    // load" and the first-draft model's conflict "the OM understates the
    // expense load", while the memorandum states no expense total and the
    // 300 bps vacancy gap alone is worth more than the whole NOI gap.
    const rec = SAMPLE_DEAL.reconciliation;
    expect(rec.against).toBe("first_draft");
    const noiRow = rec.rows.find((r) => r.metric === "Year-1 NOI")!;
    const vacRow = rec.rows.find((r) => r.metric === "Vacancy")!;
    const noiGap = parseUsd(noiRow.omValue)! - parseUsd(noiRow.myValue)!;
    expect(noiGap).toBe(usd("NOI (pro forma)") - SAMPLE_DEAL.t12.summary.noi!);
    const m = SAMPLE_DEAL.model.inputs;
    const bps = Math.round((parseFloat(vacRow.myValue) - parseFloat(vacRow.omValue)) * 100);
    expect(parseFloat(vacRow.omValue)).toBe(parseFloat(metric("Vacancy (pro forma)").value));
    expect(parseFloat(vacRow.myValue)).toBe(m.vacancyPct);
    const vacancyUsd = (bps / 10_000) * m.year1Gpr;
    expect(vacancyUsd).toBeGreaterThan(noiGap);
    // The sentence's figures are those: the gap, the bps, the dollars, the rent.
    const said = `${bps} bps more vacancy, $${vacancyUsd.toLocaleString("en-US")} on $${(m.year1Gpr / 1e6).toFixed(2)}M of rent`;
    expect(said).toBe("300 bps more vacancy, $214,500 on $7.15M of rent");
    expect(noiRow.gap).toBe(`$${Math.round(noiGap / 1000)}k below the OM — the ${said}, more than covers it`);
    expect(rec.takeaway).toContain(`its ${said} more than covers the gap`);
    // No expense total is stated, so none is blamed.
    expect(SAMPLE_DEAL.extraction.metrics.some((x) => /expense|opex/i.test(x.label))).toBe(false);
    const year1 = SAMPLE_DEAL.model.metrics.find((x) => x.key === "year1Noi")!;
    for (const s of [noiRow.gap, rec.takeaway, year1.rationale]) expect(s, s).not.toMatch(/expense load/i);
    expect(rec.takeaway).toMatch(/^The first-draft model /);
  });

  it("the first-draft model's reserve is a rule of thumb, never a lender's norm", () => {
    const reserve = SAMPLE_DEAL.model.metrics.find((m) => m.key === "capexReserve")!;
    expect(reserve.authority).toBe("Rule of thumb");
    expect(JSON.stringify(reserve) + SAMPLE_DEAL.model.summary).not.toMatch(/lender norm|lender's \$/i);
  });
});
