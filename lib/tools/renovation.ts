/**
 * The value-add renovation program — the page 12 of every multifamily
 * memorandum, and the one calculation in the business that is quoted as a
 * single multiplication.
 *
 *     $15,000 a door × 200 doors = $3,000,000
 *     $250 a month × 200 doors × 12 = $600,000
 *     "a twenty percent return on cost"
 *
 * Four things are wrong with that, they do not all point the same way, and
 * none of them is visible in the two lines above.
 *
 * Rule 1. TURNOVER SETS THE PACE, AND IT IS THE CONSTRAINT NOBODY WRITES
 * DOWN. Interiors get renovated when the resident leaves, so the schedule
 * is governed by how often that happens. A "24-month program" on 200 doors
 * needs a hundred turns a year — a 50% turnover rate the property may never
 * have posted. The pace is the LOWER of what turnover delivers and what the
 * crew can physically do, and the binding one is NAMED, the same convention
 * `sizeLoan` and `readEnvelope` use, because a constraint that binds without
 * being named is a constraint nobody manages.
 *
 * Rule 2. THE QUOTED PREMIUM IS TWO NUMBERS AND ONLY ONE OF THEM IS
 * RENOVATION. The memorandum prices the premium as the renovated comp's rent
 * less the subject's in-place rent, which decomposes exactly:
 *
 *     quoted = (renovatedComp − classicComp) + (classicComp − subjectInPlace)
 *                ^ what renovation buys         ^ the gap between two
 *                                                 buildings, which granite
 *                                                 does not close
 *
 * The second term is location, vintage, amenity and management. Spending on
 * the first does not collect the second. It is SIGNED, and the negative case
 * is real: where the subject already out-rents the comp's classic stock, the
 * quoted premium UNDERSTATES what renovation should achieve.
 *
 * Rule 3. THE MAKE-READY IS DEFERRED, NOT AVOIDED — AND THE DOWNTIME IS
 * NEITHER. `buyoutValue`'s rule, applied to a unit. Paint, carpet and clean
 * were going to be spent at the turn whatever happened, so charging the
 * whole invoice against the program counts money the owner already owed;
 * the incremental cost is the invoice LESS the make-ready. But the extra
 * weeks the unit sits down are a real loss and they are not in the cost per
 * door either. The two corrections run opposite ways, which is why neither
 * is ever made — each one alone looks like special pleading.
 *
 * Rule 4. THE RETURN ON COST HAS NO CLOCK IN IT. It is the figure every
 * memorandum leads with and it is the same number on a three-year hold and
 * a ten-year one — while the program's actual return is 63.7% and 13.7% on
 * those two, same premium, same cost, same building. The reason is
 * `pvFromExitPct`: most of a program's present value is the RESALE rather
 * than the rent it collects on the way, so the value is created once and
 * everything after that is just holding it. A renovation is a transaction,
 * not an income strategy, and a return on cost cannot tell you that.
 *
 * Which also makes the premium the one input doing double duty — it sets
 * the rent AND the exit, where the cap moves only the exit. Both shocks are
 * COMPUTED rather than asserted: the premium usually dominates, but not at
 * every hold and cap, and a card that asserted it would be wrong on the
 * deals where it is not.
 *
 * Pure, no I/O. Rents are monthly per door; costs are per door; the schedule
 * runs a year at a time, which is the granularity turnover is quoted at.
 */

import { irr } from "../underwrite/engine";

/**
 * The discount rate the present-value split is measured at — rule 4. An
 * opportunity cost, not a market rate: it is what the sponsor's own equity
 * would otherwise earn, so it sits at a levered equity return rather than a
 * cap rate. Exported so the card and the tests cannot drift from it.
 */
export const PROGRAM_DISCOUNT_PCT = 15;

/** The premium miss the shock prices, against a 50bp move in the exit cap. */
export const PREMIUM_MISS_PCT = 10;

/**
 * The longest program the schedule will build.
 *
 * It was a bare `year <= 30` guard against a thousand rows, and that quietly
 * created a worse problem than the one it solved: at a 1% turnover the card
 * reported `yearsToComplete` of 100, drew 30 bars covering 60 of 200 doors,
 * and printed a 42% return computed on that truncation — three figures none
 * of which described the same program. A pace that cannot finish inside this
 * is the finding, so the schedule comes back EMPTY and the note says so.
 */
