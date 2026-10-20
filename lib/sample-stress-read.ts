import "server-only";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import { samplePlacement } from "@/lib/sample-stress";

/**
 * Today's figures for the sample's market, through the deal page's own read
 * (lib/model-vs-market-read `todayReads`), for the public pages that draw the
 * sample (/demo and the homepage's walkthrough): the stress test's published
 * evidence, the model's read and the demand card. A read that fails is null —
 * the published rows then stand unchecked, never a broken page. Never throws.
 */
export async function sampleTodayReads(): Promise<TodayReads | null> {
  try {
    return await todayReads(samplePlacement().live);
  } catch (err) {
    console.warn("sample live figures unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
