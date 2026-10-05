/**
 * How old a research date is, and the one rule that calls it stale.
 *
 * The research layer is read by hand: the rules, the benchmark rows, the
 * market tracker's snapshot of brokerages' prints (data/research/metros.json)
 * and the sector files. Each carries the day it was read — or, for a row
 * dated by its period, the last day of the period it is for (lib/period-rows)
 * — and the deal page's rules panel marked one stale past 180 days. Nothing
 * else did: the demo printed the rules' dates beside "verified", and /market,
 * the homepage's band and gallery and the model's read against the market
 * went on using the tracker's figures, read 2026-08-25, with no age at all.
 * They would have printed them the same way in 2028.
 *
 * So this is the rule, once. Past `RESEARCH_STALE_DAYS` a research date is
 * stale: a page shows the date with its age and marks it stale — never hides
 * it, never moves it, never invents a newer figure. The figure still shows;
 * it only stops being used. The model's read against the market names a
 * stale tracker figure and holds no assumption to it.
 *
 * Not read by this rule: a fair market rent, which holds for its fiscal year
 * and is current until the year ends (lib/fmr `fmrWhen`), and a live feed's
 * figure, which keeps its own cadence (lib/live-rates).
 *
 * Imports nothing at run time: the nightly steward counts the research rows
 * past the same limit under plain Node (scripts/steward.mjs).
 */

/** The days a research date stays current — the deal page's rules panel's
 *  own figure since the build spec. Past it, a date is stale. */
export const RESEARCH_STALE_DAYS = 180;

const DAY_MS = 86_400_000;

/** An ISO day's UTC midnight — "2026-08-25", or a timestamp's own day — or
 *  null for anything else, a day that does not exist (2026-02-30) included. */
function dayMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/** Today as an ISO day, read from a clock the caller hands in. */
function dayOf(today: string | Date): number | null {
  return typeof today === "string" ? dayMs(today) : Number.isFinite(today.getTime()) ? dayMs(today.toISOString()) : null;
}

export interface ResearchAge {
  /** the day as its file states it (an ISO day), or null where it states none */
  asOf: string | null;
  /** whole days from that day to today; null where undated */
  days: number | null;
  /** more than `RESEARCH_STALE_DAYS` old. Never true of an undated figure,
   *  which a page says is undated rather than stale. */
  stale: boolean;
  /** the first day the date reads stale — the day after its last current
   *  one — or null where undated */
  staleFrom: string | null;
}

/**
 * A research date's age on `today` (an ISO day, or a Date read in UTC): how
 * many days old it is and whether it is stale. Pure.
 */
export function researchAge(asOf: string | null | undefined, today: string | Date): ResearchAge {
  const stated = typeof asOf === "string" ? asOf.trim() : "";
  const at = stated ? dayMs(stated) : null;
  if (at === null) return { asOf: null, days: null, stale: false, staleFrom: null };
  const staleFrom = new Date(at + (RESEARCH_STALE_DAYS + 1) * DAY_MS).toISOString().slice(0, 10);
  const now = dayOf(today);
  const days = now === null ? null : Math.round((now - at) / DAY_MS);
  return { asOf: stated.slice(0, 10), days, stale: days !== null && days > RESEARCH_STALE_DAYS, staleFrom };
}

/** Whether a research date is past the limit on `today` — false where it is
 *  undated (said as undated, never as stale). */
export function isResearchStale(asOf: string | null | undefined, today: string | Date): boolean {
  return researchAge(asOf, today).stale;
}

/** "1 day old", "181 days old". */
function daysOld(n: number): string {
  return `${n} day${n === 1 ? "" : "s"} old`;
}

/**
 * What a page puts beside a stale research date: "181 days old, stale" —
 * the date's age, and the mark. Null while the date is current, or where it
 * is undated. Every surface that prints a research date writes its stale
 * mark through this, so the words are the same everywhere.
 */
export function staleMark(age: ResearchAge): string | null {
  return age.stale && age.days !== null ? `${daysOld(age.days)}, stale` : null;
}

/**
 * Why a stale research figure is held to nothing, for a sentence: "181 days
 * old, past the 180 days the site holds research current". Null while the
 * date is current or undated.
 */
export function staleReason(age: ResearchAge): string | null {
  return age.stale && age.days !== null
    ? `${daysOld(age.days)}, past the ${RESEARCH_STALE_DAYS} days the site holds research current`
    : null;
}

/** The oldest of several research dates — the one a line naming them all is
 *  as stale as — or null where none is dated. */
export function oldestDate(dates: readonly (string | null | undefined)[]): string | null {
  const dated = dates.filter((d): d is string => typeof d === "string" && dayMs(d) !== null).map((d) => d.trim().slice(0, 10));
  return dated.length > 0 ? [...dated].sort()[0] : null;
}
