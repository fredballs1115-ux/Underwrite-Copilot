/**
 * The 1031 exchange: what actually gets deferred, and what does not.
 *
 * The card beside this one prices the tax bill at a sale. This one answers
 * the question that immediately follows it — "what if I roll it into the
 * next deal instead" — and it is on the page because the arithmetic has
 * three rules that reverse an answer rather than merely shading it.
 *
 *   1. **Debt relief is boot.** The rule everyone knows is "reinvest all
 *      the cash". The rule that catches people is the other half: coming
 *      down on the MORTGAGE is taxable too, even when every dollar of cash
 *      proceeds goes into the replacement. Sell a $10M building carrying
 *      $6M and buy a $9M one carrying $4M, and the $2M of debt you walked
 *      away from is boot — there is a tax bill on an exchange where no cash
 *      was ever touched.
 *
 *   2. **Trading UP in price does not cure cash boot.** Net debt relief can
 *      be offset by cash you add to the replacement; cash you pocket can
 *      NOT be offset by borrowing more. The two run one way only, which is
 *      why an exchange can clear the price test comfortably and still
 *      recognise gain. A tool that tests only the price says "fully
 *      deferred" on a deal that owes tax.
 *
 *   3. **Deferred is not forgiven.** The replacement's basis is its price
 *      LESS the gain rolled into it, not its price — so the depreciation on
 *      the new building is computed on the old basis, and the gain is still
 *      there waiting at the next sale. What an exchange buys is time and
 *      the use of the money in between, which is real and is not the same
 *      thing as a saving.
 *
 * The clock has its own trap. The 45 days to identify and the 180 days to
 * close both run from the SAME day — the transfer of the relinquished
 * property — so the 180 is not "45 plus another 180". And the 180 days are
 * cut short by the due date of that year's tax return: a deal closing in
 * the last quarter can lose weeks off the back of its window unless the
 * return is extended, which is the one date on this card that a Q4 seller
 * has to act on.
 *
 * Screening arithmetic, federal only. Two rates rather than the three the
 * after-tax card uses: since the 2017 Act only REAL property is like-kind,
 * so personal property carved out by a cost segregation study is a taxable
 * disposition on its own and is not modelled here. No state tax, no net
 * investment income tax, no related-party rules, no partial-year
 * apportionment. Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function pctOf(n: number, pct: number): number {
  return n * (pct / 100);
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

/** The two windows, both measured from the day the old property transfers. */
export const IDENTIFY_DAYS = 45;
export const EXCHANGE_DAYS = 180;

export interface ExchangeTerms {
  /** what the relinquished property sells for */
  salePrice: number | null;
  /** commissions and closing costs on that sale */
  sellingCosts: number | null;
  /** its basis after every year of depreciation — price less what was written off */
  adjustedBasis: number | null;
  /** how much of that write-off was taken, so the recognised gain can be
   *  filled recapture-first */
  depreciationTaken: number | null;
  /** debt retired out of the sale */
  mortgagePayoff: number | null;
  /** what the replacement property costs */
  replacementPrice: number | null;
  /** debt placed on the replacement */
  newMortgage: number | null;
  /** the day the relinquished property transfers, ISO yyyy-mm-dd */
  closing: string | null;
  /** the unrecaptured section 1250 rate, in % — 25% federal */
  recaptureRatePct: number | null;
  /** the long-term capital gains rate, in % */
  capGainsRatePct: number | null;
}

/** One of the three things an exchange has to do to defer the whole gain. */
export interface ExchangeTest {
  label: string;
  /** what the replacement side has to be at least */
  required: number;
  /** what it actually is */
  actual: number;
  met: boolean;
  /** how far short, zero when met */
  shortfall: number;
  note: string;
}

