import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchSeriesRows } from "@/lib/live-rates-query";
import {
  SERIES,
  metricSeries,
  metroSeriesFor,
  readMetricRates,
  readMetroRates,
  readRates,
  seriesMeta,
  type LiveRate,
  type MetroMetric,
  type RateRow,
  type SeriesMeta,
} from "@/lib/live-rates";

/**
 * The `rates` table, read for a page that may have no one signed in.
 *
 * Migration 0023 grants `select` on `rates` `to authenticated` — reference
 * data behind the login, which is right for the benchmarks and the
 * regulatory rules it sits beside. `/tools` is public on purpose, so the anon
 * client would read nothing there.
 *
 * Rather than widen the policy in a migration — which would be inert until
 * the operator runs it, and would loosen a table's grant for one page's sake
 * — this reads with the service role and hands out only what FRED already
 * publishes for nothing. No row here is anybody's data: public series,
 * pulled on a cron, republished with their dates and a link back to the
 * source.
 *
 * ONE QUERY PER SERIES, which is not the obvious shape. A single
 * `order by obs_date desc limit N` across the whole table looks equivalent
 * and quietly stops working: the daily series file a row every business
 * day, so within a few months the newest few hundred dates are all Treasury
 * tenors and SOFR and the QUARTERLY series — whose current observation is
 * months old by design — drops off the end and vanishes from the strip.
 * Each series is asked for its own newest rows instead, which the primary
 * key (series_id, obs_date) answers as an index scan. `HISTORY_ROWS` of
 * them, not two: the strip draws each series' recent path and the curve a
 * week earlier, and the count is the table's own so the read returns
 * exactly what the cron backfilled.
 *
 * A series that fails answers nothing and the others still show; a total
 * failure means no strip, no seeds, and every field keeps its worked
 * example. A rate strip is a claim about today, and a claim that cannot be
 * backed is better not made than made stale.
 *
 * WRAPPED IN `unstable_cache`, because `/tools` is a server-rendered route
 * (it already was before the strip — checked against the build output, not
 * assumed) and forty-odd queries on every visit to a calculator page would
 * be paid by everyone for a table the cron writes once a weekday. An hour
 * is the right window: nothing here changes faster than that.
 *
 * The wrapping is around the ROWS rather than the finished read, and that
 * is not cosmetic. The ages and the freshness flags come from `now`, so a
 * Date passed into the cached function would land in the cache key and
 * every call would miss — the cache would be pure overhead. The rows do not
 * depend on the clock; the reading of them does.
 *
 * (`use cache` is the Next 16 idiom, but it needs `cacheComponents` turned
 * on for the whole project, which changes how every route renders and is
 * not a change one page gets to make.)
 */
/**
 * ONE cached read, keyed by the LIST OF SERIES IDS it is asked for — the
 * key is the argument, so a series added to the table is a different
 * entry and is read the day it arrives. Keyed by the metro alone, the
 * entry a build made before the pull wrote a new series served the old
 * rows for an hour, and the page said nothing of it (2026-09-23: the demo
 * drew the demand bars and no supply line while the market page, on a
 * different entry, drew both). The ids come back to metas through
 * `seriesMeta`, which knows the strip's, the metros', the regions' and the
 * states' series alike.
 */
const cachedSeriesRows = unstable_cache(
  (ids: string[]) => readSeries(ids.map((id) => seriesMeta(id)).filter((m): m is SeriesMeta => m !== null)),
  ["live-series-rows"],
  { revalidate: 3600, tags: ["rates"] },
);

const idsOf = (series: readonly { id: string }[]): string[] => series.map((s) => s.id);

export async function liveRates(now: Date = new Date()): Promise<LiveRate[]> {
  return readRates(await cachedSeriesRows(idsOf(SERIES)), now);
}

/**
 * A covered metro's own series — or a state's, under its `state:PA` id —
 * read the same way and cached the same way, per market, since the market
 * page shows one at a time and a visitor to Baltimore should not pay for
 * Dallas.
 */
export async function liveMetroRates(metroId: string, now: Date = new Date()): Promise<LiveRate[]> {
  return readMetroRates(metroId, await cachedSeriesRows(idsOf(metroSeriesFor(metroId).series)), now);
}

/**
 * One metric across the covered metros — the sector page's ranking of
 * where a sector's payrolls are growing — cached per metric the same way:
 * fourteen series, one query each, once an hour, rather than every metro's
 * whole panel read for one figure apiece.
 */
export async function liveMetricRates(metric: MetroMetric, now: Date = new Date()): Promise<LiveRate[]> {
  return readMetricRates(metric, await cachedSeriesRows(idsOf(metricSeries(metric))), now);
}

async function readSeries(metas: readonly SeriesMeta[]): Promise<RateRow[]> {
  if (metas.length === 0) return [];
  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    // No service key — the build container, or a fresh checkout.
    console.warn("live rates unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
  // The query itself lives in lib/live-rates-query.ts, shared with the
  // analysis pipeline's uncached read — one copy, so the page and the
  // model cannot read a different table.
  return fetchSeriesRows(supabase, metas);
}
