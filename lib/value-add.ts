// A value-add renovation program (#460) — the business plan behind most
// apartment trades: renovate the classic units as they turn, re-let them at
// a premium, and sell the higher rent at a cap. A memorandum states it in
// one line ("$15,000 a door for a $250 premium, a 20% return on cost") and
// the screen read none of it: not the doors, not what a door costs, not
// whether the premium is proven on units already done, and not how fast
// the doors can actually turn.
//
// Pure — no I/O, no model call. The extraction labels the program's
// figures as rows of their own ("Units to renovate", "Units renovated",
// "Renovation cost per unit", "Renovation premium", "Achieved renovation
// premium", "Classic rent", "Renovated rent", "Annual turnover",
// "Renovation period"), each only as stated; this reads them into what
// every surface says. The arithmetic is the renovation card's on /tools
// (lib/tools/renovation), on the memorandum's own figures.
//
// Five rules.
//
// THE PREMIUM IS A CLAIM UNTIL A DOOR PROVES IT. A premium the renovated
// units already earn is evidence; one the memorandum projects is a pro
// forma — the page says which, and never lets the second pass for the
// first.
//
// THE RETURN ON COST HAS NO CLOCK. $250 a month on $15,000 is 20% a year
// on every door once it is done; how many doors are done by the sale is
// the pace's question, and the pace is set by turnover — a unit is
// renovated when its tenant leaves, so a program of a given length needs a
// given share of the classic units to turn each year.
//
// THE PREMIUM IS WORTH ITS CAP, LESS ITS COST. The value a door creates is
// its annual premium at the exit cap less what it cost; the break-even
// premium is the cost at that cap — the argument is how much, not whether.
//
// THE MODEL IS NOT THE PLAN. The screening model carries the renovation
// budget as its first year's capital and grows today's rent at one rate:
// the premium is in none of its returns, and the page says so rather than
// letting its IRR stand for the program's.
//
// A BLANK IS NULL. A turnover, a period or an achieved premium the
// memorandum does not state is not assumed.

import { compactUsd } from "@/lib/money";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parseCount } from "@/lib/criteria";
import {
  RENOVATION_COST_PER_DOOR_ROW,
  RENOVATION_DOORS_ROW,
  inferStrategy,
  renovationCostPerDoor,
} from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";

type MetricRow = { label: string; value: string; page?: string };

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// ── The rows ────────────────────────────────────────────────────────────

// The doors and a door's cost are the plan's rows too (its budget where the
// memorandum states no total), so they are read with lib/deal-strategy's
// patterns: one reading of the two rows the plan multiplies.
const TO_RENOVATE = RENOVATION_DOORS_ROW;
const RENOVATED = /^(?:units?|doors?)\s+(?:already\s+)?renovated\b|\brenovated\s+units?\b(?!.*\brent)/i;
const COST_PER = RENOVATION_COST_PER_DOOR_ROW;
const ACHIEVED = /\bachieved\b.*\bpremium\b|\bpremium\b.*\b(?:achieved|in[- ]place|proven|to\s+date)\b/i;
const PREMIUM = /\b(?:renovation|rent|value[- ]add)\s+premium\b|^premium$/i;
const CLASSIC_RENT = /\bclassic\s+(?:unit\s+)?rent\b|\bunrenovated\s+rent\b/i;
const RENOVATED_RENT = /\brenovated\s+(?:unit\s+)?rent\b|\bpost[- ]renovation\s+rent\b/i;
const TURNOVER = /\b(?:annual\s+)?(?:unit\s+)?turnover\b/i;
const PERIOD = /\brenovation\s+(?:period|program|timeline|schedule)\b/i;

const find = (rows: MetricRow[], re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** The rows a key-terms block leads with on a value-add deal: the doors,
 *  what a door costs, the premium and whether it is proven. */
export function valueAddTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter(isRow) as M[];
  const pick = (re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label)));
  return [pick(TO_RENOVATE), pick(COST_PER), pick(PREMIUM, ACHIEVED), pick(ACHIEVED)].filter((m): m is M => m != null);
}

// ── Reading one figure ─────────────────────────────────────────────────

const clean = (s: string | null | undefined) => (s ?? "").trim();
const RANGE = /\d\s*[-–—]\s*\$?\d|\d\s+to\s+\$?\d/i;

/** A monthly rent or premium to the cent: "$250", "$250/mo", "$3,000/yr"
 *  read as a month's. A range is two figures and reads as none. */
