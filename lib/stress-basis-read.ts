/**
 * The stress test's basis evidence for a surface that has not read it
 * (the memo, the report, the shared screen, the verdict's brief): the deal
 * row's stored public-record pull and the reader's own past screens of its
 * market and class, read the way the deal page reads them (lib/market-
 * memory-read, the one read of the memory), then built by the one builder
 * the page calls too (lib/stress-basis-evidence `stressBasisEvidence`).
 * A read that fails leaves its half out, never the surface down.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { buildComps, marketMemoryFor, type MarketGroup } from "@/lib/market-memory";
import { readMemoryGroup, readMemoryKeys } from "@/lib/market-memory-read";
import type { RecordCompsResult } from "@/lib/public-comps/core";
import type { PastScreensEvidence, RecordedSalesEvidence } from "@/lib/stress-test";
import { compsCallSubjectOf, memoryClassOf, stressBasisEvidence } from "@/lib/stress-basis-evidence";

/** The deal row's columns the evidence is read from. */
export interface StressBasisDeal {
  id: string;
  asset_class?: unknown;
  is_sample?: unknown;
  public_comps?: unknown;
  extraction?: unknown;
  first_signal?: unknown;
}

/** One deal's (class × market) group of the reader's own screens, as the
 *  deal page's strip reads it; null where there is none or a read failed. */
export async function readMemoryGroupFor(
  supabase: SupabaseClient,
  readerId: string,
  dealId: string,
  storedClass: string | null,
  extraction: ExtractionResult | null,
): Promise<MarketGroup | null> {
  const market = extraction?.market;
  if (!market) return null;
  try {
    const keys = await readMemoryKeys(supabase, readerId);
    if (!keys) return null;
    const cls = memoryClassOf(storedClass, extraction);
    const rows = await readMemoryGroup(supabase, keys, dealId, cls, market);
    return rows ? marketMemoryFor(buildComps(rows), dealId, cls, market) : null;
  } catch {
    return null;
  }
}

/**
 * The recorded sales and the reader's past screens for one deal's basis row.
 * `readerId` is whose past screens are read — none where null — and
 * `pastScreens: false` reads none for a surface whose words reach someone
 * other than the reader (that surface says so by name).
 */
export async function readStressBasisEvidence(
  supabase: SupabaseClient,
  deal: StressBasisDeal,
  opts: { readerId: string | null; pastScreens: boolean },
): Promise<{ recordedSales: RecordedSalesEvidence | null; pastScreens: PastScreensEvidence | null }> {
  const extraction = (deal.extraction as ExtractionResult | null | undefined) ?? null;
  const firstSignal = (deal.first_signal as FirstSignal | null | undefined) ?? null;
  const storedClass = (deal.asset_class as string | null | undefined) ?? null;
  const isSample = !!deal.is_sample;
  const memoryGroup =
    opts.pastScreens && opts.readerId && !isSample ? await readMemoryGroupFor(supabase, opts.readerId, deal.id, storedClass, extraction) : null;
  return stressBasisEvidence({
    publicComps: (deal.public_comps as RecordCompsResult | null | undefined) ?? null,
    subject: compsCallSubjectOf(extraction, firstSignal, storedClass),
    memoryGroup,
    isSample,
  });
}
