/**
 * HUD's fair market rents — one reader for every surface that prints one.
 *
 * A fair market rent belongs to a fiscal year. HUD's FY N runs from Oct 1 of
 * N−1 to Sep 30 of N, and every area's figures change on that Oct 1, bar a
 * revision published during the year with a day of its own. The year used
 * to live in the pages' own words — "FY…" typed into the markets band, the
 * market brief, the compare card and the demo, and into the research files'
 * key names — so on the day HUD's next year took effect every one of them
 * went on printing last year's rents as current. Now the year, the day it
 * takes effect and HUD's name for the area are data in the block itself,
 * and a page prints `FY${fy}` from what it reads here.
 *
 * Two rules. **A blank is null**: a bedroom the file on hand does not state
 * is null, never zero. **Only the newest fiscal year present is current**
 * (`newestFmrOnly`): HUD publishes every area's figures at once, so a row of
 * an older year — a database copy still keyed to it, merged in beside the
 * checked-in file's — is superseded wherever a newer year is on file.
 *
 * Pure, and imports nothing at run time, because the two scripts that write
 * FMR rows to the `benchmarks` table (scripts/seed-research.mjs and
 * scripts/fetch-fmr.mjs) load it under plain Node and build their rows with
 * the same `fmrRows` the app's seeds do — so what the table holds and what
 * the app would have shown without it are one shape.
 */
import type { Benchmark, ResearchStatus } from "@/lib/research";

export const FMR_BEDS = ["0br", "1br", "2br", "3br", "4br"] as const;
export type FmrBed = (typeof FMR_BEDS)[number];

/** The label the Washington area's rows carry in the `benchmarks` table: the
 *  research files hold it once in multifamily.json's block and once in
 *  metros.json's `dc` entry, and the rows come from the first. */
export const DC_AREA_METRO = "Washington DC area";

