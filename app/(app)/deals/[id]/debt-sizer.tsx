"use client";

import { useMemo, useState } from "react";
import { findMetric, parseMoney } from "@/lib/criteria";
import type { UnderwritingModel } from "@/lib/model/types";
import type { ExtractionResult } from "@/lib/anthropic/types";

/**
 * Deterministic debt sizer — pure lender math, no AI. Max loan is the most
 * restrictive of the three standard constraints:
 *
 *   LTV        loan ≤ price × max LTV
 *   DSCR       loan ≤ (NOI / min DSCR) / mortgage constant
 *   Debt yield loan ≤ NOI / min debt yield
 *
 * Seeded from the generated model when one exists (its loan terms + year-1
 * NOI), else from the OM extraction, else sensible screening defaults —
 * every figure stays editable.
 */

const fmtUsd = (n: number) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(n).toLocaleString("en-US")}`;

// Inputs seed with exact dollars ("$3,456,000"), not the compact display
// form — "$3.46M" would silently shave the sizing by the rounding.
const fmtInput = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Annual debt service per dollar of loan. r=0 degrades to principal-only. */
function mortgageConstant(ratePct: number, amortYears: number, io: boolean): number {
  if (io) return ratePct / 100;
  const r = ratePct / 100 / 12;
  const n = Math.round(amortYears * 12);
  if (n <= 0) return NaN;
  if (r === 0) return 12 / n;
  return (12 * r) / (1 - Math.pow(1 + r, -n));
}

interface Seed {
  price: number | null;
  noi: number | null;
  ratePct: number;
  amortYears: number;
  seededFrom: "model" | "extraction" | "defaults";
}

function deriveSeed(
  model: UnderwritingModel | null,
  extraction: ExtractionResult | null,
): Seed {
  if (model?.inputs) {
    return {
      price: model.inputs.purchasePrice || null,
      noi: model.cashFlow?.[0]?.noi ?? null,
      ratePct: model.inputs.loan?.ratePct ?? 6.5,
      amortYears: model.inputs.loan?.amortYears ?? 30,
      seededFrom: "model",
    };
  }
  const metrics = extraction?.metrics ?? [];
  const priceMetric = findMetric(
    metrics,
    /purchase price|asking price|\bprice\b/i,
    /unit|\/sf|per sf|per unit|psf/i,
  );
  const noiMetric = findMetric(metrics, /\bnoi\b/i, /margin|growth|debt/i);
  const price = priceMetric ? parseMoney(priceMetric.value) : null;
  const noi = noiMetric ? parseMoney(noiMetric.value) : null;
  return {
    price,
    noi,
    ratePct: 6.5,
    amortYears: 30,
    seededFrom: price != null || noi != null ? "extraction" : "defaults",
  };
}

export function DebtSizer({
  model,
  extraction,
}: {
  model: UnderwritingModel | null;
  extraction: ExtractionResult | null;
}) {
  const seed = useMemo(() => deriveSeed(model, extraction), [model, extraction]);

  // Money fields stay strings so "68m", "68,000,000" and "$68M" all work.
  const [priceRaw, setPriceRaw] = useState(seed.price != null ? fmtInput(seed.price) : "");
  const [noiRaw, setNoiRaw] = useState(seed.noi != null ? fmtInput(seed.noi) : "");
  const [ratePct, setRatePct] = useState(seed.ratePct);
  const [amortYears, setAmortYears] = useState(seed.amortYears);
  const [io, setIo] = useState(false);
  const [maxLtvPct, setMaxLtvPct] = useState(65);
  const [minDscr, setMinDscr] = useState(1.25);
  const [minDebtYieldPct, setMinDebtYieldPct] = useState(8);

  const price = parseMoney(priceRaw) ?? null;
  const noi = parseMoney(noiRaw) ?? null;

  const sized = useMemo(() => {
    const k = mortgageConstant(ratePct, amortYears, io);
    const rows: { key: string; label: string; detail: string; loan: number | null }[] = [
      {
        key: "ltv",
        label: `Max LTV ${maxLtvPct}%`,
        detail: price != null && price > 0 ? `${fmtUsd(price)} price` : "needs a price",
        loan:
          price != null && price > 0 && maxLtvPct > 0
            ? price * (maxLtvPct / 100)
            : null,
      },
      {
        key: "dscr",
        label: `Min DSCR ${minDscr.toFixed(2)}x`,
        detail:
          noi != null && noi > 0
            ? io
              ? `interest-only at ${ratePct}%`
              : `${amortYears}-yr amortization at ${ratePct}%`
            : "needs an NOI",
        loan:
          noi != null && noi > 0 && minDscr > 0 && isFinite(k) && k > 0
            ? noi / minDscr / k
            : null,
      },
      {
        key: "dy",
        label: `Min debt yield ${minDebtYieldPct}%`,
        detail: noi != null && noi > 0 ? `${fmtUsd(noi)} NOI` : "needs an NOI",
        loan:
          noi != null && noi > 0 && minDebtYieldPct > 0
            ? noi / (minDebtYieldPct / 100)
            : null,
      },
    ];
    const candidates = rows.filter((r) => r.loan != null && isFinite(r.loan));
    if (!candidates.length) return { rows, maxLoan: null, binding: null, k };
    const binding = candidates.reduce((a, b) => (a.loan! <= b.loan! ? a : b));
    return { rows, maxLoan: binding.loan!, binding: binding.key, k };
  }, [price, noi, ratePct, amortYears, io, maxLtvPct, minDscr, minDebtYieldPct]);

  const { rows, maxLoan, binding, k } = sized;
  const equity = maxLoan != null && price != null && price > 0 ? price - maxLoan : null;
  const effLtv = maxLoan != null && price != null && price > 0 ? (maxLoan / price) * 100 : null;
  const effDscr =
    maxLoan != null && noi != null && noi > 0 && isFinite(k) && k > 0
      ? noi / (maxLoan * k)
      : null;
  const effDy = maxLoan != null && noi != null && noi > 0 ? (noi / maxLoan) * 100 : null;

  const numCls =
    "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <details
      className="rounded-2xl border border-line bg-surface shadow-card"
      data-qa="debt-sizer"
    >
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          Debt sizer
          <span className="text-xs font-normal text-muted">
            what lender math supports — LTV, DSCR, debt yield
          </span>
        </span>
      </summary>
      <div className="border-t border-line p-5">
        <p className="text-sm text-muted">
          Deterministic — pure math on the figures below, no AI.{" "}
          {seed.seededFrom === "model"
            ? "Seeded from your generated model."
            : seed.seededFrom === "extraction"
              ? "Seeded from the OM extraction."
              : "Enter the deal's figures."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Price</span>
            <input value={priceRaw} onChange={(e) => setPriceRaw(e.target.value)} placeholder="$68M" inputMode="decimal" aria-label="Purchase price" className={numCls} />
            {priceRaw.trim() !== "" && price == null && (
              <span className="mt-0.5 block text-[11px] text-kill">Can&rsquo;t read that — try &ldquo;68m&rdquo;.</span>
            )}
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Year-1 NOI</span>
            <input value={noiRaw} onChange={(e) => setNoiRaw(e.target.value)} placeholder="$3.7M" inputMode="decimal" aria-label="Year-1 NOI" className={numCls} />
            {noiRaw.trim() !== "" && noi == null && (
              <span className="mt-0.5 block text-[11px] text-kill">Can&rsquo;t read that — try &ldquo;3.7m&rdquo;.</span>
            )}
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Rate %</span>
            <input type="number" step={0.05} min={0} max={20} value={ratePct} onChange={(e) => setRatePct(Number(e.target.value))} aria-label="Interest rate percent" className={numCls} />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Amort (yrs)</span>
            <input type="number" step={1} min={1} max={40} value={amortYears} onChange={(e) => setAmortYears(Number(e.target.value))} disabled={io} aria-label="Amortization years" className={`${numCls} disabled:opacity-50`} />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Max LTV %</span>
            <input type="number" step={1} min={1} max={100} value={maxLtvPct} onChange={(e) => setMaxLtvPct(Number(e.target.value))} aria-label="Maximum loan to value percent" className={numCls} />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Min DSCR</span>
            <input type="number" step={0.05} min={0.5} max={3} value={minDscr} onChange={(e) => setMinDscr(Number(e.target.value))} aria-label="Minimum debt service coverage ratio" className={numCls} />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Min debt yield %</span>
            <input type="number" step={0.25} min={1} max={25} value={minDebtYieldPct} onChange={(e) => setMinDebtYieldPct(Number(e.target.value))} aria-label="Minimum debt yield percent" className={numCls} />
          </label>
          <label className="flex items-end gap-2 pb-1.5">
            <input type="checkbox" checked={io} onChange={(e) => setIo(e.target.checked)} className="h-4 w-4 accent-brand" />
            <span className="text-sm">Interest-only</span>
          </label>
        </div>

        <ul className="mt-4 space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.key}
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2 text-sm ${
                binding === r.key ? "border-brand/40 bg-brand/5" : "border-line"
              }`}
            >
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-muted">{r.detail}</span>
              <span className="ml-auto font-mono text-sm tabular-nums">
                {r.loan != null && isFinite(r.loan) ? (
                  fmtUsd(r.loan)
                ) : (
                  <span className="text-muted">—</span>
                )}
              </span>
              {binding === r.key && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                  Binding
                </span>
              )}
            </li>
          ))}
        </ul>

        {maxLoan != null ? (
          <div className="mt-4 rounded-xl bg-faint p-4">
            <p className="text-sm">
              <span className="font-semibold">Max loan {fmtUsd(maxLoan)}</span>
              {equity != null && equity >= 0 && (
                <span className="text-muted"> · implied equity {fmtUsd(equity)}</span>
              )}
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted">
              At that loan:{" "}
              {[
                effLtv != null ? `${effLtv.toFixed(1)}% LTV` : null,
                effDscr != null ? `${effDscr.toFixed(2)}x DSCR` : null,
                effDy != null ? `${effDy.toFixed(1)}% debt yield` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Add a price or a year-1 NOI above and the sizing appears here.
          </p>
        )}
      </div>
    </details>
  );
}
