// A preferred equity position (research pass 28, round 5): money put into
// the entity that owns a building, ahead of the common equity and behind
// the mortgage, for a fixed preferred return and a date by which the
// sponsor must buy it back. The screen read one as a share of the building
// ("states no single percentage"), ran the property model at the position's
// price — a return on nothing — and handed the challenger a partner's
// traps (control, waterfall) rather than a position's (redemption, the last
// dollar, remedies). A mezzanine LOAN sold as a note stays a note
// (lib/note-yield); its senior balance is read there.
//
// Pure — no I/O, no model call. The extraction files the position's terms
// as rows of their own, each only as stated: "Preferred equity amount",
// "Preferred return" (as written, both parts), "Current pay rate",
// "Accrual rate" (and whether it compounds, as written), "Mandatory
// redemption date" (as written), "Senior loan balance", "Senior loan
// maturity", "Whole-asset value", "Extension options" and "Remedies".
//
// Six rules.
//
// A POSITION, NOT A SHARE. Its return is its rate and its redemption, never
// a slice of the building's cash flows: the yield to redemption is solved on
// the position's own payments at its price, with the engine's `irr`.
//
// THE LAST DOLLAR IS THE RISK. Over the stated value, the position's first
// dollar sits at the senior balance and its last at the senior balance, the
// amount and the accrual owed at redemption — no senior balance, no stack.
//
// CURRENT PAY IS CASH, ACCRUAL IS A PROMISE. Said apart: the cash a year,
// and what accrues to be paid at redemption. Whether the accrual compounds
// is read from its own words (compounding, the accrued return earns the
// preferred return); where they do not say, the yield is read as simple
// (the lower) and the last dollar as compounding (the higher), each on the
// side that does not flatter the position, and said so.
//
// THE REDEMPTION IS A REFINANCING. Its date is set against the senior
// loan's maturity where both are stated, and its payoff is the last dollar a
// new loan must cover. A redemption date that has gone by is a default, not
// a yield.
//
// REMEDIES DECIDE RECOVERY — as stated (a pledge, a change of control, the
// removal of the manager), never characterised.
//
// A BLANK IS NULL.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parseUsd } from "@/lib/money";
import { daysBetween, monthsBetween, readStatedDate, sameMonth } from "@/lib/note-yield";
import { irr } from "@/lib/underwrite/engine";

type Row = { label: string; value: string; page?: string };
type MetricRows = { metrics?: ReadonlyArray<{ label: string; value: string }> } | null | undefined;

const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

/** The rows the extraction labels, each by its own name. */
export const PREF_AMOUNT_ROW = /^\s*preferred\s+equity(?:\s+(?:amount|investment|balance|commitment))?\s*$/i;
export const PREF_RETURN_ROW = /^\s*preferred\s+return\s*$/i;
export const CURRENT_PAY_ROW = /^\s*current[\s-]+pay(?:\s+(?:rate|return|coupon))?\s*$/i;
export const ACCRUAL_ROW = /^\s*accru(?:al|ed|ing)(?:\s+(?:rate|return))?\s*$/i;
export const REDEMPTION_ROW = /^\s*(?:mandatory\s+)?redemption(?:\s+date)?\s*$/i;
export const SENIOR_BALANCE_ROW = /^\s*senior\s+(?:loan|mortgage|debt)(?:\s+(?:balance|amount))?\s*$/i;
export const SENIOR_MATURITY_ROW = /^\s*senior\s+(?:loan|mortgage|debt)\s+maturity(?:\s+date)?\s*$/i;
export const VALUE_ROW = /^\s*(?:whole[\s-]+asset|as[\s-]+is|appraised|property)\s+value\s*$/i;
export const EXTENSION_ROW = /^\s*extension\s+options?\s*$/i;
export const REMEDIES_ROW = /^\s*remedies\s*$/i;

