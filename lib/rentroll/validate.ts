/**
 * Import validation. The rule here is SURFACE, DON'T SWALLOW: a rent roll whose
 * SF sums past the building's NRA, or whose rent is an order of magnitude off
 * the set median, is telling you something — usually a units mismatch or a
 * totals row that slipped through. Silently normalizing it produces a clean
 * dashboard built on a wrong number.
 *
 * Pure.
 */
import type { ParseResult } from "./parse";
import type { Lease } from "./schema";

/** "info" says what the import did on purpose (a totals line left out), so
 *  the page shows it without calling it a problem. */
export type IssueSeverity = "error" | "warning" | "info";

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
    | "skipped_totals"
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
  /** what the parser left out of the leases, so the stored issues say it */
  parse?: Partial<Pick<ParseResult, "skippedTotals">>;
}

/** Up to three labels, quoted, for a message naming what it points at. */
const quoted = (labels: string[]): string => {
  const unique = [...new Set(labels)];
  return `${unique.slice(0, 3).map((l) => `“${l}”`).join(", ")}${unique.length > 3 ? "…" : ""}`;
};

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

  // What the parser left out, said so the count is never a silent loss.
  const parseIssues: ValidationIssue[] = [];
  const skipped = options.parse?.skippedTotals ?? [];
  if (skipped.length) {
    parseIssues.push({
      severity: "info",
      code: "skipped_totals",
      message: `Left out ${skipped.length} totals line${skipped.length === 1 ? "" : "s"} — the roll's own sums, not leases: ${quoted(
        skipped.map((s) => s.label),
      )}.`,
      rows: skipped.map((s) => s.row),
    });
  }

  if (leases.length === 0) {
    return [
      {
        severity: "error",
        code: "no_leases",
        message:
          "No lease rows were found. Check the header row and the column mapping — the file may have a title block above the real header.",
        rows: [],
      },
      ...parseIssues,
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

  return [...issues, ...parseIssues];
}
