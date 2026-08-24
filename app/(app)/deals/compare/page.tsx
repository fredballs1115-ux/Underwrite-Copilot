import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox, type BuyBox } from "@/lib/criteria";
import { CompareTable, usd, type Col } from "./compare-table";
import { metroForAddress } from "@/lib/market-match";
import type { StructuredAddress } from "@/lib/address";
import { leverageRead } from "@/lib/leverage";
import { seedBenchmarks } from "@/lib/research-data";

export const metadata: Metadata = { title: "Compare deals" };

/** Best-effort pull of a metric string out of the extraction. */
function fromExtraction(ex: ExtractionResult | null, re: RegExp): string | null {
  if (!ex) return null;
  const m = ex.metrics.find((x) => re.test(x.label));
  return m ? m.value : null;
}

function toCol(deal: DealRow, box: BuyBox | null, bench30: number | null): Col {
  const ex = (deal.extraction as ExtractionResult | null) ?? null;
  const verdict = (deal.verdict as VerdictResult | null) ?? null;
  const model = (deal.model as UnderwritingModel | null) ?? null;
  const r = model?.returns;

  // Mandate fit — same engine and grading as the pipeline and deal page.
  let fit: Col["fit"] = null;
  let fitNote: string | null = null;
  if (box && ex) {
    const checks = evaluateBuyBox(deal.asset_class, ex, box);
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
    coveredMarket:
      metroForAddress(
        ((deal as { address?: unknown }).address as StructuredAddress | null) ?? {},
      )?.name ?? null,
    verdict: verdict?.verdict ?? null,
    reason: verdict?.reason ?? null,
    hasModel: model != null,
    fit,
    fitNote,
    irr: r?.leveredIrrPct ?? null,
    em: r?.equityMultiple ?? null,
    coc: r?.cashOnCashPct ?? null,
    cap: r?.goingInCapPct ?? null,
    // Same arithmetic as the deal page's leverage check, run on the SAME cap
    // this table shows one row above — never a differently-sourced number.
    leverage:
      r?.goingInCapPct != null && bench30 != null
        ? leverageRead(r.goingInCapPct, bench30)
        : null,
    price: usd(r?.purchasePrice) ?? fromExtraction(ex, /\bprice\b/i),
    noi: usd(r?.year1Noi) ?? fromExtraction(ex, /\bnoi\b/i),
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

  // The freshest 30-yr fixed, one fetch for the whole table — same source
  // order as the deal page: live rates table when reachable, seeded PMMS
  // snapshot otherwise.
  let bench30: { value: number; asOf: string } | null = null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const { data: rate } = await admin
      .from("rates")
      .select("value, obs_date")
      .eq("series_id", "MORTGAGE30US")
      .order("obs_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rate?.value != null)
      bench30 = { value: Number(rate.value), asOf: String(rate.obs_date) };
  } catch {
    // no admin env — the seeded snapshot below still serves
  }
  if (!bench30) {
    const row = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed");
    if (row && typeof row.low === "number")
      bench30 = { value: row.low, asOf: row.as_of };
  }

  const cols = (rows as Scoped[]).map((d) =>
    toCol(d, boxByScope.get(scopeKey(d)) ?? null, bench30?.value ?? null),
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
          {cols.length} deals side by side. Returns come from each deal&apos;s
          generated model where present.
        </p>
      </div>

      <CompareTable cols={cols} />

      {bench30 && cols.some((c) => c.leverage) && (
        <p className="text-xs leading-relaxed text-muted">
          Leverage row: each deal&apos;s going-in cap against the 30-yr fixed
          ({bench30.value}%, {bench30.asOf}) — an owner-occupier benchmark;
          investor debt usually prices above it, so a thin spread here is
          thinner in practice.
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
