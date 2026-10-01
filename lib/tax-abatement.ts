// A property-tax abatement (#461) — Philadelphia's ten-year abatement on new
// construction and conversions, a New Jersey PILOT, New York's 421-a and
// J-51, a Cook County Class 9 or Class L, a payment in lieu of taxes struck
// with a county's development agency. The memorandum's NOI is struck on the
// abated bill, and the abatement ends on a date the memorandum states — in
// a line, rarely beside the NOI it flatters — and the screen read none of
// it.
//
// Pure — no I/O, no model call. The extraction labels the abatement's
// figures as rows of their own ("Tax abatement", "Tax abatement
// expiration", "Abated real estate taxes", "Unabated real estate taxes",
// "Annual tax abatement savings", "Tax abatement phase-out"), each only as
// stated; this reads them into what every surface says.
//
// Five rules.
//
// THE NOI IS ON ABATED TAXES. The in-place NOI, the cap struck on it and
// every coverage ratio downstream use a tax bill that ends. Nothing in the
// memorandum is false: it describes a bill the building stops paying.
//
// THE STEP-UP IS SAID AS A PRICE. The full bill less the abated one — or
// the savings, where the memorandum states only those — is income the
// owner loses when the abatement ends; at the cap the price was set at it
// is a sum of the price (the tax-reassessment card's rule on /tools).
//
// THE END IS READ EARLY. A year alone is the year's FIRST day, the side
// that does not flatter the buyer, and a term counted from a stated start
// is the start plus the term, said as counted.
//
// THE SALE IS THE CLOCK. An abatement that ends inside the model's hold
// leaves its exit struck on a NOI the building no longer earns; one that
// ends after the sale is the next buyer's step-up, and that buyer prices
// it.
//
// A BLANK IS NULL. A full bill the memorandum does not state is not
// estimated: the step-up is then unknown, and said so. Who pays it is the
// leases' question — a gross lease's owner pays all of it, a net lease
// passes it to the tenants — and a commercial building's read says so
// rather than assuming either.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { datedEnd, endLabel } from "@/lib/affordable";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import { findGoingInCap, parsePct } from "@/lib/criteria";
import { noiFigures } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import type { MetricRow } from "@/lib/ground-lease-term";
import { parseUsd } from "@/lib/money";
import { monthsBetween, yearsBetween } from "@/lib/note-yield";

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// ── The rows ────────────────────────────────────────────────────────────

const TAX = String.raw`(?:real\s+estate\s+|property\s+)?tax(?:es)?`;
/** The program as the memorandum names it: "10-year tax abatement", a
 *  PILOT, 421-a. Never its end, its savings or a bill. */
const PROGRAM = new RegExp(String.raw`^(?:real\s+estate\s+|property\s+)?tax\s+(?:abatement|exemption)(?:\s+program)?$|^pilot(?:\s+(?:agreement|program))?$`, "i");
const END = /\b(?:abatement|exemption|pilot)\b.*\b(?:expir\w*|ends?|end\s+date|burn[- ]?off)\b/i;
const ABATED = new RegExp(String.raw`\babated\s+${TAX}\b|^pilot\s+payments?\b|\b${TAX}\s*\(\s*abated\s*\)`, "i");
const UNABATED = new RegExp(String.raw`\bunabated\s+${TAX}\b|\b(?:full|post[- ]abatement)\s+${TAX}\b|\b${TAX}\s*\(\s*unabated\s*\)`, "i");
const SAVINGS = /\babatement\s+savings\b|\btax\s+savings\b/i;
const PHASE = /\b(?:abatement|exemption|pilot)\b.*\bphase[- ]?(?:out|down)\b|^phase[- ]?(?:out|down)\b/i;

// A tax figure per unit or per foot is not the building's bill.
const PER_SOMETHING = /\/\s*(?:unit|door|key|bed|sf|sq)|\bper\s+(?:unit|door|key|bed|sf|square)|\bpsf\b/i;

const find = (rows: MetricRow[], re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** The rows a key-terms block leads with on an abated property: the
 *  program, when it ends and the full bill. */
export function taxAbatementTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter(isRow) as M[];
  const pick = (re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label)));
  return [pick(PROGRAM), pick(END, PHASE), pick(UNABATED), pick(SAVINGS)].filter((m): m is M => m != null);
}

/** A year's tax bill as stated, to the dollar: never a range, never a
 *  figure per unit or per foot. */
export function taxBillOf(value: string | null | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v || PER_SOMETHING.test(v) || /\d\s*[–—]\s*\$?\d|\d\s+to\s+\$?\d/i.test(v)) return null;
  return parseUsd(v, 500);
}

