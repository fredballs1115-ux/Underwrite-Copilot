/**
 * What the LP actually nets, once the sponsor has been paid.
 *
 * The IRR on the front of a syndication's offering deck is the PROPERTY's
 * return. It is not the return any investor in that offering receives, and
 * the gap between the two is not one number but two, from two different
 * causes that behave in opposite ways:
 *
 *   - the PROMOTE, which the sponsor earns only if the deal performs, and
 *   - the FEES, which it collects whether the deal performs or not.
 *
 * A screening tool that models only the waterfall — as `waterfall-math`
 * does — sees the first and is blind to the second, which is the wrong way
 * round: the promote is disclosed on its own page in every deck, and the
 * fees are three lines in the back of the document with no arithmetic
 * attached to them.
 *
 * Four rules, in the order they cost the LP money.
 *
 * Rule 1. AN ACQUISITION FEE IS PAID OUT OF THE EQUITY, AND IT IS QUOTED
 * AGAINST THE PRICE. Those are two different denominators, and the second
 * one is much larger than the cheque. A "1.5% acquisition fee" on a
 * leveraged deal is not 1.5% of what the LP wires — it is 1.5% of a price
 * three times the size of the equity, so it is closer to 4% or 5% of the
 * money at risk, taken on day one, before a dollar of rent is collected.
 * Both figures are reported, because only one of them appears in the deck.
 *
 * Rule 2. THE ASSET MANAGEMENT FEE'S BASE IS THE LEVER, AND THE DECK
 * OFTEN OMITS IT. "1.5% asset management fee" is a complete sentence in a
 * term sheet and an incomplete one in a model: 1.5% of invested equity and
 * 1.5% of effective gross revenue are different numbers on every deal, and
 * which one was meant moves the LP's return. Both are computed whenever
 * both bases are available, so the missing word is visible rather than
 * assumed.
 *
 * Rule 3. THE FEES ARE SENIOR TO THE PREFERRED RETURN. They come out of
 * the property's cash before the waterfall runs, so a deal that never
 * clears its pref — that pays its LP nothing above a return of capital —
 * still pays its sponsor in full. The seeded deal run weak (a 3.4% property
 * return) earns a promote of exactly ZERO and pays $1,581,250 of fees, so
 * 100% of the sponsor's compensation on a deal that failed its investors
 * is fee. That is the structural point, and it is not a stress case: it is
 * what the same three percentages do on a deal that merely did not work.
 *
 * Rule 4. THE FEE SHARE GROWS AS THE DEAL WEAKENS. The promote is a share
 * of the upside and shrinks with it; the fees are nearly fixed and do not.
 * So the sponsor's compensation gets MORE fee-weighted exactly as the LP's
 * return falls. On the seeded deal the fees are 47.6% of the sponsor's
 * take — just under half, which is why quoting only the base case
 * understates this — and an exit `DOWNSIDE_EXIT_HAIRCUT`% softer takes the
 * promote from $1,840,107 to $821,763 while the fees fall only $40,000,
 * putting the share at 66.5%. Both are drawn, because the movement between
 * them is the finding rather than either figure.
 *
 * The exit haircut is struck against the SALE PRICE, not against the final
 * cash flow: the final flow is net of the loan payoff, so on a leveraged
 * deal a 10% softer sale takes far more than 10% off the equity. On the
 * seed that is $4,000,000 off the sale against $2,150,000 off the flow —
 * nearly double — and it moves the property's return 20.63% → 13.49%.
 * Cutting the flow instead would understate the downside by exactly the
 * leverage, which is the amount that matters most.
 *
 * Pure, no I/O. The split itself is `waterfall-math`'s — this module adds
 * the fees around it and never re-implements the ladder.
 */

import { irr } from "@/lib/underwrite/engine";
import { runWaterfall, type Tier } from "@/lib/tools/waterfall-math";

/** how much softer the downside exit is, in % of the sale price — rule 4 */
export const DOWNSIDE_EXIT_HAIRCUT = 10;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