export interface ExchangeRead {
  /** sale price less the costs of selling */
  amountRealized: number | null;
  /** the whole gain, exchange or no exchange */
  realizedGain: number | null;
  /** cash in hand after the old loan is retired */
  netEquity: number | null;
  /** cash put into the replacement */
  equityReinvested: number | null;
  /** cash added over and above the proceeds — this is what offsets debt relief */
  addedCash: number | null;
  /** proceeds pocketed rather than reinvested */
  cashBoot: number | null;
  /** debt walked away from, net of any cash added */
  mortgageBoot: number | null;
  totalBoot: number | null;
  /** the gain that is taxed now — never more than the gain itself */
  recognizedGain: number | null;
  /** the gain rolled into the replacement */
  deferredGain: number | null;
  /** the replacement's price LESS the gain rolled in — not its price */
  newBasis: number | null;
  /** the bill on the recognised gain, filled recapture-first */
  tax: {
    unrecaptured1250: number;
    capitalGain: number;
    total: number;
  } | null;
  /** what a plain sale would have cost, for the comparison */
  taxIfSold: number | null;
  /** the difference — what the exchange actually bought */
  taxDeferred: number | null;
  /** the three tests, in the order they are read */
  tests: ExchangeTest[];
  /** the test that fails by the most, named — null when all three are met */
  binding: ExchangeTest | null;
  clock: {
    identifyBy: string;
    closeBy: string;
    /** 180 days out, before the return's due date is applied */
    fullCloseBy: string;
    /** the due date that can cut the window short */
    returnDueBy: string;
    /** true when the return's due date lands before the 180th day */
    cutShort: boolean;
    /** days actually available to close */
    closeDays: number;
  } | null;
  note: string | null;
}

const EMPTY: ExchangeRead = {
  amountRealized: null,
  realizedGain: null,
  netEquity: null,
  equityReinvested: null,
  addedCash: null,
  cashBoot: null,
  mortgageBoot: null,
  totalBoot: null,
  recognizedGain: null,
  deferredGain: null,
  newBasis: null,
  tax: null,
  taxIfSold: null,
  taxDeferred: null,
  tests: [],
  binding: null,
  clock: null,
  note: null,
};

/** An ISO date as a UTC day number, or null. Dates only — no clocks here. */
function day(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Guard a real calendar date: Date.parse takes 2026-02-31 and rolls it.
  const d = new Date(t);
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return Math.round(t / 86_400_000);
}