// A term counted from a stated start: "10 years from 2021", "15-year PILOT
// beginning 2019" — the start plus the term, read as that year opens.
const TERM_FROM_START = /\b(\d{1,2})[\s-]*(?:years?|yrs?)\b.*\b(?:from|commenc\w*|begin\w*|start\w*|since|effective)\b\D*\b((?:19|20)\d{2})\b/i;

export interface AbatementEnd {
  /** the end, an ISO date */
  ends: string;
  /** "date" as written, "year" a year alone (its first day), "term" a term
   *  counted from a stated start */
  from: "date" | "year" | "term";
  stated: string;
  /** years left today in whole months — the figure said; negative where
   *  the stated end has passed */
  yearsLeft: number;
  /** years left to the DAY (lib/ground-lease-term `DatedSpan`): what says
   *  the abatement has ended or ends before the sale — whole months called
   *  one with four weeks to run "ended" */
  yearsToTheDay: number;
}

/** The end is read early: on its own day the abatement is gone, and the
 *  day before it is not — by the day, never by whole months. */
export const abatementEnded = (e: AbatementEnd): boolean => e.yearsToTheDay <= 0;

function endOf(row: MetricRow | null, asOf: Date, pageCount: number | null): AbatementEnd | null {
  if (!row) return null;
  const dated = datedEnd(row, "first", asOf, pageCount);
  if (dated) return { ends: dated.ends, from: dated.from, stated: dated.stated, yearsLeft: dated.yearsLeft, yearsToTheDay: dated.yearsToTheDay };
  const m = row.value.match(TERM_FROM_START);
  if (!m) return null;
  const ends = `${Number(m[2]) + Number(m[1])}-01-01`;
  const today = asOf.toISOString().slice(0, 10);
  return { ends, from: "term", stated: row.value.trim(), yearsLeft: monthsBetween(today, ends) / 12, yearsToTheDay: yearsBetween(today, ends) };
}

// A row that says there is none: "Tax abatement: None", "N/A".
const NONE = /^(?:none|no|n\/a|na|not\s+applicable|not\s+stated|[-–—])\.?$/i;
// A program row that says only that there is one: "Yes", "In place".
const BARE_YES = /^(?:yes|y|true|applicable|in\s+place|abated)\.?$/i;

// ── The read ────────────────────────────────────────────────────────────

export interface TaxAbatementRead {
  /** the program as the memorandum names it ("" where it names none) */
  program: string;
  end: AbatementEnd | null;
  /** the bill paid under the abatement, as stated */
  abatedTaxes: number | null;
  /** the full bill, as the memorandum states it */
  unabatedTaxes: number | null;
  /** the savings a year, as stated */
  savings: number | null;
  /** what the owner pays more a year once it ends: the full bill less the
   *  abated one, else the stated savings */
  stepUp: number | null;
  stepUpFrom: "bills" | "savings" | null;
  /** the in-place NOI the step-up comes out of, as stated */
  noi: number | null;
  stepUpPctOfNoi: number | null;
  /** the going-in cap as stated, in % */
  capPct: number | null;
  /** the step-up at the going-in cap: the sum of the price it is worth */
  priceAtCap: number | null;
  /** a phase-out as stated ("" where none) */
  phaseOut: string;
  /** whether the owner pays the whole step-up: a building let on gross
   *  leases (housing, a hotel, storage, parking) — false where the leases
   *  may pass taxes through to the tenants */
  ownerPays: boolean;
  page: string;
  /** the read a sentence at a time — when it ends first, then what it is
   *  worth — so a panel can lead with the first and fold the rest */
  sentences: string[];
  headline: string;
}

const money = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e4) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}M` : `$${Math.round(n).toLocaleString("en-US")}`;
const compact = (n: number) => (n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const years1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} years`;
/** The years an abatement has left, said: "4.3 years", or inside its last
 *  month, where whole months count none, "under a month". */
const leftOf = (e: AbatementEnd) => (Math.round(e.yearsLeft * 12) < 1 ? "under a month" : years1(e.yearsLeft));

// Classes let on gross leases: the owner pays the bill, and every dollar of
// a step-up comes out of its NOI.
const GROSS_CLASSES = new Set(["hospitality_str", "self_storage", "parking"]);

/**
 * An abated property's abatement, as stated. Null where the memorandum
 * states none: no program, no end, no bill and no savings.
 */
