/**
 * The layers between the senior loan and the common equity.
 *
 * `sizeLoan` says how big the senior can be. `buildStack` (sources-uses)
 * says how much equity is left to write. `runWaterfall` says how that
 * equity's profit is split. Nothing until now priced what sits BETWEEN
 * them — the mezzanine loan and the preferred equity that most deals
 * actually get done with, and that a screening model usually collapses
 * into one blended cost.
 *
 * Collapsing it is the error, and it is an error that flatters. Five
 * rules, in the order they cost money.
 *
 *   1. **Leverage is tested at the MARGIN, never on the blend.** A layer
 *      helps the common equity if and only if its own rate is below the
 *      unlevered yield on cost. The blended rate can sit comfortably
 *      under that yield while a tranche inside the blend sits well over
 *      it — the senior is large and cheap and drags the average down. The
 *      seeded stack is exactly that case: a 6.13% blended cost against a
 *      6.5% yield on cost reads fine, and both layers above the senior
 *      are destroying equity value. `blendHidesIt` names it.
 *
 *   2. **Amortisation is not a cost, it is a transfer.** Test leverage on
 *      the RATE and size coverage on the CONSTANT. A 5% senior amortising
 *      over 30 years has a 6.44% constant; judging the loan on that
 *      constant against a 6.5% yield would call a plainly accretive loan
 *      marginal, because principal paid is equity bought, not money
 *      spent. The same 6.44% is exactly right for the DSCR, since it is
 *      what the lender is owed in cash.
 *
 *   3. **An accruing preferred flatters the current return and takes it
 *      back at the sale.** It costs no cash today, so it lifts
 *      cash-on-cash by removing equity while paying nothing — on the
 *      seeded deal the stack takes $900,000 a year out of cash flow and
 *      cash-on-cash still RISES, from 6.59% to 7.89%, because the equity
 *      base shrank by $18M. Meanwhile the pref compounds. That is why
 *      `cashOnCashSeniorOnlyPct` is drawn beside it: the ratio is the
 *      wrong test when the denominator is what moved.
 *
 *   4. **Compounding is its own cost.** An accrued balance grows on the
 *      accrued balance, so five years of an 11% pref is not five years of
 *      simple interest — `accrualCost` is the difference, $1,080,465 on
 *      the seeded deal, and it is a figure nobody computes.
 *
 *   5. **Three coverage ratios, not one.** The senior's DSCR is what the
 *      senior lender tests. Combined DSCR adds the mezzanine — and a deal
 *      at 1.68× on the senior can be 1.36× all-in, with an intercreditor
 *      that lets the mezzanine lender take the property. Fixed-charge
 *      coverage adds a current-pay preferred, which is not debt and so
 *      belongs in neither of the first two, but must still be paid.
 *
 * Equity is the plug here as it is in sources-uses: the common cheque is
 * what is left after the funded layers, and a stack larger than the cost
 * reports a NEGATIVE common equity rather than clamping to zero.
 *
 * Pure, no I/O.
 */

import { loanConstant } from "./deal-math";

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

export interface StackInputs {
  /** every dollar the deal needs — price, closing, capital, reserves */
  totalCost: number | null;
  /** year one's NOI, unlevered */
  noi: number | null;
  seniorAmount: number | null;
  seniorRatePct: number | null;
  /** null or 0 amortises nothing — an interest-only senior */
  seniorAmortYears: number | null;
  mezzAmount: number | null;
  /** mezzanine is interest-only in all but name; no amortisation input */
  mezzRatePct: number | null;
  prefAmount: number | null;
  prefRatePct: number | null;
  /** true: compounds to the sale and pays nothing now */
  prefAccrues: boolean;
  /** how long the accrual runs */
  holdYears: number | null;
  /** what the common equity needs, for the WACC */
  targetEquityReturnPct: number | null;
}