/** Which figure the asset management fee is charged against — rule 2. */
export type FeeBase = "equity" | "revenue";

export interface FeeTerms {
  /** the PROPERTY's cash flows, year 0 negative — the same column the
   *  cash-flow strip and the waterfall read, before any sponsor fee */
  cashFlows: number[];
  /** the LP's share of the equity cheque, 0–100 */
  lpEquityPct: number | null;
  /** the preferred return, as an IRR, in % */
  prefPct: number | null;
  /** the promote tiers above the pref, ascending by hurdle */
  tiers: Tier[];
  /** the purchase price — the acquisition fee's base, rule 1 */
  purchasePrice: number | null;
  /** the gross sale price — the disposition fee's base, and the figure the
   *  downside haircut is struck against */
  salePrice: number | null;
  /** the acquisition fee, in % of the price */
  acquisitionFeePct: number | null;
  /** the asset management fee, in % of whichever base */
  assetManagementFeePct: number | null;
  /** which base that percent is charged against — rule 2 */
  assetManagementBase: FeeBase;
  /** effective gross revenue, for the revenue base */
  effectiveGrossRevenue: number | null;
  /** the disposition fee, in % of the sale price */
  dispositionFeePct: number | null;
}

export interface FeeDragRead {
  /** the flows as pasted — the property's own return, no fees, no split */
  dealIrrPct: number | null;
  dealMultiple: number | null;
  /** the LP's return through the waterfall with NO fees charged */
  lpIrrBeforeFeesPct: number | null;
  /** the LP's return, fees and waterfall both — what it actually receives */
  lpIrrPct: number | null;
  lpMultiple: number | null;
  /** the deal's IRR less the LP's, split into its two causes */
  promoteDragPts: number | null;
  feeDragPts: number | null;
  totalDragPts: number | null;
  /** rule 1 — the same fee against its two denominators */
  acquisitionFee: number;
  acquisitionFeePctOfEquity: number | null;
  /** rule 2 */
  assetManagementAnnual: number | null;
  assetManagementTotal: number;
  assetManagementIfEquityBase: number | null;
  assetManagementIfRevenueBase: number | null;
  assetManagementBaseGap: number | null;
  dispositionFee: number;
  totalFees: number;
  totalFeesPctOfEquity: number | null;
  /** rule 3 — what the sponsor takes, and how much of it is fee */
  gpTakeTotal: number;
  gpTakeFees: number;
  gpTakePromote: number;
  feeShareOfGpTakePct: number | null;
  /** rule 4 — the same deal with the exit softer by DOWNSIDE_EXIT_HAIRCUT% */
  downsideDealIrrPct: number | null;
  downsideLpIrrPct: number | null;
  downsideGpTakeTotal: number | null;
  downsideGpTakePromote: number | null;
  downsideFeeSharePct: number | null;
  /** the first year the asset management fee turns a positive year negative */
  capitalCallYear: number | null;
  note: string | null;
}

const EMPTY: FeeDragRead = {
  dealIrrPct: null,
  dealMultiple: null,
  lpIrrBeforeFeesPct: null,
  lpIrrPct: null,
  lpMultiple: null,
  promoteDragPts: null,
  feeDragPts: null,
  totalDragPts: null,
  acquisitionFee: 0,
  acquisitionFeePctOfEquity: null,
  assetManagementAnnual: null,
  assetManagementTotal: 0,
  assetManagementIfEquityBase: null,
  assetManagementIfRevenueBase: null,
  assetManagementBaseGap: null,
  dispositionFee: 0,
  totalFees: 0,
  totalFeesPctOfEquity: null,
  gpTakeTotal: 0,
  gpTakeFees: 0,
  gpTakePromote: 0,
  feeShareOfGpTakePct: null,
  downsideDealIrrPct: null,
  downsideLpIrrPct: null,
  downsideGpTakeTotal: null,
  downsideGpTakePromote: null,
  downsideFeeSharePct: null,
  capitalCallYear: null,
  note: null,
};