/** The position's terms, each only as stated; null where the OM says nothing. */
export interface PositionTerms {
  amount: number | null;
  /** the preferred return as written, both parts */
  preferredReturn: string | null;
  currentPayPct: number | null;
  accrualPct: number | null;
  /** the accrual is not stated but the total and the current pay are: the
   *  accrual is the one less the other, said as derived */
  accrualDerived: boolean;
  /** true where the accrual's words say it compounds, false where they say
   *  it does not, null where they say neither */
  compounds: boolean | null;
  /** the redemption date as an ISO day; a month alone is its last day */
  redemption: string | null;
  redemptionIsMonth: boolean;
  seniorBalance: number | null;
  seniorMaturity: string | null;
  value: number | null;
  extension: string | null;
  remedies: string | null;
}

export interface PositionRead {
  terms: PositionTerms;
  /** what the buyer pays for the position */
  price: number | null;
  /** whole months to the redemption; null past it or with no date */
  monthsLeft: number | null;
  /** days to the redemption, negative once it has gone by */
  daysLeft: number | null;
  /** the redemption's day has gone by — a default, not a yield */
  redeemedPast: boolean;
  /** the redemption is stated as a month alone and today falls in it */
  thisMonth: boolean;
  /** the current pay a year on the amount */
  currentPayYear: number | null;
  /** the accrual owed at redemption, simple and compounded */
  accruedSimple: number | null;
  accruedCompound: number | null;
  /** the yield to redemption at the price, percent (monthly IRR × 12): on
   *  the stated compounding, or simple where the words do not say */
  yieldPct: number | null;
  /** the current pay over the price, percent */
  currentYieldPct: number | null;
  /** over the stated value, percent: the senior balance (the first dollar),
   *  the senior balance and the amount today, and with the accrual owed at
   *  redemption (the last dollar) — compounding where the words do not say */
  attachmentPct: number | null;
  detachmentTodayPct: number | null;
  detachmentPct: number | null;
  /** months from the redemption to the senior loan's maturity — negative
   *  where the position redeems after the senior matures */
  monthsToSeniorMaturity: number | null;
  headline: string;
  sentences: string[];
}

const rowOf = (ex: MetricRows, re: RegExp): Row | null => {
  const m = (ex?.metrics ?? []).find((r) => isRow(r) && re.test(r.label) && !NOT_STATED.test(r.value.trim()));
  return m && isRow(m) ? m : null;
};

const money = (text: string): number | null => {
  // A share of value ("65% LTV") or a figure per unit is no sum.
  if (/%|percent|\bper\b|\/\s*(?:unit|sf|key)/i.test(text)) return null;
  const n = parseUsd(text);
  return n != null && n > 0 ? n : null;
};

/** One percentage the words state, or null where they state none or two
 *  different ones ("12% preferred return, 8% current pay" is two). */
const onePct = (text: string): number | null => {
  const hits = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi)].map((m) => Number(m[1]));
  const distinct = [...new Set(hits)].filter((n) => Number.isFinite(n) && n > 0 && n < 50);
  return distinct.length === 1 ? distinct[0] : null;
};

/** A percentage the words name for one part: "12% preferred return",
 *  "8% current pay", "4% accruing". */
