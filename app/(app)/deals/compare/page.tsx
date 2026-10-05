import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxCheckSource, evaluateBuyBox, screenYearOf, type BuyBox } from "@/lib/criteria";
import { CompareTable, MODEL_ROWS_NOTE, usd, type Col } from "./compare-table";
import { countyOf, placeDeal } from "@/lib/market-county";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import type { FirstSignal } from "@/lib/anthropic/types";
import { capSpreadRead, leverageRead } from "@/lib/leverage";
import { benchmark30 } from "@/lib/debt-index";
import { fmrToday } from "@/lib/fmr";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";
import { seedBenchmarks } from "@/lib/research-data";
import { asOfLabel } from "@/lib/research";
import { findPriceMetric, inferStrategy, noiFigures } from "@/lib/deal-strategy";
import { dealTypeLabel } from "@/lib/interest";
import { bannerSources, pictureVersion } from "@/lib/deal-banner";
import { coverFor, coverPlace } from "@/lib/deal-cover";
import { marketPictureFor } from "@/lib/market-picture";
import { floodCell, siteFlagsStale, type SiteFlagsResult } from "@/lib/site-flags/core";
import { affordableTag } from "@/lib/affordable";
import { singleTenantTag } from "@/lib/single-tenant";
import { hotelTag } from "@/lib/hotel-deal";
import { saleTag } from "@/lib/sale-terms";
import { rosterTag } from "@/lib/tenant-roster";
import { valueAddTag } from "@/lib/value-add";
import { taxAbatementTag } from "@/lib/tax-abatement";
import { sellerFinancingTag } from "@/lib/seller-financing";
import { siteReportsTag } from "@/lib/site-reports";
import { brokerageOf } from "@/lib/offering";
import { studentHousingTag } from "@/lib/student-housing";
import { manufacturedHousingTag } from "@/lib/manufactured-housing";
import { selfStorageTag } from "@/lib/self-storage";
import { regulationForDeal, regulationTag } from "@/lib/rent-regulation";
import { forwardTag, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseTag } from "@/lib/mixed-use";
import { TZ_COOKIE, readerToday } from "@/lib/reader-day";
import { cookies } from "next/headers";
import { compareReturns } from "@/lib/compare-figures";
import { shownAssetClass } from "@/lib/pipeline-slots";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT } from "@/lib/deal-picture";
import { verdictBehind, type JobLike } from "@/lib/screen-run";

export const metadata: Metadata = { title: "Compare deals" };

/** The OM's in-place or Year-1 NOI as stated — never the stabilized pro
 *  forma, which on a plan deal would land in the "Year-1 NOI" row as if the
 *  building earned it today. */
function goingInNoiText(ex: ExtractionResult | null): string | null {
  if (!ex) return null;
  const figs = noiFigures(ex.metrics);
  const going = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1");
  return going ? ex.metrics.find((m) => m.label === going.label)?.value ?? null : null;
}