/** One run of the fee-laden flows through the split. */
interface Run {
  flows: number[];
  lpIrrPct: number | null;
  lpMultiple: number | null;
  promote: number;
  fees: number;
  capitalCallYear: number | null;
}

export function readFeeDrag(t: FeeTerms): FeeDragRead {
  const flows = t.cashFlows;
  if (flows.length < 2) {
    return { ...EMPTY, note: "Paste at least two periods — the equity in, then what comes back." };
  }
  const baseEquity = -flows[0];
  if (!(baseEquity > 0)) {
    return { ...EMPTY, note: "The first period is the equity going in, so it must be negative." };
  }
  if (!positive(t.lpEquityPct) || t.lpEquityPct > 100) {
    return { ...EMPTY, note: "Set the LP's share of the equity, between 0 and 100." };
  }
  if (!real(t.prefPct) || t.prefPct < 0) {
    return { ...EMPTY, note: "Set the preferred return." };
  }

  const price = positive(t.purchasePrice) ? t.purchasePrice : null;
  const sale = positive(t.salePrice) ? t.salePrice : null;

  // Rule 1. The fee is quoted against the price and paid out of the equity,
  // so the equity cheque is larger than the property's own basis by exactly
  // this much — year 0 goes further out, it is not netted from a return.
  const acqPct = positive(t.acquisitionFeePct) ? t.acquisitionFeePct : 0;
  const acquisitionFee = price === null ? 0 : round(price * (acqPct / 100));

  // Rule 2. Both bases, always, whenever both are available — the point is
  // that the term sheet's percent does not say which one it means.
  const amPct = positive(t.assetManagementFeePct) ? t.assetManagementFeePct : 0;
  const egr = positive(t.effectiveGrossRevenue) ? t.effectiveGrossRevenue : null;
  const equityForFee = baseEquity + acquisitionFee;
  const ifEquityBase = amPct === 0 ? null : round(equityForFee * (amPct / 100));
  const ifRevenueBase = amPct === 0 || egr === null ? null : round(egr * (amPct / 100));
  const assetManagementAnnual =
    amPct === 0 ? null : t.assetManagementBase === "revenue" ? ifRevenueBase : ifEquityBase;

  const base = run(flows, {
    acquisitionFee,
    assetManagementAnnual: assetManagementAnnual ?? 0,
    salePrice: sale,
    dispositionFeePct: positive(t.dispositionFeePct) ? t.dispositionFeePct : 0,
    lpEquityPct: t.lpEquityPct,
    prefPct: t.prefPct,
    tiers: t.tiers,
  });

  // The same waterfall with NO fees at all — the middle of the three
  // returns, and the one that isolates the promote from the fee load.
  const noFees = runWaterfall({
    cashFlows: flows,
    lpEquityPct: t.lpEquityPct,
    prefPct: t.prefPct,
    tiers: t.tiers,
  });

  // Rule 4. Struck against the SALE PRICE, so the leverage in the final
  // flow is respected rather than quietly cancelled.
  const downside =
    sale === null
      ? null
      : run(haircut(flows, sale), {
          acquisitionFee,
          assetManagementAnnual: assetManagementAnnual ?? 0,
          salePrice: round(sale * (1 - DOWNSIDE_EXIT_HAIRCUT / 100)),
          dispositionFeePct: positive(t.dispositionFeePct) ? t.dispositionFeePct : 0,
          lpEquityPct: t.lpEquityPct,
          prefPct: t.prefPct,
          tiers: t.tiers,
        });

  const dealIrr = irr(flows);
  const dealIrrPct = dealIrr === null ? null : round(dealIrr * 100, 2);
  // Every dollar in is a contribution, not only year 0's: a deal with a
  // mid-life capital call has a larger denominator than its opening cheque,
  // and counting only the cheque would overstate the multiple.
  const distributed = flows.reduce((s, x) => s + Math.max(0, x), 0);
  const contributed = -flows.reduce((s, x) => s + Math.min(0, x), 0);

  const assetManagementTotal = round((assetManagementAnnual ?? 0) * (flows.length - 1));
  const gpTakeFees = base.fees;
  const gpTakePromote = base.promote;
  const gpTakeTotal = round(gpTakeFees + gpTakePromote);
  // One denominator for both fee ratios: the cheque the LP actually wires,
  // which INCLUDES the acquisition fee. Quoting the acquisition fee against
  // the property's basis and the total against the full cheque would put
  // two figures on the same card that cannot be added together.
  const equityAtRisk = baseEquity + acquisitionFee;

  const x: FeeDragRead = {
    dealIrrPct,
    dealMultiple: contributed > 0 ? round2(distributed / contributed) : null,
    lpIrrBeforeFeesPct: noFees.lp.irrPct,
    lpIrrPct: base.lpIrrPct,
    lpMultiple: base.lpMultiple,
    promoteDragPts:
      dealIrrPct === null || noFees.lp.irrPct === null ? null : round(dealIrrPct - noFees.lp.irrPct, 2),
    feeDragPts:
      noFees.lp.irrPct === null || base.lpIrrPct === null
        ? null
        : round(noFees.lp.irrPct - base.lpIrrPct, 2),
    totalDragPts: dealIrrPct === null || base.lpIrrPct === null ? null : round(dealIrrPct - base.lpIrrPct, 2),
    acquisitionFee,
    acquisitionFeePctOfEquity: acquisitionFee === 0 ? null : round2((acquisitionFee / equityAtRisk) * 100),
    assetManagementAnnual,
    assetManagementTotal,
    assetManagementIfEquityBase: ifEquityBase,
    assetManagementIfRevenueBase: ifRevenueBase,
    assetManagementBaseGap:
      ifEquityBase === null || ifRevenueBase === null ? null : round(Math.abs(ifEquityBase - ifRevenueBase)),
    dispositionFee: dispositionOf(sale, t),
    totalFees: gpTakeFees,
    totalFeesPctOfEquity: gpTakeFees === 0 ? null : round2((gpTakeFees / equityAtRisk) * 100),
    gpTakeTotal,
    gpTakeFees,
    gpTakePromote,
    feeShareOfGpTakePct: gpTakeTotal <= 0 ? null : round1((gpTakeFees / gpTakeTotal) * 100),
    downsideDealIrrPct: downside === null ? null : pct(irr(downside.flows)),
    downsideLpIrrPct: downside === null ? null : downside.lpIrrPct,
    downsideGpTakeTotal: downside === null ? null : round(downside.fees + downside.promote),
    downsideGpTakePromote: downside === null ? null : downside.promote,
    downsideFeeSharePct:
      downside === null || downside.fees + downside.promote <= 0
        ? null
        : round1((downside.fees / (downside.fees + downside.promote)) * 100),
    capitalCallYear: base.capitalCallYear,
    note: null,
  };
  return { ...x, note: noteFor(x, amPct > 0 && t.assetManagementBase === "revenue" && egr === null) };
}

