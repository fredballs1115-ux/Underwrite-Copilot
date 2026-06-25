import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type DealRow } from "@/lib/deals";
import type { ExtractionResult, ExtractedMetric } from "@/lib/anthropic/types";
import { Pipeline, type DealCard } from "./pipeline";

const ERRORS: Record<string, string> = {
  name: "Please give the deal a name.",
  file: "Please choose a PDF offering memorandum to upload.",
  pdf: "That file isn’t a PDF — please upload the OM as a PDF.",
  size: "That PDF is larger than 22 MB — please try a smaller file for now.",
  save: "Couldn’t save the deal. Please try again.",
};

// Up to two headline figures to show on each pipeline row.
function pickStats(metrics: ExtractedMetric[]): { label: string; value: string }[] {
  const priority = [/going[- ]?in cap/i, /\bprice\b/i, /\bnoi\b/i, /\birr\b/i];
  const chosen: ExtractedMetric[] = [];
  for (const re of priority) {
    const m = metrics.find((x) => re.test(x.label) && !chosen.includes(x));
    if (m) chosen.push(m);
    if (chosen.length >= 2) break;
  }
  return chosen.slice(0, 2).map((m) => ({ label: m.label, value: m.value }));
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? null) : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id, name, asset_class, created_at, verdict, extraction")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        <p className="font-medium">Database isn’t set up yet</p>
        <p className="mt-1 text-muted">
          Run <code>supabase/migrations/0001_init.sql</code> in your Supabase SQL
          editor, then refresh this page.
        </p>
        <p className="mt-2 text-xs text-muted">({error.message})</p>
      </div>
    );
  }

  type Row = Pick<
    DealRow,
    "id" | "name" | "asset_class" | "created_at" | "verdict" | "extraction"
  >;

  const deals: DealCard[] = ((data ?? []) as Row[]).map((d) => {
    const extraction = d.extraction as ExtractionResult | null;
    const verdict = d.verdict as { verdict?: string } | null;
    return {
      id: d.id,
      name: d.name,
      assetClass: d.asset_class,
      createdAt: d.created_at,
      verdict: verdict?.verdict ?? null,
      market: extraction?.market ?? "",
      stats: extraction ? pickStats(extraction.metrics) : [],
    };
  });

  return <Pipeline deals={deals} errorMessage={errorMessage} />;
}
