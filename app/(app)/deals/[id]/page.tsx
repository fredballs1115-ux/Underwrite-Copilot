import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type DealRow } from "@/lib/deals";
import {
  type ExtractionResult,
  type ChallengerResult,
  type BrokerCompsResult,
  type ReconciliationResult,
  type MarketResult,
  type VerdictResult,
  type ExtractedMetric,
} from "@/lib/anthropic/types";
import { DealView } from "./deal-view";

const VERDICT_PILL = {
  pass: { label: "Pass", cls: "bg-pass/15 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution" },
  pass_on: { label: "Pass on", cls: "bg-kill/15 text-kill" },
} as const;

// Headline figures for the persistent deal header. Prefer the deal-defining
// metrics; fall back to the first few so the strip is never empty.
function pickKeyStats(metrics: ExtractedMetric[]): ExtractedMetric[] {
  const priority = [
    /going[- ]?in cap/i,
    /pro ?forma cap/i,
    /exit cap/i,
    /\bprice\b/i,
    /\bnoi\b/i,
    /\birr\b/i,
    /occupancy/i,
  ];
  const chosen: ExtractedMetric[] = [];
  for (const re of priority) {
    const m = metrics.find((x) => re.test(x.label) && !chosen.includes(x));
    if (m) chosen.push(m);
    if (chosen.length >= 4) break;
  }
  for (const m of metrics) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(m)) chosen.push(m);
  }
  return chosen.slice(0, 4);
}

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode, tab } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const deal = data as DealRow;
  const extraction = deal.extraction
    ? (deal.extraction as ExtractionResult)
    : null;
  const challenges = deal.challenges
    ? (deal.challenges as ChallengerResult)
    : null;
  const comps = deal.comps ? (deal.comps as BrokerCompsResult) : null;
  const reconciliation = deal.reconciliation
    ? (deal.reconciliation as ReconciliationResult)
    : null;
  const market = deal.market ? (deal.market as MarketResult) : null;
  const verdict = deal.verdict ? (deal.verdict as VerdictResult) : null;

  const { data: jobData } = await supabase
    .from("analysis_jobs")
    .select("status, step, progress, error")
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const job = jobData as {
    status: string;
    step: string | null;
    progress: number;
    error: string | null;
  } | null;

  const keyStats = extraction ? pickKeyStats(extraction.metrics) : [];
  const pill = verdict ? VERDICT_PILL[verdict.verdict] : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deals"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← All deals
      </Link>

      {/* Persistent deal header — the anchor that stays put across tabs. */}
      <header className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{deal.name}</h1>
            <p className="mt-0.5 text-sm capitalize text-muted">
              {deal.asset_class}
            </p>
          </div>
          {pill && (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${pill.cls}`}
            >
              {pill.label}
            </span>
          )}
        </div>

        {keyStats.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {keyStats.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-faint px-3 py-2"
              >
                <p className="flex items-center gap-1 text-[11px] text-muted">
                  <span className="truncate">{m.label}</span>
                  {m.flagged && <span className="shrink-0 text-caution">⚑</span>}
                </p>
                <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </header>

      <DealView
        dealId={id}
        initialTab={tab ?? null}
        hasOm={!!deal.om_storage_path}
        modelErrorCode={errorCode ?? null}
        job={job}
        results={{ extraction, challenges, comps, reconciliation, market, verdict }}
      />
    </div>
  );
}
