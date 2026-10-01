/**
 * Import validation. The rule here is SURFACE, DON'T SWALLOW: a rent roll whose
 * SF sums past the building's NRA, or whose rent is an order of magnitude off
 * the set median, is telling you something — usually a units mismatch or a
 * totals row that slipped through. Silently normalizing it produces a clean
 * dashboard built on a wrong number.
 *
 * Pure.
 */
import { assetWords } from "@/lib/asset-words";
import type { ParseResult } from "./parse";
import type { Lease } from "./schema";

/**
 * The rent per SF a year past which no building charges a foot, so a lease
 * read above it is a column read wrong — flagged, never corrected. Rental
 * housing counted by the unit tops out near $150 (a Manhattan penthouse), so
 * $250 is past it; anything else is held to $1,000, past every office,
 * industrial and apartment building, which only the dearest retail streets
 * pass. A typical apartment export once mapped its monthly "Actual Rent" to
 * Rent $/SF and the page marked $1,886.74/SF against a $32 market with no
 * warning, because the only check compared the rows with their own median.
 */
export const RENT_PSF_CEILING = 1_000;
export const RESIDENTIAL_RENT_PSF_CEILING = 250;

/** The ceiling for a deal's class (lib/asset-words): rental housing priced by
 *  the unit gets the residential one; a mixed-use building, whose shops can
 *  let for more, and every other class, the general one. */
export function rentPsfCeiling(assetClass: string | null | undefined): number {
  const words = assetWords(assetClass);
  return words.residential && words.basis === "unit" ? RESIDENTIAL_RENT_PSF_CEILING : RENT_PSF_CEILING;
}

/** "$1.36M", "$2,150" — a figure in a message. */
const dollars = (n: number): string =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString("en-US")}`;

/** "info" says what the import did on purpose (a totals line left out), so
 *  the page shows it without calling it a problem. */
export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  code:
    | "sf_exceeds_nra"
    | "expiry_before_start"
    | "rent_psf_outlier"
    | "rent_psf_implausible"
    | "rent_psf_mismatch"
    | "duplicate_suite"
    | "missing_expiry"
    | "missing_sf"
    | "mixed_rent_basis"
    | "skipped_totals"
    | "unread_date"
    | "dates_day_first"
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
  /** what the parser left out of the leases or would not read, so the stored
   *  issues say it */
  parse?: Partial<Pick<ParseResult, "skippedTotals" | "unreadDates" | "dayFirst">>;
  /** the deal's class (lib/pipeline-slots `shownAssetClass`), which sets the
   *  rent-per-SF ceiling */
  assetClass?: string | null;
}

/** "31 December 2028" — the day said in words, so a date read day first is
 *  unmistakable whichever way the reader writes dates. */
const dayInWords = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

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
  const unreadDates = options.parse?.unreadDates ?? [];
  if (unreadDates.length) {
    parseIssues.push({
      severity: "warning",
      code: "unread_date",
      message: `${unreadDates.length} date${unreadDates.length === 1 ? "" : "s"} could not be read and ${
        unreadDates.length === 1 ? "is" : "are"
      } left blank rather than guessed (${quoted(unreadDates.map((u) => u.text))}): no month and day that exist, or no year. A lease whose expiry is blank stays out of WALT and the rollover schedule.`,
      rows: [...new Set(unreadDates.map((u) => u.row))],
    });
  }
  const dayFirst = options.parse?.dayFirst;
  if (dayFirst) {
    parseIssues.push({
      severity: "info",
      code: "dates_day_first",
      message: `Dates read day first, as the file writes them: “${dayFirst.text}” is ${dayInWords(dayFirst.date)}.`,
      rows: [],
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

  // A rent per foot no building charges is a column read wrong, however the
  // rows agree with each other.
  const ceiling = rentPsfCeiling(options.assetClass);
  const pastCeiling = leases.filter((l) => !l.vacant && l.rentPsf != null && l.rentPsf > ceiling);
  if (pastCeiling.length) {
    const top = Math.max(...pastCeiling.map((l) => l.rentPsf!));
    const who =
      ceiling === RESIDENTIAL_RENT_PSF_CEILING
        ? "any rental housing"
        : "any office, industrial or apartment building";
    issues.push({
      severity: "error",
      code: "rent_psf_implausible",
      message: `${pastCeiling.length} lease${pastCeiling.length === 1 ? "" : "s"} read above $${ceiling.toLocaleString(
        "en-US",
      )}/SF a year (up to $${top.toLocaleString("en-US", { maximumFractionDigits: 2 })}) — past what ${who} charges a foot, so a column is read wrong: usually a monthly or per-unit rent mapped to Rent $/SF, or a monthly figure read as a year's. Nothing was corrected; check the mapping.`,
      rows: pastCeiling.map((l) => l.sourceRow),
    });
  }

  // The rent per foot times the area is the base rent, where the file states
  // both: two columns that disagree cannot both be right.
  const disagree = leases.filter((l) => {
    if (l.vacant || l.rentPsf == null || l.sf == null || l.baseRentAnnual == null) return false;
    if (l.rentPsf <= 0 || l.sf <= 0 || l.baseRentAnnual <= 0) return false;
    const ratio = (l.rentPsf * l.sf) / l.baseRentAnnual;
    return ratio > 1.5 || ratio < 1 / 1.5;
  });
  if (disagree.length) {
    const l = disagree[0];
    const implied = l.rentPsf! * l.sf!;
    const ratio = implied / l.baseRentAnnual!;
    const twelve = Math.abs(ratio - 12) / 12 < 0.15 || Math.abs(1 / ratio - 12) / 12 < 0.15;
    issues.push({
      severity: "warning",
      code: "rent_psf_mismatch",
      message: `On ${disagree.length} lease${disagree.length === 1 ? "" : "s"} the Rent $/SF column times the area is not the base rent (row ${
        l.sourceRow
      }: $${l.rentPsf!.toLocaleString("en-US", { maximumFractionDigits: 2 })}/SF × ${Math.round(l.sf!).toLocaleString(
        "en-US",
      )} SF is ${dollars(implied)} a year, against ${dollars(l.baseRentAnnual!)}) — one of the two columns is mapped wrong${
        twelve ? ", or one is a month's figure and the other a year's" : ""
      }. Check the mapping.`,
      rows: disagree.map((x) => x.sourceRow),
    });
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

  // An expiry the reader refused is said once, by the unread-date note above.
  const refusedExpiry = new Set(unreadDates.filter((u) => u.field === "leaseExpiry").map((u) => u.row));
  const missingExpiry = leases.filter((l) => !l.vacant && !l.leaseExpiry && !refusedExpiry.has(l.sourceRow));
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