export interface Fmr {
  /** HUD's fiscal year — FY N runs Oct 1 of N−1 through Sep 30 of N */
  fy: number;
  /** the day these figures take effect: the fiscal year's first day, or a
   *  mid-year revision's own day */
  effective: string;
  /** HUD's name for the area, as its file names it */
  area: string;
  /** a month's rent by bedroom count; null where the file states none */
  rents: Record<FmrBed, number | null>;
  status: ResearchStatus;
  sources: string[];
  /** the day the figures were read from their source; "" where the file
   *  states no day (undated, never a day typed in for it) */
  asOf: string;
  note: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly ResearchStatus[] = ["verified", "sourced", "unverified_not_found"];

/** The first day of HUD's fiscal year `fy`. */
export function fyStart(fy: number): string {
  return `${fy - 1}-10-01`;
}

/** The last day of HUD's fiscal year `fy`. */
export function fyEnd(fy: number): string {
  return `${fy}-09-30`;
}

/** HUD's fiscal year in force on an ISO day: October onward is the next one. */
export function fiscalYearOn(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month >= 10 ? year + 1 : year;
}

/** "FY" and the year, as every page prints it — from the data, never typed. */
export function fmrLabel(fy: number): string {
  return `FY${fy}`;
}

/** The `benchmarks` metric for one bedroom count of one fiscal year. */
export function fmrMetric(fy: number, bed: FmrBed): string {
  return `hud_fmr_fy${fy}_${bed}`;
}

/** The fiscal year and bedroom count a `benchmarks` metric names; null for
 *  any metric that is not a fair market rent. */
export function readFmrMetric(metric: string): { fy: number; bed: FmrBed } | null {
  const m = /^hud_fmr_fy(\d{4})_([0-4]br)$/.exec(metric);
  return m ? { fy: Number(m[1]), bed: m[2] as FmrBed } : null;
}

/**
 * One FMR block as the research files hold it: `fy`, `effective`, `area`,
 * the bedrooms ("0br"…"4br") — at the block's top (metros.json's `fmr`) or
 * under its `value` (the sector files' convention, multifamily.json) — then
 * `status`, `sources`, `as_of` and `note`. Null where the block is missing,
 * or names no fiscal year, no day inside that year for it to take effect,
 * or no area: a figure that cannot say which year it is for is not printed.
 */
export function fmrBlock(block: unknown): Fmr | null {
  if (!block || typeof block !== "object") return null;
  const b = block as Record<string, unknown>;
  const fy = b.fy;
  if (typeof fy !== "number" || !Number.isInteger(fy) || fy < 2000 || fy > 2100) return null;
  const effective = typeof b.effective === "string" ? b.effective.trim() : "";
  if (!ISO_DAY.test(effective) || effective < fyStart(fy) || effective > fyEnd(fy)) return null;
  const area = typeof b.area === "string" ? b.area.trim() : "";
  if (!area) return null;
  const held = b.value && typeof b.value === "object" ? (b.value as Record<string, unknown>) : b;
  const rents = Object.fromEntries(
    FMR_BEDS.map((bed) => {
      const v = held[bed];
      return [bed, typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null];
    }),
  ) as Record<FmrBed, number | null>;
  const status = STATUSES.includes(b.status as ResearchStatus) ? (b.status as ResearchStatus) : "sourced";
  const sources = Array.isArray(b.sources)
    ? b.sources.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
  const asOf = typeof b.as_of === "string" && ISO_DAY.test(b.as_of.trim()) ? b.as_of.trim() : "";
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  return { fy, effective, area, rents, status, sources, asOf, note };
}

/** A metros.json entry's fair market rent — its `fmr` block, read. */
export function fmrOf(entry: unknown): Fmr | null {
  if (!entry || typeof entry !== "object") return null;
  return fmrBlock((entry as { fmr?: unknown }).fmr);
}

/** The two-bedroom figure with the year it is for — what a surface drawing
 *  HUD's rent beside another measure needs; null without one. */
export function fmrTwoBed(fmr: Fmr | null): { rent: number; fy: number } | null {
  const rent = fmr?.rents["2br"] ?? null;
  return fmr && rent !== null ? { rent, fy: fmr.fy } : null;
}

/** Where a year's figures stand on an ISO day: not yet in effect, in force,
 *  or past their fiscal year's last day — when they are no longer current,
 *  whatever the page last read. */
export function fmrPhase(fmr: Pick<Fmr, "fy" | "effective">, today: string): "ahead" | "in_force" | "ended" {
  if (today < fmr.effective) return "ahead";
  if (today > fyEnd(fmr.fy)) return "ended";
  return "in_force";
}

/** The label a metro's FMR rows carry in `benchmarks`: its research name,
 *  and the Washington area's for the `dc` entry. */
export function fmrMetroLabel(entry: { id: string; name: string }): string {
  return entry.id === "dc" ? DC_AREA_METRO : entry.name;
}

/**
 * A block's `benchmarks` rows, one a bedroom it states — the ONE shape the
 * app's seeds, scripts/seed-research.mjs and scripts/fetch-fmr.mjs all
 * write, so a row the table holds replaces the seed's row of the same key.
 * `as_of` is the day the figures were read, never the day they take
 * effect: a figure in force for a year is not stale after 180 days.
 */
export function fmrRows(fmr: Fmr, metro: string): Benchmark[] {
  const window = `${fmrLabel(fmr.fy)}, effective ${fmr.effective} through ${fyEnd(fmr.fy)}`;
  const note = [window, fmr.area, fmr.note].filter(Boolean).join(". ");
  return FMR_BEDS.flatMap((bed) => {
    const v = fmr.rents[bed];
    if (v === null) return [];
    return [
      {
        sector: "multifamily",
        metro,
        metric: fmrMetric(fmr.fy, bed),
        low: v,
        high: v,
        unit: "usd_month",
        source: fmr.sources[0] ?? "",
        as_of: fmr.asOf,
        status: fmr.status,
        note,
      },
    ];
  });
}

/** The day a row's figures take effect, read back out of the note
 *  `fmrRows` writes ("FY…, effective 2026-10-01 through …" — the rows of
 *  every earlier seed carried the same words); null for a note that states
 *  none. A `benchmarks` row has no column of its own for it. */
export function fmrEffectiveOf(note: string | null | undefined): string | null {
  const m = typeof note === "string" ? /\beffective (\d{4}-\d{2}-\d{2})\b/.exec(note) : null;
  return m ? m[1] : null;
}

/**
 * Every FMR row the research files hold: the Washington area's from
 * multifamily.json's block, then each other covered metro's from its
 * metros.json entry (the `dc` entry is the same area as the block, so it is
 * not written twice). The app's seeds and scripts/seed-research.mjs both
 * call this, so the two cannot write different rows.
 */
export function fmrBenchmarkRows(
  metrosDoc: { metros?: readonly unknown[] },
  multifamilyDoc: { supply_demand?: { rents_hud_fmr_dc_area?: unknown } | null },
): Benchmark[] {
  const out: Benchmark[] = [];
  const dc = fmrBlock(multifamilyDoc.supply_demand?.rents_hud_fmr_dc_area);
  if (dc) out.push(...fmrRows(dc, DC_AREA_METRO));
  for (const entry of metrosDoc.metros ?? []) {
    const m = entry as { id?: unknown; name?: unknown };
    if (typeof m.id !== "string" || typeof m.name !== "string" || m.id === "dc") continue;
    const fmr = fmrOf(entry);
    if (fmr) out.push(...fmrRows(fmr, fmrMetroLabel({ id: m.id, name: m.name })));
  }
  return out;
}

/**
 * The rows with every fair market rent of an older fiscal year than the
 * newest present taken out; every other row passes as it came. HUD
 * publishes all its areas' figures at once, so a newer year on file
 * anywhere supersedes an older one everywhere — a database row still keyed
 * to last year, merged in beside this year's file, is never shown as
 * current, whatever label it carries.
 */
export function newestFmrOnly<T extends { metric: string }>(rows: readonly T[]): T[] {
  let newest = -Infinity;
  for (const r of rows) {
    const m = readFmrMetric(r.metric);
    if (m && m.fy > newest) newest = m.fy;
  }
  return rows.filter((r) => {
    const m = readFmrMetric(r.metric);
    return !m || m.fy === newest;
  });
}
