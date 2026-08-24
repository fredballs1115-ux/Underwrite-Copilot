"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SAMPLE_COMP_PREMIUM_LINE } from "@/lib/marketing-constants";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { computeModel } from "@/lib/model/compute";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Fades/slides children in the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${shown ? "reveal-in" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** A stat, rendered statically — single-digit figures earn no animation.
 *  (Kept as a component so callers and tests didn't have to change.) */
export function CountUp({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {value}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive demo — a faithful MINIATURE of the real deal page.      */
/* The tab bar is the deal page's actual section list, the analyses    */
/* sub-pills are its actual analysis names, and every figure derives   */
/* from the same sample fixture + live engine the demo renders.        */
/* All data is an ILLUSTRATIVE SAMPLE, clearly labeled in the UI.      */
/* ------------------------------------------------------------------ */

// Derived once from the sample fixture through the SAME computeModel the
// product ships — this widget cannot disagree with the engine or the demo.
const INPUTS = SAMPLE_DEAL.model.inputs;
const RETURNS = computeModel(INPUTS).returns;
const VERDICT_WORD =
  SAMPLE_DEAL.verdict.verdict === "pass"
    ? "Go"
    : SAMPLE_DEAL.verdict.verdict === "pass_on"
      ? "No-go"
      : "Caution";
const pct1 = (n: number | null) =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(1)}%`;

// The REAL deal page's section list (deal-view.tsx SECTIONS) — the homepage
// walkthrough uses the product's own information architecture, not a
// marketing rewrite of it.
const TABS = ["Overview", "Financials", "Buy box", "Analyses", "Documents"] as const;
type Tab = (typeof TABS)[number];
// The REAL analyses sub-tabs (deal-view.tsx ANALYSES), shown as pills.
const ANALYSIS_PILLS = ["Verdict", "Challenger", "Comps", "Market", "Reconciler"] as const;

function RangeRow({
  label,
  low,
  base,
  high,
  src,
}: {
  label: string;
  low: string;
  base: string;
  high: string;
  src: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-[10px] text-muted">range</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {[
          ["Low", low, false],
          ["Base", base, true],
          ["High", high, false],
        ].map(([k, v, e]) => (
          <div
            key={k as string}
            className={`px-2.5 py-1.5 ${e ? "bg-brand/5" : "bg-surface"}`}
          >
            <p className="text-[9px] uppercase tracking-wide text-muted">
              {k as string}
            </p>
            <p
              className={`mt-0.5 font-mono tabular-nums ${
                e ? "text-sm font-semibold text-brand" : "text-xs"
              }`}
            >
              {v as string}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
        <span className="font-medium text-ink">Source:</span> {src}
      </p>
    </div>
  );
}

function Killer({
  n,
  name,
  read,
  severity,
}: {
  n: number;
  name: string;
  read: string;
  severity: "kill" | "caution" | "pass";
}) {
  const border =
    severity === "kill"
      ? "border-l-kill"
      : severity === "caution"
        ? "border-l-caution"
        : "border-l-pass";
  const chip =
    severity === "kill"
      ? "bg-kill/10 text-kill"
      : severity === "caution"
        ? "bg-caution/10 text-caution"
        : "bg-pass/10 text-pass";
  return (
    <div className={`rounded-lg border border-line border-l-4 ${border} bg-paper p-3`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted">{n}</span>
        <span className="text-xs font-medium">{name}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-medium uppercase ${chip}`}
        >
          {severity === "kill"
            ? "Deal-killer"
            : severity === "caution"
              ? "Stress it"
              : "Holds up"}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{read}</p>
    </div>
  );
}

