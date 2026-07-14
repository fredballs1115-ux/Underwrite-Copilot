"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { rerunAnalysis, reconcileWithModel } from "../actions";
import { PendingButton } from "../../pending-button";
import {
  addSupplementNote,
  addSupplementFile,
  removeSupplement,
} from "./supplement-actions";
import { searchPublicComps } from "./comps-actions";
import { SourceChip } from "./source-chip";
import { CompsMap, type MapComp } from "./comps-map";
import { safeHttpUrl } from "@/lib/safe-url";
import type { DealFact } from "@/lib/facts";
import { FileDrop } from "../../file-drop";
import { FileField } from "../../file-field";
import { useToast } from "../../toaster";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";
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
  VerdictCall,
  ScreenResult,
  ScreenRange,
  DealKiller,
  VerdictScenario,
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
const IconChevron = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
const IconPlus = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
);
const IconTrash = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);
const IconPaperclip = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

/* ================================================================== */
/* Shared primitives                                                   */
/* ================================================================== */

function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {aside}
    </div>
  );
}

function Callout({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line border-l-[3px] border-l-brand bg-faint/70 p-4">
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

// Progressive disclosure: show the first `initial` items, reveal the rest on
// demand. Keeps everything present but tames long lists. Items are pre-rendered.
function RevealList({
  items,
  initial = 3,
  noun = "more",
}: {
  items: ReactNode[];
  initial?: number;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, initial);
  const hidden = items.length - initial;
  return (
    <>
      <div className="space-y-3">
        {shown.map((n, i) => (
          <div key={i}>{n}</div>
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show less" : `Show ${hidden} ${noun}`}
          <IconChevron
            className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </>
  );
}

/* ================================================================== */
/* Severity scale (shared by challenger + digest)                      */
/* ================================================================== */

const SEV = {
  high: { rail: "bg-kill", chip: "bg-kill/10 text-kill", dot: "bg-kill", label: "High", rank: 0 },
  medium: { rail: "bg-caution", chip: "bg-caution/10 text-caution", dot: "bg-caution", label: "Medium", rank: 1 },
  low: { rail: "bg-brand", chip: "bg-brand/10 text-brand", dot: "bg-brand", label: "Low", rank: 2 },
} as const;

type Severity = keyof typeof SEV;

/* ================================================================== */
/* Overview — the landing: verdict + completeness + risk digest        */
/* ================================================================== */

type Results = {
  extraction: ExtractionResult | null;
  challenges: ChallengerResult | null;
  comps: BrokerCompsResult | null;
  reconciliation: ReconciliationResult | null;
  market: MarketResult | null;
  verdict: VerdictResult | null;
};

type RiskItem = {
  severity: Severity;
  title: string;
  detail: string;
  source: string;
  tab: string;
};

// Pull every concern the analysis surfaced into one ranked list — the
// red-flags digest. Derived from the already-loaded results (no extra call).
export function deriveRisks(results: Results): RiskItem[] {
  const risks: RiskItem[] = [];

  for (const c of results.challenges?.challenges ?? []) {
    risks.push({
      severity: c.severity,
      title: c.assumption,
      detail: c.challenge,
      source: "Challenger",
      tab: "challenger",
    });
  }

  for (const r of results.reconciliation?.rows ?? []) {
    if (r.direction === "unfavorable") {
      risks.push({
        severity: "high",
        title: `${r.metric}: model less favorable than the OM`,
        detail: r.gap,
        source: "Reconciler",
        tab: "reconciler",
      });
    }
  }

  for (const c of [
    ...(results.comps?.saleComps ?? []),
    ...(results.comps?.leaseComps ?? []),
  ]) {
    if (c.support === "stretched") {
      risks.push({
        severity: "medium",
        title: `Stretched comp: ${c.name}`,
        detail: c.note,
        source: "Comps",
        tab: "comps",
      });
    }
  }
  for (const f of results.comps?.redFlags ?? []) {
    risks.push({
      severity: "medium",
      title: "Comp selection / omission",
      detail: f,
      source: "Comps",
      tab: "comps",
    });
  }

  for (const c of results.market?.checks ?? []) {
    if (c.assessment === "aggressive") {
      risks.push({
        severity: "medium",
        title: `Aggressive vs. market: ${c.assumption}`,
        detail: `${c.note} (OM ${c.omSays} vs. typical ${c.typicalRange})`,
        source: "Market",
        tab: "market",
      });
    }
  }

  const flagged = (results.extraction?.metrics ?? []).filter((m) => m.flagged);
  if (flagged.length > 0) {
    risks.push({
      severity: "low",
      title: `${flagged.length} figure${flagged.length === 1 ? "" : "s"} to verify against source`,
      detail: flagged
        .slice(0, 6)
        .map((m) => m.label)
        .join(", "),
      source: "Terms",
      tab: "terms",
    });
  }

  return risks.sort((a, b) => SEV[a.severity].rank - SEV[b.severity].rank);
}

export function OverviewView({
  results,
  active,
  onNavigate,
}: {
  results: Results;
  active: boolean;
  onNavigate: (tab: string) => void;
}) {
  const risks = deriveRisks(results);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const r of risks) counts[r.severity]++;

  const steps: { key: keyof Results; label: string }[] = [
    { key: "extraction", label: "Terms" },
    { key: "challenges", label: "Challenges" },
    { key: "comps", label: "Comps" },
    { key: "market", label: "Market" },
    { key: "verdict", label: "Verdict" },
  ];
  const done = steps.filter((s) => results[s.key] != null).length;
  const hasModel = results.reconciliation != null;

  return (
    <div className="space-y-5">
      {results.verdict ? (
        <VerdictHero
          result={results.verdict}
          compact
          onMore={() => onNavigate("verdict")}
        />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium">
            {active ? "Screening in progress…" : "No verdict yet"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {active
              ? "The verdict and risk digest will appear here as the analysis completes."
              : "Run the analysis to see the verdict and the consolidated risk digest."}
          </p>
        </div>
      )}

      {/* Completeness meter — a progress cue while screening; a single quiet
          line once everything is done (it earns no card space forever). */}
      {active || done < steps.length ? (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Screening progress
            </p>
            <span className="font-mono text-xs tabular-nums text-muted">
              {done}/{steps.length}
              {hasModel ? " · model reconciled" : ""}
            </span>
          </div>
          <div className="mt-2 flex gap-1">
            {steps.map((s) => (
              <div
                key={s.key}
                className={`h-1.5 flex-1 rounded-full ${
                  results[s.key] != null ? "bg-brand" : "bg-line"
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted">
          Screened · {done}/{steps.length}
          {hasModel ? " · model reconciled" : ""}
        </p>
      )}

      {/* Red-flags digest */}
      <section>
        <SectionHeader
          title="Risk digest"
          aside={
            risks.length > 0 ? (
              <div className="flex items-center gap-2 text-xs font-medium">
                {counts.high > 0 && <span className="text-kill">{counts.high} high</span>}
                {counts.medium > 0 && (
                  <span className="text-caution">{counts.medium} med</span>
                )}
                {counts.low > 0 && <span className="text-brand">{counts.low} low</span>}
              </div>
            ) : undefined
          }
        />
        {risks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {active
              ? "Concerns will collect here as each section completes."
              : "No concerns surfaced yet."}
          </p>
        ) : (
          <div className="mt-3">
            <RevealList
              initial={5}
              noun="more concerns"
              items={risks.map((r, i) => (
                <RiskRow key={i} risk={r} onNavigate={onNavigate} />
              ))}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function RiskRow({
  risk,
  onNavigate,
}: {
  risk: RiskItem;
  onNavigate: (tab: string) => void;
}) {
  const s = SEV[risk.severity];
  return (
    <button
      type="button"
      onClick={() => onNavigate(risk.tab)}
      className="group flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:bg-faint"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{risk.title}</span>
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${s.chip}`}
          >
            {s.label}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
          {risk.detail}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand">
          {risk.source}
          <IconChevron className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

/* ================================================================== */
/* 1 — Extracted terms (key first, rest on demand)                     */
/* ================================================================== */

export function TermsView({
  result,
  facts = {},
  omUrl = null,
}: {
  result: ExtractionResult;
  facts?: Record<string, DealFact>;
  omUrl?: string | null;
}) {
  // Surface flagged + first figures; collapse the long tail.
  const ordered = [
    ...result.metrics.filter((m) => m.flagged),
    ...result.metrics.filter((m) => !m.flagged),
  ];
  const cards = ordered.map((m, i) => (
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
      {facts[m.label] ? (
        <p className="mt-2 leading-none">
          <SourceChip fact={facts[m.label]} omUrl={omUrl} />
        </p>
      ) : (
        // Deals screened before citations (migration 0018) keep their plain
        // page text — real, from the extraction, just not a validated chip.
        m.page && <p className="mt-2 text-[10px] text-muted">{m.page}</p>
      )}
    </div>
  ));

  const INITIAL = 8;
  const [open, setOpen] = useState(false);
  const shown = open ? cards : cards.slice(0, INITIAL);

  return (
    <section>
      <SectionHeader
        title="Extracted terms"
        aside={<span className="text-xs text-caution">⚑ verify against source</span>}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown}
      </div>
      {cards.length > INITIAL && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${cards.length} terms`}
          <IconChevron
            className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </section>
  );
}

/* ================================================================== */
/* 2 — Assumption challenger                                           */
/* ================================================================== */

export function ChallengerView({
  result,
  dealName,
}: {
  result: ChallengerResult;
  dealName?: string;
}) {
  const ordered = [...result.challenges].sort(
    (a, b) => SEV[a.severity].rank - SEV[b.severity].rank,
  );
  return (
    <section>
      <SectionHeader
        title="Assumption challenger"
        aside={
          <div className="flex items-center gap-3">
            <SeverityTally challenges={result.challenges} />
            {ordered.some((c) => c.question) && (
              <CopyAllQuestions challenges={ordered} dealName={dealName} />
            )}
          </div>
        }
      />
      <div className="mt-4">
        <RevealList
          initial={3}
          noun="more challenges"
          items={ordered.map((c, i) => (
            <ChallengeCard key={i} c={c} />
          ))}
        />
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
          <p className="flex-1 text-sm leading-relaxed">
            <span className="font-medium">Ask the broker — </span>
            <span className="text-muted">{c.question}</span>
          </p>
          <CopyButton text={c.question} label="Copy broker question" />
        </div>
      )}
    </div>
  );
}

/** One click → a numbered, email-ready list of every broker question. */
/** Assemble the challenges into a ready-to-send broker email: subject line,
 *  questions grouped by severity, OM page refs — paste and hit send. */
function buildBrokerEmail(challenges: Challenge[], dealName?: string): string {
  const deal = dealName?.trim() || "the deal";
  const groups: [Challenge["severity"], string][] = [
    ["high", "Deal-critical"],
    ["medium", "Important"],
    ["low", "Also worth clarifying"],
  ];
  let n = 0;
  const sections = groups
    .map(([sev, heading]) => {
      const qs = challenges.filter((c) => c.severity === sev && c.question);
      if (!qs.length) return null;
      const lines = qs.map((c) => {
        const page = c.page?.trim() ? ` (OM ${c.page.trim()})` : "";
        return `${++n}. ${c.question}${page}`;
      });
      return `${heading}:\n${lines.join("\n")}`;
    })
    .filter(Boolean);

  return [
    `Subject: ${deal} — questions from our initial screen`,
    "",
    "Hi,",
    "",
    `We've taken a first pass at ${deal} and have ${n === 1 ? "one question" : `${n} questions`} before going further:`,
    "",
    sections.join("\n\n"),
    "",
    "Anything you can share in writing helps — happy to get on a call for the rest.",
    "",
    "Thanks,",
  ].join("\n");
}

function CopyAllQuestions({
  challenges,
  dealName,
}: {
  challenges: Challenge[];
  dealName?: string;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            buildBrokerEmail(challenges, dealName),
          );
          toast("Broker email copied — subject line and all.", "success");
        } catch {
          toast("Couldn't copy — select the text instead.", "error");
        }
      }}
      className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
    >
      Copy broker email
    </button>
  );
}

/** Copy a snippet to the clipboard with toast feedback — for the questions
 *  analysts paste straight into a broker email. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("Copied — paste it into your broker email.", "success");
        } catch {
          toast("Couldn't copy — select the text instead.", "error");
        }
      }}
      className="mt-0.5 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-line/60 hover:text-ink"
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
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
    </button>
  );
}

/* ================================================================== */
/* 3 — Broker-comp scrutiny                                            */
/* ================================================================== */

// "favorable" means broker-favorable — label it honestly so a screener never
// reads the middle tier as good news.
const COMP_RATING = {
  supports: { label: "Supports", badge: "bg-pass/10 text-pass", rank: 2 },
  favorable: { label: "Leans favorable", badge: "bg-caution/10 text-caution", rank: 1 },
  stretched: { label: "Stretched", badge: "bg-kill/10 text-kill", rank: 0 },
} as const;

export function BrokerComps({
  result,
  dealId,
  compSearch,
  active,
  isPro,
  publicDemo = false,
  mapContext = null,
}: {
  result: BrokerCompsResult;
  dealId: string;
  compSearch: CompSearchResult | null;
  active: boolean;
  isPro: boolean;
  /** rendered on the public /demo page — Pro gates point to signup, not billing */
  publicDemo?: boolean;
  /** subject location for the comps map (Feature 4); null hides the map */
  mapContext?: { subjectLabel: string; market: string; omUrl: string | null } | null;
}) {
  const hasComps = result.saleComps.length > 0 || result.leaseComps.length > 0;

  // The map plots SALE comps (the OM's) beside the public-web candidates —
  // one pin set per source, colored apart, geocoded by name + market.
  // Memoized: a stable array identity keeps CompsMap's geocode/map effects
  // from re-firing (and the map from rebuilding) on unrelated re-renders.
  const mapComps: MapComp[] = useMemo(
    () =>
      mapContext
        ? [
            ...result.saleComps.map((c, i): MapComp => {
              const pageNum = c.page?.match(/\d+/)?.[0];
              return {
                id: `om-${i}`,
                kind: "om",
                name: c.name,
                detail: c.detail,
                sourceLabel: pageNum ? `OM p. ${pageNum}` : "OM",
                sourceHref:
                  pageNum && mapContext.omUrl ? `${mapContext.omUrl}#page=${pageNum}` : null,
                query: [c.name, mapContext.market].filter(Boolean).join(", "),
              };
            }),
            ...(compSearch?.candidates ?? []).map((c, i): MapComp => ({
              id: `web-${i}`,
              kind: "web",
              name: c.name,
              detail: [c.detail, c.date].filter(Boolean).join(" · "),
              sourceLabel: c.sourceName || "Public source",
              sourceHref: c.sourceUrl || null,
              query: [c.name, c.location || mapContext.market].filter(Boolean).join(", "),
            })),
          ]
        : [],
    [mapContext, result.saleComps, compSearch],
  );

  return (
    <section className="space-y-4">
      <SectionHeader title="Broker-comp scrutiny" />
      {result.summary && <Callout icon={<IconAlert />}>{result.summary}</Callout>}
      {mapContext && mapComps.length > 0 && (
        <CompsMap
          subjectLabel={mapContext.subjectLabel}
          market={mapContext.market}
          comps={mapComps}
        />
      )}
      {result.redFlags.length > 0 && (
        <div className="rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-kill">
            <IconFlag className="h-4 w-4" />
            <p className="text-sm font-medium text-ink">
              Selection &amp; omissions
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
      {result.saleComps.length > 0 && (
        <CompTable title="Sale comps" comps={result.saleComps} />
      )}
      {result.leaseComps.length > 0 && (
        <CompTable title="Lease comps" comps={result.leaseComps} />
      )}
      {!hasComps && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium">No comps in this OM</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This offering memorandum didn’t include sale or lease comps. Try a
            public-web search below, add the comps you’ve found, or upload a comp
            sheet via <span className="font-medium text-ink">“Add info”</span>.
          </p>
        </div>
      )}

      <PublicWebComps
        dealId={dealId}
        compSearch={compSearch}
        active={active}
        hasOmComps={hasComps}
        isPro={isPro}
        publicDemo={publicDemo}
      />
    </section>
  );
}

function PublicWebComps({
  dealId,
  compSearch,
  active,
  hasOmComps,
  isPro,
  publicDemo = false,
}: {
  dealId: string;
  compSearch: CompSearchResult | null;
  active: boolean;
  hasOmComps: boolean;
  isPro: boolean;
  publicDemo?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Public-web comps{" "}
            {!hasOmComps && (
              <span className="font-normal text-muted">(OM has none)</span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Comparable sales from public sources — news, press releases, county
            records, brokerage pages, trade publications. Never MLS, CoStar, or
            any licensed feed; accuracy depends on public reporting and may lag
            the market. Verify before relying on a figure.
          </p>
        </div>
        {publicDemo ? (
          // On the public demo the visitor has no account yet — route the
          // gate to signup, not the billing page's sign-in wall.
          <Link
            href="/login?mode=signup"
            className="shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
          >
            Sign up to search
          </Link>
        ) : isPro ? (
          <form action={searchPublicComps}>
            <input type="hidden" name="dealId" value={dealId} />
            <button
              type="submit"
              disabled={active}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-faint disabled:opacity-50"
            >
              {compSearch ? "Search again" : "Search public web"}
            </button>
          </form>
        ) : (
          <Link
            href="/billing"
            className="shrink-0 rounded-lg border border-caution/30 bg-caution/5 px-3 py-1.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
          >
            Upgrade to search
          </Link>
        )}
      </div>

      {compSearch && (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-muted">
            {compSearch.summary}
          </p>
          {compSearch.candidates.length > 0 && (
            <div className="mt-2 space-y-2">
              {compSearch.candidates.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-line bg-surface p-3 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-caution/10 px-2 py-0.5 text-[10px] font-medium uppercase text-caution">
                      unverified
                    </span>
                  </div>
                  {(c.location || c.date) && (
                    <p className="mt-0.5 text-xs text-muted">
                      {c.location}
                      {c.location && c.date ? " · " : ""}
                      {c.date}
                    </p>
                  )}
                  {c.detail && (
                    <p className="mt-1 font-mono text-xs tabular-nums">
                      {c.detail}
                    </p>
                  )}
                  {c.note && (
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {c.note}
                    </p>
                  )}
                  {/* LLM-sourced URL — only http(s) ever becomes a link. */}
                  {safeHttpUrl(c.sourceUrl) && (
                    <a
                      href={safeHttpUrl(c.sourceUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline"
                    >
                      {c.sourceName || "Source"} →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompTable({ title, comps }: { title: string; comps: BrokerComp[] }) {
  const INITIAL = 4;
  const [open, setOpen] = useState(false);
  // Risk first — a stretched comp must never hide behind "Show all".
  const ordered = [...comps].sort(
    (a, b) =>
      (COMP_RATING[a.support]?.rank ?? 1) - (COMP_RATING[b.support]?.rank ?? 1),
  );
  const shown = open ? ordered : ordered.slice(0, INITIAL);
  const counts = { stretched: 0, favorable: 0, supports: 0 };
  for (const c of comps) counts[c.support] = (counts[c.support] ?? 0) + 1;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
          {title}
        </h3>
        <p className="text-[11px] font-medium">
          {counts.stretched > 0 && (
            <span className="text-kill">{counts.stretched} stretched</span>
          )}
          {counts.stretched > 0 && counts.favorable > 0 && (
            <span className="text-muted"> · </span>
          )}
          {counts.favorable > 0 && (
            <span className="text-caution">{counts.favorable} leans</span>
          )}
          {(counts.stretched > 0 || counts.favorable > 0) &&
            counts.supports > 0 && <span className="text-muted"> · </span>}
          {counts.supports > 0 && (
            <span className="text-pass">{counts.supports} support</span>
          )}
        </p>
      </div>
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
            {shown.map((c, i) => {
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
      {comps.length > INITIAL && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${comps.length}`}
          <IconChevron
            className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </div>
  );
}

/* ================================================================== */
/* 4 — Reconciliation                                                  */
/* ================================================================== */

const DIR = {
  unfavorable: { badge: "bg-kill/10 text-kill", label: "Unfavorable", Icon: IconArrowDown },
  favorable: { badge: "bg-pass/10 text-pass", label: "Favorable", Icon: IconArrowUp },
  neutral: { badge: "bg-brand/10 text-brand", label: "Neutral", Icon: IconMinus },
} as const;

export function Reconciliation({ result }: { result: ReconciliationResult }) {
  const counts = { unfavorable: 0, favorable: 0, neutral: 0 };
  for (const r of result.rows) counts[r.direction] = (counts[r.direction] ?? 0) + 1;
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Reconciliation — your model vs. the OM"
        aside={
          result.rows.length > 0 ? (
            <p className="text-[11px] font-medium">
              {counts.unfavorable > 0 && (
                <span className="text-kill">{counts.unfavorable} unfavorable</span>
              )}
              {counts.unfavorable > 0 && counts.favorable > 0 && (
                <span className="text-muted"> · </span>
              )}
              {counts.favorable > 0 && (
                <span className="text-pass">{counts.favorable} favorable</span>
              )}
              {(counts.unfavorable > 0 || counts.favorable > 0) &&
                counts.neutral > 0 && <span className="text-muted"> · </span>}
              {counts.neutral > 0 && (
                <span className="text-muted">{counts.neutral} neutral</span>
              )}
            </p>
          ) : undefined
        }
      />
      {result.takeaway && (
        <Callout icon={<IconArrowRight />}>
          <span className="font-medium">Takeaway — </span>
          <span className="text-muted">{result.takeaway}</span>
        </Callout>
      )}
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
                  className="border-b border-line align-top transition-colors last:border-0 hover:bg-faint/60"
                >
                  <td className="px-4 py-3 font-medium">{r.metric}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.omValue}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium tabular-nums text-ink">
                    {r.myValue}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                    >
                      <d.Icon className="h-3 w-3" />
                      {d.label}
                    </span>
                    {r.gap && <p className="mt-1 text-ink">{r.gap}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReconcileSection({
  dealId,
  hasResult,
  error,
  disabled = false,
}: {
  dealId: string;
  hasResult: boolean;
  error: string | null;
  /** true while another pipeline runs — form stays visible but can't submit */
  disabled?: boolean;
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
      <form action={reconcileWithModel} className="mt-4 space-y-3">
        <input type="hidden" name="dealId" value={dealId} />
        <FileDrop
          name="model"
          accept=".xlsx,.xls,.csv,application/pdf"
          hint="Excel (.xlsx), CSV, or a PDF / Argus export"
          maxBytes={22 * 1024 * 1024}
        />
        <PendingButton
          disabled={disabled}
          pendingLabel="Uploading your model…"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Reconcile
        </PendingButton>
        {disabled && (
          <p className="text-xs text-muted">
            Available once the running analysis finishes.
          </p>
        )}
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
  // Aggressive first — that's where the risk is.
  const order = { aggressive: 0, conservative: 1, "in-line": 2 } as const;
  const ordered = [...result.checks].sort(
    (a, b) => order[a.assessment] - order[b.assessment],
  );
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
      {result.summary && <Callout>{result.summary}</Callout>}
      <div>
        <RevealList
          initial={3}
          noun="more checks"
          items={ordered.map((c, i) => (
            <MarketRow key={i} c={c} />
          ))}
        />
      </div>
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
          <PositionBar
            assessment={c.assessment}
            omSays={c.omSays}
            typicalRange={c.typicalRange}
          />
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

/** Parse "5.25%–5.75%" / "5.25 to 5.75" style ranges into [lo, hi]. */
function parseRange(sv: string): [number, number] | null {
  const nums = sv.replace(/,/g, "").match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lo = parseFloat(nums[0]);
  const hi = parseFloat(nums[1]);
  return hi > lo ? [lo, hi] : null;
}

function PositionBar({
  assessment,
  omSays,
  typicalRange,
}: {
  assessment: MarketCheckType["assessment"];
  omSays: string;
  typicalRange: string;
}) {
  // Plot the OM's value against the typical band — "how far outside typical"
  // is the actual analyst question, not just which side of it.
  const band = parseRange(typicalRange);
  const om = firstNum(omSays);
  if (band && om != null) {
    const [lo, hi] = band;
    const pad = (hi - lo) * 0.35 || Math.abs(hi) * 0.1 || 1;
    const min = Math.min(lo, om) - pad;
    const max = Math.max(hi, om) + pad;
    const p = (v: number) => ((v - min) / (max - min)) * 100;
    const tone =
      assessment === "aggressive"
        ? "bg-kill"
        : assessment === "conservative"
          ? "bg-brand"
          : "bg-pass";
    return (
      <div className="mt-1">
        <div className="relative h-1.5 rounded-full bg-line" aria-hidden>
          <div
            className="absolute inset-y-0 rounded-full bg-pass/25"
            style={{ left: `${p(lo)}%`, width: `${p(hi) - p(lo)}%` }}
          />
          <span
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${tone}`}
            style={{ left: `${Math.min(98, Math.max(2, p(om)))}%` }}
            title={`OM ${omSays} vs. typical ${typicalRange}`}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-muted">
          <span>{typicalRange.trim()} typical</span>
          <span className={assessment === "aggressive" ? "font-medium text-kill" : ""}>
            OM {omSays}
          </span>
        </div>
      </div>
    );
  }
  // Fallback: categorical strip when the strings don't parse.
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
/* 6 — Verdict (hero; compact variant powers the Overview)             */
/* ================================================================== */

const VERDICT = {
  pass: {
    word: "Go",
    sub: "Worth deeper work",
    tint: "from-pass/10",
    iconBg: "bg-pass/15 text-pass",
    wordCls: "text-pass",
    rail: "border-l-pass",
    Icon: IconCheck,
  },
  caution: {
    word: "Caution",
    sub: "Proceed only with named conditions",
    tint: "from-caution/10",
    iconBg: "bg-caution/15 text-caution",
    wordCls: "text-caution",
    rail: "border-l-caution",
    Icon: IconAlert,
  },
  pass_on: {
    word: "No-go",
    sub: "Recommend passing",
    tint: "from-kill/10",
    iconBg: "bg-kill/15 text-kill",
    wordCls: "text-kill",
    rail: "border-l-kill",
    Icon: IconX,
  },
} as const;

/** The one-glance differentiator: does the call survive the conservative end?
 *  Rendered as a low→high spectrum inside the verdict hero. */
function FlipStrip({
  sensitivity,
}: {
  sensitivity: NonNullable<VerdictResult["screen"]>["sensitivity"];
}) {
  const ordered = [...sensitivity].sort(
    (a, b) =>
      ["conservative", "base", "sponsor"].indexOf(a.scenario) -
      ["conservative", "base", "sponsor"].indexOf(b.scenario),
  );
  const SHORT: Record<string, string> = {
    conservative: "Cons.",
    base: "Base",
    sponsor: "Sponsor",
  };

  // The one-line answer to "where does this flip?" — derived, not generated.
  const [cons, base, sponsor] = ordered;
  let flipLine: string | null = null;
  if (cons && base && sponsor) {
    const c = CALL_META[cons.call]?.label ?? cons.call;
    const b = CALL_META[base.call]?.label ?? base.call;
    const s = CALL_META[sponsor.call]?.label ?? sponsor.call;
    if (cons.call === base.call && base.call === sponsor.call) {
      flipLine = `Holds at ${b} across the whole range — conservative through sponsor.`;
    } else if (cons.call !== base.call && base.call !== sponsor.call) {
      flipLine = `Reads ${c} / ${b} / ${s} across the range — the call lives on which end of the ranges you believe.`;
    } else if (cons.call !== base.call) {
      flipLine = `Doesn't survive the conservative end — drops to ${c} when the soft numbers hit.`;
    } else {
      flipLine = `Holds at ${b} through your base case; only the sponsor's own numbers read ${s}.`;
    }
  }

  return (
    <div className="mt-4 max-w-md">
    <div className="flex items-center gap-0">
      {ordered.map((sc, i) => {
        const call = CALL_META[sc.call] ?? CALL_META.caution;
        return (
          <div key={sc.scenario} className="flex flex-1 items-center">
            {i > 0 && <span className="h-px flex-1 bg-line" aria-hidden />}
            <span
              className="flex items-center gap-1.5 whitespace-nowrap px-1.5"
              title={sc.note}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${call.dot}`} />
              <span className="text-[11px] text-muted">
                {SHORT[sc.scenario] ?? sc.scenario}
              </span>
              <span className={`text-[11px] font-semibold ${call.cls}`}>
                {call.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
    {flipLine && (
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{flipLine}</p>
    )}
    </div>
  );
}

function VerdictHero({
  result,
  compact = false,
  onMore,
}: {
  result: VerdictResult;
  compact?: boolean;
  onMore?: () => void;
}) {
  const v = VERDICT[result.verdict] ?? VERDICT.caution;
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-line border-l-4 bg-surface shadow-sm ${v.rail}`}
    >
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
            <p
              className={`text-3xl font-semibold leading-none tracking-tight ${v.wordCls}`}
            >
              {v.word}
            </p>
            {v.sub && <p className="mt-1 text-sm text-muted">{v.sub}</p>}
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">{result.reason}</p>
        {result.screen?.sensitivity && result.screen.sensitivity.length > 0 && (
          <FlipStrip sensitivity={result.screen.sensitivity} />
        )}
        {compact && onMore && (
          <button
            type="button"
            onClick={onMore}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
          >
            View risks &amp; next steps
            <IconChevron className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!compact &&
        (result.topRisks.length > 0 || result.nextSteps.length > 0) && (
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

export function VerdictView({ result }: { result: VerdictResult }) {
  return (
    <div className="flex flex-col gap-6">
      <VerdictHero result={result} />
      {result.screen && <ScreeningRanges screen={result.screen} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The pre-model screen: ranges + provenance + the three deal-killers */
/* ------------------------------------------------------------------ */

const LEVER_META: Record<
  DealKiller["lever"],
  { label: string; blurb: string }
> = {
  basis: { label: "Basis", blurb: "Are you buying right?" },
  exit: { label: "Exit", blurb: "Does the exit cap hold?" },
  debt: { label: "Debt", blurb: "Does the financing survive a shock?" },
};
const LEVER_ORDER: DealKiller["lever"][] = ["basis", "exit", "debt"];

function ScreeningRanges({ screen }: { screen: ScreenResult }) {
  const killers = [...screen.dealKillers].sort(
    (a, b) => LEVER_ORDER.indexOf(a.lever) - LEVER_ORDER.indexOf(b.lever),
  );
  return (
    <section className="space-y-5">
      <div>
        <SectionHeader title="The screen, before the model" />
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Rent, expenses, and cap as ranges — not single hero numbers — each
          traced to where it came from. Same deal in, same ranges out.
        </p>
      </div>

      {screen.ranges.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {screen.ranges.map((r, i) => (
            <RangeCard key={i} r={r} />
          ))}
        </div>
      )}

      {killers.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Stress the three deal-killers first
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {killers.map((k, i) => (
              <DealKillerCard key={i} k={k} index={i} />
            ))}
          </div>
        </div>
      )}

      {screen.sensitivity && screen.sensitivity.length > 0 && (
        <VerdictSensitivity scenarios={screen.sensitivity} />
      )}
    </section>
  );
}

const SCENARIO_META: Record<VerdictScenario["scenario"], string> = {
  conservative: "Conservative",
  base: "Base case",
  sponsor: "Sponsor's case",
};
const SCENARIO_ORDER: VerdictScenario["scenario"][] = [
  "conservative",
  "base",
  "sponsor",
];
const CALL_META: Record<VerdictCall, { label: string; cls: string; dot: string }> = {
  pass: { label: "Go", cls: "text-pass", dot: "bg-pass" },
  caution: { label: "Caution", cls: "text-caution", dot: "bg-caution" },
  pass_on: { label: "No-go", cls: "text-kill", dot: "bg-kill" },
};

function VerdictSensitivity({ scenarios }: { scenarios: VerdictScenario[] }) {
  const ordered = [...scenarios].sort(
    (a, b) =>
      SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario),
  );
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        Where the call flips
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        The same deal, read across the range — from conservative to the
        sponsor&apos;s optimistic end.
      </p>
      <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {ordered.map((s, i) => {
          const call = CALL_META[s.call] ?? CALL_META.caution;
          return (
            <div key={i} className="bg-surface p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {SCENARIO_META[s.scenario] ?? s.scenario}
              </p>
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-sm font-semibold ${call.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${call.dot}`} />
                {call.label}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {s.note}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RANGE_CONF: Record<ScreenRange["confidence"], { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

/** Pull the first numeric out of a display string ("$1,495" → 1495). */
function firstNum(sv: string): number | null {
  const m = sv.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function RangeCard({ r }: { r: ScreenRange }) {
  const conf = RANGE_CONF[r.confidence] ?? RANGE_CONF.medium;
  // Positional encoding: WHERE the base sits inside low→high is the most
  // diagnostic fact about a range (hugging the sponsor's end is a tell).
  const lo = firstNum(r.low);
  const hi = firstNum(r.high);
  const base = firstNum(r.base);
  const pos =
    lo != null && hi != null && base != null && hi > lo
      ? Math.min(1, Math.max(0, (base - lo) / (hi - lo)))
      : null;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{r.label}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${conf.cls}`}
        >
          {conf.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <RangeCell label="Low" value={r.low} />
        <RangeCell label="Base" value={r.base} emphasized />
        <RangeCell label="High" value={r.high} />
      </div>
      {pos != null && (
        <div className="relative mt-2.5 h-1.5 rounded-full bg-line" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand/30"
            style={{ width: `${pos * 100}%` }}
          />
          <span
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
              pos > 0.7 ? "bg-caution" : "bg-brand"
            }`}
            style={{ left: `${pos * 100}%` }}
            title={
              pos > 0.7
                ? "Base sits near the optimistic end of the range"
                : "Where the base sits inside the range"
            }
          />
        </div>
      )}
      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        <span className="font-medium text-ink">Source:</span> {r.source}
      </p>
      {r.basis && (
        <p className="mt-1 text-xs leading-relaxed text-muted">{r.basis}</p>
      )}
    </div>
  );
}

function RangeCell({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`px-3 py-2 ${emphasized ? "bg-brand/10" : "bg-surface"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-0.5 font-mono tabular-nums ${
          emphasized
            ? "text-base font-semibold text-brand"
            : "text-sm text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DealKillerCard({ k, index }: { k: DealKiller; index: number }) {
  const meta = LEVER_META[k.lever] ?? { label: k.lever, blurb: "" };
  return (
    <div className="rounded-xl border border-line border-t-2 border-t-brand bg-surface p-4 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs tabular-nums text-muted">
          {index + 1}
        </span>
        <p className="text-sm font-semibold">{meta.label}</p>
      </div>
      {meta.blurb && (
        <p className="mt-0.5 text-[11px] text-muted">{meta.blurb}</p>
      )}
      <p className="mt-2.5 text-sm leading-relaxed">{k.read}</p>
      <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-muted">
        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-kill" />
        <span>{k.risk}</span>
      </p>
    </div>
  );
}

/* ================================================================== */
/* Per-tab supplements — add your own data to any section              */
/* ================================================================== */

export type TabSupplement = {
  notes: { id: string; text: string; createdAt: string }[];
  files: { id: string; name: string; createdAt: string; url: string | null }[];
};

export function Supplements({
  dealId,
  tab,
  data,
}: {
  dealId: string;
  tab: string;
  data: TabSupplement;
}) {
  if (data.notes.length === 0 && data.files.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        Your additions
      </h3>
      <div className="mt-3 space-y-2">
        {data.notes.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-xl border border-line border-l-2 border-l-brand bg-surface p-4 shadow-sm"
          >
            <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">
              {n.text}
            </p>
            <RemoveButton dealId={dealId} tab={tab} id={n.id} kind="note" />
          </div>
        ))}
        {data.files.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm"
          >
            <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
            {f.url ? (
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-sm font-medium text-brand hover:underline"
              >
                {f.name}
              </a>
            ) : (
              <span className="flex-1 truncate text-sm">{f.name}</span>
            )}
            <RemoveButton dealId={dealId} tab={tab} id={f.id} kind="file" />
          </div>
        ))}
      </div>
    </section>
  );
}

function RemoveButton({
  dealId,
  tab,
  id,
  kind,
}: {
  dealId: string;
  tab: string;
  id: string;
  kind: "note" | "file";
}) {
  return (
    <form action={removeSupplement}>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        aria-label="Remove"
        className="shrink-0 rounded p-1 text-muted transition-colors hover:text-kill"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </form>
  );
}

export function AddData({ dealId, tab }: { dealId: string; tab: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-dashed border-line p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <IconPlus
          className={`h-4 w-4 transition-transform ${open ? "rotate-45" : ""}`}
        />
        Add info or upload to this section
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <form action={addSupplementNote} className="space-y-2">
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="tab" value={tab} />
            <textarea
              name="text"
              required
              rows={2}
              placeholder="Add a note, a correction, or a figure the analysis missed…"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Add note
            </button>
          </form>
          <div className="border-t border-line pt-3">
            <form
              action={addSupplementFile}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="dealId" value={dealId} />
              <input type="hidden" name="tab" value={tab} />
              <FileField name="file" />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                Upload
              </button>
            </form>
            <p className="mt-1.5 text-[11px] text-muted">
              Rent roll, T-12, comp sheet, anything — PDF, Excel, CSV, or image
              (up to 22 MB).
            </p>
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
      <PendingButton
        pendingLabel="Starting the screen…"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        {label}
      </PendingButton>
    </form>
  );
}
