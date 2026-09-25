import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxCheckSource, evaluateBuyBox, type BuyBox } from "@/lib/criteria";
import { CompareTable, usd, type Col } from "./compare-table";
import { dataMetroForAddress, metroForAddress } from "@/lib/market-match";
import type { StructuredAddress } from "@/lib/address";
import type { FirstSignal } from "@/lib/anthropic/types";
import { capSpreadRead, leverageRead } from "@/lib/leverage";
import { benchmark30 } from "@/lib/debt-index";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";
import { seedBenchmarks } from "@/lib/research-data";
import { findPriceMetric, inferStrategy, isPlanDeal, noiFigures } from "@/lib/deal-strategy";
import { bannerSources } from "@/lib/deal-banner";
import { compareInterest } from "@/lib/compare-interest";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT } from "@/lib/deal-picture";

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
): Col {
  const ex = (deal.extraction as ExtractionResult | null) ?? null;
  const verdict = (deal.verdict as VerdictResult | null) ?? null;
  const model = (deal.model as UnderwritingModel | null) ?? null;
  const r = model?.returns;
  const signal = ((deal as { first_signal?: unknown }).first_signal as FirstSignal | null) ?? null;
  const address =
    ((deal as { address?: unknown }).address as StructuredAddress | null) ?? null;
  const picture = ((deal as { photo?: unknown }).photo as DealVisualCache | null)?.picture ?? null;

  // A plan deal's generated model books dark years first, so its year-1 cap
  // is negative or a default — not a figure to compare on, and not one to
  // spread against debt. The yield-on-cost row is its answer.
  const strat = inferStrategy(ex, signal);
  const planDeal = isPlanDeal(strat.kind);
  // What the price buys (#423): the model runs at the documents' price, and
  // on a note that is a loan's and on a share the share's — so a note shows
  // its yield to maturity where a building shows a cap, a share's cap is
  // struck on the whole its price implies, and returns the price did not
  // buy are withheld rather than set beside buildings' (lib/compare-interest).
  const ci = compareInterest(ex, r ?? null);
  const cap = planDeal ? null : ci.cap;

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
    assetClass: deal.asset_class,
    market: ex?.market || "—",
    // Same matcher the pipeline and deal page use — all three surfaces agree.
    coveredMarket: metroForAddress(address ?? {})?.name ?? null,
    readMarket: dataMetroForAddress(address ?? {})?.name ?? null,
    verdict: verdict?.verdict ?? null,
    reason: verdict?.reason ?? null,
    hasModel: model != null,
    fit,
    fitNote,
    strategy: strat.kind === "unknown" ? null : strat.label,
    planDeal,
    irr: ci.withheld ? null : (r?.leveredIrrPct ?? null),
    em: ci.withheld ? null : (r?.equityMultiple ?? null),
    coc: ci.withheld ? null : (r?.cashOnCashPct ?? null),
    cap,
    yoc: r?.yieldOnCostPct ?? null,
    // Same arithmetic as the deal page's leverage check, run on the SAME cap
    // this table shows one row above — never a differently-sourced number.
    leverage: cap != null && bench30 != null ? leverageRead(cap, bench30) : null,
    // The same cap over today's 10-year (lib/debt-index reads it off the
    // rates table the strip draws from) — a fact with a date, no verdict.
    capOverTenYear: cap != null && tenYearPct != null ? capSpreadRead(cap, tenYearPct) : null,
    interest: ci.tag,
    noteYtm: ci.noteYtmPct,
    withheld: ci.withheld,
    // The shared price reader — never a per-unit price or a prior trade; a
    // development's land cost is its price.
    price: usd(r?.purchasePrice) ?? findPriceMetric(ex?.metrics ?? [], strat.kind)?.value ?? null,
    noi: usd(r?.year1Noi) ?? goingInNoiText(ex),
    // Each building pictured at the head of its column (#418): its own
    // photograph where the deal has one cached, then Street View, then the
    // USGS aerial — each pinned, so its credit is the picture on screen.
    pictures: bannerSources({
      dealId: deal.id,
      pictureCredit: picture ? PICTURE_CREDIT[picture.source] : null,
      googleEnabled,
      hasStreetAddress: !!address?.street,
      hasAddress: !!address?.label,
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

  const cols = (rows as Scoped[]).map((d) =>
    toCol(d, boxByScope.get(scopeKey(d)) ?? null, bench30?.value ?? null, tenYearPct, !!process.env.GOOGLE_MAPS_API_KEY),
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
          {cols.length}{" "}deals side by side. Returns come from each deal&apos;s
          generated model where present.
        </p>
      </div>

      <CompareTable cols={cols} />

      {bench30 && cols.some((c) => c.leverage) && (
        <p className="text-xs leading-relaxed text-muted">
          Leverage row: each deal&apos;s going-in cap against the 30-yr fixed
          ({bench30.value}%, {bench30.source}, as of {bench30.asOf}) — an
          owner-occupier benchmark; investor debt usually prices above it, so
          a thin spread here is thinner in practice.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        First-pass screen, not investment advice. &ldquo;Best&rdquo; is only
        awarded among deals the screen didn&apos;t reject.
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