export function monthlyOf(value: string | null | undefined): number | null {
  const v = clean(value).replace(/,/g, "");
  if (!v || RANGE.test(v)) return null;
  const m = v.match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const yearly = /\/\s*(?:yr|year)\b|per\s+year|annual(?:ly)?\b/i.test(v);
  return yearly ? n / 12 : n;
}

/** A share in percent: "45%", "45 percent". */
function pctOf(value: string | null | undefined): number | null {
  const m = clean(value).match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/** A period in months: "24 months", "2 years", "18-24 months" is none. */
function monthsOf(value: string | null | undefined): number | null {
  const v = clean(value);
  if (!v || RANGE.test(v)) return null;
  const mo = v.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/i);
  if (mo) return Number(mo[1]) > 0 ? Number(mo[1]) : null;
  const yr = v.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
  return yr && Number(yr[1]) > 0 ? Number(yr[1]) * 12 : null;
}

// ── The read ────────────────────────────────────────────────────────────

export interface ValueAddRead {
  /** doors the program will touch */
  doors: number | null;
  /** doors already renovated, where stated */
  renovated: number | null;
  costPerDoor: number | null;
  /** the monthly premium a renovated door earns, as stated (or the
   *  renovated rent less the classic rent) */
  premium: number | null;
  /** where the premium came from */
  premiumFrom: "stated" | "rents" | null;
  /** the premium the renovated units already earn, where stated */
  achievedPremium: number | null;
  classicRent: number | null;
  renovatedRent: number | null;
  /** the building's annual turnover, in % */
  turnoverPct: number | null;
  /** the program's stated length, in months */
  programMonths: number | null;
  /** the premium a year over the cost of a door, in % — the memorandum's
   *  own arithmetic */
  returnOnCostPct: number | null;
  /** the share of the classic units that must turn each year to finish in
   *  the stated period, in % */
  turnoverNeededPct: number | null;
  /** years to renovate every door if the classic units turn at the stated
   *  turnover */
  yearsAtTurnover: number | null;
  totalCost: number | null;
  /** the premium a year once every door is done */
  premiumNoi: number | null;
  page: string;
  /** the read a sentence at a time: the program and its return first, then
   *  the premium's proof, then the pace — a panel leads with the first and
   *  folds the rest its pictures draw */
  sentences: string[];
  headline: string;
}