const partPct = (text: string, part: RegExp): number | null => {
  const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:%|percent\\b)\\s*(?:${part.source})`, "i"));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 50 ? n : null;
};

const compoundingOf = (text: string): boolean | null => {
  if (/\bnon[\s-]*compound|\bsimple\b|\bnot\s+compound/i.test(text)) return false;
  if (/\bcompound(?:s|ed|ing)?\b/i.test(text)) return true;
  return null;
};

/** The position's terms from the rows the extraction labels — each only as
 *  stated. */
export function readPositionTerms(ex: MetricRows): PositionTerms {
  const amountRow = rowOf(ex, PREF_AMOUNT_ROW);
  const returnRow = rowOf(ex, PREF_RETURN_ROW);
  const currentRow = rowOf(ex, CURRENT_PAY_ROW);
  const accrualRow = rowOf(ex, ACCRUAL_ROW);
  const redemptionRow = rowOf(ex, REDEMPTION_ROW);
  const seniorRow = rowOf(ex, SENIOR_BALANCE_ROW);
  const seniorMaturityRow = rowOf(ex, SENIOR_MATURITY_ROW);
  const valueRow = rowOf(ex, VALUE_ROW);
  const extensionRow = rowOf(ex, EXTENSION_ROW);
  const remediesRow = rowOf(ex, REMEDIES_ROW);

  // The preferred return as written may state its parts ("12% preferred
  // return, 8% current pay"): each part is read by the words it is named
  // with, the parts' own rows first.
  const returnText = returnRow?.value ?? "";
  const currentPayPct = currentRow ? onePct(currentRow.value) : partPct(returnText, /current[\s-]*pay/);
  let accrualPct = accrualRow ? onePct(accrualRow.value) : partPct(returnText, /accru/);
  let accrualDerived = false;
  // The total less the cash part is what accrues — said as derived — only
  // where the total is one figure and the current pay is below it.
  const total = returnRow ? (partPct(returnText, /pref(?:erred)?(?:\s+return)?\b|total|all[\s-]*in/) ?? onePct(returnText)) : null;
  if (accrualPct == null && total != null && currentPayPct != null && total > currentPayPct) {
    accrualPct = Math.round((total - currentPayPct) * 1e6) / 1e6;
    accrualDerived = true;
  }
  const redemption = redemptionRow ? readStatedDate(redemptionRow.value, 1990, 2100, "last") : null;
  const seniorMaturity = seniorMaturityRow ? readStatedDate(seniorMaturityRow.value, 1990, 2100, "first") : null;
  const compoundWords = [accrualRow?.value, returnRow?.value].filter(Boolean).join(" ");
  return {
    amount: amountRow ? money(amountRow.value) : null,
    preferredReturn: returnRow ? returnRow.value.trim() : null,
    currentPayPct,
    accrualPct,
    accrualDerived,
    compounds: accrualPct != null ? compoundingOf(compoundWords) : null,
    redemption: redemption?.iso ?? null,
    redemptionIsMonth: !!redemption?.month,
    seniorBalance: seniorRow ? money(seniorRow.value) : null,
    seniorMaturity: seniorMaturity?.iso ?? null,
    value: valueRow ? money(valueRow.value) : null,
    extension: extensionRow ? extensionRow.value.trim() : null,
    remedies: remediesRow ? remediesRow.value.trim() : null,
  };
}

/** Whether the memorandum sells a preferred equity position: the interest's
 *  own kind, or a share the extraction filed before that kind was asked
 *  whose rows say a position — a "Preferred equity amount" beside a rate.
 *  Never a fee simple's rows: a memorandum can describe a capital stack it
 *  does not sell. */
export function isPreferredEquity(ex: ExtractionResult | null | undefined): boolean {
  if (!ex) return false;
  const kind = ex.interest?.kind as string | undefined;
  if (kind === "preferred_equity") return true;
  if (kind !== "partial_interest") return false;
  const t = readPositionTerms(ex);
  return t.amount != null && (t.currentPayPct != null || t.accrualPct != null);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (isoDay: string) => `${MONTHS[Number(isoDay.slice(5, 7)) - 1]} ${isoDay.slice(0, 4)}`;
const pctText = (n: number, places = 2) => `${n.toFixed(places)}%`;
const money2 = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3).toLocaleString("en-US")}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};

/** The position read at its price on a day. Null unless the memorandum
 *  sells one (`isPreferredEquity`) and states its amount. */
export function readPosition(
  ex: ExtractionResult | null | undefined,
  price: number | null,
  asOf: Date = new Date(),
): PositionRead | null {
  if (!ex || !isPreferredEquity(ex)) return null;
  const terms = readPositionTerms(ex);
  if (terms.amount == null) return null;
  const amount = terms.amount;
  const pay = price != null && price > 0 ? price : null;
  const today = iso(asOf);
  const daysLeft = terms.redemption ? daysBetween(today, terms.redemption) : null;
  const thisMonth = terms.redemptionIsMonth && !!terms.redemption && sameMonth(today, terms.redemption);
  const redeemedPast = !thisMonth && daysLeft != null && daysLeft < 0;
  const monthsLeft = terms.redemption && !redeemedPast ? Math.max(0, monthsBetween(today, terms.redemption)) : null;

  const current = terms.currentPayPct != null ? terms.currentPayPct / 100 : 0;
  const accrual = terms.accrualPct != null ? terms.accrualPct / 100 : 0;
  const currentPayYear = terms.currentPayPct != null ? amount * current : null;
  const accruedSimple = terms.accrualPct != null && monthsLeft != null ? amount * accrual * (monthsLeft / 12) : null;
  // Compounding, the accrued return earns the preferred return itself (the
  // current pay and the accrual together) — what "compounding" means of an
  // unpaid preferred return — so a position bought at par earns exactly
  // its preferred return.
  let accruedCompound: number | null = null;
  if (terms.accrualPct != null && monthsLeft != null) {
    let owed = 0;
    for (let t = 0; t < monthsLeft; t++) owed = owed * (1 + (current + accrual) / 12) + (amount * accrual) / 12;
    accruedCompound = owed;
  }
  // The yield on the stated compounding; where the words say neither, the
  // simple accrual — the lower yield.
  const accruedForYield = terms.compounds === true ? accruedCompound : accruedSimple;
  // The last dollar on the stated compounding; where the words say neither,
  // compounding — the higher stack.
  const accruedForStack = terms.compounds === false ? accruedSimple : accruedCompound;

  let yieldPct: number | null = null;
  const anyRate = terms.currentPayPct != null || terms.accrualPct != null;
  if (pay != null && monthsLeft != null && monthsLeft >= 1 && anyRate) {
    const flows = [-pay];
    for (let t = 1; t <= monthsLeft; t++) {
      flows.push((amount * current) / 12 + (t === monthsLeft ? amount + (accruedForYield ?? 0) : 0));
    }
    const monthly = irr(flows);
    yieldPct = monthly != null ? monthly * 12 * 100 : null;
  }

  const value = terms.value;
  const senior = terms.seniorBalance;
  const stacked = value != null && senior != null;
  const attachmentPct = stacked ? (senior / value) * 100 : null;
  const detachmentTodayPct = stacked ? ((senior + amount) / value) * 100 : null;
  const detachmentPct = stacked && accruedForStack != null ? ((senior + amount + accruedForStack) / value) * 100 : detachmentTodayPct;
  const monthsToSeniorMaturity =
    terms.redemption && terms.seniorMaturity
      ? terms.redemption <= terms.seniorMaturity
        ? monthsBetween(terms.redemption, terms.seniorMaturity)
        : -monthsBetween(terms.seniorMaturity, terms.redemption)
      : null;

  const read: Omit<PositionRead, "headline" | "sentences"> = {
    terms,
    price: pay,
    monthsLeft,
    daysLeft,
    redeemedPast,
    thisMonth,
    currentPayYear,
    accruedSimple,
    accruedCompound,
    yieldPct,
    currentYieldPct: currentPayYear != null && pay != null ? (currentPayYear / pay) * 100 : null,
    attachmentPct,
    detachmentTodayPct,
    detachmentPct,
    monthsToSeniorMaturity,
  };
  const sentences = positionSentences(read);
  return { ...read, headline: sentences[0], sentences };
}

function rateWords(t: PositionTerms): string {
  const parts: string[] = [];
  if (t.currentPayPct != null) parts.push(`${pctText(t.currentPayPct)} current pay`);
  if (t.accrualPct != null) parts.push(`${pctText(t.accrualPct)} accruing${t.accrualDerived ? " (the preferred return less the current pay)" : ""}`);
  return parts.join(" and ");
}

function positionSentences(r: Omit<PositionRead, "headline" | "sentences">): string[] {
  const t = r.terms;
  const out: string[] = [];
  const rates = rateWords(t);
  const by = t.redemption ? `, to be redeemed by ${monthYear(t.redemption)}` : "";
  const lead = `A preferred equity position of ${money2(t.amount!)}${rates ? ` at ${rates}` : ""}${by}`;
  if (r.redeemedPast) {
    out.push(`${lead}: its mandatory redemption date has gone by — unredeemed, that is a default to be cured under the remedies, not a yield.`);
  } else if (r.yieldPct != null && r.price != null) {
    out.push(`${lead}: ${pctText(r.yieldPct, 1)} to redemption at its ${money2(r.price)} price.`);
  } else if (!t.redemption) {
    out.push(`${lead}. The memorandum states no redemption date, so no yield to redemption is read.`);
  } else {
    out.push(`${lead}.`);
  }
  // Current pay is cash, accrual a promise.
  if (r.currentPayYear != null || (t.accrualPct != null && r.monthsLeft != null)) {
    const cash = r.currentPayYear != null ? `${money2(r.currentPayYear)} a year is paid in cash` : "nothing is paid in cash";
    let owed = "";
    if (t.accrualPct != null && r.monthsLeft != null && r.accruedSimple != null && r.accruedCompound != null) {
      if (t.compounds === true) owed = `; ${money2(r.accruedCompound)} accrues, compounding, to be paid at redemption`;
      else if (t.compounds === false) owed = `; ${money2(r.accruedSimple)} accrues, not compounding, to be paid at redemption`;
      else
        owed = `; ${money2(r.accruedSimple)} accrues to be paid at redemption, or ${money2(r.accruedCompound)} if it compounds — the memorandum does not say, so the yield is read as simple, the lower, and the last dollar as compounding, the higher`;
    }
    out.push(`Current pay is cash and accrual a promise: ${cash}${owed}.`);
  }
  // The stack.
  if (r.attachmentPct != null && r.detachmentPct != null && t.seniorBalance != null && t.value != null) {
    const today = r.detachmentTodayPct != null && Math.abs(r.detachmentTodayPct - r.detachmentPct) >= 0.05 ? ` (${pctText(r.detachmentTodayPct, 1)} today)` : "";
    out.push(
      `Behind the ${money2(t.seniorBalance)} senior loan on the ${money2(t.value)} stated value, the position's first dollar sits at ${pctText(r.attachmentPct, 1)} and its last at ${pctText(r.detachmentPct, 1)} at redemption${today}.`,
    );
    if (r.detachmentPct >= 100) out.push("Its last dollar is past the stated value: a sale at that value would not repay it whole.");
  } else if (t.seniorBalance == null) {
    out.push("The memorandum states no senior loan balance, so where the position's last dollar sits is not read.");
  } else if (t.value == null) {
    out.push("The memorandum states no value for the property, so the stack is not read.");
  }
  // The redemption against the senior's maturity.
  if (r.monthsToSeniorMaturity != null && t.seniorMaturity && t.redemption) {
    out.push(
      r.monthsToSeniorMaturity >= 0
        ? `It redeems ${r.monthsToSeniorMaturity} months before the senior loan matures (${monthYear(t.seniorMaturity)}): the sponsor must refinance or sell to its last dollar by then.`
        : `It redeems after the senior loan matures (${monthYear(t.seniorMaturity)}): the senior loan must be refinanced first, ahead of it.`,
    );
  }
  if (t.extension) out.push(`Extension options, as stated: ${t.extension.replace(/\.$/, "")}.`);
  if (t.remedies) out.push(`Remedies, as stated: ${t.remedies.replace(/\.$/, "")}.`);
  return out;
}