export interface StackLayer {
  key: "senior" | "mezz" | "pref" | "common";
  label: string;
  amount: number;
  /** of total cost */
  sharePct: number;
  /** cumulative cost covered through the top of this layer */
  throughPct: number;
  /** its annual cost, as a rate */
  ratePct: number | null;
  /** cash it takes each year per dollar — zero for an accruing preferred */
  constantPct: number | null;
  /** cash it takes each year */
  annualCash: number | null;
  /**
   * Its own rate against the unlevered yield on cost (rule 1). Null for
   * the common equity, which is the thing being helped or hurt, and for
   * a layer with no rate stated.
   */
  accretive: boolean | null;
}

export interface CapitalStackRead {
  layers: StackLayer[];
  /** what is left to write — negative when the stack exceeds the cost */
  commonEquity: number | null;
  yieldOnCostPct: number | null;
  /** dollar-weighted over the funded layers above the common equity */
  blendedRatePct: number | null;
  /** the same with the common equity at its target — the deal's WACC */
  waccPct: number | null;
  seniorDebtService: number | null;
  seniorDscr: number | null;
  /** senior and mezzanine — what the lenders test */
  combinedDebtService: number | null;
  combinedDscr: number | null;
  /** everything that must be paid in cash, preferred included */
  fixedCharges: number | null;
  fixedChargeCoverage: number | null;
  cashFlowAfterDebt: number | null;
  cashOnCashPct: number | null;
  /** the same deal with the senior alone — rule 3's comparison */
  cashOnCashSeniorOnlyPct: number | null;
  /** an accruing preferred's balance when the building is sold */
  prefBalanceAtExit: number | null;
  prefAccrued: number | null;
  /** what compounding cost over paying the same rate current (rule 4) */
  accrualCost: number | null;
  /** the labels of every layer whose own rate is above the yield on cost */
  dilutive: string[];
  /** the blend is under the yield and a layer inside it is over (rule 1) */
  blendHidesIt: boolean;
  note: string;
}

const EMPTY: CapitalStackRead = {
  layers: [],
  commonEquity: null,
  yieldOnCostPct: null,
  blendedRatePct: null,
  waccPct: null,
  seniorDebtService: null,
  seniorDscr: null,
  combinedDebtService: null,
  combinedDscr: null,
  fixedCharges: null,
  fixedChargeCoverage: null,
  cashFlowAfterDebt: null,
  cashOnCashPct: null,
  cashOnCashSeniorOnlyPct: null,
  prefBalanceAtExit: null,
  prefAccrued: null,
  accrualCost: null,
  dilutive: [],
  blendHidesIt: false,
  note: "",
};

