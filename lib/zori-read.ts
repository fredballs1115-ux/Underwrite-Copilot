import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchBenchRows, fetchBenchRowsFor } from "@/lib/live-rates-query";
import { ZILLOW_METRICS, zillowFileMonths, zoriFor, type BenchRow, type FileMonth, type ZoriRead } from "@/lib/zori";

/**
 * The Zillow rows for one covered metro — the asking rent, the apartment
 * asking rent, the home value and their changes — read for a page that may
 * have no one signed in: the same reason and the same shape as the
 * live-rates read. `benchmarks` is granted to authenticated users, `/market`
 * is public, and a Zillow figure is Zillow's to publish, not anybody's
 * data. Cached an hour per metro; the pull writes once a month. The rows
 * are cached and the read is made on them each time, on the caller's day,
 * so a figure stops being said the day it stops being current.
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

export async function liveZori(metroName: string, now: Date = new Date()): Promise<ZoriRead | null> {
  return zoriFor(await cachedRows(metroName), metroName, now);
}

/** Each Zillow file's month for one metro, current or not — the feeds
 *  card's read, from the same cached rows the pages read. */
export async function liveZillowFiles(metroName: string): Promise<FileMonth[]> {
  return zillowFileMonths(await cachedRows(metroName), metroName);
}

/**
 * Every metro area's Zillow read at once — the rent board's one read,
 * cached an hour under the list of names (a new metro is read the day it
 * is listed), one query rather than one a metro. A name with no rows
 * reads null, as `liveZori` would.
 */
const cachedRowsFor = unstable_cache(
  async (metroNames: string[]): Promise<BenchRow[]> => {
    let supabase: ReturnType<typeof createSupabaseAdminClient>;
    try {
      supabase = createSupabaseAdminClient();
    } catch (err) {
      console.warn("zori unavailable:", err instanceof Error ? err.message : err);
      return [];
    }
    return fetchBenchRowsFor(supabase, metroNames, ZILLOW_METRICS);
  },
  ["zori-rows-for"],
  { revalidate: 3600, tags: ["benchmarks"] },
);

export async function liveZoriAll(metroNames: readonly string[], now: Date = new Date()): Promise<Map<string, ZoriRead | null>> {
  const rows = await cachedRowsFor([...metroNames]);
  return new Map(metroNames.map((name) => [name, zoriFor(rows, name, now)]));
}
