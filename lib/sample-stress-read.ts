import "server-only";
import { cache } from "react";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import { samplePlacement } from "@/lib/sample-stress";

/**
 * Today's figures for the sample's market, through the deal page's own read
 * (lib/model-vs-market-read `todayReads`), for the public pages that draw the
 * sample (/demo and the homepage's walkthrough): the stress test's published
 * evidence, the model's read and the demand card. A read that fails is null —
 * the published rows then stand unchecked, never a broken page. Never throws.
 * Read once a render (React's `cache`): the homepage's header chip, its memo
 * tile and its walkthrough share one read, so they draw one set of figures.
 */
export const sampleTodayReads = cache(async (): Promise<TodayReads | null> => {
  try {
    return await todayReads(samplePlacement().live);
  } catch (err) {
    console.warn("sample live figures unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
});
