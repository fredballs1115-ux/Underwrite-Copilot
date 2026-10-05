// A sandwich position (research pass 28, round 9) — a master lease of a
// building from its owner, sublet to its tenants. The screen read it as a
// leasehold of the land (fixed in pass 28's first round: it is told it
// sells a lease of the building, not the building or the land), but nothing
// read the two rents the position lives between, or when it ends: the model
// capitalised the position's income forever, and the master lease ran out
// fifteen years on.
//
// Pure — no I/O, no model call. The extraction files the position's figures
// as rows of their own, each only as stated: "Master lease rent" (a year's),
// "Sublease income" (a year's, in place), "Master lease expiration" (as
// written, the current term — never one that assumes an option), "Master
// lease term remaining" (only a stated count) and "Master lease options".
// The term is read by lib/ground-lease-term's `readMasterLeaseTerm`, through
// lib/interest's `leaseholdTermOf`, the one reader the tag, the panel and the
// exit on the term share.
//
// Five rules.
//
// THE POSITION IS A SPREAD. Its income is what the subtenants pay less the
// master rent — both as stated, one subtraction, one division for the cover.
//
// IT ENDS WITH THE MASTER LEASE. No building and no land come to the buyer:
// the term is the asset, and the exit is valued on it (lib/leasehold-exit).
//
// THE MASTER RENT IS OWED WHATEVER THE SUBTENANTS PAY. The cushion is said
// as the share of the sublease income that can be lost before the spread is
// gone.
//
// THE MASTER LEASE DECIDES. Consent to assign and to sublet, the fee owner's
// mortgage and a non-disturbance agreement — the challenger's questions.
//
// A BLANK IS NULL. A rent per foot, a range or a share is no year's rent; a
// stated NOI is set against the spread only to say where the two disagree,
// never to choose one.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { noiFigures } from "@/lib/deal-strategy";
import { endHasPassed, groundLeaseTermLine, termEndLabel, yearsText, type GroundLeaseTerm } from "@/lib/ground-lease-term";
import { isMasterLeasehold, leaseholdTermOf } from "@/lib/interest";
import { annualIncomeOf } from "@/lib/mixed-use";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;
/** A figure that is not today's: a projection, a budget, a stabilized year. */
const NOT_TODAY = /pro\s?forma|projected|budget|stabili[sz]ed|underwritten|year\s*[2-9]|\byr\.?\s*[2-9]/i;

export const MASTER_RENT_ROW = /^\s*(?:annual\s+|current\s+|in[- ]place\s+)?master[\s-]+(?:lease\s+)?rent\b(?!\s+(?:increases?|escalations?|bumps?|steps?|growth|per)\b)/i;
export const SUBLEASE_INCOME_ROW =
  /^\s*(?:annual\s+|current\s+|in[- ]place\s+)?(?:sub[\s-]?lease|subtenant|sub[\s-]?tenant)\s+(?:income|rents?|revenues?)\b(?!\s+(?:increases?|escalations?|per)\b)/i;
const MASTER_TERM_ROW = /^\s*master[\s-]+lease\s+(?:expir|term|end|options?|extension|renewal)/i;

/** A year's rent or income from a row's words, the figure before any
 *  clause that follows it ("$1,100,000 a year, increasing 2% annually");
 *  a monthly figure taken twelve times; null for a rate, a range or a
 *  share. */
