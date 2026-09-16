/**
 * The arithmetic an analyst does twenty times a day, before there is a deal
 * to screen.
 *
 * Pure, LLM-free, no I/O — the same rule every math layer here follows. The
 * deal page's debt sizer does this with an OM behind it; this module is the
 * napkin version, for the call where someone says "eight and a quarter, what
 * does that size to" and the answer is wanted before the call ends. That is
 * the whole point of it living here: an analyst who opens a spreadsheet for
 * this has left the site.
 *
 * TWO CONVENTIONS, both deliberate:
 *
 *  1. A RATE IS A PERCENT. `6.5` means 6.5%, because that is what a person
 *     types. The underwriting engine stores decimals (0.065) to match how
 *     Excel holds a percent-formatted cell; that is right for the engine and
 *     wrong for a keyboard, so every parameter here is named `…Pct` and the
 *     two conventions never meet in one function.
 *  2. A BLANK IS NULL, NEVER ZERO. An input nobody filled in is absent, and
 *     absent is a different claim from zero — a deal with no DSCR floor is
 *     not a deal with a DSCR floor of zero. Every function returns `null`
 *     rather than guessing, and a missing loan test is dropped rather than
 *     sized at nothing. This is the same rule the extraction layer holds to.
 */

/** A number we can actually compute with. */
function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Positive and finite — the shape a price, a size or a count has to have. */
function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

// ---------------------------------------------------------------------------
// The cap rate triangle: any two of NOI, price and cap give the third
// ---------------------------------------------------------------------------

/**
 * Cap rate as a percent.
 *
 * A negative NOI yields a negative cap, which is arithmetically honest and
 * the caller's to interpret — a building losing money has a cap rate, it is
 * just not one anybody quotes.
 */
export function capRatePct(noi: number | null, price: number | null): number | null {
  if (!real(noi) || !positive(price)) return null;
  return (noi / price) * 100;
}

/** What a stated NOI is worth at a stated cap. */
export function valueFromCap(noi: number | null, capPct: number | null): number | null {
  if (!positive(noi) || !positive(capPct)) return null;
  return noi / (capPct / 100);
}

/** The NOI a price implies at a stated cap. */
export function noiFromCap(price: number | null, capPct: number | null): number | null {
  if (!positive(price) || !positive(capPct)) return null;
  return price * (capPct / 100);
}

/** Price per unit, per square foot, per key — one function, any divisor. */
export function per(price: number | null, count: number | null): number | null {
  if (!real(price) || !positive(count)) return null;
  return price / count;
}

// ---------------------------------------------------------------------------
// Debt
// ---------------------------------------------------------------------------

/**
 * The mortgage constant: annual debt service per dollar of loan, as a
 * DECIMAL (0.0759 = 7.59 cents a year per dollar borrowed).
 *
 * Interest-only is the rate itself. A zero rate amortises principal only,
 * which is the mathematically correct limit and stops the standard formula
 * dividing by zero.
 */
export function loanConstant(
  ratePct: number | null,
  amortYears: number | null,
  io: boolean,
): number | null {
  if (!real(ratePct) || ratePct < 0) return null;
  if (io) return ratePct / 100;
  if (!positive(amortYears)) return null;
  const n = Math.round(amortYears * 12);
  if (n <= 0) return null;
  const r = ratePct / 100 / 12;
  if (r === 0) return 12 / n;
  return (12 * r) / (1 - Math.pow(1 + r, -n));
}

/** One lender test, and the loan it allows. */
export interface LoanTest {
  key: "ltv" | "dscr" | "debtYield";
  label: string;
  /** what the test was set to, in the unit the test is quoted in */
  setAt: string;
  maxLoan: number;
  /** the test that allowed the least, i.e. the one that actually governs */
  binding: boolean;
}

export interface SizingInputs {
  price: number | null;
  noi: number | null;
  ratePct: number | null;
  amortYears: number | null;
  io: boolean;
  /** each test applies only when it is set — a blank test is not a test */
  maxLtvPct: number | null;
  minDscr: number | null;
  minDebtYieldPct: number | null;
}