export function readStack(input: StackInputs): CapitalStackRead {
  const {
    totalCost,
    noi,
    seniorAmount,
    seniorRatePct,
    seniorAmortYears,
    mezzAmount,
    mezzRatePct,
    prefAmount,
    prefRatePct,
    prefAccrues,
    holdYears,
    targetEquityReturnPct,
  } = input;

  if (!positive(totalCost)) {
    return { ...EMPTY, note: "Enter what the deal costs, all in." };
  }

  const senior = positive(seniorAmount) ? seniorAmount : 0;
  const mezz = positive(mezzAmount) ? mezzAmount : 0;
  const pref = positive(prefAmount) ? prefAmount : 0;
  const commonEquity = round(totalCost - senior - mezz - pref);

  const yieldOnCostPct = positive(noi) ? round((noi / totalCost) * 100, 2) : null;

  // Rule 2: the constant carries amortisation, the rate does not.
  const seniorK = loanConstant(
    seniorRatePct,
    seniorAmortYears,
    !positive(seniorAmortYears),
  );
  const seniorDebtService = senior > 0 && seniorK !== null ? round(senior * seniorK) : null;
  const mezzCash = mezz > 0 && real(mezzRatePct) ? round(mezz * (mezzRatePct / 100)) : null;
  const prefCash =
    pref > 0 && real(prefRatePct) && !prefAccrues
      ? round(pref * (prefRatePct / 100))
      : pref > 0 && prefAccrues
        ? 0
        : null;

  const layers: StackLayer[] = [];
  let through = 0;
  const add = (
    key: StackLayer["key"],
    label: string,
    amount: number,
    ratePct: number | null,
    constantPct: number | null,
    annualCash: number | null,
  ) => {
    if (amount === 0 && key !== "common") return;
    through += amount;
    layers.push({
      key,
      label,
      amount: round(amount),
      sharePct: round((amount / totalCost) * 100, 1),
      throughPct: round((through / totalCost) * 100, 1),
      ratePct: real(ratePct) ? round(ratePct, 2) : null,
      constantPct: real(constantPct) ? round(constantPct * 100, 2) : null,
      annualCash,
      // Rule 1 and rule 2 together: the test is the RATE, and the common
      // equity is what the test is about rather than a subject of it.
      accretive:
        key === "common" || yieldOnCostPct === null || !real(ratePct)
          ? null
          : ratePct < yieldOnCostPct,
    });
  };

  add("senior", "Senior loan", senior, seniorRatePct, seniorK, seniorDebtService);
  add(
    "mezz",
    "Mezzanine",
    mezz,
    real(mezzRatePct) ? mezzRatePct : null,
    real(mezzRatePct) ? mezzRatePct / 100 : null,
    mezzCash,
  );
  add(
    "pref",
    prefAccrues ? "Preferred (accruing)" : "Preferred (current pay)",
    pref,
    real(prefRatePct) ? prefRatePct : null,
    real(prefRatePct) ? (prefAccrues ? 0 : prefRatePct / 100) : null,
    prefCash,
  );
  add(
    "common",
    "Common equity",
    commonEquity,
    real(targetEquityReturnPct) ? targetEquityReturnPct : null,
    null,
    null,
  );

  // Dollar-weighted, over the funded layers only. A layer with no rate
  // stated is left out of both sides rather than counted at zero — a
  // blank is null, never zero.
  let rated = 0;
  let weighted = 0;
  const weigh = (amount: number, ratePct: number | null | undefined) => {
    if (amount > 0 && real(ratePct)) {
      rated += amount;
      weighted += amount * ratePct;
    }
  };
  weigh(senior, seniorRatePct);
  weigh(mezz, mezzRatePct);
  weigh(pref, prefRatePct);
  const blendedRatePct = rated > 0 ? round(weighted / rated, 2) : null;

  let waccPct: number | null = null;
  if (rated > 0 && real(targetEquityReturnPct) && commonEquity > 0) {
    waccPct = round(
      (weighted + commonEquity * targetEquityReturnPct) / (rated + commonEquity),
      2,
    );
  }

  const seniorDscr =
    positive(noi) && positive(seniorDebtService)
      ? round(noi / seniorDebtService, 2)
      : null;

  const combinedDebtService =
    seniorDebtService === null && mezzCash === null
      ? null
      : round((seniorDebtService ?? 0) + (mezzCash ?? 0));
  const combinedDscr =
    positive(noi) && positive(combinedDebtService)
      ? round(noi / combinedDebtService, 2)
      : null;

  const fixedCharges =
    combinedDebtService === null ? null : round(combinedDebtService + (prefCash ?? 0));
  const fixedChargeCoverage =
    positive(noi) && positive(fixedCharges) ? round(noi / fixedCharges, 2) : null;

  const cashFlowAfterDebt =
    positive(noi) && fixedCharges !== null ? round(noi - fixedCharges) : null;
  const cashOnCashPct =
    cashFlowAfterDebt !== null && commonEquity > 0
      ? round((cashFlowAfterDebt / commonEquity) * 100, 2)
      : null;

  // Rule 3's comparison: the same building, the senior alone, the whole
  // rest of the stack written as common equity.
  const equitySeniorOnly = round(totalCost - senior);
  const cashOnCashSeniorOnlyPct =
    positive(noi) && seniorDebtService !== null && equitySeniorOnly > 0
      ? round(((noi - seniorDebtService) / equitySeniorOnly) * 100, 2)
      : null;

  let prefBalanceAtExit: number | null = null;
  let prefAccrued: number | null = null;
  let accrualCost: number | null = null;
  if (pref > 0 && real(prefRatePct) && prefAccrues && positive(holdYears)) {
    const balance = pref * Math.pow(1 + prefRatePct / 100, holdYears);
    prefBalanceAtExit = round(balance);
    prefAccrued = round(balance - pref);
    // Rule 4: what the compounding itself cost, over paying the same
    // rate in cash each year.
    accrualCost = round(prefAccrued - pref * (prefRatePct / 100) * holdYears);
  }

  const dilutive = layers.filter((l) => l.accretive === false).map((l) => l.label);
  const blendHidesIt =
    blendedRatePct !== null &&
    yieldOnCostPct !== null &&
    blendedRatePct < yieldOnCostPct &&
    dilutive.length > 0;

  const notes: string[] = [];
  if (commonEquity < 0) {
    notes.push(
      `The funded layers come to ${round(-commonEquity)} dollars MORE than the deal costs. ` +
        "That is not a stack; one of the layers is oversized.",
    );
  }
  if (yieldOnCostPct === null) {
    notes.push("Enter year one's NOI to test whether each layer earns its place.");
  } else if (blendHidesIt) {
    notes.push(
      `The blended cost of ${blendedRatePct}% sits under the ${yieldOnCostPct}% yield on cost, ` +
        `which reads fine — but ${dilutive.join(" and ")} ${dilutive.length > 1 ? "cost" : "costs"} ` +
        "more than the building earns. The blend is hiding it: leverage is tested layer by layer, " +
        "not on the average.",
    );
  } else if (dilutive.length > 0) {
    notes.push(
      `${dilutive.join(" and ")} ${dilutive.length > 1 ? "cost" : "costs"} more than the ` +
        `${yieldOnCostPct}% the building earns, so ${dilutive.length > 1 ? "they take" : "it takes"} ` +
        "from the common equity rather than adding to it.",
    );
  } else if (layers.some((l) => l.accretive === true)) {
    notes.push(
      `Every funded layer costs less than the ${yieldOnCostPct}% yield on cost, so each one ` +
        "lifts the return on the common equity.",
    );
  }
  if (
    cashOnCashPct !== null &&
    cashOnCashSeniorOnlyPct !== null &&
    cashOnCashPct > cashOnCashSeniorOnlyPct &&
    dilutive.length > 0
  ) {
    notes.push(
      `Cash-on-cash still reads higher than the ${cashOnCashSeniorOnlyPct}% the senior alone would ` +
        "give, because the layers took equity out of the denominator. The ratio is not the test here.",
    );
  }
  if (prefAccrued !== null && accrualCost !== null) {
    notes.push(
      `The preferred pays nothing now and is owed ${prefBalanceAtExit} at the sale — ` +
        `${prefAccrued} of accrual, of which ${accrualCost} is the compounding alone.`,
    );
  }
  if (combinedDscr !== null && seniorDscr !== null && combinedDscr < seniorDscr) {
    notes.push(
      `Coverage is ${seniorDscr}x on the senior and ${combinedDscr}x once the mezzanine is counted, ` +
        "which is the ratio that decides who can take the property.",
    );
  }

  return {
    layers,
    commonEquity,
    yieldOnCostPct,
    blendedRatePct,
    waccPct,
    seniorDebtService,
    seniorDscr,
    combinedDebtService,
    combinedDscr,
    fixedCharges,
    fixedChargeCoverage,
    cashFlowAfterDebt,
    cashOnCashPct,
    cashOnCashSeniorOnlyPct,
    prefBalanceAtExit,
    prefAccrued,
    accrualCost,
    dilutive,
    blendHidesIt,
    note: notes.join(" "),
  };
}
