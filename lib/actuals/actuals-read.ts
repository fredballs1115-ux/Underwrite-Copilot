// The deal's actuals — its rent roll and its T-12 against the memorandum —
// read ONE way for every surface that prints them (research pass 24, B3):
// the deal page's actuals card, the full report's "The actuals" page and the
// memo's one line beside its key terms. Pure.
//
// Its rules:
//   - like with like: the memorandum's NOI held against the T-12 is the one
//     the shared picker chooses for the deal's kind (lib/actuals/analyze
//     `pickOmNoi`) — on a plan deal the in-place or Year-1 figure, never the
//     finished project's pro forma — and the note says why where it matters;
//   - each document carries its own date: a rent roll its stated as-of, or
//     "no stated as-of" with the day the screen measured it from; a T-12 the
//     end of its trailing year, or "period not stated" — never undated
//     silently;
//   - an actual NOI of nothing (zero, or not a number) is compared to
//     nothing: an infinite gap is no finding;
//   - a blank is null: a figure a document did not state is a dash, never 0.
import { compactUsd } from "@/lib/money";
import { withArticle } from "@/lib/article";
import { assetWords, rentQuotedMonthly } from "@/lib/asset-words";
import { isPlanDeal, type StrategyKind } from "@/lib/deal-strategy";
import { leasesShort } from "@/lib/rentroll/profiles";
import { OM_NOI_BASIS_LABEL, compareNoi, pickOmNoi } from "./analyze";
import type { NoiComparison, RentRollSummary, T12Summary } from "./types";

export interface ActualsRead {
  rentRoll: { asOf: string | null; summary: RentRollSummary } | null;
  t12: { periodEnd: string | null; summary: T12Summary } | null;
  noiComparison: NoiComparison | null;
  /** On a plan deal: which OM figure the T-12 is held against and why the
   *  stabilized pro forma is not — or, when the OM states only the finished
   *  project's NOI, why there is no comparison at all. Null otherwise. */
  noiNote: string | null;
  /** the deal's class as the page shows it (shownAssetClass): a roll of a
   *  class whose rent is quoted a month a unit is read that way */
  assetClass: string | null;
}

/**
 * The deal's actuals from its stored rent roll and T-12, against the
 * memorandum's metrics read for the deal's kind. Null where neither
 * document is on the deal.
 */
export function readActuals(input: {
  metrics: { label: string; value: string }[];
  strategy: { kind: StrategyKind; label: string };
  rentRoll: { asOf: string | null; summary: RentRollSummary } | null;
  t12: { periodEnd: string | null; summary: T12Summary } | null;
  assetClass?: string | null;
}): ActualsRead | null {
  const { metrics, strategy, rentRoll, t12 } = input;
  if (!rentRoll && !t12) return null;
  const t12Summary = t12?.summary ?? null;
  const omPick = pickOmNoi(metrics, strategy.kind);
  const omNoi = omPick?.noi ?? null;
  const noiNote = isPlanDeal(strategy.kind)
    ? omPick
      ? `${withArticle(strategy.label.toLowerCase(), true)}: the T-12 is held against the OM's ${OM_NOI_BASIS_LABEL[omPick.basis]}. The stabilized pro forma describes the finished project and is judged on yield on cost, never against today's actuals.`
      : t12Summary
        ? `${withArticle(strategy.label.toLowerCase(), true)}: the OM states only the finished project's NOI, so there is nothing to hold the T-12 against until an in-place figure is stated. The stabilized pro forma is judged on yield on cost.`
        : null
    : null;
  const t12Noi = t12Summary?.noi;
  return {
    rentRoll,
    t12,
    noiComparison:
      omNoi != null && t12Noi != null && Number.isFinite(t12Noi) && t12Noi !== 0 ? compareNoi(omNoi, t12Noi, omPick) : null,
    noiNote,
    assetClass: input.assetClass ?? null,
  };
}

/**
 * The deal's actuals from the rows a route read — the newest rent roll's
 * `as_of_date` and `summary`, the newest T-12's `period_end_date` and
 * `summary` — on the deal's own kind (its extraction and first signal, as
 * the deal page reads it) and its one class. Null where neither row holds a
 * summary.
 */
export function actualsFromRows(
  extraction: { metrics?: { label: string; value: string }[] } | null,
  strategy: { kind: StrategyKind; label: string },
  assetClass: string | null,
  rentRollRow: { as_of_date?: string | null; summary?: unknown } | null | undefined,
  t12Row: { period_end_date?: string | null; summary?: unknown } | null | undefined,
): ActualsRead | null {
  return readActuals({
    metrics: extraction?.metrics ?? [],
    strategy,
    rentRoll: rentRollRow?.summary
      ? { asOf: rentRollRow.as_of_date ?? null, summary: rentRollRow.summary as RentRollSummary }
      : null,
    t12: t12Row?.summary ? { periodEnd: t12Row.period_end_date ?? null, summary: t12Row.summary as T12Summary } : null,
    assetClass,
  });
}

/** A figure on the actuals surfaces: the card's own dollar writer. */
export const actualsUsd = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : compactUsd(n, { millions: 2 });

const pct1 = (dec: number | null | undefined): string =>
  dec == null || !Number.isFinite(dec) ? "—" : `${(dec * 100).toFixed(1)}%`;

/** "May 31, 2026" — a month alone "May 2026", a year alone the year; read
 *  in UTC so a server's render and a browser's agree. A day that does not
 *  exist, and anything else, is printed as it came. */