export interface Sizing {
  tests: LoanTest[];
  /** the least of the tests that were set; null when none were */
  loan: number | null;
  constant: number | null;
  equity: number | null;
  annualDebtService: number | null;
  /** what the loan actually lands at, once the binding test has spoken */
  ltvPct: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
}

/**
 * Size a loan against whichever of the three tests were set, and say which
 * one governs.
 *
 * The binding constraint is the answer an analyst is actually after. "It
 * sizes to $18.4M" is half a sentence; "it sizes to $18.4M and you are debt
 * yield constrained, not LTV" tells them what to negotiate.
 */
export function sizeLoan(inp: SizingInputs): Sizing {
  const constant = loanConstant(inp.ratePct, inp.amortYears, inp.io);
  const empty: Sizing = {
    tests: [],
    loan: null,
    constant,
    equity: null,
    annualDebtService: null,
    ltvPct: null,
    dscr: null,
    debtYieldPct: null,
  };

  const tests: Omit<LoanTest, "binding">[] = [];

  if (positive(inp.price) && positive(inp.maxLtvPct)) {
    tests.push({
      key: "ltv",
      label: "Loan to value",
      setAt: `${trim(inp.maxLtvPct)}%`,
      maxLoan: inp.price * (inp.maxLtvPct / 100),
    });
  }
  // Both coverage tests need a positive NOI: a building with no income
  // supports no debt on either test, and dividing by a negative would size
  // a negative loan, which is not a smaller loan — it is nonsense.
  if (positive(inp.noi) && positive(inp.minDscr) && positive(constant)) {
    tests.push({
      key: "dscr",
      label: "Debt service coverage",
      setAt: `${trim(inp.minDscr, 2)}x`,
      maxLoan: inp.noi / (inp.minDscr * constant),
    });
  }
  if (positive(inp.noi) && positive(inp.minDebtYieldPct)) {
    tests.push({
      key: "debtYield",
      label: "Debt yield",
      setAt: `${trim(inp.minDebtYieldPct)}%`,
      maxLoan: inp.noi / (inp.minDebtYieldPct / 100),
    });
  }

  if (tests.length === 0) return empty;

  const least = Math.min(...tests.map((t) => t.maxLoan));
  const withBinding: LoanTest[] = tests.map((t) => ({ ...t, binding: t.maxLoan === least }));
  const loan = least;

  return {
    tests: withBinding,
    loan,
    constant,
    equity: positive(inp.price) ? inp.price - loan : null,
    annualDebtService: real(constant) ? loan * constant : null,
    ltvPct: positive(inp.price) ? (loan / inp.price) * 100 : null,
    dscr: positive(constant) && positive(inp.noi) && loan > 0 ? inp.noi / (loan * constant) : null,
    debtYieldPct: positive(inp.noi) && loan > 0 ? (inp.noi / loan) * 100 : null,
  };
}

/**
 * The occupancy at which the building exactly covers its operating expenses
 * and its debt service, as a percent of gross potential rent.
 *
 * The number a lender asks for and a borrower should know before they are
 * asked: how far the building can fall before it stops paying its own way.
 * Above 100% means it does not cover at full occupancy, which is a real
 * answer and is returned rather than clamped.
 */
export function breakEvenOccupancyPct(
  grossPotentialRent: number | null,
  operatingExpenses: number | null,
  annualDebtService: number | null,
): number | null {
  if (!positive(grossPotentialRent)) return null;
  if (!real(operatingExpenses) || !real(annualDebtService)) return null;
  return ((operatingExpenses + annualDebtService) / grossPotentialRent) * 100;
}

// ---------------------------------------------------------------------------
// Building it rather than buying it
// ---------------------------------------------------------------------------

export interface CostStack {
  land: number | null;
  hardCost: number | null;
  softCost: number | null;
  /** contingency is quoted against hard cost, which is the convention */
  contingencyPct: number | null;
}

export interface YieldOnCost {
  totalCost: number | null;
  contingency: number | null;
  yieldOnCostPct: number | null;
  /** yield on cost less the exit cap, in basis points */
  spreadBps: number | null;
}