export function readTaxAbatement(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): TaxAbatementRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow);
  const stated = rows.filter((m) => !NONE.test(m.value.trim()));
  const programRow = find(stated, PROGRAM);
  const endRow = find(stated, END, PHASE);
  const abatedRow = find(stated, ABATED, UNABATED);
  const unabatedRow = find(stated, UNABATED);
  const savingsRow = find(stated, SAVINGS);
  const phaseRow = find(stated, PHASE);
  if (!programRow && !endRow && !unabatedRow && !savingsRow && !abatedRow) return null;

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const end = endOf(endRow, asOf, pageCount);
  const abatedTaxes = abatedRow ? taxBillOf(abatedRow.value) : null;
  const unabatedTaxes = unabatedRow ? taxBillOf(unabatedRow.value) : null;
  const savings = savingsRow ? taxBillOf(savingsRow.value) : null;
  const fromBills = abatedTaxes != null && unabatedTaxes != null && unabatedTaxes > abatedTaxes ? unabatedTaxes - abatedTaxes : null;
  const stepUp = fromBills ?? savings;
  const stepUpFrom: TaxAbatementRead["stepUpFrom"] = fromBills != null ? "bills" : savings != null ? "savings" : null;

  const metrics = ex.metrics ?? [];
  const nois = noiFigures(metrics);
  const noiFig = nois.find((f) => f.kind === "in_place") ?? nois.find((f) => f.kind === "year1") ?? null;
  const noi = noiFig && noiFig.value > 0 ? noiFig.value : null;
  const capRow = findGoingInCap(metrics);
  const capRaw = capRow ? parsePct(capRow.value) : null;
  const capPct = capRaw != null && capRaw > 0.5 && capRaw < 25 ? capRaw : null;

  const cls = assetClassKey(ex.assetClass);
  const ownerPays = cls != null && (assetWords(cls).residential || GROSS_CLASSES.has(cls));
  const pageRow = endRow ?? programRow ?? unabatedRow ?? savingsRow ?? abatedRow;
  const n = parsePageNumber(pageRow?.page);
  const page = n != null && pageCount != null && n <= pageCount ? (pageRow?.page ?? "").trim() : "";

  const read: Omit<TaxAbatementRead, "sentences" | "headline"> = {
    program: programRow && !BARE_YES.test(programRow.value.trim()) ? programRow.value.trim().replace(/\.$/, "") : "",
    end,
    abatedTaxes,
    unabatedTaxes,
    savings,
    stepUp,
    stepUpFrom,
    noi,
    stepUpPctOfNoi: stepUp != null && noi != null ? (stepUp / noi) * 100 : null,
    capPct,
    priceAtCap: stepUp != null && capPct != null ? stepUp / (capPct / 100) : null,
    phaseOut: phaseRow ? phaseRow.value.trim().replace(/\.$/, "") : "",
    ownerPays,
    page,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

/** "Jan 2031"; a year alone as the year. */
export function abatementEndLabel(e: AbatementEnd): string {
  return endLabel({ ends: e.ends, from: e.from === "date" ? "date" : "year" });
}

function sentencesOf(r: Omit<TaxAbatementRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  const what = r.program ? `under its ${r.program.replace(/^(?:a|an|the)\s+/i, "")}` : "";
  if (r.end) {
    const when = abatementEndLabel(r.end);
    const counted = r.end.from === "term" ? ` (${r.end.stated}, counted from its stated start)` : "";
    out.push(
      !abatementEnded(r.end)
        ? `The property's taxes are abated${what ? ` ${what}` : ""} until ${when}${counted}, ${leftOf(r.end)} from today.`
        : `The abatement${what ? ` ${what}` : ""} ended ${when}${counted} by the memorandum's own date: the trailing figures may still carry abated months.`,
    );
  } else {
    out.push(`The property's taxes are abated${what ? ` ${what}` : ""}; the memorandum states no end.`);
  }
  if (r.stepUp != null) {
    const source =
      r.stepUpFrom === "bills"
        ? `The full bill is ${money(r.unabatedTaxes!)} a year against the ${money(r.abatedTaxes!)} paid today, as stated: ${money(r.stepUp)} a year more once it ends`
        : `The memorandum states the abatement saves ${money(r.stepUp)} a year: that much more once it ends`;
    const share = r.stepUpPctOfNoi != null ? `, ${Math.round(r.stepUpPctOfNoi)}% of the in-place NOI` : "";
    out.push(`${source}${share}.`);
    if (r.priceAtCap != null) out.push(`At the ${r.capPct!.toFixed(2)}% going-in cap it is ${money(r.priceAtCap)} of the price.`);
  } else {
    out.push("The memorandum states no full tax bill, so the step-up when the abatement ends is not known: ask for the assessor's full-value bill.");
  }
  if (r.phaseOut) out.push(`It steps down as stated: ${r.phaseOut}.`);
  if (!r.ownerPays && r.stepUp != null) {
    out.push("On leases that pass taxes through, the tenants pay the step-up; the owner keeps the share on vacant space and above any base year or cap.");
  }
  return out;
}

export interface TaxAbatementModel {
  holdMonths: number;
  exitCapPct: number;
  expenseGrowthPct: number;
}

/** What the model does with the abatement: it grows today's abated taxes
 *  as one expense line, so where the abatement ends against its sale is
 *  said, with the step-up at its exit cap. "" where nothing is stated to
 *  say it with. */
export function taxAbatementModelLine(r: TaxAbatementRead, m: TaxAbatementModel): string {
  const grow = `The model grows today's abated taxes at ${(m.expenseGrowthPct * 100).toFixed(1)}% a year with the rest of its expenses`;
  const atCap = r.stepUp != null && m.exitCapPct > 0 ? `${money(r.stepUp / m.exitCapPct)} of value at its ${(m.exitCapPct * 100).toFixed(2)}% exit cap` : "";
  if (!r.end) return `${grow}, as if the abatement never ended; the memorandum states no end to say when it does.`;
  const hold = m.holdMonths / 12;
  const when = abatementEndLabel(r.end);
  if (abatementEnded(r.end)) return `${grow}; the abatement has ended by the memorandum's own date, so check that the in-place NOI carries the full bill.`;
  if (r.end.yearsToTheDay < hold) {
    const into = leftOf(r.end);
    return `${grow}: the abatement ends ${when}, ${into} into its ${Math.round(hold)}-year hold, so its exit is struck on a NOI the building no longer earns${
      atCap ? ` — the step-up is ${atCap}` : ""
    }.`;
  }
  const after = r.end.yearsLeft - hold;
  return `${grow}: the abatement ends ${when}, ${after < 0.05 ? "as the model sells" : `${years1(after)} after its sale`}, so the next buyer takes the step-up and prices it while the model's exit is struck on abated taxes${
    atCap ? ` — the step-up is ${atCap}, less what the years still abated are worth to that buyer` : ""
  }.`;
}

/** The pipeline row's tag: "Tax abated, 4 yrs left, +$450k/yr", "Tax
 *  abated", "Abatement ended". */
export function taxAbatementTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readTaxAbatement(ex, asOf);
  if (!r) return null;
  if (r.end && abatementEnded(r.end)) return "Abatement ended";
  const step = r.stepUp != null ? `, +${compact(r.stepUp)}/yr` : "";
  if (!r.end) return `Tax abated${step}`;
  const whole = Math.floor(r.end.yearsLeft);
  const yrs = r.end.yearsLeft < 1 ? "under 1 yr" : `${whole} ${whole === 1 ? "yr" : "yrs"}`;
  return `Tax abated, ${yrs} left${step}`;
}