function toCol(
  deal: DealRow,
  box: BuyBox | null,
  bench30: number | null,
  tenYearPct: number | null,
  googleEnabled: boolean,
  job: JobLike | null,
  /** the reader's own day (lib/reader-day), which decides the rent
   *  allowance in force */
  today: string,
): Col {
  const ex = (deal.extraction as ExtractionResult | null) ?? null;
  const verdict = (deal.verdict as VerdictResult | null) ?? null;
  const model = (deal.model as UnderwritingModel | null) ?? null;
  const r = model?.returns;
  const signal = ((deal as { first_signal?: unknown }).first_signal as FirstSignal | null) ?? null;
  // Read the way the pipeline and the deal page read it (#441): a typed line
  // with its street, city and state, a deal with no address placed by its
  // memorandum's. The pipeline's view stores the same upgrade.
  const stored = (deal as { address?: unknown }).address;
  const address =
    ((deal as { is_sample?: boolean }).is_sample ? null : addressUpgrade(stored, ex)) ??
    (stored as StructuredAddress | null) ??
    null;
  const picture = ((deal as { photo?: unknown }).photo as DealVisualCache | null)?.picture ?? null;
  // The class the deal was filed under ("auto" where the analyst left it to
  // the deck) — never printed as it stands: the column shows the deal's one
  // class through `shownAssetClass`.
  const filedClass = (deal.asset_class as string | null) ?? null;
  // The same placement the pipeline and the deal page make (lib/market-
  // county, #447) — all three surfaces agree, a county-placed deal naming
  // its county.
  const storedFlags = (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
  const placed = placeDeal(address, countyOf(address, siteFlagsStale(storedFlags, address?.label) ? null : storedFlags));

  // A plan deal's generated model books dark years first, so its year-1 cap
  // is negative or a default — not a figure to compare on, and not one to
  // spread against debt. The yield-on-cost row is its answer.
  const strat = inferStrategy(ex, signal);
  // What the price buys (#423): the model runs at the documents' price, and
  // on a note that is a loan's and on a share the share's — so a note shows
  // its yield to maturity where a building shows a cap, a share's cap is
  // struck on the whole its price implies, and returns the price did not
  // buy are withheld rather than set beside buildings' (lib/compare-interest).
  // Where the first-draft model has no figure, the memorandum's own: the
  // header's yield on cost, the pipeline card's going-in cap, each said as
  // the memorandum's (lib/compare-figures).
  const figs = compareReturns(ex, r ?? null, strat);
  const planDeal = figs.planDeal;
  const cap = figs.cap;
  // The price and the year-1 NOI: the model's, else the memorandum's — the
  // shared price reader (never a per-unit price or a prior trade; a
  // development's land cost is its price), read against the year the screen
  // read the memorandum, and its in-place or year-1 NOI.
  const modelPrice = usd(r?.purchasePrice);
  const statedPrice = findPriceMetric(ex?.metrics ?? [], strat.kind, screenYearOf(ex))?.value ?? null;
  const modelNoi = usd(r?.year1Noi);
  const statedNoi = goingInNoiText(ex);

  // Mandate fit — same engine, the same inputs and the same inferred kind
  // as the pipeline and deal page, so a development's land cost is judged
  // by the fit call printed beside it.
  let fit: Col["fit"] = null;
  let fitNote: string | null = null;
  const checkSource = box ? buyBoxCheckSource(ex, signal, address, strat.kind) : null;
  if (box && checkSource) {
    const checks = evaluateBuyBox(deal.asset_class, checkSource, box);
    const misses = checks.filter((c) => c.status === "miss");
    const nears = checks.filter((c) => c.status === "near");
    if (misses.length) {
      fit = "outside";
      fitNote = `Misses: ${misses.map((c) => c.label.toLowerCase()).join(", ")}`;
    } else if (nears.length) {
      fit = "near";
      fitNote = `Near on ${nears.map((c) => c.label.toLowerCase()).join(", ")}`;
    } else if (checks.some((c) => c.status === "pass")) {
      fit = "fits";
    }
  }

  return {
    id: deal.id,
    name: deal.name,
    // The deal's one class, as every surface shows it: the analyst's where
    // they filed one, the deck's where they left "Auto" — never a dash for
    // a deal the extraction has read.
    assetClass: shownAssetClass(deal.asset_class, ex),
    market: ex?.market || "—",
    coveredMarket: placed.briefed?.name ?? null,
    readMarket: placed.read?.name ?? null,
    readCounty: placed.placedBy?.county ?? null,
    verdict: verdict?.verdict ?? null,
    reason: verdict?.reason ?? null,
    // A re-screen still running, or one that failed before its verdict,
    // leaves the call on file the previous screen's (lib/screen-run, the
    // reader the memo, the report, the shared screen and the meeting
    // workbook ask): marked as the run, never crowned "best".
    behind: verdictBehind(job),
    hasModel: model != null,
    fit,
    fitNote,
    // Whose strategy it is on a note or a leased fee, as the deal header
    // says it (lib/interest `dealTypeLabel`).
    strategy: strat.kind === "unknown" ? null : dealTypeLabel(strat.label, ex),
    planDeal,
    irr: figs.withheld ? null : (r?.leveredIrrPct ?? null),
    em: figs.withheld ? null : (r?.equityMultiple ?? null),
    coc: figs.withheld ? null : (r?.cashOnCashPct ?? null),
    cap,
    capFrom: figs.capFrom,
    yoc: figs.yoc,
    yocFrom: figs.yocFrom,
    // Same arithmetic as the deal page's leverage check, run on the SAME cap
    // this table shows one row above — never a differently-sourced number.
    leverage: cap != null && bench30 != null ? leverageRead(cap, bench30) : null,
    // The same cap over today's 10-year (lib/debt-index reads it off the
    // rates table the strip draws from) — a fact with a date, no verdict.
    capOverTenYear: cap != null && tenYearPct != null ? capSpreadRead(cap, tenYearPct) : null,
    interest: figs.tag,
    affordable: affordableTag(ex),
    tenancy: singleTenantTag(ex),
    roster: rosterTag(ex),
    valueAdd: valueAddTag(ex),
    abatement: taxAbatementTag(ex),
    sellerNote: sellerFinancingTag(ex),
    reports: siteReportsTag(ex),
    broker: brokerageOf(ex),
    student: studentHousingTag(ex),
    mh: manufacturedHousingTag(ex, Infinity),
    storage: selfStorageTag(ex, Infinity),
    // The rent rules that reach the building, read through the one call
    // every surface makes (lib/rent-regulation `regulationForDeal`) at the
    // address the column is placed at. It is handed the class the deal was
    // filed under and reads the deal's one class itself (`shownAssetClass`).
    regulation: regulationTag(
      regulationForDeal(
        {
          extraction: ex,
          address,
          siteFlags: (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null,
          assetClass: filedClass,
        },
        today,
      ),
    ),
    // A forward purchase (lib/forward-purchase), read on the reader's day
    // with the kind the column reads.
    forward: forwardTag(readForwardPurchase(ex, new Date(`${today}T12:00:00Z`), strat)),
    // A mixed-use building's commercial share (lib/mixed-use).
    mixedUse: mixedUseTag(ex, new Date(`${today}T12:00:00Z`)),
    hotel: hotelTag(ex),
    sale: saleTag(ex),
    noteYtm: figs.noteYtmPct,
    withheld: figs.withheld,
    // FEMA's zone at the building from the stored site-flags lookup (#426);
    // blank before it has answered, never a guess.
    flood: floodCell(
      (() => {
        const f = (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
        return f && f.status !== "pending" && !siteFlagsStale(f, address?.label) ? f.flood : undefined;
      })(),
    ),
    price: modelPrice ?? statedPrice,
    priceFrom: modelPrice ? "model" : statedPrice ? "om" : null,
    noi: modelNoi ?? statedNoi,
    noiFrom: modelNoi ? "model" : statedNoi ? "om" : null,
    // Each building pictured at the head of its column (#418): its own
    // photograph where the deal has one cached, then Street View, then the
    // USGS aerial — each pinned, so its credit is the picture on screen. The
    // overhead stays here, where two columns' overheads tell two buildings
    // apart (lib/deal-banner); no market photograph.
    pictures: bannerSources({
      dealId: deal.id,
      pictureCredit: picture ? PICTURE_CREDIT[picture.source] : null,
      // Its colours before its pixels (#463), as on its pipeline card.
      picturePreview: picture?.preview ?? null,
      pictureVersion: picture ? pictureVersion(picture.hero) : null,
      googleEnabled,
      hasStreetAddress: !!address?.street,
      hasAddress: !!address?.label,
    }),
    // The deal's cover (#442), built as the pipeline page builds it, so the
    // column wears the drawing its card wears: under a picture while it
    // loads, and in place of the blank plate where no picture answers.
    cover: coverFor({
      seed: deal.id,
      assetClass: shownAssetClass(deal.asset_class, ex),
      place: coverPlace(address, marketPictureFor(address, ex?.market ?? null, placed.briefed ?? placed.read, placed.county)?.name, ex?.market),
    }),
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: idsParam } = await searchParams;
  const ids = (idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const supabase = await createSupabaseServerClient();
  const { data } = ids.length
    ? await supabase.from("deals").select("*").in("id", ids)
    : { data: [] };
  const rows = ((data ?? []) as DealRow[]).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id),
  );

  // Each deal's latest job, read the way the pipeline page reads it: a
  // re-screen running, or one that failed before its verdict, leaves the
  // call on file the previous screen's beside this run's terms.
  const { data: jobRows } = rows.length
    ? await supabase
        .from("analysis_jobs")
        .select("deal_id, status, step, updated_at, created_at")
        .in(
          "deal_id",
          rows.map((d) => d.id),
        )
        .order("created_at", { ascending: false })
        .limit(Math.max(100, rows.length * 3))
    : { data: [] as ({ deal_id: string } & JobLike)[] };
  // The newest job per deal (rows arrive newest first).
  const jobByDeal = new Map<string, JobLike>();
  for (const j of (jobRows ?? []) as ({ deal_id: string } & JobLike)[]) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j);
  }

  // One buy box per owning scope (team or personal) — fetch each scope once.
  type Scoped = DealRow & { user_id: string; team_id: string | null };
  const scopeKey = (d: Scoped) => (d.team_id ? `t:${d.team_id}` : `u:${d.user_id}`);
  const scopes = Array.from(new Set((rows as Scoped[]).map(scopeKey)));
  const boxEntries = await Promise.all(
    scopes.map(async (key) => {
      const [kind, id] = [key[0], key.slice(2)];
      const box = await getBuyBoxForDeal(
        kind === "u" ? id : "",
        kind === "t" ? id : null,
      ).catch(() => null);
      return [key, box] as const;
    }),
  );
  const boxByScope = new Map(boxEntries);

  // The week's 30-yr fixed and today's 10-year, one cached read for the
  // whole table (lib/debt-index-read) — the same read the deal page's
  // leverage check makes, the research layer's snapshot only where the
  // table has no survey, and the note says which. Nothing fresh on the
  // 10-year means no spread row.
  const debt = await liveDebtSeeds(HOLD_MONTHS);
  const bench30 = benchmark30(
    debt.survey30,
    seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed"),
  );
  const tenYearPct = debt.tenYear?.pct ?? null;
  // Today on the reader's own calendar (lib/reader-day), read once per
  // request: each column's rent rules read the allowance in force on it.
  const todayIso = readerToday((await cookies()).get(TZ_COOKIE)?.value);

  const cols = (rows as Scoped[]).map((d) =>
    toCol(
      d,
      boxByScope.get(scopeKey(d)) ?? null,
      bench30?.value ?? null,
      tenYearPct,
      !!process.env.GOOGLE_MAPS_API_KEY,
      jobByDeal.get(d.id) ?? null,
      todayIso,
    ),
  );

  const backLink = (
    <Link
      href="/deals"
      className="text-sm text-muted transition-colors hover:text-ink"
    >
      ← Pipeline
    </Link>
  );

  if (cols.length < 2) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm text-muted">
            Pick two or more deals from the pipeline to compare them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {backLink}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Compare</h1>
        <p className="mt-1 text-sm text-muted">
          {cols.length}{" "}deals side by side.{" "}{MODEL_ROWS_NOTE}
        </p>
      </div>

      <CompareTable cols={cols} />

      {bench30 && cols.some((c) => c.leverage) && (
        <p className="text-xs leading-relaxed text-muted">
          Leverage row: each deal&apos;s going-in cap against the 30-yr fixed
          ({bench30.value}%, {bench30.source}, {asOfLabel(bench30.asOf, bench30.live ? undefined : fmrToday())}) — an
          owner-occupier benchmark; investor debt usually prices above it, so
          a thin spread here is thinner in practice.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        First-pass screen, not investment advice. &ldquo;Best&rdquo; is only
        awarded among deals the screen didn&apos;t reject
        {cols.some((c) => c.behind) ? ", and never to a call a re-screen is replacing" : ""}.
        {cols.every((c) => !c.fit) && (
          <>
            {" "}
            <Link
              href="/criteria"
              className="font-medium text-brand hover:text-brand-strong"
            >
              Set a buy box
            </Link>{" "}
            to see each deal&apos;s mandate fit here.
          </>
        )}
      </p>
    </div>
  );
}
