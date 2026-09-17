/**
 * A below-market lease, and what it is worth to end it.
 *
 * The most common asset-management question there is, and the one people
 * answer with the wrong arithmetic in both directions at once.
 *
 * The naive version: market rent less in-place rent, times the feet, times
 * the years left, discounted. That is the "prize". Then subtract the cost
 * of re-tenanting — downtime, tenant improvements, a leasing commission —
 * and offer the tenant the difference.
 *
 * Both halves of that are wrong.
 *
 *   1. **The re-tenanting cost is not avoided by waiting, only DEFERRED.**
 *      The lease ends eventually; the downtime, the improvement allowance
 *      and the commission are owed either way. Charging their full amount
 *      against the buyout counts a cost the landlord was always going to
 *      pay. What the buyout really costs is the time value of paying it
 *      sooner, which is a fraction of it.
 *
 *      The error runs the other way too, and further than a shading. On
 *      the seeded lease at $38 rather than $28 — a $4 spread against a
 *      $42 market — the spread calculation says pay the tenant $908,072
 *      to leave, and the honest answer is MINUS $527,092: the landlord
 *      should pay them to stay. A $4 spread is $160,000 a year and the
 *      turnover it drags forward carries at more than that. A test pins
 *      the sign flip, because a tool that only ever shades a number is
 *      not worth opening.
 *
 *   2. **The prize is not the spread either.** Ending the lease does not
 *      hand the landlord market rent from tomorrow; it hands them the
 *      downtime first. So the honest answer is not a spread at all — it is
 *      the difference between TWO CASH FLOW STREAMS, one where the lease
 *      runs its course and one where it ends now, over the same horizon.
 *      `buyoutValue` is exactly that difference, and nothing else.
 *
 *      It follows, and a test pins it, that **a lease with nothing left to
 *      run is worth nothing to buy out.** The two streams are the same
 *      stream. Every intuition that starts from the spread gets this
 *      wrong, because the spread is still there on the last day.
 *
 *      The relationship between the two answers is exact, and a test pins
 *      it: strip the turnover out — no downtime, no allowance, no
 *      commission — and `buyoutValue` equals the naive spread figure to
 *      the dollar. The naive calculation is not a different model; it is
 *      this one with its hidden assumption made true. Everything between
 *      the two numbers is the turnover, which on the seeded lease is
 *      $1,435,163 of a $2,933,935 headline.
 *
 *   3. **The tenant's floor is not the landlord's ceiling**, and the gap
 *      between them is usually NEGATIVE. Both sides are valuing the same
 *      spread: to the landlord it is money coming, to the tenant it is
 *      money saved. The spread therefore CANCELS — with no friction, no
 *      move and the same discount rate on both sides, the zone of
 *      possible agreement is exactly ZERO, which a test pins, and it is
 *      the cleanest way to see that a buyout creates no value of itself.
 *      Put the frictions back and the zone goes negative by their amount.
 *
 *      Which is why most buyouts do not happen, and why the ones that do
 *      turn on something the spread does not contain. This module asks
 *      for the two that matter. **Vacant possession may be worth more
 *      than the rent** — a block to assemble, a building to sell clean, a
 *      redevelopment that cannot start with a tenant in it — so
 *      `outsideValue` is an input, and the note says the deal lives or
 *      dies on it. And **the two sides discount differently**: a tenant
 *      who needs the cash today prices a future saving far below what the
 *      landlord prices a future gain, which opens a deal on its own.
 *
 * Conventions shared with the rest of `/tools`, deliberately: escalations
 * step annually on the lease's own anniversary (`lease-math`), and the
 * commission is written against the GROSS rent over the new term rather
 * than the effective rent. The streams run MONTHLY because downtime is
 * quoted in months and an annual grid cannot hold it (`debt-math`'s rule).
 *
 * Pure, no I/O.
 */

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

export interface BuyoutTerms {
  /** the space, in square feet */
  sf: number | null;
  /** what the tenant pays now, per SF per year */
  inPlaceRentPsf: number | null;
  /** what the space would let for today, per SF per year */
  marketRentPsf: number | null;
  /** years left to run on the existing lease */
  yearsRemaining: number | null;
  /** the existing lease's own annual step, in % */
  inPlaceEscalationPct: number | null;
  /** what market rent is expected to do, % a year */
  marketGrowthPct: number | null;
  /** the landlord's discount rate, % */
  landlordRatePct: number | null;
  /** the tenant's, which is rarely the same number */
  tenantRatePct: number | null;
  /** months empty before a replacement tenant pays */
  downtimeMonths: number | null;
  /** improvement allowance on the replacement lease, per SF */
  tiPsf: number | null;
  /** leasing commission, % of the new lease's gross rent */
  commissionPct: number | null;
  /** the replacement lease's term, in years */
  newTermYears: number | null;
  /** what vacant possession is worth beyond the rent */
  outsideValue: number | null;
  /** what it costs the tenant to move, all in */
  tenantMovingCost: number | null;
}

