// Property actuals — the DETERMINISTIC analytics (Feature 1). PURE and
// LLM-FREE: the LLM extracts the raw rent-roll rows and T-12 line items with
// page refs; every consolidated figure below (occupancy, WALT, expiry buckets,
// weighted rent, reconstructed NOI, the OM-vs-actual delta) is computed here in
// code and unit-tested against known-answer fixtures. Given the same
// extraction it always returns the same summary.

import { parseMoney } from "@/lib/criteria";
import type {
  RentRollExtraction,
  RentRollSummary,
  ExpiryBuckets,
  T12Extraction,
  T12Summary,
  NoiComparison,
  ActualsSeverity,
} from "./types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Years from `fromISO` to `toISO`, or null when either date is unparseable. */
function yearsBetween(fromISO: string, toISO: string): number | null {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / MS_PER_YEAR;
}

/** The calendar anniversary `n` years after an ISO date, as epoch ms (UTC) —
 *  so an "expires in exactly 3 years" lease buckets the same way whether or
 *  not the window spans a leap day. Null when the date is unparseable. */
function anniversaryMs(iso: string, n: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate());
}

const sfOf = (sf: number | null): number =>
  typeof sf === "number" && Number.isFinite(sf) && sf > 0 ? sf : 0;

/**
 * Consolidate a rent roll into unit mix, occupancy, WALT, weighted rent, and
 * lease-expiry buckets. WALT and the buckets need a reference date — the roll's
 * own "as of" date, or `asOfOverride` (e.g. the screen date) — and are null
 * when none is available (never guessed).
 */
export function consolidateRentRoll(
  x: RentRollExtraction,
  asOfOverride?: string,
): RentRollSummary {
  const asOf = (x.asOfDate && x.asOfDate.trim()) || asOfOverride || "";
  const rows = x.rows;
  const occupied = rows.filter((r) => r.occupied);

  const totalSf = rows.reduce((s, r) => s + sfOf(r.sf), 0);
  const occupiedSf = occupied.reduce((s, r) => s + sfOf(r.sf), 0);
  const sfWeightedOccupancy = totalSf > 0 ? occupiedSf / totalSf : null;

  // WALT + expiry buckets over occupied units carrying BOTH SF and a parseable
  // expiry date. Time-to-expiry is floored at 0 (a lapsed lease is "now").
  // Buckets use CALENDAR anniversaries (≤1y / ≤3y / ≤5y from the as-of date),
  // so a same-day-anniversary lease lands in the same bucket whether or not
  // the window spans a leap day; WALT keeps mean-year arithmetic (an average).
  let waltNum = 0;
  let waltDen = 0;
  let expiryCoveredSf = 0;
  const bkt = { next12mo: 0, y1to3: 0, y3to5: 0, y5plus: 0 };
  const ann1 = asOf ? anniversaryMs(asOf, 1) : null;
  const ann3 = asOf ? anniversaryMs(asOf, 3) : null;
  const ann5 = asOf ? anniversaryMs(asOf, 5) : null;
  for (const r of occupied) {
    const sf = sfOf(r.sf);
    if (sf <= 0) continue;
    const raw = asOf ? yearsBetween(asOf, r.leaseExpiry) : null;
    if (raw == null || ann1 == null || ann3 == null || ann5 == null) continue;
    const y = Math.max(0, raw);
    waltNum += sf * y;
    waltDen += sf;
    expiryCoveredSf += sf;
    const exp = Date.parse(r.leaseExpiry);
    if (exp <= ann1) bkt.next12mo += sf;
    else if (exp <= ann3) bkt.y1to3 += sf;
    else if (exp <= ann5) bkt.y3to5 += sf;
    else bkt.y5plus += sf;
  }
  const waltYears = waltDen > 0 ? waltNum / waltDen : null;
  const expiryBuckets: ExpiryBuckets | null =
    expiryCoveredSf > 0
      ? {
          next12mo: bkt.next12mo / expiryCoveredSf,
          y1to3: bkt.y1to3 / expiryCoveredSf,
          y3to5: bkt.y3to5 / expiryCoveredSf,
          y5plus: bkt.y5plus / expiryCoveredSf,
        }
      : null;

  // SF-weighted in-place rent PSF over occupied units — stated PSF wins, else
  // derive from monthly rent × 12 ÷ SF.
  let rentNum = 0;
  let rentDen = 0;
  for (const r of occupied) {
    const sf = sfOf(r.sf);
    if (sf <= 0) continue;
    const psf =
      typeof r.rentPsf === "number" && r.rentPsf > 0
        ? r.rentPsf
        : typeof r.inPlaceRentMonthly === "number" && r.inPlaceRentMonthly > 0
          ? (r.inPlaceRentMonthly * 12) / sf
          : null;
    if (psf == null) continue;
    rentNum += sf * psf;
    rentDen += sf;
  }
  const weightedAvgRentPsf = rentDen > 0 ? rentNum / rentDen : null;

  return {
    unitCount: rows.length,
    occupiedUnits: occupied.length,
    totalSf,
    occupiedSf,
    sfWeightedOccupancy,
    waltYears,
    weightedAvgRentPsf,
    expiryBuckets,
    expiryCoveredSf,
    truncated: x.truncated,
  };
}

