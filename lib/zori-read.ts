import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchBenchRows } from "@/lib/live-rates-query";
import { ZILLOW_METRICS, zoriFor, type BenchRow, type ZoriRead } from "@/lib/zori";

/**
 * The Zillow rows for one covered metro — the asking rent, the apartment
 * asking rent, the home value and their changes — read for a page that may
 * have no one signed in: the same reason and the same shape as the
 * live-rates read. `benchmarks` is granted to authenticated users, `/market`
 * is public, and a Zillow figure is Zillow's to publish, not anybody's
 * data. Cached an hour per metro; the pull writes once a month.
 */
const cachedRows = unstable_cache(
  async (metroName: string): Promise<BenchRow[]> => {
    let supabase: ReturnType<typeof createSupabaseAdminClient>;
    try {
      supabase = createSupabaseAdminClient();
    } catch (err) {
      console.warn("zori unavailable:", err instanceof Error ? err.message : err);
      return [];
    }
    // The query lives in lib/live-rates-query.ts, shared with the analysis
    // pipeline's uncached read.
    return fetchBenchRows(supabase, metroName, ZILLOW_METRICS);
  },
  ["zori-rows"],
  { revalidate: 3600, tags: ["benchmarks"] },
);

export async function liveZori(metroName: string): Promise<ZoriRead | null> {
  return zoriFor(await cachedRows(metroName), metroName);
}
