import { cookies } from "next/headers";
import { currentSampleRow } from "@/lib/sample-refresh";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TZ_COOKIE, readerDateLong, readerToday } from "@/lib/reader-day";
import { isPro } from "@/lib/billing";
import { SAMPLE_EXPORT_PATH, exportGate, exportGateDealOf } from "@/lib/sample-exports";
import {
  renderMemoPdf,
  buildMemoData,
  type MemoData,
  type MemoExchange,
} from "@/lib/memo/memo-document";
import { buyBoxForDealRow } from "@/lib/deal-buy-box";
import { getBrandingForDeal, brandingLogoDataUri } from "@/lib/branding-server";
import { evaluateBuyBox, type BuyBoxCheck } from "@/lib/criteria";
import { dealCheckSource } from "@/lib/buy-box-chip";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { countyOf, placeDeal } from "@/lib/market-county";
import { todayReads } from "@/lib/model-vs-market-read";
import { modelVsMarketFor, type ModelVsMarket } from "@/lib/model-vs-market";
import { regulationForDeal } from "@/lib/rent-regulation";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import { dealOverrideLines } from "@/lib/market/deal-checks";
import { verdictBehind } from "@/lib/screen-run";
import { coverPictureFor } from "@/lib/memo/cover-aerial";
import { actualsFromRows, actualsShortLine } from "@/lib/actuals/actuals-read";
import { t12SummaryOf } from "@/lib/actuals/analyze";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { inferStrategy } from "@/lib/deal-strategy";
import { shownAssetClass } from "@/lib/asset-class";
import { pdfSafe } from "@/lib/memo/pdf-text";
import type { DealVisualCache } from "@/lib/deal-location";
import { HOLD_MONTHS, deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { modelMarketFor } from "@/lib/model-market";
import { buildStressTest } from "@/lib/stress-test";
import { readStressBasisEvidence } from "@/lib/stress-basis-read";
import type { StressTest } from "@/lib/stress-test-types";
import type { BrokerCompsResult, ChallengerResult, MarketResult } from "@/lib/anthropic/types";

// PDF generation needs the Node runtime (not edge).
export const runtime = "nodejs";

/**
 * Stream a one-page screening memo PDF for a deal. RLS on the user-scoped
 * Supabase client guarantees the caller can only export their own deals.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url),
      302,
    );
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.redirect(new URL(`/deals/${id}?error=exportfail`, req.url), 302);
  if (!data) return new Response("Not found", { status: 404 });

  // The PDF memo is a Pro feature — except on the reader's own sample deal,
  // which the public pages promise free (lib/sample-exports). On Free, send
  // the user straight to the upgrade path with an ?upsell tag so the billing
  // page explains why they landed there (never a raw error page, never a
  // silent/mystery redirect).
  const gateDeal = exportGateDealOf(data as { is_sample?: boolean | null; om_storage_path?: string | null });
  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch (err) {
    // Never let the plan lookup 500 the export into a raw error page.
    console.error(`memo isPro check failed for deal ${id}:`, err);
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  const gate = exportGate(pro, gateDeal);
  // A free reader on the sample gets the public sample's own file, never one
  // built from the row, which the reader can write (lib/sample-exports).
  if (gate === "sample") {
    return Response.redirect(new URL(SAMPLE_EXPORT_PATH.memo, req.url), 302);
  }
  if (gate === "upsell") {
    return Response.redirect(new URL(`/billing?upsell=memo`, req.url), 302);
  }

  // An outdated sample reads as the current fixture (lib/sample-refresh),
  // as the deal page draws it.
  const deal = currentSampleRow(data as DealRow);
  // A memo without a verdict is a near-blank, brand-damaging PDF — refuse it.
  if (!deal.verdict) {
    return Response.redirect(
      new URL(`/deals/${id}?error=memoempty`, req.url),
      302,
    );
  }
  // A screen that failed before reaching the verdict, or one still running
  // that has not reached it yet, leaves this run's terms beside the previous
  // screen's call — a memo pairing the two would read as one screen. Refuse
  // it until the run finishes, or is run again (lib/screen-run).
  const { data: latestJob } = await supabase
    .from("analysis_jobs")
    // Its last write too: a run that stopped making progress is waited on
    // by nothing, and the refusal says so (lib/screen-run `isStalled`).
    .select("status, step, updated_at")
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const behind = verdictBehind(latestJob);
  if (behind) {
    return Response.redirect(
      new URL(`/deals/${id}?error=${behind === "running" ? "memorunning" : behind === "stalled" ? "memostalled" : "memostale"}`, req.url),
      302,
    );
  }
  // The day the memo is dated: the reader's own (lib/reader-day), never the
  // server's UTC day, which is tomorrow from 8 pm Eastern — and the day its
  // file is named for and its dated lines (the rent allowance in force, a
  // delivery's clock) are read on, read once so the three cannot differ.
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  const now = new Date();
  const dateStr = readerDateLong(tz, now);
  const readerDay = readerToday(tz, now);

  // The buyer's standing criteria, so the forwarded page carries the fit call.
  // Best-effort: no box (or a pre-0008 schema) just means no buy-box row.
  let buyBoxChecks: BuyBoxCheck[] = [];
  // The reader's 1031 exchange, where the box holds one (lib/exchange-deal):
  // its deadlines against this deal, read on the reader's own day
  // (lib/reader-day) as the deal header's chip reads them.
  let exchange: MemoExchange | null = null;
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    const box = await buyBoxForDealRow({ ...ownership, is_sample: (deal as { is_sample?: boolean }).is_sample });
    if (box?.exchange) exchange = { block: box.exchange, readerDay };
    if (box) {
      // The same source the deal page judges (lib/buy-box-chip
      // `dealCheckSource`): the extraction widened with the first signal and
      // the deal's structured address, the deal's kind as the page infers it
      // and what the price buys — so a criterion the page calls "in
      // territory" is never "unknown" on the PDF, nor a cap the page
      // withholds held to the box's floor.
      const extraction = (deal.extraction as ExtractionResult | null) ?? null;
      const firstSignal = (deal.first_signal as FirstSignal | null) ?? null;
      buyBoxChecks = evaluateBuyBox(
        deal.asset_class,
        dealCheckSource(extraction, firstSignal, (deal.address as StructuredAddress | null) ?? null),
        box,
      );
    }
  } catch {
    buyBoxChecks = [];
    exchange = null;
  }

  // Custom firm branding (Feature 6) — best-effort; any failure (pre-0021
  // schema, missing logo file) just renders the default identity.
  let branding: MemoData["branding"] = null;
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    const b = await getBrandingForDeal(ownership.user_id, ownership.team_id);
    if (b) {
      branding = {
        firmName: b.firmName ?? null,
        logoDataUri: await brandingLogoDataUri(b, {
          userId: ownership.user_id,
          teamId: ownership.team_id,
        }),
        footerText: b.footerText ?? null,
      };
    }
  } catch {
    branding = null;
  }

  // This link opens in a plain <a> navigation, so an unhandled throw would put
  // a raw "Internal Server Error" in the browser. Catch it and bounce back to
  // the deal with a friendly, mapped error instead.
  try {
    // Submarket checks the analyst overrode travel with the memo (Phase 4).
    // Best-effort: a pre-0033 schema returns nothing and the section is absent.
    const overrides = await dealOverrideLines(
      supabase,
      id,
      deal.name,
      (deal.extraction as ExtractionResult | null) ?? null,
    );
    // The building on the cover (#434): its own photograph where the deal
    // has one, else the same USGS frame the deal page's Aerial tab shows,
    // through the same resolver. Bounded to a few seconds: the memo never
    // waits on imagery, it just prints without it.
    const cover = await coverPictureFor(
      supabase,
      id,
      (deal.address as StructuredAddress | null) ?? null,
      ((deal as unknown as { photo?: DealVisualCache | null }).photo ?? null),
    );
    // The rent allowance in force is read on the reader's day — the day the
    // memo is dated and its file named for (lib/rent-regulation).
    // The deal's rent roll and T-12 against the memorandum, in one line
    // beside the key terms (research pass 24, B3) — the report's own read.
    // A read that fails prints no line, never a claim the documents hold
    // nothing.
    const extraction = (deal.extraction as ExtractionResult | null) ?? null;
    const [rrRes, t12Res] = await Promise.all([
      supabase
        .from("deal_rent_rolls")
        .select("as_of_date, summary")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("deal_t12_statements")
        .select("period_end_date, summary")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const firstSignal = (deal.first_signal as FirstSignal | null) ?? null;
    const actuals =
      rrRes.error || t12Res.error
        ? null
        : actualsFromRows(
            extraction,
            inferStrategy(extraction, firstSignal),
            shownAssetClass(deal.asset_class as string | null, extraction) || null,
            rrRes.data,
            t12Res.data,
          );
    const actualsLine = actuals ? pdfSafe(actualsShortLine(actuals)) : "";
    // The OM's assumptions tested in code (lib/stress-test), the way the
    // deal page builds it: the stored results, the deal's documents and the
    // model derived as the deal page and the report derive it — the same
    // rate read, the actuals folded in, never seeded on the sample
    // (lib/model-market) — and the published figures the report's test
    // reads (the model's assumptions against them, lib/model-vs-market), so
    // the memo's block and the report's page say one test. A derivation that
    // fails prints a memo without the block, never no memo.
    let stressTest: StressTest | null = null;
    try {
      if (extraction && !rrRes.error && !t12Res.error) {
        const debt = await liveDebtSeeds(HOLD_MONTHS);
        // The rent rules that reach the building, on the reader's day, the
        // report's own call (lib/rent-regulation `regulationForDeal`).
        const address = addressUpgrade(deal.address, extraction) ?? (deal.address as StructuredAddress | null) ?? null;
        const siteFlags = (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
        const regulationRead = regulationForDeal({ extraction, address, siteFlags, assetClass: deal.asset_class as string | null }, readerDay);
        const t12Summary = t12SummaryOf(t12Res.data?.summary);
        const derived = deriveUnderwriteInputs(
          extraction,
          deal.name,
          {
            rentRoll: rrRes.data?.summary
              ? { summary: rrRes.data.summary as RentRollSummary, asOf: (rrRes.data.as_of_date as string | null) ?? null }
              : null,
            t12: t12Summary ? { summary: t12Summary as T12Summary, periodEnd: (t12Res.data?.period_end_date as string | null) ?? null } : null,
          },
          modelMarketFor((deal as { is_sample?: boolean }).is_sample, debt),
          // Its noon, the day every dated reader of the model reads on.
          { regulation: regulationRead, asOf: new Date(`${readerDay}T12:00:00Z`) },
        );
        // The model's assumptions against the published figures, the report
        // route's own read: the market the deal page places the deal in
        // (#447), the same cached readers. Its own try: a failed live read
        // leaves the test on the stored market check's figures alone.
        let modelVsMarket: ModelVsMarket | null = null;
        try {
          const metro = placeDeal(address, countyOf(address, siteFlags)).live;
          modelVsMarket = modelVsMarketFor({
            derived,
            extraction,
            firstSignal,
            storedAssetClass: deal.asset_class as string | null,
            metro,
            reads: await todayReads(metro),
            regulation: regulationRead,
          });
        } catch (err) {
          console.warn(`memo assumptions read failed for ${id}:`, err instanceof Error ? err.message : err);
          modelVsMarket = null;
        }
        // The recorded sales and the reader's own past screens, as the deal
        // page sets the basis against them (lib/stress-basis-read, the one
        // builder): the memo is the reader's own document.
        const { recordedSales, pastScreens } = await readStressBasisEvidence(supabase, deal, { readerId: user.id, pastScreens: true });
        stressTest = buildStressTest({
          extraction,
          firstSignal,
          challenger: (deal.challenges as ChallengerResult | null) ?? null,
          market: (deal.market as MarketResult | null) ?? null,
          modelVsMarket,
          actuals,
          derived,
          storedAssetClass: deal.asset_class as string | null,
          brokerComps: (deal.comps as BrokerCompsResult | null) ?? null,
          recordedSales,
          pastScreens,
          readOn: readerDay,
        });
      }
    } catch (err) {
      console.warn(`memo stress test not built for ${id}:`, err instanceof Error ? err.message : err);
      stressTest = null;
    }
    const memo = { ...buildMemoData(deal, dateStr, buyBoxChecks, branding, overrides, cover, readerDay, exchange, stressTest), actualsLine };
    // The line rides where the page has room for it (`renderMemoPdf`): the
    // one-page memo stays on one page.
    const buffer = await renderMemoPdf(memo);

    const safe =
      (deal.name || "deal")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "deal";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}-screening-memo-${readerDay}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("memo render failed", err);
    return Response.redirect(new URL(`/deals/${id}?error=memofail`, req.url), 302);
  }
}