const money = (n: number) => compactUsd(n, { millions: 2, trim: true, thousandsFrom: Infinity });
const dollars = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const pct = (n: number) => `${Math.round(n)}%`;
const years1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} years`;

/**
 * A value-add deal's renovation program, as stated. Null where the deal is
 * not a value-add (or states no program: no doors, no cost and no premium).
 */
export function readValueAdd(ex: ExtractionResult | null | undefined): ValueAddRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow);
  const toRenovate = find(rows, TO_RENOVATE);
  const costRow = find(rows, COST_PER);
  const premiumRow = find(rows, PREMIUM, ACHIEVED);
  const achievedRow = find(rows, ACHIEVED);
  const classicRow = find(rows, CLASSIC_RENT);
  const renovatedRentRow = find(rows, RENOVATED_RENT);
  const kind = inferStrategy(ex).kind;
  const stated = !!(toRenovate || costRow || premiumRow);
  if (kind !== "value_add" && !(toRenovate && (costRow || premiumRow))) return null;
  if (!stated) return null;

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const doors = toRenovate ? parseCount(toRenovate.value) : null;
  const renovatedRow = find(rows, RENOVATED, TO_RENOVATE);
  const renovated = renovatedRow ? parseCount(renovatedRow.value) : null;
  const costPerDoor = costRow ? renovationCostPerDoor(costRow.value) : null;
  const classicRent = classicRow ? monthlyOf(classicRow.value) : null;
  const renovatedRent = renovatedRentRow ? monthlyOf(renovatedRentRow.value) : null;
  const statedPremium = premiumRow ? monthlyOf(premiumRow.value) : null;
  const premium =
    statedPremium ?? (classicRent != null && renovatedRent != null && renovatedRent > classicRent ? renovatedRent - classicRent : null);
  const premiumFrom: ValueAddRead["premiumFrom"] = statedPremium != null ? "stated" : premium != null ? "rents" : null;
  const achievedPremium = achievedRow ? monthlyOf(achievedRow.value) : null;
  const turnoverRow = find(rows, TURNOVER);
  const turnoverPct = turnoverRow ? pctOf(turnoverRow.value) : null;
  const periodRow = find(rows, PERIOD);
  const programMonths = periodRow ? monthsOf(periodRow.value) : null;

  const returnOnCostPct = premium != null && costPerDoor != null ? ((premium * 12) / costPerDoor) * 100 : null;
  const turnoverNeededPct = programMonths != null ? Math.min(100, 100 / (programMonths / 12)) : null;
  const yearsAtTurnover = turnoverPct != null ? 100 / turnoverPct : null;
  const totalCost = doors != null && costPerDoor != null ? doors * costPerDoor : null;
  const premiumNoi = doors != null && premium != null ? doors * premium * 12 : null;
  const pageRow = toRenovate ?? costRow ?? premiumRow;
  const n = parsePageNumber(pageRow?.page);
  const page = n != null && pageCount != null && n <= pageCount ? clean(pageRow?.page) : "";

  const read: Omit<ValueAddRead, "headline" | "sentences"> = {
    doors,
    renovated,
    costPerDoor,
    premium,
    premiumFrom,
    achievedPremium,
    classicRent,
    renovatedRent,
    turnoverPct,
    programMonths,
    returnOnCostPct,
    turnoverNeededPct,
    yearsAtTurnover,
    totalCost,
    premiumNoi,
    page,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<ValueAddRead, "headline" | "sentences">): string[] {
  const parts: string[] = [];
  const doorsText = r.doors != null ? `${r.doors.toLocaleString("en-US")} ${r.doors === 1 ? "door" : "doors"}` : "the classic units";
  if (r.costPerDoor != null && r.premium != null) {
    parts.push(
      `The program renovates ${doorsText} at ${money(r.costPerDoor)} each for ${dollars(Math.round(r.premium * 100) / 100)} a month more rent: ${pct(r.returnOnCostPct!)} a year on the cost of every door once it is done${
        r.totalCost != null ? `, ${money(r.totalCost)} in all` : ""
      }.`,
    );
  } else if (r.premium != null) {
    parts.push(`The program renovates ${doorsText} for ${dollars(Math.round(r.premium * 100) / 100)} a month more rent; the memorandum states no cost a door.`);
  } else if (r.costPerDoor != null) {
    parts.push(`The program renovates ${doorsText} at ${money(r.costPerDoor)} each; the memorandum states no premium, so there is no return to read.`);
  }
  if (r.premiumFrom === "rents" && r.classicRent != null && r.renovatedRent != null) {
    parts.push(`The premium is the renovated rent of ${dollars(r.renovatedRent)} less the classic rent of ${dollars(r.classicRent)}, as stated.`);
  }
  if (r.achievedPremium != null) {
    parts.push(
      `${r.renovated != null ? `On the ${r.renovated.toLocaleString("en-US")} ${r.renovated === 1 ? "door" : "doors"} already renovated` : "On the doors already renovated"}, the premium achieved is ${dollars(
        Math.round(r.achievedPremium * 100) / 100,
      )} a month, as stated${
        r.premium != null && r.premiumFrom === "stated" && Math.abs(r.achievedPremium - r.premium) >= 1
          ? r.achievedPremium < r.premium
            ? ` — under the ${dollars(Math.round(r.premium * 100) / 100)} the program is priced on`
            : ` — over the ${dollars(Math.round(r.premium * 100) / 100)} the program is priced on`
          : ""
      }.`,
    );
  } else if (r.premium != null) {
    parts.push("No premium achieved on renovated units is stated: the premium is a projection until a door proves it.");
  }
  if (r.programMonths != null && r.turnoverNeededPct != null) {
    parts.push(
      `${withArticle(`${r.programMonths}-month program`, true)} needs ${pct(r.turnoverNeededPct)} of the classic units to turn each year, since a unit is renovated when its tenant leaves.`,
    );
    if (r.turnoverPct != null) {
      parts.push(
        r.turnoverPct + 0.5 < r.turnoverNeededPct
          ? `The building turns ${pct(r.turnoverPct)} a year, as stated: at that pace the program takes ${years1(r.yearsAtTurnover!)}.`
          : `The building turns ${pct(r.turnoverPct)} a year, as stated, enough for the stated period.`,
      );
    }
  } else if (r.turnoverPct != null && r.yearsAtTurnover != null) {
    parts.push(`The building turns ${pct(r.turnoverPct)} a year, as stated: renovating as the classic units turn takes ${years1(r.yearsAtTurnover)}.`);
  }
  return parts;
}

export interface ValueAddModel {
  holdMonths: number;
  exitCapPct: number;
  /** the model's first-year capital */
  capitalYr1: number;
  rentGrowthPct: number;
}

/** What the program is worth at the model's exit cap, and what the model
 *  does and does not carry of it. "" where the premium or the cost is not
 *  stated. */
export function valueAddModelLine(r: ValueAddRead, m: ValueAddModel): string {
  if (r.premium == null || r.costPerDoor == null || !(m.exitCapPct > 0)) return "";
  const cap = m.exitCapPct;
  const breakEven = (r.costPerDoor * cap) / 12;
  const perDoor = (r.premium * 12) / cap - r.costPerDoor;
  const value =
    r.doors != null
      ? `At the model's ${(cap * 100).toFixed(2)}% exit cap a door's premium is worth ${money((r.premium * 12) / cap)} against its ${money(r.costPerDoor)} cost — ${
          perDoor >= 0 ? `${money(perDoor)} a door, ${money(perDoor * r.doors)} across the program,` : `${money(-perDoor)} a door lost,`
        } and the premium breaks even at ${dollars(Math.round(breakEven * 100) / 100)} a month.`
      : `At the model's ${(cap * 100).toFixed(2)}% exit cap the premium breaks even at ${dollars(Math.round(breakEven * 100) / 100)} a month.`;
  const model =
    m.capitalYr1 > 0
      ? ` The screening model spends ${money(m.capitalYr1)} of capital in its first year and grows today's rent at ${(m.rentGrowthPct * 100).toFixed(1)}%: the premium is in none of its returns, so its IRR is not the program's.`
      : ` The screening model grows today's rent at ${(m.rentGrowthPct * 100).toFixed(1)}% and carries no renovation capital: the program is in none of its returns.`;
  return `${value}${model}`;
}

