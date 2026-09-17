import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SERIES, readRates, type LiveRate, type RateRow } from "@/lib/live-rates";

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
 * publishes for nothing. No row here is anybody's data: four public series,
 * pulled on a cron, republished with their dates and a link back to the
 * source.
 *
 * ONE QUERY PER SERIES, which is not the obvious shape. A single
 * `order by obs_date desc limit N` across the whole table looks equivalent
 * and quietly stops working: the two daily series file a row every business
 * day, so within a few months the newest sixty dates are all Treasury and
 * SOFR and the QUARTERLY series — whose current observation is months old by
 * design — drops off the end and vanishes from the strip. Each series is
 * asked for its own two newest rows instead, which the primary key
 * (series_id, obs_date) answers as an index scan.
 *
 * A series that fails answers nothing and the others still show; a total
 * failure means no strip, no seeds, and every field keeps its worked
 * example. A rate strip is a claim about today, and a claim that cannot be
 * backed is better not made than made stale.
 *
 * WRAPPED IN `unstable_cache`, because `/tools` is a server-rendered route
 * (it already was before the strip — checked against the build output, not
 * assumed) and four queries on every visit to a calculator page would be
 * paid by everyone for a table the cron writes once a weekday. An hour is
 * the right window: nothing here changes faster than that.
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

async function readAllSeries(): Promise<RateRow[]> {
  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    // No service key — the build container, or a fresh checkout.
    console.warn("live rates unavailable:", err instanceof Error ? err.message : err);
    return [];
  }

  const perSeries = await Promise.all(
    SERIES.map(async (s): Promise<RateRow[]> => {
      try {
        const { data, error } = await supabase
          .from("rates")
          .select("series_id, obs_date, value")
          // Two: the newest, and the one before it for the move.
          .eq("series_id", s.id)
          .order("obs_date", { ascending: false })
          .limit(2);
        if (error) throw new Error(error.message);
        return (data as RateRow[] | null) ?? [];
      } catch (err) {
        console.warn(
          `live rates: ${s.id} unavailable:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }
    }),
  );

  return perSeries.flat();
}
