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
 * Three rules. **A blank is null**: a bedroom the file on hand does not
 * state is null, never zero. **A metro's newest fiscal year is its current
 * one** (`newestFmrOnly`): a row of an older year — a database copy still
 * keyed to it, merged in beside the checked-in file's — is superseded where
 * the same metro has a newer one, and anywhere once its own year has ended
 * and HUD's next is on file; a metro the newest pull missed keeps its year
 * while that year is in force. **A year ends**: every surface that prints
 * one says so past its last day (`fmrWhen`), rather than printing last
 * year's rents as current.
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
export function fmrTwoBed(fmr: Fmr | null): { rent: number; fy: number; effective: string } | null {
  const rent = fmr?.rents["2br"] ?? null;
  return fmr && rent !== null ? { rent, fy: fmr.fy, effective: fmr.effective } : null;
}

/** Today as an ISO day, UTC — read by a page outside its render and handed
 *  to what it draws, since it reads the clock. */
export function fmrToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** An ISO day as a page says it ("Sep 30, 2027"), read in UTC. */
function longDay(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

/**
 * When a year's figures apply, said as it stands on `today`: "effective Oct
 * 1, 2026" before and through the year, "ended Sep 30, 2027" once its last
 * day has passed. Every surface that prints a fair market rent says it this
 * way — the research panel, the compare card, the asking-rent line, the
 * homepage's band, the demo and the Mid-Atlantic line — where only the
 * market brief's row once knew that a year ends (the pre-ship audit of
 * 2026-09-30). `effective` may be null for a row whose note states no day.
 */
export function fmrWhen(
  fmr: { fy: number; effective: string | null },
  today: string,
): { ended: boolean; text: string | null } {
  if (today > fyEnd(fmr.fy)) return { ended: true, text: `ended ${longDay(fyEnd(fmr.fy))}` };
  return { ended: false, text: fmr.effective ? `effective ${longDay(fmr.effective)}` : null };
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

/** A label an older pull filed a metro's rows under, and the one they are
 *  filed under now: the pull before #476 labelled the Washington entry's
 *  rows by its research name. Both are one HUD area. */
const RENAMED_LABEL: Readonly<Record<string, string>> = { "Washington DC": DC_AREA_METRO };

/**
 * The rows with every fair market rent a newer one supersedes taken out;
 * every other row passes as it came. A row is superseded where its own
 * metro (an older pull's label read as today's) has a newer fiscal year,
 * and anywhere once its own year has ended and a newer year is on file.
 * HUD publishes every area at once, so a newer year anywhere means the
 * older one is done — but only at its end: a metro the newest pull missed
 * (its HUD area not matched, say) keeps the year still in force rather than
 * showing no rent at all (the pre-ship audit of 2026-09-30: the rule used
 * to be global and immediate).
 */
export function newestFmrOnly<T extends { metric: string; metro?: string | null }>(
  rows: readonly T[],
  today: string = fmrToday(),
): T[] {
  const groupOf = (r: T) => {
    const label = r.metro ?? "";
    return RENAMED_LABEL[label] ?? label;
  };
  let newest = -Infinity;
  const newestFor = new Map<string, number>();
  for (const r of rows) {
    const m = readFmrMetric(r.metric);
    if (!m) continue;
    if (m.fy > newest) newest = m.fy;
    const g = groupOf(r);
    if (m.fy > (newestFor.get(g) ?? -Infinity)) newestFor.set(g, m.fy);
  }
  return rows.filter((r) => {
    const m = readFmrMetric(r.metric);
    if (!m) return true;
    if (m.fy < (newestFor.get(groupOf(r)) ?? m.fy)) return false;
    return !(m.fy < newest && today > fyEnd(m.fy));
  });
}