/**
 * What a plan deal earns on every dollar it will take to build, and how much
 * of a cushion that leaves over the cap it would sell at.
 *
 * The spread is the whole question on a development: build at a 6.5 and sell
 * at a 5.5 and the hundred basis points are the profit; build at a 5.6 and
 * there is no reason to take the risk. A plan deal has no going-in cap, which
 * is why this is the test it gets judged on instead.
 */
export function yieldOnCost(
  stack: CostStack,
  stabilizedNoi: number | null,
  exitCapPct: number | null,
): YieldOnCost {
  const contingency =
    positive(stack.hardCost) && positive(stack.contingencyPct)
      ? stack.hardCost * (stack.contingencyPct / 100)
      : null;

  const parts = [stack.land, stack.hardCost, stack.softCost, contingency].filter(real);
  // Nothing entered is not a project costing nothing.
  const totalCost = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;

  const yieldOnCostPct =
    positive(totalCost) && positive(stabilizedNoi) ? (stabilizedNoi / totalCost) * 100 : null;

  const spreadBps =
    real(yieldOnCostPct) && positive(exitCapPct)
      ? Math.round((yieldOnCostPct - exitCapPct) * 100)
      : null;

  return { totalCost, contingency, yieldOnCostPct, spreadBps };
}

// ---------------------------------------------------------------------------
// Rent, in whichever unit the other side of the table quotes it in
// ---------------------------------------------------------------------------

export interface RentQuote {
  perSfYear: number | null;
  perSfMonth: number | null;
  perUnitMonth: number | null;
  annualTotal: number | null;
}

/**
 * One rent, said four ways.
 *
 * Office and retail quote dollars per square foot per year, industrial per
 * square foot per month, multifamily per unit per month — and a comp set
 * routinely mixes them. Give this whichever one you have plus the size it is
 * quoted against, and it says the rest.
 */
export function rentQuote(input: {
  perSfYear?: number | null;
  perSfMonth?: number | null;
  perUnitMonth?: number | null;
  /** rentable area, for the two per-SF forms */
  sf?: number | null;
  /** unit count, for the per-unit form */
  units?: number | null;
}): RentQuote {
  const { sf = null, units = null } = input;

  // Settle on dollars per SF per year first; everything else follows from it.
  let perSfYear: number | null = null;
  if (positive(input.perSfYear)) perSfYear = input.perSfYear;
  else if (positive(input.perSfMonth)) perSfYear = input.perSfMonth * 12;
  else if (positive(input.perUnitMonth) && positive(units) && positive(sf)) {
    // Through the average unit, which is the only bridge between a per-unit
    // rent and a per-foot one.
    perSfYear = (input.perUnitMonth * units * 12) / sf;
  }

  if (!positive(perSfYear)) {
    // A per-unit rent with no area still says what the building collects.
    const annualOnly =
      positive(input.perUnitMonth) && positive(units) ? input.perUnitMonth * units * 12 : null;
    return {
      perSfYear: null,
      perSfMonth: null,
      perUnitMonth: positive(input.perUnitMonth) ? input.perUnitMonth : null,
      annualTotal: annualOnly,
    };
  }

  const annualTotal = positive(sf) ? perSfYear * sf : null;
  return {
    perSfYear,
    perSfMonth: perSfYear / 12,
    perUnitMonth: positive(units) && real(annualTotal) ? annualTotal / units / 12 : null,
    annualTotal,
  };
}

/**
 * A gross rent and a net rent are not comparable until the expenses are on
 * the same side. Given a net (NNN) rent and the expense load the tenant
 * carries, this is the gross-equivalent, and the other way round.
 */
export function grossFromNet(netPerSf: number | null, expensesPerSf: number | null): number | null {
  if (!positive(netPerSf) || !real(expensesPerSf)) return null;
  return netPerSf + expensesPerSf;
}

export function netFromGross(grossPerSf: number | null, expensesPerSf: number | null): number | null {
  if (!positive(grossPerSf) || !real(expensesPerSf)) return null;
  return grossPerSf - expensesPerSf;
}

// ---------------------------------------------------------------------------

/** Trim a rate for a label: 65 not 65.0, 1.25 not 1.3. */
function trim(n: number, places = 2): string {
  return Number(n.toFixed(places)).toString();
}