/**
 * Normalize a T-12 statement. EGI is reconstructed from collected rent − vacancy
 * + other income when the subtotal is missing; total opex from the line items;
 * and NOI from EGI − opex when the bottom line isn't stated (flagged derived).
 */
export function summarizeT12(x: T12Extraction): T12Summary {
  const egi =
    x.egi != null
      ? x.egi
      : x.collectedRent != null
        ? x.collectedRent - (x.vacancyLoss ?? 0) + (x.otherIncome ?? 0)
        : null;

  const totalOpex =
    x.totalOpex != null
      ? x.totalOpex
      : x.opex.length
        ? x.opex.reduce((s, l) => s + l.amount, 0)
        : null;

  let noi = x.noi;
  let noiDerived = false;
  if (noi == null && egi != null && totalOpex != null) {
    noi = egi - totalOpex;
    noiDerived = true;
  }

  return {
    collectedRent: x.collectedRent,
    vacancyLoss: x.vacancyLoss,
    otherIncome: x.otherIncome,
    egi,
    opex: x.opex,
    totalOpex,
    noi,
    noiDerived,
  };
}

/**
 * Pick the OM's assumed-NOI metric out of an extraction — ONE implementation
 * shared by the deal page's actuals card and the pipeline's challenger note,
 * so the two can never disagree. Word-bounded and per-unit-safe: "NOI per
 * unit" and "$/SF" figures are excluded, and \bnoi\b can't match inside
 * "Illinois". Prefers the stabilized / pro-forma figure (the sponsor's story)
 * over an in-place NOI; returns the parsed dollars alongside the metric.
 */
export function pickOmNoi(
  metrics: { label: string; value: string }[],
): { label: string; value: string; noi: number } | null {
  const INC = /net operating income|\bnoi\b/i;
  const EXC = /\bper\b|\/|psf|unit/i;
  const eligible = metrics.filter((m) => INC.test(m.label) && !EXC.test(m.label));
  const m =
    eligible.find((x) => /stab|pro ?forma|forward/i.test(x.label)) ?? eligible[0];
  if (!m) return null;
  const noi = parseMoney(m.value);
  return noi != null && Number.isFinite(noi) ? { ...m, noi } : null;
}

export function severityForNoiDelta(deltaPct: number): ActualsSeverity {
  const abs = Math.abs(deltaPct);
  if (abs > 0.1) return "red_flag";
  if (abs > 0.05) return "material";
  return "in_line";
}

/**
 * Compare the OM's assumed NOI to the T-12 actual. Delta is signed
 * (OM − actual) ÷ |actual|, so positive = the OM runs hot vs the actuals.
 * Severity: >10% red flag, >5% material, else in line.
 */
export function compareNoi(omNoi: number, t12Noi: number): NoiComparison {
  const deltaPct =
    t12Noi !== 0
      ? (omNoi - t12Noi) / Math.abs(t12Noi)
      : omNoi === 0
        ? 0
        : Infinity;
  const severity = severityForNoiDelta(deltaPct);
  const direction =
    Math.abs(deltaPct) <= 0.005 ? "in_line" : omNoi > t12Noi ? "above" : "below";
  return { omNoi, t12Noi, deltaPct, severity, direction };
}
