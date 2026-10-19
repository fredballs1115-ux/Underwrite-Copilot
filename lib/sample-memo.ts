// The sample's IC memo as data: what the public memo download
// (app/api/demo/memo/route.ts) hands `buildMemoData` — the sample's row as
// the seed action stores it, its checks on the deal page's check source
// against the public sample's buy box, the reader's day and the mandate's
// exchange (lib/sample-cover `sampleDocumentRow`, `sampleDocumentChecks`) —
// so a page that previews the memo (the homepage's artifact tile,
// app/memo-preview) draws the memo's own words and figures, never a drawing
// of a memo, and cannot drift from the download as a dated or address-
// dependent line changes (audit C7, L4). Server-only, as the memo document
// is. The download adds the cover picture, which it fetches; a preview
// carries none. lib/sample-cover's test holds the two equal, cover aside.
import { buildMemoData, type MemoData, type MemoExchange } from "@/lib/memo/memo-document";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { readerDateLong, readerToday } from "@/lib/reader-day";
import { sampleActualsLine, sampleDocumentChecks, sampleDocumentRow, sampleStressTest } from "@/lib/sample-cover";

/** The memo the download builds at `now`, dated as it dates it (a reader of
 *  no known time zone, lib/reader-day), with no cover. */
export function sampleMemoData(now: Date = new Date()): MemoData {
  const dateStr = readerDateLong(null, now);
  const readerDay = readerToday(null, now);
  const deal = sampleDocumentRow();
  const buyBoxChecks = sampleDocumentChecks();
  const exchange: MemoExchange | null = SAMPLE_DEMO_BOX.exchange
    ? { block: SAMPLE_DEMO_BOX.exchange, readerDay }
    : null;
  // The actuals line the download sets beside its key terms (audit C8, H1),
  // and the stress test the download leads with (lib/sample-cover).
  return { ...buildMemoData(deal, dateStr, buyBoxChecks, null, null, null, readerDay, exchange, sampleStressTest(readerDay)), actualsLine: sampleActualsLine() };
}
