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
const cachedRows = unstable_cache(
  () => readAllSeries(),
  ["live-rates-rows"],
  { revalidate: 3600, tags: ["rates"] },
);

export async function liveRates(now: Date = new Date()): Promise<LiveRate[]> {
  return readRates(await cachedRows(), now);
}

/**
 * A covered metro's own series, read the same way and cached the same way
 * — per metro, since the market page shows one at a time and a visitor to
 * Baltimore should not pay for Dallas.
 */
const cachedMetroRows = unstable_cache(
  (metroId: string) => readSeries(metroSeriesFor(metroId).series),
  ["live-metro-rows"],
  { revalidate: 3600, tags: ["rates"] },
);

export async function liveMetroRates(metroId: string, now: Date = new Date()): Promise<LiveRate[]> {
  return readMetroRates(metroId, await cachedMetroRows(metroId), now);
}

/**
 * One metric across the covered metros — the sector page's ranking of
 * where a sector's payrolls are growing — cached per metric the same way:
 * fourteen series, one query each, once an hour, rather than every metro's
 * whole panel read for one figure apiece.
 */
const cachedMetricRows = unstable_cache(
  (metric: string) => readSeries(metricSeries(metric as MetroMetric)),
  ["live-metric-rows"],
  { revalidate: 3600, tags: ["rates"] },
);

export async function liveMetricRates(metric: MetroMetric, now: Date = new Date()): Promise<LiveRate[]> {
  return readMetricRates(metric, await cachedMetricRows(metric), now);
}

function readAllSeries(): Promise<RateRow[]> {
  return readSeries(SERIES);
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