export function statedDay(iso: string): string {
  const m = iso.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  if (!mo) return y;
  const year = Number(y);
  const month = Number(mo);
  if (month < 1 || month > 12) return iso;
  if (!d) {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const t = new Date(Date.UTC(year, month - 1, Number(d)));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== Number(d)) return iso;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The OM figure's name, by what it is. */
export const OM_NOI_LABEL: Record<NonNullable<NoiComparison["omBasis"]>, string> = {
  in_place: "OM in-place NOI",
  year1: "OM Year-1 NOI",
  stabilized: "OM pro forma NOI",
};

export const SEVERITY_WORD: Record<NoiComparison["severity"], string> = {
  in_line: "In line",
  material: "Material",
  red_flag: "Red flag",
};

/** The rent roll's date: its stated as-of, else the screen day it was
 *  measured from, said as such; null where neither is known. */
export function rentRollDateWords(rentRoll: ActualsRead["rentRoll"]): string | null {
  if (!rentRoll) return null;
  if (rentRoll.asOf) return `as of ${statedDay(rentRoll.asOf)}`;
  if (rentRoll.summary.asOfUsed) return `no stated as-of — measured at screen date ${statedDay(rentRoll.summary.asOfUsed)}`;
  return "no stated as-of";
}

/** The T-12's date: the end of its trailing year, or said as not stated. */
export function t12DateWords(t12: ActualsRead["t12"]): string | null {
  if (!t12) return null;
  return t12.periodEnd ? `TTM to ${statedDay(t12.periodEnd)}` : "period not stated";
}

/** The roll's average rent, in the class's own terms: a month a unit where
 *  its rent is quoted that way, else per foot a year; plus what it is
 *  averaged over where that is fewer than the occupied units. */
export function avgRentOf(summary: RentRollSummary, assetClass: string | null | undefined): { text: string; basis: string | null } {
  const monthly = rentQuotedMonthly(assetClass);
  const noun = assetWords(assetClass).noun ?? { one: "unit", many: "units" };
  const text =
    monthly && summary.avgRentMonthly != null
      ? `$${Math.round(summary.avgRentMonthly).toLocaleString("en-US")}/${noun.one}/mo`
      : summary.weightedAvgRentPsf != null
        ? `$${summary.weightedAvgRentPsf.toFixed(2)}/SF${monthly ? "/yr" : ""}`
        : "—";
  const basis =
    monthly && summary.avgRentMonthly != null && summary.rentUnits != null && summary.rentUnits < summary.occupiedUnits
      ? `over ${summary.rentUnits} of ${summary.occupiedUnits} occupied ${noun.many}`
      : null;
  return { text, basis };
}

/**
 * The rent roll's WALT as a page prints it, by the rent-roll page's own rule
 * (lib/rentroll/profiles `leasesShort`): a class that leases by the month or
 * the year — apartments, storage, a hotel — is read for loss to lease, not
 * WALT, so its WALT is not a figure to print ("0.6 yr" on an apartment roll
 * had read as a cliff the rent-roll page says is routine). `note` says why.
 */
export function actualsWalt(
  summary: Pick<RentRollSummary, "waltYears">,
  assetClass: string | null | undefined,
): { text: string; note: string | null } {
  if (leasesShort(assetClass)) return { text: "n/a", note: "leases of a year or less — read for loss to lease" };
  return { text: summary.waltYears != null ? `${summary.waltYears.toFixed(1)} yr` : "—", note: null };
}

/** The gap in words: "8.7% over the T-12", "3.1% under the T-12", "in line
 *  with the T-12". */
export function gapWords(c: NoiComparison): string {
  if (c.direction === "in_line") return "in line with the T-12";
  return `${pct1(Math.abs(c.deltaPct))} ${c.direction === "above" ? "over" : "under"} the T-12`;
}

/**
 * The actuals in one line, for the memo beside its key terms: the T-12's
 * NOI with its period against the OM's figure, the gap and its grade; then
 * the rent roll's occupancy and WALT with its date. "" where there is
 * nothing to say.
 */
export function actualsShortLine(read: ActualsRead | null): string {
  if (!read) return "";
  const parts: string[] = [];
  const st = read.t12?.summary;
  if (st) {
    const when = t12DateWords(read.t12);
    // One bracket, the derivation and the date in it (audit C8, L3): "(derived)
    // (period not stated)" had read as two afterthoughts.
    const noi = `T-12 NOI ${actualsUsd(st.noi)} (${st.noiDerived ? "derived; " : ""}${when})`;
    const c = read.noiComparison;
    parts.push(
      c
        ? `${noi}: ${c.omBasis ? OM_NOI_LABEL[c.omBasis] : "OM NOI"} ${c.direction === "in_line" ? "in line" : `${pct1(Math.abs(c.deltaPct))} ${c.direction === "above" ? "over" : "under"}`}${c.severity === "in_line" ? "" : `, ${c.severity === "red_flag" ? "a red flag" : "material"}`}.`
        : `${noi}.`,
    );
  }
  const rr = read.rentRoll?.summary;
  if (rr) {
    const stats = [
      rr.sfWeightedOccupancy != null ? `${pct1(rr.sfWeightedOccupancy)} occupied` : `${rr.occupiedUnits} of ${rr.unitCount} occupied`,
      // The rent-roll page's rule (actualsWalt): a roll of leases of a year
      // or less has no WALT worth printing.
      rr.waltYears != null && !leasesShort(read.assetClass) ? `WALT ${rr.waltYears.toFixed(1)} yrs` : null,
    ].filter(Boolean);
    // The line is the memo's, beside its key terms: an undated roll is
    // said as undated, and the day the screen measured it from is on the
    // card and the report's page.
    const when = read.rentRoll?.asOf ? `as of ${statedDay(read.rentRoll.asOf)}` : "undated";
    parts.push(`Rent roll (${when}): ${stats.join(", ")}.`);
  }
  return parts.join(" ");
}