/** The disposition fee, which needs a sale price to have a base at all. */
function dispositionOf(sale: number | null, t: FeeTerms): number {
  const pctFee = positive(t.dispositionFeePct) ? t.dispositionFeePct : 0;
  return sale === null || pctFee === 0 ? 0 : round(sale * (pctFee / 100));
}

/**
 * The exit softer by DOWNSIDE_EXIT_HAIRCUT% of the SALE PRICE. The whole
 * haircut lands on the equity, because the loan is repaid at par either
 * way — which is the leverage, and the reason this is not a 10% cut to the
 * final flow.
 */
function haircut(flows: number[], sale: number): number[] {
  const out = [...flows];
  const last = out.length - 1;
  out[last] = out[last] - sale * (DOWNSIDE_EXIT_HAIRCUT / 100);
  return out;
}

interface RunTerms {
  acquisitionFee: number;
  assetManagementAnnual: number;
  salePrice: number | null;
  dispositionFeePct: number;
  lpEquityPct: number;
  prefPct: number;
  tiers: Tier[];
}

/**
 * The property's flows with the three fees taken out, run through the
 * waterfall. The fees come off BEFORE the split, which is rule 3 expressed
 * as arithmetic rather than as a sentence.
 */
function run(flows: number[], t: RunTerms): Run {
  const net = [...flows];
  // Rule 1 — an extra cheque at closing, not a haircut to a distribution.
  net[0] = net[0] - t.acquisitionFee;

  let fees = t.acquisitionFee;
  let capitalCallYear: number | null = null;
  for (let i = 1; i < net.length; i++) {
    if (t.assetManagementAnnual <= 0) break;
    const before = net[i];
    net[i] = before - t.assetManagementAnnual;
    fees += t.assetManagementAnnual;
    // A fee larger than the year's cash is a capital call, and the model
    // says so rather than clamping the flow at zero: the money is owed and
    // somebody sends it.
    if (capitalCallYear === null && before >= 0 && net[i] < 0) capitalCallYear = i;
  }

  const disposition =
    t.salePrice === null || t.dispositionFeePct === 0
      ? 0
      : round(t.salePrice * (t.dispositionFeePct / 100));
  if (disposition > 0) {
    net[net.length - 1] = net[net.length - 1] - disposition;
    fees += disposition;
  }

  const w = runWaterfall({
    cashFlows: net,
    lpEquityPct: t.lpEquityPct,
    prefPct: t.prefPct,
    tiers: t.tiers,
  });

  return {
    flows: net,
    lpIrrPct: w.lp.irrPct,
    lpMultiple: w.lp.multiple,
    promote: round(w.promote),
    fees: round(fees),
    capitalCallYear,
  };
}

