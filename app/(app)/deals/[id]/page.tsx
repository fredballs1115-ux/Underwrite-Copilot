import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEAL_STEPS, type DealRow } from "@/lib/deals";
import {
  type ExtractionResult,
  type ChallengerResult,
  type BrokerCompsResult,
  type BrokerComp,
} from "@/lib/anthropic/types";
import { AnalysisProgress } from "./analysis-progress";
import { rerunAnalysis } from "../actions";

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
  const challenges = deal.challenges
    ? (deal.challenges as ChallengerResult)
    : null;
  const comps = deal.comps ? (deal.comps as BrokerCompsResult) : null;

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

  const active = job?.status === "queued" || job?.status === "running";

  return (
    <div className="space-y-8">
      <Link href="/deals" className="text-sm text-muted hover:text-ink">
        ← All deals
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
        <p className="mt-1 text-sm capitalize text-muted">{deal.asset_class}</p>
      </div>

      {/* Status area */}
      {active ? (
        <AnalysisProgress
          dealId={id}
          initial={{
            status: job!.status,
            step: job!.step,
            progress: job!.progress,
          }}
        />
      ) : job?.status === "error" ? (
        <div className="rounded-xl border border-kill/30 bg-kill/5 p-5">
          <p className="text-sm font-medium text-kill">Analysis failed</p>
          {job.error && <p className="mt-1 text-sm text-muted">{job.error}</p>}
          <RetryForm dealId={id} label="Try again" />
        </div>
      ) : !extraction && deal.om_storage_path ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            Analysis hasn’t run for this deal yet.
          </p>
          <RetryForm dealId={id} label="Run analysis" />
        </div>
      ) : !extraction ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">No OM uploaded for this deal.</p>
        </div>
      ) : null}

      {extraction && <ExtractedTerms result={extraction} />}
      {challenges && <ChallengerResults result={challenges} />}
      {comps && <BrokerComps result={comps} />}

      {/* The six-step loop */}
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

function RetryForm({ dealId, label }: { dealId: string; label: string }) {
  return (
    <form action={rerunAnalysis} className="mt-3">
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        {label}
      </button>
    </form>
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
            {m.page && <p className="mt-0.5 text-[11px] text-muted">{m.page}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChallengerResults({ result }: { result: ChallengerResult }) {
  const sev = {
    high: { ring: "border-l-kill", badge: "bg-kill/10 text-kill" },
    medium: { ring: "border-l-caution", badge: "bg-caution/10 text-caution" },
    low: { ring: "border-l-brand", badge: "bg-brand/10 text-brand" },
  } as const;

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        Assumption challenger
      </h2>
      <div className="mt-3 space-y-3">
        {result.challenges.map((c, i) => {
          const s = sev[c.severity] ?? sev.medium;
          return (
            <div
              key={i}
              className={`rounded-xl border border-line border-l-4 ${s.ring} bg-surface p-4 shadow-sm`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.assumption}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${s.badge}`}
                >
                  {c.severity}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {c.challenge}
              </p>
              {c.question && (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-medium">Ask the broker:</span>{" "}
                  <span className="text-muted">{c.question}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
      {result.stressTest && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
          <p className="text-sm font-medium">Stress test</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {result.stressTest}
          </p>
        </div>
      )}
    </section>
  );
}

function BrokerComps({ result }: { result: BrokerCompsResult }) {
  const hasComps =
    result.saleComps.length > 0 || result.leaseComps.length > 0;

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        Broker-comp scrutiny
      </h2>

      {result.summary && (
        <p className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed shadow-sm">
          {result.summary}
        </p>
      )}

      {hasComps && (
        <div className="mt-3 space-y-5">
          <CompGroup title="Sale comps" comps={result.saleComps} />
          <CompGroup title="Lease comps" comps={result.leaseComps} />
        </div>
      )}

      {result.redFlags.length > 0 && (
        <div className="mt-3 rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">Cherry-picking & omissions</p>
          <ul className="mt-2 space-y-1.5">
            {result.redFlags.map((flag, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span aria-hidden className="text-kill">
                  ⚑
                </span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CompGroup({ title, comps }: { title: string; comps: BrokerComp[] }) {
  // Rating → how strongly the comp actually backs the subject deal's pricing.
  const rating = {
    supports: { label: "Supports", badge: "bg-pass/10 text-pass" },
    favorable: { label: "Favorable", badge: "bg-caution/10 text-caution" },
    stretched: { label: "Stretched", badge: "bg-kill/10 text-kill" },
  } as const;

  if (comps.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      <div className="mt-2 space-y-2">
        {comps.map((c, i) => {
          const r = rating[c.support] ?? rating.favorable;
          return (
            <div
              key={i}
              className="rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.detail && (
                    <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                  )}
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                >
                  {r.label}
                </span>
              </div>
              {c.note && (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {c.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
