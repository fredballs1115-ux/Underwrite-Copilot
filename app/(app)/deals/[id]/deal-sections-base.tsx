"use client";

// What the deal page's Overview draws — the icons and primitives every
// section shares, the severity scale, the risk digest and the verdict's hero —
// moved out of deal-sections-view.tsx so a page that opens on the Overview
// (the homepage's walkthrough of the sample deal) can load the other
// sections only when their tab is opened. deal-sections-view.tsx draws the
// rest with these and re-exports what it re-exported before.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { screenedOn, type BehindWhy } from "@/lib/screen-run";
import { incomeGapShare } from "@/lib/gap-detail";
import { NOI_IN_LINE_BAND } from "@/lib/actuals/in-line-band";
import { EmptyGlyph, StageRailGhost } from "@/app/empty-pictures";
import { StressTestPanel } from "@/app/stress-test-panel";
import type { StressTest } from "@/lib/stress-test-types";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
  VerdictCall,
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
export const IconAlert = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);
export const IconAsk = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);
export const IconActivity = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Svg>
);
export const IconArrowRight = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);
export const IconArrowUp = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Svg>
);
export const IconArrowDown = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Svg>
);
export const IconMinus = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconFlag = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </Svg>
);
export const IconChevron = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const IconPlus = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
);
export const IconTrash = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);
export const IconPaperclip = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

/* ================================================================== */
/* Shared primitives                                                   */
/* ================================================================== */

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  // An aside with no room beside the title takes its own row beneath it,
  // rather than squeezing its words onto three lines.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {aside}
    </div>
  );
}

/** A count line as a picture — one bar, a segment per kind in its colour,
 *  the counts kept beside it in the same colours (they are the accessible
 *  text; the bar is decoration with the counts as its tooltip). The same
 *  shape as the pipeline's verdict split (#241). Nothing when every count
 *  is zero. */