export const MAX_PROGRAM_YEARS = 30;

/** The exit-cap widening the shock prices, in basis points. */
export const EXIT_CAP_SHOCK_BPS = 50;

/** Days in the year the downtime is charged against. */
const DAYS_PER_YEAR = 365;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function nonNegative(n: number | null | undefined): n is number {
  return real(n) && n >= 0;
}

export interface RenovationTerms {
  /** doors the program intends to touch */
  units: number | null;
  /** what a classic unit at the SUBJECT rents for today, monthly */
  inPlaceRent: number | null;
  /** what a RENOVATED unit at the comparable rents for, monthly — rule 2 */
  renovatedCompRent: number | null;
  /**
   * what a CLASSIC unit at the same comparable rents for, monthly. The line
   * that splits the quoted premium in two, and the line a memorandum
   * quoting a renovation premium almost never prints — rule 2.
   */
  classicCompRent: number | null;
  /** the renovation invoice, per door */
  costPerDoor: number | null;
  /** the make-ready owed at the turn regardless — rule 3 */
  makeReadyPerDoor: number | null;
  /** days a unit is down for a normal turn */
  normalTurnDays: number | null;
  /** days a unit is down for a renovated turn — rule 3 */
  renovationDownDays: number | null;
  /** the share of doors that vacate in a year, in % — rule 1 */
  annualTurnoverPct: number | null;
  /** what the crew can finish in a month, if that is the tighter one */
  crewDoorsPerMonth?: number | null;
  /** the cap rate the created value is sold at */
  exitCapPct: number | null;
  /** how long the property is held, in years */
  holdYears: number | null;
  /** the program the memorandum claims, in months — rule 1 */
  claimedProgramMonths?: number | null;
}

/** One year of the program. */
export interface ProgramYear {
  year: number;
  /** doors finished during the year */
  doors: number;
  /** doors finished by the end of it */
  doorsDone: number;
  /** capital spent, at the start of the year */
  capital: number;
  /** premium collected during the year, on a mid-year convention */
  premiumIncome: number;
}

export interface RenovationRead {
  /** rule 2 — the decomposition */
  quotedPremium: number | null;
  renovationPremium: number | null;
  buildingGap: number | null;
  buildingGapShareOfQuotedPct: number | null;
  /** rule 3 — the cost */
  downtimeCostPerDoor: number | null;
  netCostPerDoor: number | null;
  totalCapital: number | null;
  /** rule 1 — the pace */
  doorsFromTurnover: number | null;
  doorsFromCrew: number | null;
  paceDoorsPerYear: number | null;
  binding: "turnover" | "crew" | null;
  yearsToComplete: number | null;
  claimedYears: number | null;
  turnoverNeededForClaimPct: number | null;
  /** the headline, honestly computed, and the one the memorandum prints */
  returnOnCostPct: number | null;
  quotedReturnOnCostPct: number | null;
  /** what the program is worth */
  stabilizedPremiumNoi: number | null;
  valuePerDoor: number | null;
  valueCreated: number | null;
  quotedValueCreated: number | null;
  breakEvenPremium: number | null;
  /** rule 4 */
  schedule: ProgramYear[];
  programIrrPct: number | null;
  pvFromExitPct: number | null;
  /** the same program sold the year it finishes — rule 4's clock */
  completionYear: number | null;
  irrIfSoldAtCompletionPct: number | null;
  /** true where the pace cannot finish the program inside MAX_PROGRAM_YEARS */
  paceTooSlow: boolean | null;
  irrIfPremiumMissesPct: number | null;
  irrIfExitCapWidensPct: number | null;
  doorsDoneByExit: number | null;
  undoneAtExit: number | null;
  note: string | null;
}

