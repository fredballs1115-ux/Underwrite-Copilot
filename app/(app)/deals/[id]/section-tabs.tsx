// The deal page's section bar and its Analyses pills — the tablists the
// signed-in deal page draws (deal-view.tsx) and, on the sample deal, the
// public pages draw too (/demo's sections, the homepage's walkthrough), so a
// visitor's tabs are the product's, never a copy of them. Plain markup over
// the readers in lib/deal-tabs: no server action, no data table, no state of
// its own (the caller holds which tab is open).
import type { KeyboardEvent } from "react";
import { ANALYSES, SECTIONS, type AnalysisKey, type SectionKey, type SectionState } from "@/lib/deal-tabs";

/** A section's dot: finished, running (it pulses), waiting, or idle. */
export function TabDot({ state, active }: { state: SectionState; active: boolean }) {
  const base = "h-1.5 w-1.5 rounded-full";
  if (state === "done") {
    return <span aria-hidden className={`${base} ${active ? "bg-white" : "bg-pass"}`} />;
  }
  if (state === "running") {
    return <span aria-hidden className={`${base} pulse-bar ${active ? "bg-white" : "bg-brand"}`} />;
  }
  if (state === "pending") {
    return <span aria-hidden className={`${base} ${active ? "bg-white/50" : "bg-line"}`} />;
  }
  return (
    <span
      aria-hidden
      className={`${base} ${active ? "bg-white/40" : "bg-transparent ring-1 ring-inset ring-line"}`}
    />
  );
}

/** The next tab an arrow key, Home or End moves to; -1 for any other key. */
function nextIndex(key: string, at: number, n: number): number {
  return key === "ArrowRight" ? (at + 1) % n : key === "ArrowLeft" ? (at - 1 + n) % n : key === "Home" ? 0 : key === "End" ? n - 1 : -1;
}

/**
 * The section bar — one section visible at a time: a segmented control, each
 * tab with its state's dot and its finding count. Arrow keys, Home and End
 * move through the tabs (the standard tabs pattern) and focus follows. The
 * caller wraps it in the strip that scrolls it sideways on a phone, and
 * draws the panel `deal-tabpanel` each tab controls.
 */
export function DealSectionTabs({
  active,
  stateOf,
  counts,
  onSelect,
  label = "Deal sections",
  fadeAlways = false,
}: {
  active: SectionKey;
  stateOf: (key: SectionKey) => SectionState;
  counts: Record<SectionKey, number>;
  onSelect: (key: SectionKey) => void;
  /** the tablist's accessible name */
  label?: string;
  /** the strip around it fades its right edge at every width (a column
   *  narrower than the five tabs), not only on a phone */
  fadeAlways?: boolean;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = nextIndex(e.key, SECTIONS.findIndex((t) => t.key === active), SECTIONS.length);
    if (next < 0) return;
    e.preventDefault();
    onSelect(SECTIONS[next].key);
    document.getElementById(`tab-${SECTIONS[next].key}`)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm ${fadeAlways ? "mr-8" : "max-md:mr-8"}`}
    >
      {SECTIONS.map((t) => {
        const state = stateOf(t.key);
        const isActiveTab = t.key === active;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={isActiveTab}
            aria-controls="deal-tabpanel"
            tabIndex={isActiveTab ? 0 : -1}
            onClick={() => onSelect(t.key)}
            className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              isActiveTab ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-faint hover:text-ink"
            }`}
          >
            <TabDot state={state} active={isActiveTab} />
            {t.label}
            {/* The dot's colour says a section is being worked on; so do
                words, to a screen reader (research pass 33). */}
            {state === "running" ? <span className="sr-only">, running</span> : null}
            {count > 0 && (
              <span
                title={`${count} finding${count === 1 ? "" : "s"}`}
                className={`rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums ${
                  isActiveTab ? "bg-white/20 text-white" : "bg-kill/10 text-kill"
                }`}
              >
                {count}
                {/* What the figure counts, said: it had been in a title
                    only (research pass 33). */}
                <span className="sr-only">{` finding${count === 1 ? "" : "s"}`}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Analyses tab's secondary pill nav over its five views — the verdict
 * first, then the critique behind it. The tabs pattern the deal's own
 * sections use: arrow keys, Home and End move through them, one tab stop,
 * each tied to the panel `analysis-tabpanel` it opens — they had been tabs
 * in name only (research pass 33). A view with no result yet is muted.
 */
export function AnalysisTabs({
  active,
  counts,
  has,
  onSelect,
}: {
  active: AnalysisKey;
  counts: Record<AnalysisKey, number>;
  /** whether the view's result is on the deal */
  has: (key: AnalysisKey) => boolean;
  onSelect: (key: AnalysisKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Analyses"
      onKeyDown={(e) => {
        const next = nextIndex(e.key, ANALYSES.findIndex((a) => a.key === active), ANALYSES.length);
        if (next < 0) return;
        e.preventDefault();
        onSelect(ANALYSES[next].key);
        document.getElementById(`analysis-tab-${ANALYSES[next].key}`)?.focus();
      }}
      className="flex flex-wrap gap-1.5"
    >
      {ANALYSES.map((a) => {
        const on = a.key === active;
        return (
          <button
            key={a.key}
            id={`analysis-tab-${a.key}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="analysis-tabpanel"
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(a.key)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              on
                ? "border-brand bg-brand/10 text-brand"
                : has(a.key)
                  ? "border-line bg-surface text-ink hover:bg-faint"
                  : "border-line bg-surface text-muted hover:bg-faint"
            }`}
          >
            {a.label}
            {counts[a.key] > 0 && (
              <span className="rounded-full bg-kill/10 px-1.5 py-px font-mono text-[10px] tabular-nums text-kill">
                {counts[a.key]}
                <span className="sr-only">{` finding${counts[a.key] === 1 ? "" : "s"}`}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
