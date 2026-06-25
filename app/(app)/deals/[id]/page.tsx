import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEAL_STEPS, type DealRow } from "@/lib/deals";
import {
  type ExtractionResult,
  type ChallengerResult,
  type BrokerCompsResult,
  type BrokerComp,
  type ReconciliationResult,
  type MarketResult,
  type VerdictResult,
} from "@/lib/anthropic/types";
import { AnalysisProgress } from "./analysis-progress";
import { rerunAnalysis, reconcileWithModel } from "../actions";

const MODEL_ERRORS: Record<string, string> = {
  modelfile: "Please choose your model file to upload.",
  modeltype: "Please upload your model as .xlsx, .csv, or PDF.",
  modelsize: "That file is larger than 22 MB — please try a smaller export.",
};

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode } = await searchParams;
  const modelError = errorCode ? MODEL_ERRORS[errorCode] : null;

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

      {/* The headline — synthesizes everything below it. */}
      {verdict && <Verdict result={verdict} />}

      {extraction && <ExtractedTerms result={extraction} />}
      {challenges && <ChallengerResults result={challenges} />}
      {comps && <BrokerComps result={comps} />}
      {market && <MarketCheck result={market} />}
      {reconciliation && <Reconciliation result={reconciliation} />}

      {/* Reconcile-your-model upload — available once the OM screen has run. */}
      {extraction && !active && (
        <ReconcileSection
          dealId={id}
          hasResult={!!reconciliation}
          error={modelError}
        />
      )}

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

function Reconciliation({ result }: { result: ReconciliationResult }) {
  // Direction is from the BUYER's perspective: unfavorable = their model is
  // worse than the OM claims (the gap that kills deals).
  const dir = {
    unfavorable: { badge: "bg-kill/10 text-kill", label: "Unfavorable" },
    favorable: { badge: "bg-pass/10 text-pass", label: "Favorable" },
    neutral: { badge: "bg-brand/10 text-brand", label: "Neutral" },
  } as const;

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        Reconciliation — your model vs. the OM
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Metric</th>
              <th className="px-4 py-2.5 font-medium">OM says</th>
              <th className="px-4 py-2.5 font-medium">Your model</th>
              <th className="px-4 py-2.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => {
              const d = dir[r.direction] ?? dir.neutral;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{r.metric}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {r.omValue}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {r.myValue}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                    >
                      {d.label}
                    </span>
                    {r.gap && (
                      <p className="mt-1 text-muted">{r.gap}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.takeaway && (
        <p className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm leading-relaxed">
          <span className="font-medium">Takeaway: </span>
          <span className="text-muted">{result.takeaway}</span>
        </p>
      )}
    </section>
  );
}

function ReconcileSection({
  dealId,
  hasResult,
  error,
}: {
  dealId: string;
  hasResult: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-medium">
        {hasResult ? "Reconcile a different model" : "Reconcile your model"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Upload your own underwriting — Excel (.xlsx), CSV, or a PDF / ARGUS
        export — and we’ll line it up against the OM and surface every gap, from
        your perspective. This is the part the OM can’t tell you.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {error}
        </p>
      )}

      <form
        action={reconcileWithModel}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="dealId" value={dealId} />
        <input
          type="file"
          name="model"
          accept=".xlsx,.xls,.csv,application/pdf"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-strong"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Reconcile
        </button>
      </form>
    </section>
  );
}

function MarketCheck({ result }: { result: MarketResult }) {
  const tone = {
    "in-line": { badge: "bg-pass/10 text-pass", label: "In-line" },
    aggressive: { badge: "bg-kill/10 text-kill", label: "Aggressive" },
    conservative: { badge: "bg-brand/10 text-brand", label: "Conservative" },
  } as const;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Market plausibility check
        </h2>
        <span className="text-xs text-muted">rules-of-thumb, not pulled comps</span>
      </div>
      <div className="mt-3 space-y-2">
        {result.checks.map((c, i) => {
          const t = tone[c.assessment] ?? tone["in-line"];
          return (
            <div
              key={i}
              className="rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.assumption}</span>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.badge}`}
                >
                  {t.label}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                <span>
                  OM: <span className="text-ink">{c.omSays}</span>
                </span>
                <span>
                  Typical: <span className="text-ink">{c.typicalRange}</span>
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
      {result.summary && (
        <p className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm leading-relaxed text-muted">
          {result.summary}
        </p>
      )}
    </section>
  );
}

function Verdict({ result }: { result: VerdictResult }) {
  const v = {
    pass: {
      card: "border-pass/30 bg-pass/5",
      badge: "bg-pass/15 text-pass",
      label: "Pass — worth deeper work",
    },
    caution: {
      card: "border-caution/30 bg-caution/5",
      badge: "bg-caution/15 text-caution",
      label: "Caution — proceed with conditions",
    },
    pass_on: {
      card: "border-kill/30 bg-kill/5",
      badge: "bg-kill/15 text-kill",
      label: "Pass on — kill it",
    },
  } as const;
  const s = v[result.verdict] ?? v.caution;

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${s.card}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Verdict
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${s.badge}`}
        >
          {s.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{result.reason}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {result.topRisks.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Top risks
            </p>
            <ul className="mt-2 space-y-1.5">
              {result.topRisks.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-muted"
                >
                  <span aria-hidden className="text-kill">
                    •
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.nextSteps.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Next steps
            </p>
            <ul className="mt-2 space-y-1.5">
              {result.nextSteps.map((n, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-muted"
                >
                  <span aria-hidden className="text-brand">
                    →
                  </span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