export function SplitBar({
  parts,
}: {
  parts: { n: number; label: string; bar: string; text: string }[];
}) {
  const shown = parts.filter((p) => p.n > 0);
  const total = shown.reduce((sum, p) => sum + p.n, 0);
  if (total === 0) return null;
  const words = shown.map((p) => `${p.n} ${p.label}`).join(" · ");
  return (
    <div className="flex items-center gap-2 text-[11px] font-medium">
      <span
        aria-hidden
        data-split-bar
        title={words}
        className="flex h-1.5 w-16 shrink-0 gap-px overflow-hidden rounded-full bg-faint"
      >
        {shown.map((p) => (
          <span key={p.label} className={p.bar} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </span>
      <span className="whitespace-nowrap">
        {shown.map((p, i) => (
          <span key={p.label} className={p.text}>
            {i > 0 && <span className="text-muted"> · </span>}
            {p.n} {p.label}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Callout({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
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
  icon,
}: {
  title: string;
  action?: ReactNode;
  /** a picture of what the empty place stands for (a stage's icon,
   *  app/stage-icons), drawn in a dashed muted ring above the words —
   *  decorative, never a figure */
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      {icon ? <EmptyGlyph className="mb-3">{icon}</EmptyGlyph> : null}
      <p className="text-sm text-muted">{title}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// Progressive disclosure: show the first `initial` items, reveal the rest on
// demand. Keeps everything present but tames long lists. Items are pre-rendered.
export function RevealList({
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
          aria-expanded={open}
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

export const SEV = {
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
      // Graded by the size its gap line states, against the model's own
      // figure (lib/gap-detail), on the property-actuals card's "In line"
      // band. The sample's $174k NOI gap is 4.7% of the model's NOI, and
      // that card calls the same gap In line. A gap inside the band is
      // never HIGH. A size the row does not state, a dollar gap on another
      // footing, and a rate's gap (the band is the income's, not a cap's)
      // keep the old grade.
      const share = incomeGapShare(r);
      risks.push({
        severity: share != null && share <= NOI_IN_LINE_BAND ? "low" : "high",
        // "Your model": the reader's own underwriting, which the reconciler
        // reads — never the OM's pro forma nor the site's engine, which the
        // same page also calls a model (research pass 32).
        title: `${r.metric}: your model less favorable than the OM`,
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
        detail: `${c.note} (OM ${c.omSays} vs. typical ${c.typicalRange}, a rule of thumb)`,
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
  screening = false,
  onNavigate,
  stale = [],
  staleWhy = "failed",
  stopped = false,
  stressTest = null,
}: {
  results: Results;
  active: boolean;
  /** the OM's assumptions tested (lib/stress-test), built on the server
   *  from what the page holds — drawn first after the call, before the
   *  risk digest, since the test is what the call rests on; null draws
   *  nothing */
  stressTest?: StressTest | null;
  /** a screen (not a side job) is running: the progress rail above counts
   *  its six steps, so the meter's own count of five results stands down —
   *  "0/5" under "Step 2 of 6" read as two answers to one question */
  screening?: boolean;
  onNavigate: (tab: string) => void;
  /** results the latest screen has not rewritten — the previous screen's
   *  (lib/screen-run `previousScreenResults`) */
  stale?: ReadonlyArray<keyof Results>;
  /** why: the latest screen failed before them, is still running, or
   *  stopped making progress before them */
  staleWhy?: BehindWhy;
  /** the latest screen stopped before its end (lib/screen-run
   *  `screenStopped`): what is missing is missing because it stopped, and
   *  the reason is at the top of the page — never "no concerns", which
   *  reads as a clean result */
  stopped?: boolean;
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
  // A failed screen counts only what it reached: a result the previous
  // screen wrote is present, but it is not this screen's — "5/5" over a
  // mixed generation was the finding this line closes.
  const staleSet = new Set<keyof Results>(stale);
  const done = steps.filter((s) => results[s.key] != null && !staleSet.has(s.key)).length;
  const staleCount = steps.filter((s) => results[s.key] != null && staleSet.has(s.key)).length;
  const hasModel = results.reconciliation != null;

  return (
    <div className="space-y-5">
      {results.verdict ? (
        <VerdictHero
          result={results.verdict}
          compact
          stale={staleSet.has("verdict")}
          staleWhy={staleWhy}
          onMore={() => onNavigate("verdict")}
        />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          {/* Idle, the six stages as a rail none of which is lit; while a
              screen runs, the page's own rail above is the picture. */}
          {active ? null : <StageRailGhost className="mb-4 max-w-sm" />}
          <p className="text-sm font-medium">
            {active ? "Screening in progress…" : "No verdict yet"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {active
              ? "The verdict and risk digest will appear here as the analysis completes."
              : stopped
                ? "The screen stopped before its verdict — the reason is at the top of the page."
                : "Run the analysis to see the verdict and the consolidated risk digest."}
          </p>
        </div>
      )}

      {/* The OM's assumptions, tested (app/stress-test-panel): the product
          leads with it, right after the call. */}
      <StressTestPanel test={stressTest} />
      {/* The whole method, one link under the panel wherever it is drawn —
          the deal page, /demo and the homepage's walkthrough; each row's
          own link lands on its section. */}
      {stressTest && stressTest.rows.length > 0 && (
        <p className="-mt-3 px-1 text-xs" data-qa="how-we-test-link">
          <Link href="/how-we-test" className="font-medium text-brand hover:underline">
            How each assumption is tested
          </Link>
        </p>
      )}

      {/* Completeness meter — a card while results are missing or a side job
          runs; a single quiet line once everything is done (it earns no card
          space forever). While a screen runs, the rail above is the progress
          cue: the meter stands down, and only a re-screen's previous-screen
          results are said, in a line of their own. */}
      {screening ? (
        staleCount > 0 ? (
          <p className="px-1 text-xs leading-relaxed text-caution">
            {`Until the run in progress reaches ${staleCount === 1 ? "it" : "them"}, ${staleCount} of this deal's results ${staleCount === 1 ? "is" : "are"} the previous screen's.`}
          </p>
        ) : null
      ) : active || done < steps.length ? (
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
                title={staleSet.has(s.key) && results[s.key] != null ? `${s.label}: from the previous screen` : s.label}
                className={`h-1.5 flex-1 rounded-full ${
                  results[s.key] == null
                    ? "bg-line"
                    : staleSet.has(s.key)
                      ? "bg-caution/50"
                      : "bg-brand"
                }`}
              />
            ))}
          </div>
          {staleCount > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-caution">
              {staleWhy === "running"
                ? `${staleCount} of these are from the previous screen — the run in progress replaces each as it reaches it.`
                : staleWhy === "stalled"
                  ? `${staleCount} of these are from the previous screen — the latest run stopped making progress before reaching them. Start it again to bring them up to date.`
                  : `${staleCount} of these are from the previous screen — the latest run failed before reaching them. Run it again to bring them up to date.`}
            </p>
          )}
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
              <SplitBar
                parts={[
                  { n: counts.high, label: "high", bar: "bg-kill", text: "text-kill" },
                  { n: counts.medium, label: "med", bar: "bg-caution", text: "text-caution" },
                  { n: counts.low, label: "low", bar: "bg-brand", text: "text-brand" },
                ]}
              />
            ) : undefined
          }
        />
        {risks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {active
              ? "Concerns will collect here as each section completes."
              : stopped
                ? "Nothing to digest yet — the screen stopped before it finished."
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
          {/* Two lines rather than an ellipsis: on a phone the title is the
              whole finding ("Exit cap compression to 5…" said nothing). */}
          <span className="line-clamp-2 text-sm font-medium">{risk.title}</span>
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
/* 6 — Verdict (hero; compact variant powers the Overview)             */
/* ================================================================== */

const VERDICT = {
  pass: {
    word: "Go",
    sub: "Worth deeper work",
    tint: "from-pass/10",
    iconBg: "bg-pass/10 text-pass",
    wordCls: "text-pass",
    rail: "border-l-pass",
    Icon: IconCheck,
  },
  caution: {
    word: "Caution",
    sub: "Proceed only with named conditions",
    tint: "from-caution/10",
    iconBg: "bg-caution/10 text-caution",
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
    // The strip above already shows the three calls; this line says only
    // what the picture cannot — whether the call survives the soft numbers.
    if (cons.call === base.call && base.call === sponsor.call) {
      flipLine = `Holds at ${b} across the range.`;
    } else if (cons.call !== base.call && base.call !== sponsor.call) {
      flipLine = "The call depends on whose numbers you believe.";
    } else if (cons.call !== base.call) {
      flipLine = `Drops to ${c} at the conservative end.`;
    } else {
      flipLine = `Holds at ${b}; only the sponsor's numbers read ${s}.`;
    }
  }

  return (
    <div className="mt-4 max-w-md">
    {/* Three calls in a row; a phone stacks them (the connectors go) so the
        sponsor's call is never the one cut off at the edge. */}
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0">
      {ordered.map((sc, i) => {
        const call = CALL_META[sc.call] ?? CALL_META.caution;
        return (
          <div key={sc.scenario} className="flex items-center sm:flex-1">
            {i > 0 && <span className="hidden h-px flex-1 bg-line sm:block" aria-hidden />}
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

export function VerdictHero({
  result,
  compact = false,
  stale = false,
  staleWhy = "failed",
  onMore,
}: {
  result: VerdictResult;
  compact?: boolean;
  /** the latest screen has not re-run the verdict — this call was written
   *  about the terms as they were before that run */
  stale?: boolean;
  /** why: that screen failed before the verdict, is still running, or
   *  stopped making progress on the way */
  staleWhy?: BehindWhy;
  onMore?: () => void;
}) {
  const v = VERDICT[result.verdict] ?? VERDICT.caution;
  const topRisks = result.topRisks ?? [];
  const nextSteps = result.nextSteps ?? [];
  // The day the call was written, so a call weeks old never reads as today's.
  const on = screenedOn(result.generatedAt);
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-line border-l-4 bg-surface shadow-sm ${v.rail}`}
    >
      <div className={`bg-gradient-to-b ${v.tint} to-transparent p-6`}>
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Verdict
        </span>
        {on && (
          <span className="text-xs text-muted" data-qa="verdict-date">
            {" · "}
            {on}
          </span>
        )}
        {stale && (
          <>
            {" "}
            <span
              className="ml-2 rounded-full bg-caution/10 px-2 py-px text-[11px] font-medium text-caution"
              title={
                staleWhy === "running"
                  ? "A new screen of this deal is running. This call was written about the terms as they stood before it — the run replaces it when it reaches the verdict."
                  : staleWhy === "stalled"
                    ? "The latest screen stopped making progress before it reached the verdict. This call was written about the terms as they stood before that run — start the screen again to refresh it."
                    : "The latest screen failed before it reached the verdict. This call was written about the terms as they stood before that run — run the screen again to refresh it."
              }
            >
              From the previous screen
            </span>
          </>
        )}
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
        (topRisks.length > 0 || nextSteps.length > 0) && (
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Top risks
              </p>
              <ul className="mt-3 space-y-2">
                {topRisks.map((r, i) => (
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
                {nextSteps.map((n, i) => (
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

export const CALL_META: Record<VerdictCall, { label: string; cls: string; dot: string }> = {
  pass: { label: "Go", cls: "text-pass", dot: "bg-pass" },
  caution: { label: "Caution", cls: "text-caution", dot: "bg-caution" },
  pass_on: { label: "No-go", cls: "text-kill", dot: "bg-kill" },
};