/**
 * The small print under the position's figures (the panel's, as a note's
 * `noteCaption` is under the note's): how long it runs to its redemption and
 * on what accrual its yield was read — or, past its redemption date, that
 * the date has gone by, where no yield is drawn. "" where neither applies.
 */
export function positionCaption(r: PositionRead | null): string {
  if (!r) return "";
  const t = r.terms;
  if (!t.redemption) {
    return r.currentYieldPct != null || r.currentPayYear != null
      ? "The memorandum states no redemption date, so there is no yield to redemption to give."
      : "";
  }
  const when = monthYear(t.redemption);
  if (r.redeemedPast) return `Its ${when} redemption date has gone by: unredeemed, that is a default to be cured under the remedies, not a yield.`;
  if (r.monthsLeft === 0) {
    return r.thisMonth
      ? `Due this month, at its ${when} redemption.`
      : r.daysLeft === 0
        ? `Due today, at its ${when} redemption.`
        : `Under a month to its ${when} redemption.`;
  }
  if (r.monthsLeft == null) return "";
  // The yield's accrual on the side lib/position reads it: as stated, else
  // simple — the lower.
  const basis =
    t.accrualPct == null
      ? "on its current pay alone — the memorandum states no accrual"
      : t.compounds === true
        ? "the accrual compounding, as stated"
        : t.compounds === false
          ? "the accrual simple, as stated"
          : "the accrual read as simple, the lower yield — the memorandum does not say whether it compounds";
  return `${r.monthsLeft} ${r.monthsLeft === 1 ? "month" : "months"} to its ${when} redemption, ${basis}.`;
}