const EMPTY: RenovationRead = {
  quotedPremium: null,
  renovationPremium: null,
  buildingGap: null,
  buildingGapShareOfQuotedPct: null,
  downtimeCostPerDoor: null,
  netCostPerDoor: null,
  totalCapital: null,
  doorsFromTurnover: null,
  doorsFromCrew: null,
  paceDoorsPerYear: null,
  binding: null,
  yearsToComplete: null,
  claimedYears: null,
  turnoverNeededForClaimPct: null,
  returnOnCostPct: null,
  quotedReturnOnCostPct: null,
  stabilizedPremiumNoi: null,
  valuePerDoor: null,
  valueCreated: null,
  quotedValueCreated: null,
  breakEvenPremium: null,
  schedule: [],
  programIrrPct: null,
  pvFromExitPct: null,
  completionYear: null,
  irrIfSoldAtCompletionPct: null,
  paceTooSlow: null,
  irrIfPremiumMissesPct: null,
  irrIfExitCapWidensPct: null,
  doorsDoneByExit: null,
  undoneAtExit: null,
  note: null,
};

export function readRenovation(t: RenovationTerms): RenovationRead {
  if (!positive(t.units)) {
    return { ...EMPTY, note: "Enter how many doors the program would touch." };
  }
  if (!positive(t.costPerDoor)) {
    return { ...EMPTY, note: "Enter the renovation cost per door." };
  }
  if (!positive(t.renovatedCompRent) || !positive(t.inPlaceRent)) {
    return {
      ...EMPTY,
      note: "Enter the in-place rent and the renovated rent the program is priced against.",
    };
  }

  const units = Math.floor(t.units);

  // Rule 2. The quoted premium, and the two pieces it is actually made of.
  // Without the comp's own classic rent there is nothing to split against,
  // so the whole quoted figure stands as the renovation premium — which is
  // exactly the assumption the memorandum is making silently.
  const quotedPremium = t.renovatedCompRent - t.inPlaceRent;
  const classicComp = positive(t.classicCompRent) ? t.classicCompRent : null;
  const renovationPremium =
    classicComp === null ? quotedPremium : t.renovatedCompRent - classicComp;
  const buildingGap = classicComp === null ? null : classicComp - t.inPlaceRent;

  // Rule 3. The invoice is not the cost. The make-ready comes out because
  // it was owed at the turn anyway; the extra days down go in because they
  // are a loss the cost per door never mentions.
  const makeReady = nonNegative(t.makeReadyPerDoor) ? t.makeReadyPerDoor : 0;
  const normalDays = nonNegative(t.normalTurnDays) ? t.normalTurnDays : 0;
  const renoDays = nonNegative(t.renovationDownDays) ? t.renovationDownDays : 0;
  // Never negative: a renovation that takes LESS time than a normal turn is
  // a data-entry error, not a rent credit.
  const extraDays = Math.max(0, renoDays - normalDays);
  // Charged at the CLASSIC rent, because that is what the unit would have
  // been re-let at had it taken a normal turn. Charging the renovated rent
  // would bill the program for rent that only exists because of it.
  const downtimeCost = (extraDays / DAYS_PER_YEAR) * t.inPlaceRent * 12;
  // Rounded HERE, once, and everything downstream derives from the rounded
  // figure — the debt schedule's rule. A reader multiplying the cost per
  // door on the card by the door count has to land on the total the card
  // prints, and an unrounded downtime residue put those $85 apart.
  const netCostPerDoor = round(t.costPerDoor - makeReady + downtimeCost);
  // A make-ready larger than the invoice would mean being PAID to renovate,
  // which produced a positive value per door and a negative break-even
  // premium — every figure downstream nonsense. The same reasoning already
  // refuses a renovation shorter than a normal turn; this is that guard
  // applied to the other half of rule 3.
  if (netCostPerDoor <= 0) {
    return {
      ...EMPTY,
      note: "The make-ready is at or above the renovation invoice, so the program costs nothing incremental — check the two figures rather than reading a return off them.",
    };
  }
  const totalCapital = units * netCostPerDoor;

  // Rule 1. The pace, and which of the two constraints sets it.
  const fromTurnover = positive(t.annualTurnoverPct) ? units * (t.annualTurnoverPct / 100) : null;
  const fromCrew = positive(t.crewDoorsPerMonth) ? t.crewDoorsPerMonth * 12 : null;
  const pace =
    fromTurnover === null && fromCrew === null
      ? null
      : Math.min(fromTurnover ?? Infinity, fromCrew ?? Infinity);
  const binding: "turnover" | "crew" | null =
    pace === null ? null : fromTurnover !== null && pace === fromTurnover ? "turnover" : "crew";
  const yearsToComplete = pace === null || pace <= 0 ? null : units / pace;
  // A. The schedule is only built where the program can actually finish.
  const paceTooSlow = yearsToComplete !== null && yearsToComplete > MAX_PROGRAM_YEARS;

  // What the memorandum's own program length would require of TURNOVER —
  // the claim restated in the one unit that can be checked against the rent
  // roll. The door count cancels out of it (a two-year program turns half
  // the book a year whether the book is 40 doors or 400), which is why it
  // is a share and not a count. It assumes the crew can keep up; where the
  // crew is the binding constraint no turnover rate reaches the claim.
  const claimedYears = positive(t.claimedProgramMonths) ? t.claimedProgramMonths / 12 : null;
  const turnoverNeeded = claimedYears === null ? null : 100 / claimedYears;

  // Rounded to the cent before anything is built on it, for the same reason
  // the cost is: the premium is a rent and the card prints it.
  const annualPremium = round(renovationPremium, 2) * 12;
  const stabilizedPremiumNoi = units * annualPremium;
  const returnOnCost = netCostPerDoor > 0 ? (annualPremium / netCostPerDoor) * 100 : null;
  // The memorandum's own arithmetic, kept whole so the two can be set side
  // by side: the quoted premium over the gross invoice.
  const quotedReturnOnCost = t.costPerDoor > 0 ? ((quotedPremium * 12) / t.costPerDoor) * 100 : null;

  const cap = positive(t.exitCapPct) ? t.exitCapPct / 100 : null;
  const valuePerDoor = cap === null ? null : annualPremium / cap - netCostPerDoor;
  const valueCreated = valuePerDoor === null ? null : units * valuePerDoor;
  const quotedValueCreated =
    cap === null ? null : units * ((quotedPremium * 12) / cap - t.costPerDoor);
  // The premium at which the program creates exactly nothing: the honest
  // floor, and the reason this is an argument about how much rather than
  // about whether.
  const breakEvenPremium = cap === null ? null : (netCostPerDoor * cap) / 12;

  // Rule 4. The schedule.
  const hold = positive(t.holdYears) ? Math.round(t.holdYears) : null;
  const schedule =
    pace === null || pace <= 0 || paceTooSlow
      ? []
      : buildSchedule(units, pace, netCostPerDoor, annualPremium);

  const run =
    hold === null || cap === null || schedule.length === 0
      ? null
      : runProgram(schedule, hold, cap, units, annualPremium);

  const missed =
    hold === null || cap === null || pace === null || pace <= 0 || paceTooSlow
      ? null
      : runProgram(
          buildSchedule(units, pace, netCostPerDoor, annualPremium * (1 - PREMIUM_MISS_PCT / 100)),
          hold,
          cap,
          units,
          annualPremium * (1 - PREMIUM_MISS_PCT / 100),
        );

  const widened =
    hold === null || cap === null || schedule.length === 0
      ? null
      : runProgram(schedule, hold, cap + EXIT_CAP_SHOCK_BPS / 10_000, units, annualPremium);

  // Rule 4. The same program sold the year it finishes — the clock the
  // return on cost does not have. Only worth drawing where the stated hold
  // is longer, which is the case that has something to say.
  const completionYear = yearsToComplete === null ? null : Math.ceil(yearsToComplete);
  const atCompletion =
    completionYear === null || cap === null || schedule.length === 0 || hold === null
      ? null
      : runProgram(schedule, completionYear, cap, units, annualPremium);

  // Taken off the schedule rather than from pace × hold, so the figure the
  // card prints and the doors the exit is credited for are one number.
  const doneByExit =
    hold === null
      ? null
      : Math.min(
          units,
          Math.round(schedule.filter((r) => r.year <= hold).reduce((s, r) => s + r.doors, 0)),
        );

  const x: RenovationRead = {
    quotedPremium: round(quotedPremium, 2),
    renovationPremium: round(renovationPremium, 2),
    buildingGap: buildingGap === null ? null : round(buildingGap, 2),
    buildingGapShareOfQuotedPct:
      buildingGap === null || quotedPremium === 0 ? null : round1((buildingGap / quotedPremium) * 100),
    downtimeCostPerDoor: round(downtimeCost),
    netCostPerDoor: round(netCostPerDoor),
    totalCapital: round(totalCapital),
    doorsFromTurnover: fromTurnover === null ? null : round1(fromTurnover),
    doorsFromCrew: fromCrew === null ? null : round1(fromCrew),
    paceDoorsPerYear: pace === null ? null : round1(pace),
    binding,
    yearsToComplete: yearsToComplete === null ? null : round1(yearsToComplete),
    claimedYears: claimedYears === null ? null : round1(claimedYears),
    turnoverNeededForClaimPct: turnoverNeeded === null ? null : round1(turnoverNeeded),
    returnOnCostPct: returnOnCost === null ? null : round1(returnOnCost),
    quotedReturnOnCostPct: quotedReturnOnCost === null ? null : round1(quotedReturnOnCost),
    stabilizedPremiumNoi: round(stabilizedPremiumNoi),
    valuePerDoor: valuePerDoor === null ? null : round(valuePerDoor),
    valueCreated: valueCreated === null ? null : round(valueCreated),
    quotedValueCreated: quotedValueCreated === null ? null : round(quotedValueCreated),
    breakEvenPremium: breakEvenPremium === null ? null : round(breakEvenPremium, 2),
    schedule,
    programIrrPct: run === null || run.rate === null ? null : round1(run.rate * 100),
    pvFromExitPct: run === null ? null : run.pvFromExitPct,
    completionYear,
    paceTooSlow,
    irrIfSoldAtCompletionPct:
      atCompletion === null || atCompletion.rate === null ? null : round1(atCompletion.rate * 100),
    irrIfPremiumMissesPct: missed === null || missed.rate === null ? null : round1(missed.rate * 100),
    irrIfExitCapWidensPct:
      widened === null || widened.rate === null ? null : round1(widened.rate * 100),
    doorsDoneByExit: doneByExit,
    undoneAtExit: doneByExit === null ? null : units - doneByExit,
    note: null,
  };
  return { ...x, note: noteFor(x) };
}

