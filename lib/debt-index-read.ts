import "server-only";
import { liveRates } from "@/lib/live-rates-read";
import { NO_DEBT_SEEDS, debtSeeds, type DebtSeeds } from "@/lib/debt-index";

/**
 * Today's debt indices for a deal, off the same cached rates read `/tools`
 * and `/market` draw their strip from (an hour, service role — see
 * `lib/live-rates-read.ts` for why). Every surface that derives a deal's
 * model calls THIS — the deal page, the workbook route, the report route
 * and the bridge's current-assumptions read — so the page and the workbook
 * cannot disagree about the rate. A read that fails seeds nothing, and each
 * surface keeps its old flat default with the old note: a rate the model
 * cannot back is better left as the analyst's to enter than made stale.
 */
export async function liveDebtSeeds(holdMonths: number): Promise<DebtSeeds> {
  try {
    return debtSeeds(await liveRates(), holdMonths);
  } catch (err) {
    console.warn("debt seeds unavailable:", err instanceof Error ? err.message : err);
    return NO_DEBT_SEEDS;
  }
}