export function annualOf(stated: string): number | null {
  const lead = stated.split(/;|,\s+(?=[a-z(])/i)[0] ?? "";
  return annualIncomeOf(lead);
}

export interface SandwichRead {
  masterRent: number | null;
  subleaseIncome: number | null;
  /** the sublease income less the master rent, where both are stated */
  spread: number | null;
  /** the sublease income over the master rent, × */
  coverage: number | null;
  /** the share of the sublease income that can be lost before the spread
   *  is gone, a percent — only where the spread is positive */
  cushionPct: number | null;
  /** the master lease's term, read on the day (lib/ground-lease-term) */
  term: GroundLeaseTerm | null;
  termLine: string;
  /** the stated NOI, where it is more than the spread — it counts income
   *  beyond the subleases, or comes before the master rent */
  noiOverSpread: { value: number; label: string } | null;
  sentences: string[];
  headline: string;
}

const money = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return a >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
};
const times = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}×`;
const pctWhole = (n: number) => `${Math.round(n)}%`;

/**
 * A sandwich position's two rents and its term, each only as stated. Null
 * on anything but a master leasehold (lib/interest `isMasterLeasehold`), and
 * where the memorandum states neither rent nor the master lease's end.
 */
export function readSandwichLease(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): SandwichRead | null {
  if (!ex || !isMasterLeasehold(ex)) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  const yearOf = (re: RegExp) => {
    const r = rows.find((m) => re.test(m.label) && !NOT_TODAY.test(m.label));
    return r ? annualOf(r.value) : null;
  };
  const masterRent = yearOf(MASTER_RENT_ROW);
  const subleaseIncome = yearOf(SUBLEASE_INCOME_ROW);
  const { term } = leaseholdTermOf(ex, asOf);
  if (masterRent == null && subleaseIncome == null && !term) return null;

  const spread = masterRent != null && subleaseIncome != null ? subleaseIncome - masterRent : null;
  const coverage = masterRent != null && subleaseIncome != null && masterRent > 0 ? subleaseIncome / masterRent : null;
  const cushionPct = spread != null && spread > 0 && subleaseIncome != null && subleaseIncome > 0 ? (spread / subleaseIncome) * 100 : null;
  // The stated NOI against the spread: more than it by over 2% says the NOI
  // counts income beyond the subleases or comes before the master rent.
  const noi = noiFigures(rows).find((f) => f.kind === "in_place" || f.kind === "year1") ?? null;
  const noiOverSpread = noi && spread != null && spread > 0 && noi.value > spread * 1.02 ? { value: noi.value, label: noi.label } : null;
  const read: Omit<SandwichRead, "sentences" | "headline"> = {
    masterRent,
    subleaseIncome,
    spread,
    coverage,
    cushionPct,
    term,
    termLine: term ? groundLeaseTermLine(term, "master lease") : "",
    noiOverSpread,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<SandwichRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  if (r.masterRent != null && r.subleaseIncome != null && r.spread != null && r.coverage != null) {
    out.push(
      r.spread > 0
        ? `The subleases bring in ${money(r.subleaseIncome)} a year against the ${money(r.masterRent)} master rent: a spread of ${money(r.spread)}, the position's income before its own costs, the sublease income covering the master rent ${times(r.coverage)}.`
        : `The subleases bring in ${money(r.subleaseIncome)} a year against the ${money(r.masterRent)} master rent: the position pays ${money(-r.spread)} a year more than its subtenants bring in.`,
    );
    if (r.cushionPct != null) {
      out.push(`The master rent is owed whatever the subtenants pay: a fall of ${pctWhole(r.cushionPct)} in the sublease income takes the whole spread.`);
    }
  } else if (r.masterRent != null) {
    out.push(`The master rent is ${money(r.masterRent)} a year, as stated; the memorandum states no sublease income beside it, so the spread is not read.`);
  } else if (r.subleaseIncome != null) {
    out.push(`The subleases bring in ${money(r.subleaseIncome)} a year, as stated; the memorandum states no master rent beside it, so the spread is not read.`);
  }
  if (r.term) {
    out.push(
      endHasPassed(r.term)
        ? `${r.termLine}.`
        : `${r.termLine}. When it ends the position ends with it: no building and no land come to the buyer.`,
    );
  } else {
    out.push("The memorandum states no end for the master lease, so the years the position has are not read — and the term is the asset.");
  }
  if (r.noiOverSpread && r.spread != null) {
    out.push(
      `The stated ${r.noiOverSpread.label}, ${money(r.noiOverSpread.value)}, is more than the subleases' income less the master rent, ${money(
        r.spread,
      )}: it counts income beyond the subleases or comes before the master rent — the operating statement says which, and the master rent is owed either way.`,
    );
  }
  return out;
}

