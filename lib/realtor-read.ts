import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { REALTOR_METRICS, realtorFor, type RealtorRead } from "@/lib/realtor";
import type { BenchRow } from "@/lib/zori";

/**
 * The Realtor.com rows for one covered metro, read for a page that may
 * have no one signed in — the same reason and the same shape as the Zillow
 * read: `benchmarks` is granted to authenticated users, `/market` is
 * public, and a published figure is the publisher's, not anybody's data.
 * Cached an hour per metro; the pull writes once a month.
 */
const cachedRows = unstable_cache(
  async (metroName: string): Promise<BenchRow[]> => {
    let supabase: ReturnType<typeof createSupabaseAdminClient>;
    try {
      supabase = createSupabaseAdminClient();
    } catch (err) {
      console.warn("realtor unavailable:", err instanceof Error ? err.message : err);
      return [];
    }
    try {
      const { data, error } = await supabase
        .from("benchmarks")
        .select("metric, metro, low, as_of, note, source")
        .eq("metro", metroName)
        .in("metric", [...REALTOR_METRICS]);
      if (error) throw new Error(error.message);
      return (data as BenchRow[] | null) ?? [];
    } catch (err) {
      console.warn(`realtor: ${metroName} unavailable:`, err instanceof Error ? err.message : err);
      return [];
    }
  },
  ["realtor-rows"],
  { revalidate: 3600, tags: ["benchmarks"] },
);

export async function liveRealtor(metroName: string): Promise<RealtorRead | null> {
  return realtorFor(await cachedRows(metroName), metroName);
}