/** The abatement in one line, for the memo under its title, the
 *  workbook's cover and the report. */
export function taxAbatementShortLine(r: TaxAbatementRead): string {
  const parts: string[] = [];
  if (r.program) parts.push(r.program);
  if (r.end) {
    parts.push(
      !abatementEnded(r.end) ? `ends ${abatementEndLabel(r.end)}, ${leftOf(r.end)} from today` : `ended ${abatementEndLabel(r.end)}`,
    );
  } else {
    parts.push("no end stated");
  }
  if (r.stepUp != null) {
    parts.push(
      `${money(r.stepUp)} a year more once it ends${r.stepUpPctOfNoi != null ? ` (${Math.round(r.stepUpPctOfNoi)}% of the in-place NOI)` : ""}`,
    );
  } else {
    parts.push("no full bill stated");
  }
  return `Tax abatement: ${parts.join("; ")}`;
}

/** The abatement as the steps that read the memorandum after the
 *  extraction see it (lib/deal-context). */
export function taxAbatementContextLine(r: TaxAbatementRead): string {
  return `The tax abatement: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The abatement's traps by name, for the assumption review. */
export function taxAbatementNote(r: TaxAbatementRead): string {
  const step =
    r.stepUp != null
      ? ` — ${money(r.stepUp)} a year${r.stepUpPctOfNoi != null ? `, ${Math.round(r.stepUpPctOfNoi)}% of the in-place NOI` : ""}`
      : " — the memorandum states no full bill";
  return [
    `THE TAX ABATEMENT AS STATED: ${r.headline}`,
    "TAX-ABATEMENT TRAPS, checked by name where the OM gives the inputs:",
    `(a) THE NOI IS ON ABATED TAXES${step}: the in-place NOI, the cap struck on it and every coverage ratio use a bill that ends, and a pro forma that carries the abated bill past the end is a misread;`,
    "(b) THE BURN-OFF — when the abatement ends or steps down against the hold and the loan's term: a lender sizes a refinance on the full bill, and a sale near the end is priced on it;",
    "(c) THE TRANSFER — whether the abatement survives the sale and what the buyer must file or keep up to hold it; some are lost on a transfer, a change of use or a missed filing;",
    "(d) THE CONDITIONS — affordability, employment or occupancy conditions the abatement carries, and what breaking one costs (a clawback of the taxes abated);",
    "(e) THE ASSESSMENT — the full bill the memorandum states is on today's assessment, and a sale may reassess the property to its price.",
  ].join(" ");
}