/** What the property model's returns are, beside the position's own. */
export function positionModelLine(r: PositionRead | null): string | null {
  if (!r) return null;
  const yieldPart = r.yieldPct != null ? `its yield to redemption is ${pctText(r.yieldPct, 1)}` : "its return is its rate and its redemption";
  const stackPart = r.detachmentPct != null ? ` and its last dollar sits at ${pctText(r.detachmentPct, 1)} of the stated value` : "";
  return `The property model runs the whole building at the position's price; that is not this position's return — ${yieldPart}${stackPart}.`;
}

/** The tag a pipeline row wears: "Pref equity, 12% to Jun 2029". */
export function positionTag(r: PositionRead | null): string | null {
  if (!r) return null;
  const t = r.terms;
  const total = t.currentPayPct != null || t.accrualPct != null ? (t.currentPayPct ?? 0) + (t.accrualPct ?? 0) : null;
  const rate = total != null ? ` ${Number(total.toFixed(2))}%` : "";
  const to = t.redemption && !r.redeemedPast ? ` to ${monthYear(t.redemption)}` : "";
  if (r.redeemedPast) return "Pref equity, past redemption";
  return `Pref equity${rate ? `,${rate}` : ""}${to}`;
}

/** The read in one line, for the memo, the workbook's cover and the shared
 *  screen. */