export interface BuyoutRead {
  /** market less in-place, per SF, today */
  spreadPsf: number | null;
  /** that spread across the whole space, in year one */
  spreadAnnual: number | null;
  /** the re-tenanting bill, whenever it falls due */
  reTenantingCost: number | null;
  /** improvement allowance and commission, separately */
  tiCost: number | null;
  commissionCost: number | null;
  /** rent forgone during the downtime, at the market rent of that day */
  downtimeCost: number | null;
  /**
   * The difference between the two streams — the most the buyout is
   * worth to the landlord BEFORE anything outside the rent.
   */
  buyoutValue: number | null;
  /** the same with vacant possession counted */
  landlordCeiling: number | null;
  /** what the tenant gives up, at the tenant's own rate, plus moving */
  tenantFloor: number | null;
  /** ceiling less floor: positive means there is a deal in it */
  zopa: number | null;
  /** what the naive spread calculation would have said */
  naiveSpreadPv: number | null;
  note: string;
}

const EMPTY: BuyoutRead = {
  spreadPsf: null,
  spreadAnnual: null,
  reTenantingCost: null,
  tiCost: null,
  commissionCost: null,
  downtimeCost: null,
  buyoutValue: null,
  landlordCeiling: null,
  tenantFloor: null,
  zopa: null,
  naiveSpreadPv: null,
  note: "",
};

/**
 * The rent owed in month `m` by a lease that began in month `start` at
 * `psf` a foot, stepping `escPct` on each of its own anniversaries.
 *
 * Zero before the lease begins. The step is annual and dated from the
 * lease's own start, never from the analysis date — the convention
 * `lease-math` uses, and the one that prices free rent correctly.
 */
function rentAt(
  m: number,
  start: number,
  psf: number,
  escPct: number,
  sf: number,
): number {
  if (m < start) return 0;
  const years = Math.floor((m - start) / 12);
  return (psf * Math.pow(1 + escPct / 100, years) * sf) / 12;
}

/** Present value of a monthly stream at an annual nominal rate. */
function pv(monthly: number[], annualPct: number): number {
  const r = annualPct / 100 / 12;
  return monthly.reduce((acc, c, m) => acc + c / Math.pow(1 + r, m), 0);
}

