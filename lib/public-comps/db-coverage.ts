import "server-only";
import { signedInStockCounts } from "@/lib/research-read";
import { DB_MARKETS, type DbMarket } from "./db-markets";

/**
 * The property database's markets that hold recorded sales today, through
 * the cached count read every signed-in page shares (lib/research-read
 * `signedInStockCounts`, read once an hour). A market whose ingest has not
 * run, or whose read failed, is left out: coverage is claimed only for a
 * market the table answers with sales. For a signed-in reader only.
 */
export async function dbMarketsWithSales(): Promise<DbMarket[]> {
  const counts = await Promise.all(DB_MARKETS.map((m) => signedInStockCounts(m.ingestMarket)));
  return DB_MARKETS.filter((_, i) => (counts[i]?.sales ?? 0) > 0);
}
