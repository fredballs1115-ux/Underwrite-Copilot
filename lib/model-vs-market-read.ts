import "server-only";
import type { LiveRate } from "@/lib/live-rates";
import type { RealtorRead } from "@/lib/realtor";
import { liveMetroRates, liveRates } from "@/lib/live-rates-read";
import { liveZori } from "@/lib/zori-read";
import { liveRealtor } from "@/lib/realtor-read";
import type { MarketReads } from "@/lib/model-vs-market";

/**
 * Today's figures, read once through the cached readers — the metro's own
 * series, Zillow's rents and Realtor.com's market where the deal sits in a
 * covered metro, the national table for every deal — for the two checks
 * that share them: "since this screen" (lib/brief-delta) and the model's
 * assumptions against the published figures (lib/model-vs-market). The deal
 * page, the report route and the workbook route call this, so no surface
 * reads a different table for one deal on one day. A read that fails
 * throws, and each caller keeps its check absent rather than made against
 * a blank.
 */
export interface TodayReads extends MarketReads {
  rates: LiveRate[];
  realtor: RealtorRead | null;
  national: LiveRate[];
}

export async function todayReads(
  metro: { id: string; name: string } | null,
  now: Date = new Date(),
): Promise<TodayReads> {
  const [rates, zori, realtor, national] = await Promise.all([
    metro ? liveMetroRates(metro.id, now) : Promise.resolve([] as LiveRate[]),
    metro ? liveZori(metro.name) : Promise.resolve(null),
    metro ? liveRealtor(metro.name) : Promise.resolve(null),
    liveRates(now),
  ]);
  return { rates, zori, realtor, national, now };
}
