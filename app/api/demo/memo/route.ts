import { buildMemoData, renderMemoPdf, type MemoData, type MemoExchange } from "@/lib/memo/memo-document";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { readerDateLong, readerToday } from "@/lib/reader-day";
import { sampleActualsLine, sampleCover, sampleDocumentChecks, sampleDocumentRow, sampleStressTest } from "@/lib/sample-cover";

export const runtime = "nodejs";

// The memo prints today's date but is otherwise pure fixture, so render it
// once per day per process and serve the same bytes: this is a public
// unauthenticated route, and Render doesn't edge-cache dynamic responses, so
// without this every request would pay a full @react-pdf render. The promise
// (not the buffer) is cached so concurrent first hits share one render; a
// failed render clears the slot to allow retry.
let cachedRender: { day: string; pdf: Promise<Buffer> } | null = null;

/**
 * The memo the signed-in route (app/api/deals/[id]/memo) builds for the
 * sample, call for call: the same row, the same check source, the same
 * arguments to `buildMemoData` in the same order, the same actuals line and
 * the same `renderMemoPdf` (lib/sample-documents.render.test.ts renders both
 * routes and holds the two PDFs' text equal).
 */
async function renderSampleMemo(dateStr: string, readerDay: string): Promise<Buffer> {
  const deal = sampleDocumentRow();
  // The demo mandate, where a signed-in reader's memo judges the reader's
  // own box: a visitor has none (lib/sample-cover `sampleDocumentChecks`).
  const buyBoxChecks = sampleDocumentChecks();
  // A 1031 exchange is a buy box's, and the demo mandate holds none.
  const exchange: MemoExchange | null = SAMPLE_DEMO_BOX.exchange
    ? { block: SAMPLE_DEMO_BOX.exchange, readerDay }
    : null;
  // No firm's branding and no dismissed submarket checks: both are a
  // signed-in reader's own rows, and a visitor has neither.
  const branding: MemoData["branding"] = null;
  const overrides: string[] | null = null;
  // The aerial of Brewerytown, the sample report's cover too
  // (lib/sample-cover), bounded like the real memo's: a slow or failed USGS
  // answer means a memo without a cover.
  const cover = await sampleCover(readerDay);
  // The sample's rent roll and T-12 against its memorandum, in the line the
  // signed-in memo sets beside its key terms (audit C8, H1).
  const actualsLine = sampleActualsLine();
  // The OM's assumptions tested in code, as the signed-in memo builds it for
  // the sample: its stored results and documents on the one derivation
  // (lib/sample-cover `sampleStressTest`), no published figure read today.
  const stressTest = sampleStressTest(readerDay);
  const memo = { ...buildMemoData(deal, dateStr, buyBoxChecks, branding, overrides, cover, readerDay, exchange, stressTest), actualsLine };
  // Drawn as the signed-in memo is: the line rides where the page has room
  // for it, so the one-page memo stays on one page.
  return renderMemoPdf(memo);
}

function getSampleMemo(dateStr: string, readerDay: string): Promise<Buffer> {
  if (cachedRender && cachedRender.day === readerDay) return cachedRender.pdf;
  const next = {
    day: readerDay,
    pdf: renderSampleMemo(dateStr, readerDay).catch((err) => {
      // Only clear our own entry — a newer day's render may have replaced it.
      if (cachedRender === next) cachedRender = null;
      throw err;
    }),
  };
  cachedRender = next;
  return next.pdf;
}

/**
 * The sample deal's IC memo as a PUBLIC download — a prospect sees the actual
 * deliverable before creating an account. Pure fixture data (no user rows,
 * no auth), rendered by the same document code the product ships, judged
 * against the same hypothetical mandate the /demo buy-box tab shows.
 */
export async function GET() {
  // Dated as the signed-in route dates a reader whose browser has not told
  // it a time zone (lib/reader-day), the day its dated lines read on too.
  const now = new Date();
  const dateStr = readerDateLong(null, now);
  const readerDay = readerToday(null, now);

  try {
    const buffer = await getSampleMemo(dateStr, readerDay);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sample-ic-memo.pdf"',
        // Fixture-only output — safe to cache at the edge for a day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("sample memo render failed", err);
    return Response.redirect(new URL("/demo", process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com"), 302);
  }
}
