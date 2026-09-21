import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { zoriFor, type BenchRow, type ZoriRead } from "@/lib/zori";

/**
 * The two ZORI rows for one covered metro, read for a page that may have
 * no one signed in — the same reason and the same shape as the live-rates
 * read: `benchmarks` is granted to authenticated users, `/market` is
 * public, and a Zillow figure is Zillow's to publish, not anybody's data.
 * Cached an hour per metro; the pull writes once a month.
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
    try {
      const { data, error } = await supabase
        .from("benchmarks")
        .select("metric, metro, low, as_of, note, source")
        .eq("metro", metroName)
        .in("metric", ["zori_rent", "zori_rent_yoy"]);
      if (error) throw new Error(error.message);
      return (data as BenchRow[] | null) ?? [];
    } catch (err) {
      console.warn(`zori: ${metroName} unavailable:`, err instanceof Error ? err.message : err);
      return [];
    }
  },
  ["zori-rows"],
  { revalidate: 3600, tags: ["benchmarks"] },
);

export async function liveZori(metroName: string): Promise<ZoriRead | null> {
  return zoriFor(await cachedRows(metroName), metroName);
}
