"use client";

import { type ReactNode } from "react";
import { rerunAnalysis, reconcileWithModel } from "../actions";
import type {
  ExtractionResult,
  ChallengerResult,
  Challenge,
  BrokerCompsResult,
  BrokerComp,
  ReconciliationResult,
  MarketResult,
  MarketCheck as MarketCheckType,
  VerdictResult,
} from "@/lib/anthropic/types";

/* ================================================================== */
/* Icons — minimal inline SVGs (stroke, currentColor). No dependency. */
/* ================================================================== */

function Svg({
  children,
  className = "h-4 w-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const IconCheck = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const IconX = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);
const IconAlert = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);
const IconAsk = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);
const IconActivity = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Svg>
);
const IconArrowRight = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);
const IconArrowUp = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Svg>
);
const IconArrowDown = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Svg>
);
const IconMinus = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
const IconFlag = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </Svg>
);

/* ================================================================== */
/* Shared layout primitives                                            */
/* ================================================================== */

function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {aside}
    </div>
  );
}

function Callout({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
      {icon && <span className="mt-0.5 shrink-0 text-brand">{icon}</span>}
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <p className="text-sm text-muted">{title}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/* ================================================================== */
/* 1 — Extracted terms                                                 */
/* ================================================================== */

export function TermsView({ result }: { result: ExtractionResult }) {
  return (
    <section>
      <SectionHeader
        title="Extracted terms"
        aside={<span className="text-xs text-caution">⚑ verify against source</span>}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {result.metrics.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${
              m.flagged
                ? "border border-line border-l-2 border-l-caution"
                : "border border-line"
            }`}
          >
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              <span className="truncate">{m.label}</span>
              {m.flagged && <span className="shrink-0 text-caution">⚑</span>}
            </p>
            <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
              {m.value}
            </p>
            {m.page && <p className="mt-2 text-[10px] text-muted">{m.page}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ================================================================== */
/* 2 — Assumption challenger                                           */
/* ================================================================== */

const SEV = {
  high: { rail: "bg-kill", chip: "bg-kill/10 text-kill", label: "High" },
  medium: { rail: "bg-caution", chip: "bg-caution/10 text-caution", label: "Medium" },
  low: { rail: "bg-brand", chip: "bg-brand/10 text-brand", label: "Low" },
} as const;

export function ChallengerView({ result }: { result: ChallengerResult }) {
  return (
    <section>
      <SectionHeader
        title="Assumption challenger"
        aside={<SeverityTally challenges={result.challenges} />}
      />
      <div className="mt-4 space-y-3">
        {result.challenges.map((c, i) => (
          <ChallengeCard key={i} c={c} />
        ))}
      </div>
      {result.stressTest && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-brand">
            <IconActivity className="h-4 w-4" />
            <p className="text-sm font-medium text-ink">Stress test</p>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {result.stressTest}
          </p>
        </div>
      )}
    </section>
  );
}

function SeverityTally({ challenges }: { challenges: Challenge[] }) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of challenges) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  const parts: { n: number; label: string; cls: string }[] = [];
  if (counts.high) parts.push({ n: counts.high, label: "high", cls: "text-kill" });
  if (counts.medium)
    parts.push({ n: counts.medium, label: "med", cls: "text-caution" });
  if (counts.low) parts.push({ n: counts.low, label: "low", cls: "text-brand" });
  if (parts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      {parts.map((p, i) => (
        <span key={i} className={p.cls}>
          {p.n} {p.label}
        </span>
      ))}
    </div>
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const s = SEV[c.severity] ?? SEV.medium;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4 pl-5 shadow-sm">
      <span className={`absolute left-0 top-0 h-full w-1 ${s.rail}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${s.chip}`}
        >
          {s.label}
        </span>
        <span className="text-sm font-semibold">{c.assumption}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{c.challenge}</p>
      {c.question && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-faint p-3">
          <span className="mt-0.5 shrink-0 text-brand">
            <IconAsk className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed">
            <span className="font-medium">Ask the broker — </span>
            <span className="text-muted">{c.question}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* 3 — Broker-comp scrutiny                                            */
/* ================================================================== */

const COMP_RATING = {
  supports: { label: "Supports", badge: "bg-pass/10 text-pass" },
  favorable: { label: "Favorable", badge: "bg-caution/10 text-caution" },
  stretched: { label: "Stretched", badge: "bg-kill/10 text-kill" },
} as const;

export function BrokerComps({ result }: { result: BrokerCompsResult }) {
  const hasComps = result.saleComps.length > 0 || result.leaseComps.length > 0;
  return (
    <section className="space-y-4">
      <SectionHeader title="Broker-comp scrutiny" />
      {result.summary && <Callout icon={<IconAlert />}>{result.summary}</Callout>}
      {result.saleComps.length > 0 && (
        <CompTable title="Sale comps" comps={result.saleComps} />
      )}
      {result.leaseComps.length > 0 && (
        <CompTable title="Lease comps" comps={result.leaseComps} />
      )}
      {!hasComps && (
        <p className="text-sm text-muted">
          No comparable sales or leases were included in this OM.
        </p>
      )}
      {result.redFlags.length > 0 && (
        <div className="rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-kill">
            <IconFlag className="h-4 w-4" />
            <p className="text-sm font-medium text-ink">
              Cherry-picking &amp; omissions
            </p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {result.redFlags.map((f, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CompTable({ title, comps }: { title: string; comps: BrokerComp[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Comp</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
              <th className="px-4 py-2.5 text-right font-medium">Assessment</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => {
              const r = COMP_RATING[c.support] ?? COMP_RATING.favorable;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top transition-colors last:border-0 hover:bg-faint/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    {c.note && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {c.note}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-muted">
                    {c.detail}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                    >
                      {r.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================== */
/* 4 — Reconciliation                                                  */
/* ================================================================== */

const DIR = {
  unfavorable: {
    badge: "bg-kill/10 text-kill",
    label: "Unfavorable",
    Icon: IconArrowDown,
  },
  favorable: {
    badge: "bg-pass/10 text-pass",
    label: "Favorable",
    Icon: IconArrowUp,
  },
  neutral: { badge: "bg-brand/10 text-brand", label: "Neutral", Icon: IconMinus },
} as const;

export function Reconciliation({ result }: { result: ReconciliationResult }) {
  const unfav = result.rows.filter((r) => r.direction === "unfavorable").length;
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Reconciliation — your model vs. the OM"
        aside={
          unfav > 0 ? (
            <span className="rounded-full bg-kill/10 px-2 py-0.5 text-[11px] font-medium text-kill">
              {unfav} unfavorable
            </span>
          ) : undefined
        }
      />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Metric</th>
              <th className="px-4 py-2.5 font-medium">OM says</th>
              <th className="px-4 py-2.5 font-medium">Your model</th>
              <th className="px-4 py-2.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => {
              const d = DIR[r.direction] ?? DIR.neutral;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{r.metric}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.omValue}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.myValue}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                    >
                      <d.Icon className="h-3 w-3" />
                      {d.label}
                    </span>
                    {r.gap && <p className="mt-1 text-muted">{r.gap}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.takeaway && (
        <Callout icon={<IconArrowRight />}>
          <span className="font-medium">Takeaway — </span>
          <span className="text-muted">{result.takeaway}</span>
        </Callout>
      )}
    </section>
  );
}

export function ReconcileSection({
  dealId,
  hasResult,
  error,
}: {
  dealId: string;
  hasResult: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
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

/* ================================================================== */
/* 5 — Market plausibility check                                       */
/* ================================================================== */

const TONE = {
  "in-line": { badge: "bg-pass/10 text-pass", label: "In-line" },
  aggressive: { badge: "bg-kill/10 text-kill", label: "Aggressive" },
  conservative: { badge: "bg-brand/10 text-brand", label: "Conservative" },
} as const;

export function MarketCheck({ result }: { result: MarketResult }) {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Market plausibility check"
        aside={
          <span className="text-xs text-muted">
            rules-of-thumb, not pulled comps
          </span>
        }
      />
      <div className="space-y-2">
        {result.checks.map((c, i) => (
          <MarketRow key={i} c={c} />
        ))}
      </div>
      {result.summary && <Callout>{result.summary}</Callout>}
    </section>
  );
}

function MarketRow({ c }: { c: MarketCheckType }) {
  const t = TONE[c.assessment] ?? TONE["in-line"];
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{c.assumption}</span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.badge}`}
        >
          {t.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1.3fr]">
        <MiniStat label="OM says" value={c.omSays} />
        <MiniStat label="Typical" value={c.typicalRange} />
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Position
          </p>
          <PositionBar assessment={c.assessment} />
        </div>
      </div>
      {c.note && (
        <p className="mt-3 text-sm leading-relaxed text-muted">{c.note}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

// A qualitative position indicator driven by the assessment enum (robust — no
// parsing of free-text ranges). Shows where the OM's number sits.
function PositionBar({
  assessment,
}: {
  assessment: MarketCheckType["assessment"];
}) {
  const order: {
    key: MarketCheckType["assessment"];
    label: string;
    color: string;
  }[] = [
    { key: "conservative", label: "Cons.", color: "bg-brand" },
    { key: "in-line", label: "In-line", color: "bg-pass" },
    { key: "aggressive", label: "Aggr.", color: "bg-kill" },
  ];
  return (
    <div className="mt-1 flex gap-1">
      {order.map((seg) => {
        const on = seg.key === assessment;
        return (
          <div key={seg.key} className="flex-1">
            <div className={`h-1.5 rounded-full ${on ? seg.color : "bg-line"}`} />
            <p
              className={`mt-1 text-[9px] ${
                on ? "font-medium text-ink" : "text-muted"
              }`}
            >
              {seg.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* 6 — Verdict (the headline)                                          */
/* ================================================================== */

const VERDICT = {
  pass: {
    word: "Pass",
    sub: "Worth deeper work",
    tint: "from-pass/10",
    iconBg: "bg-pass/15 text-pass",
    Icon: IconCheck,
  },
  caution: {
    word: "Caution",
    sub: "Proceed only with named conditions",
    tint: "from-caution/10",
    iconBg: "bg-caution/15 text-caution",
    Icon: IconAlert,
  },
  pass_on: {
    word: "Pass on",
    sub: "Kill it",
    tint: "from-kill/10",
    iconBg: "bg-kill/15 text-kill",
    Icon: IconX,
  },
} as const;

export function VerdictView({ result }: { result: VerdictResult }) {
  const v = VERDICT[result.verdict] ?? VERDICT.caution;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className={`bg-gradient-to-b ${v.tint} to-transparent p-6`}>
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Verdict
        </span>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${v.iconBg}`}
          >
            <v.Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-3xl font-semibold leading-none tracking-tight">
              {v.word}
            </p>
            {v.sub && <p className="mt-1 text-sm text-muted">{v.sub}</p>}
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">{result.reason}</p>
      </div>
      {(result.topRisks.length > 0 || result.nextSteps.length > 0) && (
        <div className="grid gap-px bg-line sm:grid-cols-2">
          <div className="bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Top risks
            </p>
            <ul className="mt-3 space-y-2">
              {result.topRisks.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill"
                  />
                  <span className="text-muted">{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Next steps
            </p>
            <ul className="mt-3 space-y-2">
              {result.nextSteps.map((n, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden className="mt-0.5 shrink-0 text-brand">
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export function RetryForm({ dealId, label }: { dealId: string; label: string }) {
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