/**
 * The one sentence, leading with rule 4 where there is a downside to
 * report — the fee load against a good outcome is an argument, and the fee
 * load against a poor one is the finding.
 */
function noteFor(x: FeeDragRead, missingRevenue: boolean): string {
  // A missing input leads over any finding: charged against a revenue base
  // with no revenue given, the fee is not zero — it is unknown, and a card
  // that quietly charged nothing would flatter the deal by the whole fee.
  if (missingRevenue) {
    return "The asset management fee is set against revenue, so enter effective gross revenue — until then it is charged at nothing, which understates the drag.";
  }
  // The capital call leads where there is one: it is rare, it is concrete,
  // and it turns a year the deck shows as income into a cheque.
  if (x.capitalCallYear !== null) {
    return `The asset management fee turns year ${x.capitalCallYear} negative, so that year is a capital call rather than a distribution.`;
  }
  if (x.downsideFeeSharePct !== null && x.downsideGpTakeTotal !== null && x.downsideFeeSharePct >= 60) {
    return `On an exit ${DOWNSIDE_EXIT_HAIRCUT}% softer the sponsor still collects ${usd(x.downsideGpTakeTotal)}, and ${x.downsideFeeSharePct}% of it is fees rather than promote.`;
  }
  if (x.totalDragPts !== null && x.feeDragPts !== null && x.promoteDragPts !== null && x.dealIrrPct !== null) {
    return `The deck's ${x.dealIrrPct}% reaches the LP as ${x.lpIrrPct}% — ${x.feeDragPts} points of fees and ${x.promoteDragPts} points of promote.`;
  }
  if (x.totalFeesPctOfEquity !== null) {
    return `The fees come to ${x.totalFeesPctOfEquity}% of the equity, ahead of the preferred return.`;
  }
  return "Set the fees to see what the deck's return becomes by the time it reaches the LP.";
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pct(r: number | null): number | null {
  return r === null ? null : round(r * 100, 2);
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
const round2 = (n: number) => round(n, 2);
