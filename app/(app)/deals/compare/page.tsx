import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";
import { CompareTable, usd, type Col } from "./compare-table";

export const metadata: Metadata = { title: "Compare deals" };

/** Best-effort pull of a metric string out of the extraction. */
function fromExtraction(ex: ExtractionResult | null, re: RegExp): string | null {
  if (!ex) return null;
  const m = ex.metrics.find((x) => re.test(x.label));
  return m ? m.value : null;
}

function toCol(deal: DealRow): Col {
  const ex = (deal.extraction as ExtractionResult | null) ?? null;
  const verdict = (deal.verdict as VerdictResult | null) ?? null;
  const model = (deal.model as UnderwritingModel | null) ?? null;
  const r = model?.returns;
  return {
    id: deal.id,
    name: deal.name,
    assetClass: deal.asset_class,
    market: ex?.market || "—",
    verdict: verdict?.verdict ?? null,
    irr: r?.leveredIrrPct ?? null,
    em: r?.equityMultiple ?? null,
    coc: r?.cashOnCashPct ?? null,
    cap: r?.goingInCapPct ?? null,
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
  const cols = rows.map(toCol);

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

      <p className="text-xs leading-relaxed text-muted">
        First-pass screen, not investment advice. Deals without a generated
        model show blanks for the return metrics.
      </p>
    </div>
  );
}