function iso(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The two deadlines an exchange runs on.
 *
 * Both measured from the transfer, not from each other. The 180-day window
 * is then capped by the due date of the return for the year the transfer
 * fell in — 15 April of the following year, for an individual filing on a
 * calendar year — because the replacement has to be acquired before that
 * return is filed. An extension restores the full 180 days, which is why a
 * Q4 exchange's first act is usually to file one.
 */
export function exchangeClock(closing: string | null): ExchangeRead["clock"] {
  const start = day(closing);
  if (start === null) return null;
  const identify = start + IDENTIFY_DAYS;
  const full = start + EXCHANGE_DAYS;
  const year = Number(closing!.slice(0, 4));
  const due = Math.round(Date.UTC(year + 1, 3, 15) / 86_400_000);
  const close = Math.min(full, due);
  return {
    identifyBy: iso(identify),
    closeBy: iso(close),
    fullCloseBy: iso(full),
    returnDueBy: iso(due),
    cutShort: due < full,
    closeDays: close - start,
  };
}

export function readExchange(t: ExchangeTerms): ExchangeRead {
  const clock = exchangeClock(t.closing);

  if (!positive(t.salePrice)) {
    return { ...EMPTY, clock, note: "Set what the property being sold is worth." };
  }
  if (!real(t.adjustedBasis) || t.adjustedBasis < 0) {
    return {
      ...EMPTY,
      clock,
      note: "Set the adjusted basis — the price you paid less every dollar of depreciation taken since.",
    };
  }

  const costs = real(t.sellingCosts) && t.sellingCosts > 0 ? t.sellingCosts : 0;
  const oldDebt = real(t.mortgagePayoff) && t.mortgagePayoff > 0 ? t.mortgagePayoff : 0;
  const newDebt = real(t.newMortgage) && t.newMortgage > 0 ? t.newMortgage : 0;

  const amountRealized = t.salePrice - costs;
  const realizedGain = amountRealized - t.adjustedBasis;
  const netEquity = amountRealized - oldDebt;

  if (!positive(t.replacementPrice)) {
    return {
      ...EMPTY,
      clock,
      amountRealized: round(amountRealized),
      realizedGain: round(realizedGain),
      netEquity: round(netEquity),
      note: "Set the replacement property's price to see what is actually deferred.",
    };
  }

  const equityReinvested = t.replacementPrice - newDebt;

  // RULE ONE and RULE TWO together, and the asymmetry is the whole point.
  //
  // Cash boot is proceeds NOT put back into the replacement. Mortgage boot
  // is debt walked away from — but it is offset by cash added over and
  // above the proceeds, because adding your own money to the replacement is
  // economically the same as replacing the loan. The offset runs one way
  // only: fresh borrowing does not cure cash you took off the table. So an
  // exchange can pass the price test and still recognise gain, which is the
  // trap this module exists to show.
  const cashBoot = Math.max(0, netEquity - equityReinvested);
  const addedCash = Math.max(0, equityReinvested - netEquity);
  const netDebtRelief = Math.max(0, oldDebt - newDebt);
  const mortgageBoot = Math.max(0, netDebtRelief - addedCash);
  const totalBoot = cashBoot + mortgageBoot;

  // Never more than there was to recognise. A property sold at a loss has
  // no gain for boot to reach, however the deal is structured.
  const recognizedGain = Math.max(0, Math.min(Math.max(0, realizedGain), totalBoot));
  const deferredGain = Math.max(0, realizedGain) - recognizedGain;

  // RULE THREE. The replacement takes the gain with it: its basis is what
  // it cost less what was rolled in. That is why the depreciation on the
  // new building is smaller than its price suggests, and why the gain is
  // still standing there at the next sale.
  const newBasis = t.replacementPrice - deferredGain;

  const recapRate = real(t.recaptureRatePct) ? t.recaptureRatePct : 25;
  const capRate = real(t.capGainsRatePct) ? t.capGainsRatePct : 20;
  const depreciation =
    real(t.depreciationTaken) && t.depreciationTaken > 0 ? t.depreciationTaken : 0;

  // Boot is taxed depreciation-recapture first, at the higher rate — so the
  // first dollars recognised are the expensive ones. Running boot at the
  // capital gains rate understates the bill on any property held long
  // enough to have depreciation worth recapturing.
  const taxOn = (gain: number) => {
    const unrecaptured1250 = Math.min(gain, depreciation);
    const capitalGain = gain - unrecaptured1250;
    return {
      unrecaptured1250: round(unrecaptured1250),
      capitalGain: round(capitalGain),
      total: round(pctOf(unrecaptured1250, recapRate) + pctOf(capitalGain, capRate)),
    };
  };

  const tax = taxOn(recognizedGain);
  const taxIfSold = taxOn(Math.max(0, realizedGain)).total;

  const tests: ExchangeTest[] = [
    {
      label: "Trade up in price",
      required: round(amountRealized),
      actual: round(t.replacementPrice),
      met: t.replacementPrice >= amountRealized - 0.5,
      shortfall: round(Math.max(0, amountRealized - t.replacementPrice)),
      note: "The replacement has to cost at least what this one realised, net of the costs of selling.",
    },
    {
      label: "Reinvest all the equity",
      required: round(Math.max(0, netEquity)),
      actual: round(equityReinvested),
      met: equityReinvested >= netEquity - 0.5,
      shortfall: round(cashBoot),
      note: "Every dollar of proceeds goes in. What you keep is cash boot, and nothing offsets it.",
    },
    {
      label: "Replace the debt",
      required: round(oldDebt),
      actual: round(newDebt + addedCash),
      met: newDebt + addedCash >= oldDebt - 0.5,
      shortfall: round(mortgageBoot),
      note: "New debt, or your own cash in its place. Coming down on the loan is taxable even when no cash is touched.",
    },
  ];

  const failed = tests.filter((x) => !x.met);
  const binding =
    failed.length === 0
      ? null
      : failed.reduce((worst, x) => (x.shortfall > worst.shortfall ? x : worst));

  let note: string | null = null;
  if (realizedGain <= 0) {
    note =
      "The sale is at or below the adjusted basis, so there is no gain to defer — an exchange has nothing to do here, and a loss is not recognised in one either.";
  } else if (cashBoot > 0 && tests[0].met) {
    // The headline trap, named only when it actually fires.
    note =
      "The replacement costs more than this property realised, and there is STILL boot: cash taken off the table is not cured by borrowing more on the other side.";
  }

  return {
    amountRealized: round(amountRealized),
    realizedGain: round(realizedGain),
    netEquity: round(netEquity),
    equityReinvested: round(equityReinvested),
    addedCash: round(addedCash),
    cashBoot: round(cashBoot),
    mortgageBoot: round(mortgageBoot),
    totalBoot: round(totalBoot),
    recognizedGain: round(recognizedGain),
    deferredGain: round(deferredGain),
    newBasis: round(newBasis),
    tax,
    taxIfSold: round(taxIfSold),
    taxDeferred: round(taxIfSold - tax.total),
    tests,
    binding,
    clock,
    note,
  };
}
