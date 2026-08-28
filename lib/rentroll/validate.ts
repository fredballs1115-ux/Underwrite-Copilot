/**
 * Import validation. The rule here is SURFACE, DON'T SWALLOW: a rent roll whose
 * SF sums past the building's NRA, or whose rent is an order of magnitude off
 * the set median, is telling you something — usually a units mismatch or a
 * totals row that slipped through. Silently normalizing it produces a clean
 * dashboard built on a wrong number.
 *
 * Pure.
 */
import type { Lease } from "./schema";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code:
    | "sf_exceeds_nra"
    | "expiry_before_start"
    | "rent_psf_outlier"
    | "duplicate_suite"
    | "missing_expiry"
    | "missing_sf"
    | "mixed_rent_basis"
    | "no_leases";
  message: string;
  /** source rows the issue points at */
  rows: number[];
}

export interface ValidateOptions {
  /** building NRA, when the user has stated it */
  nra?: number | null;
  /** how far off the median rent PSF counts as an outlier (multiplicative) */
  outlierFactor?: number;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function validateLeases(
  leases: Lease[],
  options: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outlierFactor = options.outlierFactor ?? 10;

  if (leases.length === 0) {
    return [
      {
        severity: "error",
        code: "no_leases",
        message:
          "No lease rows were found. Check the header row and the column mapping — the file may have a title block above the real header.",
        rows: [],
      },
    ];
  }

  const totalSf = leases.reduce((s, l) => s + (l.sf ?? 0), 0);
  if (options.nra != null && options.nra > 0 && totalSf > options.nra * 1.005) {
    issues.push({
      severity: "error",
      code: "sf_exceeds_nra",
      message: `Leases sum to ${Math.round(totalSf).toLocaleString("en-US")} SF against a stated NRA of ${Math.round(
        options.nra,
      ).toLocaleString("en-US")} SF. Something is double-counted — usually a totals row or a suite listed twice.`,
      rows: [],
    });
  }

  const badDates = leases.filter(
    (l) => l.leaseStart && l.leaseExpiry && l.leaseExpiry < l.leaseStart,
  );
  if (badDates.length) {
    issues.push({
      severity: "error",
      code: "expiry_before_start",
      message: `${badDates.length} lease${badDates.length === 1 ? "" : "s"} expire before they start — the start and expiry columns are probably swapped.`,
      rows: badDates.map((l) => l.sourceRow),
    });
  }

  const psfs = leases
    .filter((l) => !l.vacant && l.rentPsf != null && l.rentPsf > 0)
    .map((l) => l.rentPsf!);
  const med = median(psfs);
  if (med != null && med > 0) {
    const outliers = leases.filter(
      (l) =>
        !l.vacant &&
        l.rentPsf != null &&
        l.rentPsf > 0 &&
        (l.rentPsf > med * outlierFactor || l.rentPsf < med / outlierFactor),
    );
    if (outliers.length) {
      issues.push({
        severity: "warning",
        code: "rent_psf_outlier",
        message: `${outliers.length} lease${outliers.length === 1 ? "" : "s"} sit more than ${outlierFactor}× off the median rent of $${med.toFixed(
          2,
        )}/SF. Usually a monthly figure in an annual column, or the reverse.`,
        rows: outliers.map((l) => l.sourceRow),
      });
    }
  }

  const bySuite = new Map<string, number[]>();
  for (const l of leases) {
    const key = l.suite.trim().toLowerCase();
    if (!key) continue;
    bySuite.set(key, [...(bySuite.get(key) ?? []), l.sourceRow]);
  }
  const dupes = [...bySuite.entries()].filter(([, rows]) => rows.length > 1);
  if (dupes.length) {
    issues.push({
      severity: "warning",
      code: "duplicate_suite",
      message: `${dupes.length} suite${dupes.length === 1 ? "" : "s"} appear more than once (${dupes
        .slice(0, 4)
        .map(([s]) => s)
        .join(", ")}${dupes.length > 4 ? "…" : ""}). Check for a demised space listed twice.`,
      rows: dupes.flatMap(([, rows]) => rows),
    });
  }

  const missingExpiry = leases.filter((l) => !l.vacant && !l.leaseExpiry);
  if (missingExpiry.length) {
    issues.push({
      severity: "warning",
      code: "missing_expiry",
      message: `${missingExpiry.length} occupied space${
        missingExpiry.length === 1 ? " has" : "s have"
      } no expiry date. They're excluded from WALT and the rollover schedule rather than assumed.`,
      rows: missingExpiry.map((l) => l.sourceRow),
    });
  }

  const missingSf = leases.filter((l) => l.sf == null || l.sf <= 0);
  if (missingSf.length) {
    issues.push({
      severity: "warning",
      code: "missing_sf",
      message: `${missingSf.length} row${missingSf.length === 1 ? " has" : "s have"} no square footage, so they carry no weight in any SF-weighted figure.`,
      rows: missingSf.map((l) => l.sourceRow),
    });
  }

  const bases = new Set(leases.filter((l) => !l.vacant).map((l) => l.rentBasis));
  bases.delete("unknown");
  if (bases.size > 1) {
    issues.push({
      severity: "warning",
      code: "mixed_rent_basis",
      message: `This roll mixes ${[...bases].join(" and ")} leases. A single mark-to-market across them compares different things — set market rents per basis, or split the analysis.`,
      rows: [],
    });
  }

  return issues;
}
