"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReturnsHeadline,
  Sensitivity,
  Assumptions,
  Conflicts,
  CashFlow,
  CapexPanel,
} from "../(app)/deals/[id]/model-view";
import type { UnderwritingModel } from "@/lib/model/types";

const SLIDE_MS = 7000;

/**
 * A stepped slideshow through the generated model — the exact components the
 * app renders (returns, cash flow, sensitivity, assumptions, conflicts), fed
 * by the illustrative sample. Auto-advances gently; any manual step takes
 * over. Respects prefers-reduced-motion and pauses in background tabs.
 */
export function ModelSlideshow({ model }: { model: UnderwritingModel }) {
  const slides = useMemo(
    () => [
      {
        key: "returns",
        label: "Returns",
        blurb:
          "Levered IRR, equity multiple, and average cash-on-cash — computed from the reconciled inputs, not the broker's pro forma.",
        node: <ReturnsHeadline model={model} />,
      },
      {
        key: "cashflow",
        label: "Cash flow",
        blurb:
          "Year by year across the hold: gross rent down through vacancy, expenses, reserves, and debt service to levered cash flow.",
        node: <CashFlow cashFlow={model.cashFlow} defaultOpen />,
      },
      {
        key: "sensitivity",
        label: "Sensitivity",
        blurb:
          "Exit cap × purchase price grid — see where the return thesis breaks before you're in it.",
        node: <Sensitivity model={model} />,
      },
      {
        key: "capex",
        label: "CapEx",
        blurb:
          "The capital plan, reserved below NOI in every year — per-unit funding, the total across the hold, and what it costs year-1 NOI.",
        node: <CapexPanel model={model} />,
      },
      {
        key: "assumptions",
        label: "Assumptions",
        blurb:
          "Every input with its source and the document that won — OM claims versus rent-roll and T-12 actuals.",
        node: <Assumptions metrics={model.metrics} />,
      },
      {
        key: "conflicts",
        label: "Conflicts",
        blurb:
          "Where the documents disagreed, and which figure the model chose to trust — with the rationale.",
        node: <Conflicts conflicts={model.conflicts} />,
      },
    ],
    [model],
  );

  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) setIndex((v) => (v + 1) % slides.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [auto, slides.length]);

  function goTo(next: number) {
    setAuto(false); // the reader has taken the wheel
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }

  const slide = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Inside the generated model"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="text-lg font-semibold tracking-tight">
            Inside the generated model
          </h3>
          <span className="rounded-full bg-caution/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-caution">
            Illustrative sample
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous model view"
            className="rounded-lg border border-line bg-surface p-1.5 text-muted transition-colors hover:bg-faint hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-12 text-center font-mono text-xs tabular-nums text-muted">
            {index + 1} / {slides.length}
          </span>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next model view"
            className="rounded-lg border border-line bg-surface p-1.5 text-muted transition-colors hover:bg-faint hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setAuto((v) => !v)}
            aria-label={auto ? "Pause the slideshow" : "Resume the slideshow"}
            aria-pressed={auto}
            className="ml-1 rounded-lg border border-line bg-surface p-1.5 text-muted transition-colors hover:bg-faint hover:text-ink"
          >
            {auto ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        The screen doesn&rsquo;t stop at a verdict — it builds a working
        underwriting model you can download as Excel. These are the live
        product views, not screenshots.
      </p>

      {/* Step pills double as slide labels and direct navigation. */}
      <div role="tablist" aria-label="Model views" className="mt-4 flex flex-wrap gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => goTo(i)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              i === index
                ? "border-brand bg-brand/10 text-brand"
                : "border-line bg-surface text-muted hover:bg-faint hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        key={slide.key}
        role="tabpanel"
        aria-label={slide.label}
        className="animate-fade mt-4 min-h-80"
      >
        <p className="mb-3 text-sm leading-relaxed text-muted">{slide.blurb}</p>
        {slide.node}
      </div>
    </section>
  );
}