/**
 * The program year by year. Capital is spent at the START of the year the
 * doors are done in; the premium is collected DURING it, so a door finished
 * evenly through the year earns half a year of it — the mid-year convention,
 * and the whole reason the honest return is below the headline.
 */
function buildSchedule(
  units: number,
  pace: number,
  netCostPerDoor: number,
  annualPremium: number,
): ProgramYear[] {
  const rows: ProgramYear[] = [];
  let done = 0;
  let year = 1;
  // A pace that cannot finish inside the cap is reported as such rather than
  // truncated — see MAX_PROGRAM_YEARS. The caller checks first; this is the
  // belt to that brace.
  while (done < units && year <= MAX_PROGRAM_YEARS) {
    const doors = Math.min(pace, units - done);
    const before = done;
    done += doors;
    rows.push({
      year,
      doors: round1(doors),
      doorsDone: round1(done),
      capital: round(doors * netCostPerDoor),
      premiumIncome: round((before + doors / 2) * annualPremium),
    });
    year += 1;
  }
  return rows;
}

/**
 * The program's own cash flows, and the share of their present value that
 * is the resale rather than the rent — rule 4.
 *
 * Incremental throughout: this is the renovation's stream, not the deal's.
 * The exit credits only the doors ACTUALLY FINISHED by then. A buyer
 * underwrites the rest as their own value-add story and pays for it in
 * their price, not in yours.
 */