/** The pipeline row's tag: "Reno $250/mo, 20% on cost", "Reno $250/mo". */
export function valueAddTag(ex: ExtractionResult | null | undefined): string | null {
  const r = readValueAdd(ex);
  if (!r || r.premium == null) return null;
  const premium = `Reno ${dollars(Math.round(r.premium))}/mo`;
  return r.returnOnCostPct != null ? `${premium}, ${pct(r.returnOnCostPct)} on cost` : premium;
}

/** The program in one line, for the memo under its title, the workbook's
 *  cover and the report. */
export function valueAddShortLine(r: ValueAddRead): string {
  const parts: string[] = [];
  if (r.doors != null) parts.push(`${r.doors.toLocaleString("en-US")} ${r.doors === 1 ? "door" : "doors"} to renovate`);
  if (r.costPerDoor != null) parts.push(`${money(r.costPerDoor)} a door`);
  if (r.premium != null) parts.push(`${dollars(Math.round(r.premium * 100) / 100)} a month premium${r.returnOnCostPct != null ? ` (${pct(r.returnOnCostPct)} on cost)` : ""}`);
  parts.push(r.achievedPremium != null ? `${dollars(Math.round(r.achievedPremium * 100) / 100)} achieved on renovated units` : "no achieved premium stated");
  if (r.programMonths != null) parts.push(`${r.programMonths}-month program`);
  return `Value-add program: ${parts.join("; ")}`;
}

/** The program as the steps that read the memorandum after the extraction
 *  see it (lib/deal-context). */
export function valueAddContextLine(r: ValueAddRead): string {
  return `The renovation program: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The program's traps by name, for the assumption review. */
export function valueAddNote(r: ValueAddRead): string {
  const traps = [
    r.achievedPremium != null
      ? `(a) THE PREMIUM'S PROOF — the ${dollars(Math.round(r.achievedPremium * 100) / 100)} achieved on renovated units, against the premium the program is priced on: ask for the renovated units' own leases, not the average`
      : "(a) THE PREMIUM'S PROOF — no achieved premium is stated: ask for leases signed on renovated units, and treat the premium as a projection until they exist",
    "(b) THE PREMIUM IS TWO NUMBERS — the renovated comparable's rent over the subject's classic rent is what renovation buys PLUS the gap between two buildings; ask for the comparable's own classic rent",
    "(c) THE PACE — a unit is renovated when its tenant leaves: set the program's length against the rent roll's actual turnover, and the premium's ramp against it",
    "(d) THE COST — the invoice less the make-ready owed at the turn anyway, plus the extra days down at the classic rent, and a contingency the budget may not carry",
    "(e) THE CLOCK — the return on cost has none: the value is realised only at the sale, at the exit cap, on the doors done by then",
  ];
  return `${valueAddContextLine(r)}\n\nVALUE-ADD TRAPS, checked by name against the facts above: ${traps.join("; ")}.`;
}
