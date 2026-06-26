import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedSupplementUrl } from "@/lib/storage";
import { type DealRow } from "@/lib/deals";
import { type DealDocument } from "@/lib/documents";
import type { UnderwritingModel } from "@/lib/model/types";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";
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
  const model = deal.model ? (deal.model as UnderwritingModel) : null;
  const compSearch = deal.comp_search
    ? (deal.comp_search as CompSearchResult)
    : null;

  const { data: docsData } = await supabase
    .from("deal_documents")
    .select("id, deal_id, kind, filename, storage_path, content_type, created_at")
    .eq("deal_id", id)
    .order("created_at", { ascending: true });
  const documents = (docsData ?? []) as DealDocument[];

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

  // User-added supplements, with short-lived signed URLs minted for any files.
  type RawSupp = {
    notes?: { id: string; text: string; createdAt: string }[];
    files?: { id: string; name: string; path: string; createdAt: string }[];
  };
  const rawSupp = (deal.supplements as Record<string, RawSupp> | null) ?? {};
  const supplements: Record<
    string,
    {
      notes: { id: string; text: string; createdAt: string }[];
      files: { id: string; name: string; createdAt: string; url: string | null }[];
    }
  > = {};
  for (const [tabKey, s] of Object.entries(rawSupp)) {
    const files = await Promise.all(
      (s.files ?? []).map(async (f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
        url: await signedSupplementUrl(f.path),
      })),
    );
    supplements[tabKey] = { notes: s.notes ?? [], files };
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deals"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← All deals
      </Link>

      {/* Persistent deal header — the anchor that stays put across tabs. */}
      <header className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
            <p className="mt-0.5 text-sm capitalize text-muted">
              {deal.asset_class}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {pill && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.cls}`}
              >
                {pill.label}
              </span>
            )}
            {verdict && (
              <a
                href={`/api/deals/${id}/memo`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                Download memo
              </a>
            )}
          </div>
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
        supplements={supplements}
        model={model}
        documents={documents}
        compSearch={compSearch}
      />
    </div>
  );
}