/** The model's read (`meta.sandwich`): it capitalises the position's income
 *  at its sale as if it ran forever, while the master lease ends. */
export function sandwichModelLine(r: SandwichRead | null, m: { holdYears: number } | null): string | null {
  if (!r) return null;
  if (!r.term) {
    return "The model capitalises the position's income at its sale as if it ran forever; the memorandum states no end for the master lease, so how much of that the term bears is not read.";
  }
  if (endHasPassed(r.term)) return null;
  const end = `${r.term.from === "year" ? "in " : ""}${termEndLabel(r.term)}`;
  if (!m || !(m.holdYears > 0)) {
    return `The model capitalises the position's income at its sale as if it ran forever; the master lease ends ${end}, and the position with it.`;
  }
  const after = r.term.yearsToTheDay - m.holdYears;
  return after <= 0
    ? `The model capitalises the position's income at its sale as if it ran forever; the master lease ends ${end}, inside the model's ${m.holdYears}-year hold, so the sale the model prices cannot happen.`
    : `The model capitalises the position's income at its sale as if it ran forever; the master lease ends ${end}, ${yearsText(after)} after the model's sale, and the position with it — the exit on that term is the one to read.`;
}

/** The pipeline row's tag: "Spread $720k, 1.65× cover"; the term is the
 *  interest tag's ("Master lease, 15 yrs left"). */
export function sandwichTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readSandwichLease(ex, asOf);
  if (!r || r.spread == null || r.coverage == null) return null;
  return r.spread > 0 ? `Spread ${money(r.spread)}, ${times(r.coverage)} cover` : "Subleases under the master rent";
}

/** The read in one line, for the memo, the workbook's cover and the report. */
export function sandwichShortLine(r: SandwichRead): string {
  const parts = [
    r.subleaseIncome != null && r.masterRent != null
      ? `subleases ${money(r.subleaseIncome)} against ${withArticle(money(r.masterRent))} master rent${r.coverage != null ? ` (${times(r.coverage)})` : ""}`
      : r.masterRent != null
        ? `master rent ${money(r.masterRent)}`
        : r.subleaseIncome != null
          ? `subleases ${money(r.subleaseIncome)}`
          : "",
    r.term && !endHasPassed(r.term) ? `the master lease ends ${r.term.from === "year" ? "in " : ""}${termEndLabel(r.term)}` : "",
  ].filter(Boolean);
  return `Sandwich position: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function sandwichContextLine(r: SandwichRead): string {
  return `Sandwich position (a master lease of the building, sublet): ${r.headline}`;
}

const TRAPS =
  "SANDWICH-LEASE TRAPS, checked by name where the OM gives the inputs: (a) THE TERM AND THE OPTIONS — the master lease's end and its options, and their rent, against the subleases' own ends; (b) THE SPREAD AND WHO PAYS FIRST — the master rent is owed whatever the subtenants pay, its increases against the subleases', and the subtenants' credit; (c) THE FEE OWNER'S LENDER — whether the master lease sits behind the fee owner's mortgage, and whether a non-disturbance agreement keeps it standing through a foreclosure; (d) CONSENT TO ASSIGN AND SUBLET — what the master lease requires of the owner's consent to this sale and to new subleases; (e) THE END — what the master lease requires handed back, and what the subtenants' leases say when it ends.";

/** The facts, then the traps by name, for the assumption review. */
export function sandwichNote(r: SandwichRead): string {
  return `SANDWICH POSITION AS STATED: ${r.headline} ${TRAPS}`;
}

/** The rows a key-terms block leads with, each only where stated: the two
 *  rents, then the master lease's end and options. */
export function sandwichTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.filter((m) => re.test(m.label));
  return [...pick(MASTER_RENT_ROW).slice(0, 1), ...pick(SUBLEASE_INCOME_ROW).slice(0, 1), ...pick(MASTER_TERM_ROW).slice(0, 2)];
}