export function positionShortLine(r: PositionRead): string {
  return r.headline;
}

/** The deal context's line for the Claude steps that read the OM after the
 *  extraction. */
export function positionContextLine(r: PositionRead): string {
  return `What is being sold: ${withArticle("preferred equity position")} in the owning entity — ${r.sentences.slice(0, 3).join(" ")}`;
}

/** A position's traps by name — the interest note's (lib/interest) and this
 *  module's own note read one list. */
export const POSITION_TRAPS =
  "PREFERRED-EQUITY TRAPS, checked by name where the OM gives the inputs: (a) THE STACK — the position's first and last dollar on today's value, not the sponsor's; (b) THE REDEMPTION — its date against the senior loan's maturity, and what a refinance at the last dollar needs; (c) CURRENT VS ACCRUED — the cash, the compounding, and the coverage left after the senior's debt service; (d) REMEDIES AND THE SENIOR LENDER — a recognition or intercreditor agreement, consent to a change of control, cure rights; (e) THE SPONSOR — guarantees, key-person terms, removal; (f) THE EXIT ORDER — what the position recovers on a sale at a lower value.";

/** The challenger's notes: the facts, then the traps by name. */
export function positionNote(r: PositionRead): string {
  return `${positionContextLine(r)} ${POSITION_TRAPS}`;
}

/** The position's own rows, in the order a key-terms block leads with them. */
export function positionTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const pick = (re: RegExp) => metrics.find((m) => re.test(m.label) && !NOT_STATED.test(m.value.trim())) ?? null;
  return [PREF_AMOUNT_ROW, PREF_RETURN_ROW, CURRENT_PAY_ROW, ACCRUAL_ROW, REDEMPTION_ROW, SENIOR_BALANCE_ROW, REMEDIES_ROW]
    .map(pick)
    .filter((m): m is M => m != null);
}