function runProgram(
  schedule: ProgramYear[],
  hold: number,
  cap: number,
  units: number,
  annualPremium: number,
): { rate: number | null; pvFromExitPct: number } {
  const flows: number[] = new Array(hold + 1).fill(0);
  // A year that falls outside the hold never happens: the building was sold
  // before it started, so neither its capital nor its premium is the
  // seller's. Charging the capital and skipping the income — the easy
  // version of this loop — would price a program half-run as if the money
  // had gone out anyway.
  for (const row of schedule) {
    if (row.year > hold) continue;
    flows[row.year - 1] -= row.capital;
    flows[row.year] += row.premiumIncome;
  }
  // Doors finished within the hold — a year's doors count only if the year
  // itself closed inside it.
  const finished = schedule.filter((r) => r.year <= hold).reduce((s, r) => s + r.doors, 0);
  const doorsAtExit = Math.min(units, finished);
  const exitValue = cap > 0 ? (doorsAtExit * annualPremium) / cap : 0;
  flows[hold] += exitValue;

  const d = PROGRAM_DISCOUNT_PCT / 100;
  const pvExit = exitValue / Math.pow(1 + d, hold);
  // The rent the program collects on the way, discounted on its own. NOT
  // the net stream: the capital is what buys both halves, so netting it in
  // here drives the operating side negative and reports every program as
  // 100% resale — which is what the first version of this did, and it read
  // as a finding rather than as the arithmetic error it was.
  const pvRent = schedule
    .filter((r) => r.year <= hold)
    .reduce((s, r) => s + r.premiumIncome / Math.pow(1 + d, r.year), 0);
  const gross = pvRent + pvExit;
  return {
    rate: irr(flows),
    pvFromExitPct: gross > 0 ? round1((pvExit / gross) * 100) : 0,
  };
}