export function readBuyout(terms: BuyoutTerms): BuyoutRead {
  const {
    sf,
    inPlaceRentPsf,
    marketRentPsf,
    yearsRemaining,
    inPlaceEscalationPct,
    marketGrowthPct,
    landlordRatePct,
    tenantRatePct,
    downtimeMonths,
    tiPsf,
    commissionPct,
    newTermYears,
    outsideValue,
    tenantMovingCost,
  } = terms;

  if (!positive(sf)) {
    return { ...EMPTY, note: "Enter the size of the space." };
  }
  if (!positive(inPlaceRentPsf) || !positive(marketRentPsf)) {
    return { ...EMPTY, note: "Enter the rent in place and the rent the space would let for." };
  }

  const spreadPsf = round(marketRentPsf - inPlaceRentPsf, 2);
  const spreadAnnual = round(spreadPsf * sf);

  if (!real(yearsRemaining) || yearsRemaining < 0 || !positive(landlordRatePct)) {
    return {
      ...EMPTY,
      spreadPsf,
      spreadAnnual,
      note:
        `The space is ${spreadPsf} a foot under market, worth ${spreadAnnual} a year. ` +
        "Enter the years left and a discount rate to price ending it.",
    };
  }

  const esc = real(inPlaceEscalationPct) ? inPlaceEscalationPct : 0;
  const growth = real(marketGrowthPct) ? marketGrowthPct : 0;
  const down = real(downtimeMonths) && downtimeMonths > 0 ? Math.round(downtimeMonths) : 0;
  const newTerm = positive(newTermYears) ? newTermYears : 0;
  const ti = real(tiPsf) && tiPsf > 0 ? round(tiPsf * sf) : 0;

  const remainMonths = Math.round(yearsRemaining * 12);
  const newTermMonths = Math.round(newTerm * 12);
  // One horizon for both streams, long enough that each reaches the end of
  // the same replacement lease. Comparing streams of different lengths is
  // the other way to get this wrong.
  const horizon = remainMonths + down + newTermMonths;

  // The replacement lease's rent, at the market of the day it starts.
  const marketAt = (m: number) => marketRentPsf * Math.pow(1 + growth / 100, m / 12);

  // Rule 1: this bill is owed either way. It is charged to BOTH streams,
  // at the month each one actually pays it.
  const startIfWait = remainMonths + down;
  const newPsfIfWait = marketAt(startIfWait);
  const newPsfIfNow = marketAt(down);
  const grossOver = (psf: number) => {
    let g = 0;
    for (let y = 0; y < newTerm; y += 1) {
      g += psf * Math.pow(1 + growth / 100, y) * sf;
    }
    return g;
  };
  const commissionOf = (psf: number) =>
    real(commissionPct) && commissionPct > 0
      ? round((commissionPct / 100) * grossOver(psf))
      : 0;

  const commissionIfNow = commissionOf(newPsfIfNow);
  const commissionIfWait = commissionOf(newPsfIfWait);
  const tiCost = ti;
  const commissionCost = commissionIfNow;
  const reTenantingCost = round(ti + commissionIfNow);

  // Stream A — the lease runs its course, then the space turns over.
  const waitStream: number[] = [];
  // Stream B — the lease ends today and the space turns over now.
  const nowStream: number[] = [];
  for (let m = 0; m < horizon; m += 1) {
    waitStream.push(
      m < remainMonths
        ? rentAt(m, 0, inPlaceRentPsf, esc, sf)
        : rentAt(m, startIfWait, newPsfIfWait, growth, sf),
    );
    nowStream.push(rentAt(m, down, newPsfIfNow, growth, sf));
  }
  // The turnover bill, each stream at its own moment.
  waitStream[Math.min(remainMonths, horizon - 1)] -= ti + commissionIfWait;
  nowStream[0] -= ti + commissionIfNow;

  const buyoutValue = round(
    pv(nowStream, landlordRatePct) - pv(waitStream, landlordRatePct),
  );

  // The rent the landlord goes without while the space is empty, priced
  // at the market rent of those months — reported, never subtracted a
  // second time, since the streams already carry it.
  let downtimeCost = 0;
  for (let m = 0; m < down; m += 1) downtimeCost += (newPsfIfNow * sf) / 12;
  downtimeCost = round(downtimeCost);

  // What the naive calculation says, kept so the two can be compared.
  const spreadStream: number[] = [];
  for (let m = 0; m < remainMonths; m += 1) {
    spreadStream.push(
      rentAt(m, 0, marketRentPsf, growth, sf) - rentAt(m, 0, inPlaceRentPsf, esc, sf),
    );
  }
  const naiveSpreadPv = round(pv(spreadStream, landlordRatePct));

  const landlordCeiling = round(
    buyoutValue + (real(outsideValue) ? outsideValue : 0),
  );

  // Rule 3: the tenant is valuing the SAME spread, at their own rate.
  let tenantFloor: number | null = null;
  if (positive(tenantRatePct)) {
    tenantFloor = round(
      pv(spreadStream, tenantRatePct) +
        (real(tenantMovingCost) && tenantMovingCost > 0 ? tenantMovingCost : 0),
    );
  }
  const zopa = tenantFloor === null ? null : round(landlordCeiling - tenantFloor);

  const notes: string[] = [];
  if (remainMonths === 0) {
    notes.push(
      "The lease has nothing left to run, so ending it early is worth nothing — " +
        "the space turns over on the same day either way. " +
        `The ${spreadPsf} a foot of spread is still there on the last day, which is ` +
        "why starting from the spread gets this wrong.",
    );
  } else {
    notes.push(
      `Ending the lease is worth ${buyoutValue} to the landlord: ` +
        `${Math.round((yearsRemaining ?? 0) * 10) / 10} years of market rent instead of in-place, ` +
        "less the cost of turning the space over sooner than it had to be turned over.",
    );
    if (naiveSpreadPv > buyoutValue) {
      notes.push(
        `Taking the spread alone would have said ${naiveSpreadPv} — ` +
          `${round(naiveSpreadPv - buyoutValue)} too much, because it hands the landlord ` +
          "market rent from tomorrow and there is a vacancy in between.",
      );
    }
  }
  if (zopa !== null) {
    if (zopa >= 0) {
      notes.push(
        `There is a deal in it: the landlord can go to ${landlordCeiling} and the tenant ` +
          `should take ${tenantFloor}, so ${zopa} is on the table.`,
      );
    } else {
      notes.push(
        `There is no deal on these terms — the landlord can pay ${landlordCeiling} and the ` +
          `tenant needs ${tenantFloor}. The spread is a transfer and cancels between them; ` +
          "what is left is the turnover and the move, which are a cost to both. A buyout " +
          "happens when vacant possession is worth something the rent does not contain, or " +
          "when the tenant discounts the future far harder than the landlord does.",
      );
    }
  }

  return {
    spreadPsf,
    spreadAnnual,
    reTenantingCost,
    tiCost,
    commissionCost,
    downtimeCost,
    buyoutValue,
    landlordCeiling,
    tenantFloor,
    zopa,
    naiveSpreadPv,
    note: notes.join(" "),
  };
}
