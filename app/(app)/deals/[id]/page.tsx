import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEAL_STEPS, type DealRow } from "@/lib/deals";
import { type ExtractionResult } from "@/lib/anthropic/types";
import { AnalysisProgress } from "./analysis-progress";

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  return (
    <div className="space-y-8">
      <Link href="/deals" className="text-sm text-muted hover:text-ink">
        ← All deals
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
        <p className="mt-1 text-sm capitalize text-muted">{deal.asset_class}</p>
      </div>

      {/* Extraction: results when ready, otherwise live progress */}
      {extraction ? (
        <ExtractedTerms result={extraction} />
      ) : (
        <AnalysisProgress
          dealId={id}
          hasOm={!!deal.om_storage_path}
          initial={{
            status: job?.status ?? "none",
            step: job?.step ?? null,
            progress: job?.progress ?? 0,
            error: job?.error ?? null,
          }}
        />
      )}

      {/* The six-step loop — extraction is live, the rest land in later phases */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Screening checklist
        </h2>
        <ul className="mt-3 space-y-2">
          {DEAL_STEPS.map((step, i) => {
            const done = deal[step.key] != null;
            return (
              <li
                key={step.key}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    done ? "bg-pass/15 text-pass" : "bg-paper text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{step.label}</span>
                <span className="text-xs text-muted">
                  {done ? "Done" : "Not run yet"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function ExtractedTerms({ result }: { result: ExtractionResult }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Extracted terms
        </h2>
        <span className="text-xs text-caution">⚑ = verify against source</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {result.metrics.map((m, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs text-muted">
              {m.label}
              {m.flagged && <span className="ml-1 text-caution">⚑</span>}
            </p>
            <p className="mt-0.5 text-sm font-medium">{m.value}</p>
            {m.page && (
              <p className="mt-0.5 text-[11px] text-muted">{m.page}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
