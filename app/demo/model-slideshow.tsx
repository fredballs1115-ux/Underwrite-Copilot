"use client";

import { useEffect, useMemo, useState } from "react";
// The card's views from the modules that hold no server action (model-view
// itself carries the card's document and generate forms).
import { ReturnsHeadline } from "../(app)/deals/[id]/returns-headline";
import {
  StressPanel,
  Sensitivity,
  Assumptions,
  Conflicts,
  CashFlow,
  CapexPanel,
} from "../(app)/deals/[id]/model-panels";
import type { UnderwritingModel } from "@/lib/model/types";

const SLIDE_MS = 7000;

/**
 * The first-draft model card's views one at a time — the exact components
 * the deal page's card stacks (app/(app)/deals/[id]/model-view), in its
 * order, fed by the illustrative sample — then the card's workbook and its
 * two-model sentence. Auto-advances gently; a step, or a hand on a slide's
 * own controls, takes over. Respects prefers-reduced-motion and pauses in
 * background tabs.
 */
export function ModelSlideshow({ model }: { model: UnderwritingModel }) {
  // The deal page's first-draft card, view by view in its own order
  // (model-view's ModelView): the returns, the stress test, the grid, the
  // conflicts, the assumptions, the capital plan and the cash flow.
  const slides = useMemo(
    () => [
      {
        key: "returns",
        label: "Returns",
        blurb: "Levered IRR, equity multiple and year-one cash-on-cash, from the reconciled inputs.",
        node: <ReturnsHeadline model={model} />,
      },
      {
        key: "stress",
        label: "Stress test",
        blurb: "Move rent, vacancy, expenses and the exit cap, and watch the returns move.",
        node: <StressPanel model={model} />,
      },
      {
        key: "sensitivity",
        label: "Sensitivity",
        blurb: "Exit cap × purchase price: where the return thesis breaks.",
        node: <Sensitivity model={model} />,
      },
      {
        key: "conflicts",
        label: "Conflicts",
        blurb: "Where the documents disagreed, and which figure the model trusted.",
        node: <Conflicts conflicts={model.conflicts} />,
      },
      {
        key: "assumptions",
        label: "Assumptions",
        blurb: "Every input with the document that won, and the ones no document states.",
        node: <Assumptions metrics={model.metrics} generatedFrom={model.generatedFrom} />,
      },
      {
        key: "capex",
        label: "CapEx",
        blurb: "The capital plan, reserved below NOI in every year.",
        node: <CapexPanel model={model} />,
      },
      {
        key: "cashflow",
        label: "Cash flow",
        blurb: "Gross rent down through vacancy, expenses, reserves and debt service, year by year.",
        node: <CashFlow cashFlow={model.cashFlow} defaultOpen />,
      },
    ],
    [model],
  );

  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  // Under reduced motion nothing ever plays — reflect that in the control
  // instead of showing a pause button for a stopped show. On a phone the
  // section is only as tall as the slide showing (see the grid below), so
  // autoplay would reflow the page under the reader's thumb: there the
  // reader steps through by hand.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        window.matchMedia("(max-width: 639px)").matches
      ) {
        setAuto(false);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 639px)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) setIndex((v) => (v + 1) % slides.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [auto, slides.length]);

  function goTo(next: number) {
    setAuto(false); // the reader has taken the wheel
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }

  return (
    <section aria-roledescription="carousel" aria-label="Inside the generated model">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-caution/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-caution">
          Illustrative sample
        </span>
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
      {/* Step pills double as slide labels and direct navigation — the tabs
          pattern whole: arrow keys, Home and End, one tab stop, each tied to
          its slide (research pass 33: the arrow keys had done nothing). */}
      <div
        role="tablist"
        aria-label="Model views"
        onKeyDown={(e) => {
          const n = slides.length;
          const next =
            e.key === "ArrowRight" ? (index + 1) % n : e.key === "ArrowLeft" ? (index - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
          if (next < 0) return;
          e.preventDefault();
          goTo(next);
          document.getElementById(`model-tab-${slides[next].key}`)?.focus();
        }}
        className="mt-4 flex flex-wrap gap-1.5"
      >
        {slides.map((s, i) => (
          <button
            key={s.key}
            id={`model-tab-${s.key}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`model-panel-${s.key}`}
            tabIndex={i === index ? 0 : -1}
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

      {/* From the sm breakpoint up every slide stays mounted in the same grid
          cell, so the section is always as tall as the TALLEST slide and
          autoplay never reflows the page under the reader. On a phone that
          reservation is a screen of blank space under the compact Returns
          slide (the cash-flow table is the tall one), so there the inactive
          slides are display:none and autoplay is off. */}
      <div
        className="mt-4 grid grid-cols-[minmax(0,1fr)]"
        // A hand on a slide's own controls (the stress test's sliders, the
        // cash flow's fold) stops the show under it.
        onPointerDown={() => setAuto(false)}
        onFocusCapture={() => setAuto(false)}
      >
        {slides.map((s, i) => (
          <div
            key={s.key}
            id={`model-panel-${s.key}`}
            role="tabpanel"
            aria-labelledby={`model-tab-${s.key}`}
            aria-hidden={i !== index}
            className={`col-start-1 row-start-1 min-w-0 ${
              i === index ? "animate-fade" : "hidden pointer-events-none sm:invisible sm:block"
            }`}
          >
            <p className="mb-3 text-sm leading-relaxed text-muted">{s.blurb}</p>
            {s.node}
          </div>
        ))}
      </div>

      {/* The card's foot, as the deal page's card ends: its workbook, here
          the public sample's, and the sentence that says it is the other
          model (model-view's own words). */}
      <div className="mt-6 flex flex-col gap-1.5">
        <a
          href="/api/demo/underwrite.xlsx"
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Download the OM underwrite model (.xlsx)
        </a>
        <p data-qa="demo-two-models" className="max-w-2xl text-xs leading-relaxed text-muted">
          The workbook is a separate model, built from the memorandum’s terms — its returns can differ from the ones
          above. The Overview’s sensitivity playground runs the workbook’s model, not this one.
        </p>
      </div>
    </section>
  );
}
