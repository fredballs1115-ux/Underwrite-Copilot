import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Benchmark, RegulatoryRule } from "@/lib/research";

/**
 * The reference tables a SIGNED-IN reader may read, read once an hour for
 * all of them.
 *
 * Migrations 0023 and 0028 grant `benchmarks`, `regulatory_rules`,
 * `properties` and `recorded_sales` to authenticated users `using (true)`:
 * every signed-in reader reads exactly the same rows. Each view of /market
 * and of a deal's research panel had read them again through its own
 * session — the whole `benchmarks` table, every rule, and two exact counts
 * over the property database — and the page waited for the slowest of them
 * before it showed anything (research pass 25: /market's skeleton stayed up
 * 7.1–7.4 s whenever one of those reads was retried). One cached read with
 * the service role answers the same rows to every signed-in reader.
 *
 * The CALLER checks that a reader is signed in. These rows are not for a
 * visitor with no account, by the same policies — a public page reads them
 * only for a signed-in reader and draws its checked-in files otherwise, as
 * it did when the session read came back empty for them.
 *
 * A failed read throws, so it is never cached as an empty table; each caller
 * already keeps its checked-in files when a read fails. The tags are the
 * pulls' own (`benchmarks`), so a revalidation of the feed rows reaches this
 * read too.
 */
function admin() {
  return createSupabaseAdminClient();
}

const cachedBenchmarkRows = unstable_cache(
  async (): Promise<Benchmark[]> => {
    const { data, error } = await admin().from("benchmarks").select("*");
    if (error) throw new Error(`benchmarks: ${error.message}`);
    return (data ?? []) as unknown as Benchmark[];
  },
  ["signed-in-benchmark-rows"],
  { revalidate: 3600, tags: ["benchmarks"] },
);

const cachedRuleRows = unstable_cache(
  async (): Promise<RegulatoryRule[]> => {
    const { data, error } = await admin().from("regulatory_rules").select("*");
    if (error) throw new Error(`regulatory_rules: ${error.message}`);
    return (data ?? []) as unknown as RegulatoryRule[];
  },
  ["signed-in-rule-rows"],
  { revalidate: 3600, tags: ["regulatory_rules"] },
);

export interface StockCounts {
  parcels: number;
  sales: number;
}

const cachedStockCounts = unstable_cache(
  async (market: string): Promise<StockCounts> => {
    const supabase = admin();
    const [p, s] = await Promise.all([
      supabase.from("properties").select("id", { count: "exact", head: true }).eq("market", market),
      supabase.from("recorded_sales").select("id", { count: "exact", head: true }).eq("market", market),
    ]);
    if (p.error) throw new Error(`properties: ${p.error.message}`);
    if (s.error) throw new Error(`recorded_sales: ${s.error.message}`);
    return { parcels: p.count ?? 0, sales: s.count ?? 0 };
  },
  ["signed-in-stock-counts"],
  { revalidate: 3600, tags: ["properties"] },
);

/** Every benchmark row, or null when the read fails (the caller keeps its
 *  checked-in files). For a signed-in reader only. */
export async function signedInBenchmarkRows(): Promise<Benchmark[] | null> {
  try {
    return await cachedBenchmarkRows();
  } catch (err) {
    console.warn("benchmarks read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Every regulatory rule row, or null when the read fails. For a signed-in
 *  reader only. */
export async function signedInRuleRows(): Promise<RegulatoryRule[] | null> {
  try {
    return await cachedRuleRows();
  } catch (err) {
    console.warn("regulatory_rules read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The property database's counts for one ingested market — null where the
 *  read fails (migration 0028 not run) or holds no rows, so the page draws
 *  no line rather than a hollow "0". For a signed-in reader only. */
export async function signedInStockCounts(market: string): Promise<StockCounts | null> {
  try {
    const counts = await cachedStockCounts(market);
    return counts.parcels > 0 || counts.sales > 0 ? counts : null;
  } catch (err) {
    console.warn("property counts read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
