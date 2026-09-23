import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_ROWS, type RateRow, type SeriesMeta } from "@/lib/live-rates";
import type { BenchRow } from "@/lib/zori";

/**
 * The two queries behind every live-market read, with no cache of their
 * own: the page readers (`lib/live-rates-read.ts`, `lib/zori-read.ts`,
 * `lib/realtor-read.ts`) wrap them in Next's `unstable_cache`, and the
 * analysis pipeline calls them bare — a screen reads a metro's figures once
 * per run, from the web process or the worker, and the worker has no Next
 * cache to wrap them in. One copy of each query, so the page and the model
 * cannot read a different table.
 *
 * ONE QUERY PER SERIES (see `lib/live-rates-read.ts` for why): a single
 * newest-first query across the table drops the quarterly series once the
 * daily ones have filed a few months of rows. A series with a
 * margin-of-error companion is read with it, so the read stays one index
 * scan a series. A series that fails answers nothing and the others still
 * come back.
 */
export async function fetchSeriesRows(
  supabase: SupabaseClient,
  metas: readonly SeriesMeta[],
): Promise<RateRow[]> {
  const ids = metas.flatMap((s) => (s.moe ? [s.id, s.moe] : [s.id]));
  if (ids.length === 0) return [];
  const perSeries = await Promise.all(
    ids.map(async (id): Promise<RateRow[]> => {
      try {
        const { data, error } = await supabase
          .from("rates")
          .select("series_id, obs_date, value")
          .eq("series_id", id)
          .order("obs_date", { ascending: false })
          .limit(HISTORY_ROWS);
        if (error) throw new Error(error.message);
        return (data as RateRow[] | null) ?? [];
      } catch (err) {
        console.warn(`live rates: ${id} unavailable:`, err instanceof Error ? err.message : err);
        return [];
      }
    }),
  );
  return perSeries.flat();
}

/** A metro's rows in `benchmarks` for the metrics named — the Zillow and
 *  Realtor.com pulls write them by the metro's name, so that is the key. */
export async function fetchBenchRows(
  supabase: SupabaseClient,
  metroName: string,
  metrics: readonly string[],
): Promise<BenchRow[]> {
  if (metrics.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("benchmarks")
      .select("metric, metro, low, as_of, note, source")
      .eq("metro", metroName)
      .in("metric", [...metrics]);
    if (error) throw new Error(error.message);
    return (data as BenchRow[] | null) ?? [];
  } catch (err) {
    console.warn(`benchmarks: ${metroName} unavailable:`, err instanceof Error ? err.message : err);
    return [];
  }
}