function CompRow({
  name,
  meta,
  rating,
}: {
  name: string;
  meta: string;
  rating: "stretched" | "leans" | "support";
}) {
  const chip =
    rating === "stretched"
      ? ["Stretched", "bg-kill/10 text-kill"]
      : rating === "leans"
        ? ["Leans favorable", "bg-caution/10 text-caution"]
        : ["Genuine support", "bg-pass/10 text-pass"];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="truncate text-[10px] text-muted">{meta}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${chip[1]}`}
      >
        {chip[0]}
      </span>
    </div>
  );
}

/** The deal page's three-figure summary strip, in miniature. */
function SummaryFigures() {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-line px-3 py-2.5">
      {(
        [
          ["Price", `$${(INPUTS.purchasePrice / 1e6).toFixed(0)}M`],
          ["Size", `${INPUTS.units} units`],
          ["Going-in cap", `${RETURNS.goingInCapPct.toFixed(2)}%`],
        ] as const
      ).map(([k, v]) => (
        <div key={k}>
          <dt className="text-[9px] uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DemoPanel({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Overview":
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <p className="text-xs font-medium">Screening verdict</p>
              <p className="mt-0.5 text-[10px] text-muted">
                one rubric — the work shown on every call
              </p>
            </div>
            <span className="rounded-full bg-caution/10 px-3 py-1 text-xs font-semibold text-caution">
              {VERDICT_WORD}
            </span>
          </div>
          <SummaryFigures />
          <Killer n={1} name="Basis" read={SAMPLE_COMP_PREMIUM_LINE} severity="kill" />
          <Killer
            n={2}
            name="Exit"
            read="Underwriting exits 20 bps below the going-in cap after a 5-year hold — the spread does the returns' heavy lifting."
            severity="caution"
          />
        </div>
      );
    case "Financials":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            {(
              [
                ["Levered IRR", pct1(RETURNS.leveredIrrPct)],
                ["Equity multiple", RETURNS.equityMultiple ? `${RETURNS.equityMultiple.toFixed(2)}x` : "—"],
                ["Cash-on-cash", pct1(RETURNS.cashOnCashPct)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-surface px-2 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted">{k}</p>
                <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <RangeRow
            label="Exit cap"
            low="5.25%"
            base={`${INPUTS.exitCapPct.toFixed(2)}%`}
            high="5.75%"
            src="submarket trades 5.25–5.75%; broker holds 5.25%."
          />
          <RangeRow
            label="Market rent / unit"
            low="$2,400"
            base="$2,480"
            high="$2,600"
            src="rent roll actuals · OM p.12 pro forma flagged +8%."
          />
        </div>
      );
    case "Buy box":
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Mandate fit</p>
              <span className="rounded-full bg-caution/10 px-2.5 py-0.5 text-xs font-semibold text-caution">
                WATCH
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Your saved criteria, checked in code on every screen — cap floor,
              return targets, geographies, hard dealbreakers.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
            {(
              [
                ["✓", "Market", "text-pass border-line"],
                ["✓", "Price", "text-pass border-line"],
                ["✓", "Asset class", "text-pass border-line"],
                ["✕", "Going-in cap", "text-kill border-kill/30 bg-kill/[0.04]"],
              ] as const
            ).map(([mark, label, cls]) => (
              <span
                key={label}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 ${cls}`}
              >
                <span aria-hidden>{mark}</span>
                <span className="text-ink">{label}</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            A deal can be well-underwritten and still be outside the box — it
            says so, from the first signal onward, and the verdict judges the
            fit out loud.
          </p>
        </div>
      );
    case "Analyses":
      return (
        <div className="space-y-3">
          {/* The real analyses sub-tabs, verbatim (Verdict shown active). */}
          <div className="flex flex-wrap gap-1" aria-hidden>
            {ANALYSIS_PILLS.map((p, i) => (
              <span
                key={p}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                  i === 0 ? "bg-faint text-ink shadow-sm" : "text-muted"
                }`}
              >
                {p}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            {(
              [
                ["Conservative", "No-go", "text-kill"],
                ["Base", VERDICT_WORD, "text-caution"],
                ["Sponsor", "Go", "text-pass"],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="bg-surface px-2 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted">{k}</p>
                <p className={`mt-0.5 text-xs font-semibold ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          <CompRow name="The Brixton" meta="comparable vintage · 2.1 mi" rating="support" />
          <CompRow name="Vue at Legacy" meta="newer, amenitized · 4.0 mi" rating="stretched" />
          <p className="text-[10px] leading-relaxed text-muted">
            Five analyses, one rubric — the verdict flips across scenarios, and
            that spread <em>is</em> the finding.
          </p>
        </div>
      );
    case "Documents":
      return (
        <div className="space-y-2.5">
          {(
            [
              ["offering-memorandum.pdf", "screened — all six stages, page-cited", "bg-pass/10 text-pass", "Screened"],
              ["rent-roll.csv", "actuals beat pro forma in every conflict", "bg-brand/10 text-brand", "Reconciled"],
              ["t12-operating.pdf", "expense load anchored to the trailing twelve", "bg-brand/10 text-brand", "Reconciled"],
            ] as const
          ).map(([file, meta, cls, chip]) => (
            <div
              key={file}
              className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{file}</p>
                <p className="truncate text-[10px] text-muted">{meta}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${cls}`}>
                {chip}
              </span>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-muted">
            Add a rent roll, T-12, or loan terms any time — the screen
            re-anchors itself and flags where the OM&apos;s pro forma drifts.
          </p>
        </div>
      );
  }
}

/** Tabbed walkthrough mirroring the real deal page's sections — sample data. */
export function DemoTabs() {
  const [tab, setTab] = useState<Tab>("Overview");

  function onKeys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? TABS[(i + 1) % TABS.length]
        : TABS[(i - 1 + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`demo-tab-${next}`)?.focus();
  }

  return (
    <div className="shadow-float overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-faint px-3 py-2">
        <div
          role="tablist"
          aria-label="Screen walkthrough"
          onKeyDown={onKeys}
          className="flex gap-1 overflow-x-auto"
        >
          {TABS.map((t) => (
            <button
              key={t}
              id={`demo-tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted sm:block">
          Sample data
        </span>
      </div>
      {/* min-h pinned to the tallest panel so switching tabs never reflows
          the section — clicking around must feel solid, not jumpy. */}
      <div role="tabpanel" className="animate-fade min-h-[24rem] p-4" key={tab}>
        <DemoPanel tab={tab} />
      </div>
    </div>
  );
}