/**
 * The one sentence. It leads with rule 2 where the split exists, because a
 * premium that is half location is the finding that changes the bid — and
 * with rule 1 otherwise, because a program that cannot run at the claimed
 * pace is the next thing wrong with the page.
 */
function noteFor(x: RenovationRead): string {
  if (
    x.buildingGap !== null &&
    x.buildingGap > 0 &&
    x.buildingGapShareOfQuotedPct !== null &&
    x.returnOnCostPct !== null &&
    x.quotedReturnOnCostPct !== null
  ) {
    return `Of the ${usd(x.quotedPremium ?? 0)} premium being quoted, ${usd(x.buildingGap)} is the gap to a different building rather than anything renovation buys — ${x.buildingGapShareOfQuotedPct}% of it. Corrected, and net of the make-ready the turn owed anyway, the ${x.quotedReturnOnCostPct}% return on cost is ${x.returnOnCostPct}%.`;
  }
  if (x.buildingGap !== null && x.buildingGap < 0) {
    return `The subject already out-rents the comparable's classic stock by ${usd(Math.abs(x.buildingGap))}, so the quoted premium UNDERSTATES what renovation should achieve here — ${usd(x.renovationPremium ?? 0)} a door rather than ${usd(x.quotedPremium ?? 0)}.`;
  }
  if (x.paceTooSlow === true && x.paceDoorsPerYear !== null && x.yearsToComplete !== null) {
    return `At ${x.paceDoorsPerYear} doors a year the program takes ${x.yearsToComplete} years, which is a pace rather than a plan — nothing past ${MAX_PROGRAM_YEARS} years is scheduled, and no return is reported off a program that cannot finish.`;
  }
  if (x.undoneAtExit !== null && x.undoneAtExit > 0) {
    return `${x.undoneAtExit} of the ${(x.doorsDoneByExit ?? 0) + x.undoneAtExit} doors are still classic at the sale — the program outlasts the hold, so the buyer underwrites the rest as their own story and pays for it in their price rather than yours.`;
  }
  if (
    x.claimedYears !== null &&
    x.yearsToComplete !== null &&
    x.yearsToComplete > x.claimedYears &&
    x.paceDoorsPerYear !== null
  ) {
    return `At ${x.paceDoorsPerYear} doors a year the program takes ${x.yearsToComplete} years, not the ${x.claimedYears} claimed — ${x.binding === "turnover" ? "turnover" : "the crew"} binds, and nothing on the page says so.`;
  }
  if (
    x.pvFromExitPct !== null &&
    x.programIrrPct !== null &&
    x.irrIfSoldAtCompletionPct !== null &&
    x.completionYear !== null
  ) {
    return `${x.pvFromExitPct}% of the program's present value is the resale rather than the rent it collects, so the value is made once — sold the year it finishes it earns ${x.irrIfSoldAtCompletionPct}%, held to the stated exit ${x.programIrrPct}%, on the same premium and the same cost.`;
  }
  if (x.returnOnCostPct !== null) {
    return `${x.returnOnCostPct}% on cost, net of the make-ready the turn owed anyway. Enter the comparable's own classic rent to split the premium from the building.`;
  }
  return "Enter the renovation cost and the rents it is priced against.";
}

function usd(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
