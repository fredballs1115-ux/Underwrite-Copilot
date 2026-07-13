"use client";

import { useMemo, useState } from "react";
import { findMetric, parseMoney } from "@/lib/criteria";
import type { UnderwritingModel } from "@/lib/model/types";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type { ExtractionResult } from "@/lib/anthropic/types";

/**
 * Debt & financing — every loan number a screen needs, all deterministic
 * client math (no AI):
 *
 *   · loan terms the OM itself states, with page references
 *   · the debt sizer: max loan under the most restrictive of LTV / DSCR /
 *     debt yield, binding constraint flagged, implied equity
 *   · payment breakdown at that loan (monthly, annual, year-1 I/P split)
 *   · rate sensitivity: sizing and coverage at −50 / +50 / +100 bps
 *   · breakeven occupancy vs the underwritten economics (model required)
 *   · an amortization preview across the hold
 *
 * Seeded from the generated model when one exists, else the OM extraction,
 * else sensible screening defaults — every figure stays editable.
 */

const fmtUsd = (n: number) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(n).toLocaleString("en-US")}`;

// Tabular contexts keep a fixed two decimals so columns don't jitter
// ($2.26M / $2.23M / $2.20M, never $2.2M).
const fmtUsdCol = (n: number) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2)}M`
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

/** Exact first-year interest/principal split at a given loan. */
function paymentBreakdown(
  loan: number,
  ratePct: number,
  amortYears: number,
  io: boolean,
): { monthly: number; annual: number; interest1: number; principal1: number } {
  if (io) {
    const annual = loan * (ratePct / 100);
    return { monthly: annual / 12, annual, interest1: annual, principal1: 0 };
  }
  const r = ratePct / 100 / 12;
  const n = Math.round(amortYears * 12);
  const monthly = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
  let bal = loan;
  let interest1 = 0;
  let principal1 = 0;
  for (let m = 0; m < 12; m++) {
    const i = bal * r;
    const p = monthly - i;
    interest1 += i;
    principal1 += p;
    bal -= p;
  }
  return { monthly, annual: monthly * 12, interest1, principal1 };
}

/** Year-by-year balances at a given loan (interest-only stays flat). */
function amortPreview(
  loan: number,
  ratePct: number,
  amortYears: number,
  io: boolean,
  years: number,
): { year: number; begin: number; interest: number; principal: number; end: number }[] {
  const rows = [];
  const r = ratePct / 100 / 12;
  const n = Math.round(amortYears * 12);
  const monthly = io
    ? (loan * (ratePct / 100)) / 12
    : r === 0
      ? loan / n
      : (loan * r) / (1 - Math.pow(1 + r, -n));
  let bal = loan;
  for (let y = 1; y <= years; y++) {
    const begin = bal;
    let interest = 0;
    let principal = 0;
    for (let m = 0; m < 12; m++) {
      const i = io ? monthly : bal * r;
      const p = io ? 0 : monthly - i;
      interest += i;
      principal += p;
      bal -= p;
    }
    rows.push({ year: y, begin, interest, principal, end: bal });
  }
  return rows;
}

/** Loan terms the OM itself states — shown with their page references. */
function omLoanTerms(extraction: ExtractionResult | null) {
  const metrics = extraction?.metrics ?? [];
  const picks: { label: string; value: string; page?: string }[] = [];
  const take = (label: string, inc: RegExp, exc?: RegExp) => {
    const m = findMetric(metrics, inc, exc);
    if (m) picks.push({ label, value: m.value, page: (m as { page?: string }).page });
  };
  take("Loan amount", /loan amount|existing (debt|loan)|assumable (debt|loan)|first mortgage/i, /rate|ltv/i);
  take("LTV", /loan[- ]to[- ]value|\bltv\b/i);
  take("Rate", /interest rate|\bloan rate\b|\bcoupon\b/i, /cap ?rate|growth|tax|vacancy/i);
  take("Amortization", /amortiz/i);
  take("Interest-only", /interest[- ]only|\bi\/?o\b period/i);
  take("Maturity", /maturity|loan term/i, /amortiz/i);
  return picks;
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

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-wider text-muted">
      {children}
    </h3>
  );
}

export function DebtSizer({
  model,
  extraction,
  underwrite = null,
}: {
  model: UnderwritingModel | null;
  extraction: ExtractionResult | null;
  /** the derived screening model — carries the capital plan (reserves, TI,
   *  LC, year-1 capex) that rounds out the FINANCING & CAPITAL card */
  underwrite?: UnderwriteInputs | null;
}) {
  const seed = useMemo(() => deriveSeed(model, extraction), [model, extraction]);
  const omTerms = useMemo(() => omLoanTerms(extraction), [extraction]);

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

  /** Max loan under the three constraints at a given rate. */
  function sizeAt(rate: number): number | null {
    const k = mortgageConstant(rate, amortYears, io);
    const cands: number[] = [];
    if (price != null && price > 0 && maxLtvPct > 0) cands.push(price * (maxLtvPct / 100));
    if (noi != null && noi > 0 && minDscr > 0 && isFinite(k) && k > 0)
      cands.push(noi / minDscr / k);
    if (noi != null && noi > 0 && minDebtYieldPct > 0)
      cands.push(noi / (minDebtYieldPct / 100));
    return cands.length ? Math.min(...cands) : null;
  }

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

  const pay = maxLoan != null ? paymentBreakdown(maxLoan, ratePct, amortYears, io) : null;

  // Rate strip: re-size at each rate AND hold today's sizing to watch DSCR.
  const rateStrip = useMemo(() => {
    if (maxLoan == null) return [];
    const steps = [-0.5, 0, 0.5, 1.0];
    return steps
      .map((d) => {
        const rate = Math.round((ratePct + d) * 100) / 100;
        if (rate <= 0) return null;
        const sizedLoan = sizeAt(rate);
        const kAt = mortgageConstant(rate, amortYears, io);
        const dscrHeld =
          noi != null && noi > 0 && isFinite(kAt) && kAt > 0
            ? noi / (maxLoan * kAt)
            : null;
        return { d, rate, sizedLoan, dscrHeld };
      })
      .filter(Boolean) as { d: number; rate: number; sizedLoan: number | null; dscrHeld: number | null }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLoan, ratePct, amortYears, io, noi, price, maxLtvPct, minDscr, minDebtYieldPct]);

  // Breakeven occupancy needs the underwritten income structure — model only.
  const breakeven = useMemo(() => {
    const inp = model?.inputs;
    if (!inp || maxLoan == null || !inp.year1Gpr) return null;
    const ds = maxLoan * (isFinite(k) && k > 0 ? k : 0);
    if (!ds) return null;
    const needed =
      inp.year1Opex + (inp.capexReserveAnnual ?? 0) + ds - (inp.otherIncomeAnnual ?? 0);
    const occ = (needed / inp.year1Gpr) * 100;
    return {
      occ,
      underwritten: 100 - (inp.vacancyPct ?? 0),
    };
     
  }, [model, maxLoan, k]);

  const holdYears = model?.holdYears ?? 5;
  const amortRows =
    maxLoan != null ? amortPreview(maxLoan, ratePct, amortYears, io, Math.min(Math.max(holdYears, 3), 10)) : [];

  // The capital plan (Bug 11): reserves / TI / LC / year-1 capex from the
  // derived screening model, preferring the generated model's own reserve
  // line when one exists. Pure display of already-computed inputs.
  const capex = useMemo(() => {
    const uw = underwrite;
    const modelReserve = model?.inputs?.capexReserveAnnual;
    const reserveAnnual =
      modelReserve != null && modelReserve > 0
        ? modelReserve
        : uw && uw.rsf > 0 && uw.reservesPsf > 0
          ? uw.reservesPsf * uw.rsf
          : null;
    // Derive the /SF from the SAME annual figure the tile shows — mixing the
    // model's annual with the screen's default reservesPsf could print a
    // pair that doesn't divide ($100k/yr · $0.25/SF on 220k SF).
    const reservePsf =
      reserveAnnual != null && uw && uw.rsf > 0
        ? reserveAnnual / uw.rsf
        : uw && uw.reservesPsf > 0
          ? uw.reservesPsf
          : null;
    return {
      reserveAnnual,
      reservePsf,
      capYr1: uw ? uw.capitalImprovementsYr1 : null,
      tiPsf: uw && uw.tiPsf > 0 ? uw.tiPsf : null,
      lcPct: uw && uw.lcPct > 0 ? uw.lcPct : null,
      source:
        modelReserve != null && modelReserve > 0
          ? ("model" as const)
          : uw
            ? ("screen" as const)
            : null,
    };
  }, [model, underwrite]);

  const numCls =
    "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <details
      // OPEN by default and second in the tab (Bug 11): the debt story is a
      // first-class read, not an appendix — still collapsible for focus.
      open
      className="rounded-2xl border border-line border-l-4 border-l-brand bg-surface shadow-card"
      data-qa="debt-sizer"
    >
      <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            <span className="block text-xs font-medium uppercase tracking-wider text-muted">
              Financing &amp; capital
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Debt, coverage, and the capital plan
            </span>
          </span>
          <span className="text-xs font-normal text-muted">
            sizing, payments, rate sensitivity, capex — deterministic
          </span>
        </span>
      </summary>
      <div className="border-t border-line p-5">
        <p className="text-sm text-muted">
          Pure math on the figures below, no AI.{" "}
          {seed.seededFrom === "model"
            ? "Seeded from your generated model."
            : seed.seededFrom === "extraction"
              ? "Seeded from the OM extraction."
              : "Enter the deal's figures."}
        </p>

        {omTerms.length > 0 && (
          <>
            <SubHead>Financing stated in the OM</SubHead>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {omTerms.map((t) => (
                <li
                  key={t.label}
                  className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs"
                >
                  <span className="text-muted">{t.label}:</span>{" "}
                  <span className="font-mono font-medium tabular-nums">{t.value}</span>
                  {t.page && <span className="text-muted"> · {t.page}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <SubHead>Debt sizer</SubHead>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        {maxLoan != null && pay != null ? (
          <>
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

            <SubHead>Debt service at that loan</SubHead>
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Monthly payment", fmtUsd(pay.monthly)],
                  ["Annual debt service", fmtUsd(pay.annual)],
                  ["Year-1 interest", fmtUsd(pay.interest1)],
                  [
                    "Year-1 principal",
                    io ? "$0 (interest-only)" : fmtUsd(pay.principal1),
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            {rateStrip.length > 0 && (
              <>
                <SubHead>If rates move</SubHead>
                <div className="scroll-shadows-x mt-2 overflow-x-auto">
                  <table className="w-full min-w-105 text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted">
                        <th className="py-1.5 pr-3 font-medium">Rate</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Max loan re-sized</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Δ vs today</th>
                        <th className="py-1.5 text-right font-medium">DSCR holding today&rsquo;s loan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rateStrip.map((s) => (
                        <tr key={s.rate} className={s.d === 0 ? "bg-faint/60" : undefined}>
                          <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-xs tabular-nums">
                            {s.rate.toFixed(2)}%{s.d === 0 ? " (today)" : ""}
                          </td>
                          <td className="whitespace-nowrap py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                            {s.sizedLoan != null ? fmtUsdCol(s.sizedLoan) : "—"}
                          </td>
                          <td className={`whitespace-nowrap py-1.5 pr-3 text-right font-mono text-xs tabular-nums ${s.sizedLoan != null && s.sizedLoan < maxLoan ? "text-kill" : "text-muted"}`}>
                            {s.sizedLoan != null
                              ? `${s.sizedLoan >= maxLoan ? "+" : "−"}${fmtUsd(Math.abs(s.sizedLoan - maxLoan))}`
                              : "—"}
                          </td>
                          <td className={`whitespace-nowrap py-1.5 text-right font-mono text-xs tabular-nums ${s.dscrHeld != null && s.dscrHeld < minDscr ? "font-semibold text-kill" : ""}`}>
                            {s.dscrHeld != null ? `${s.dscrHeld.toFixed(2)}x` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {breakeven && (
              <>
                <SubHead>Breakeven occupancy</SubHead>
                <p className="mt-2 text-sm">
                  <span className="font-mono font-semibold tabular-nums">
                    {breakeven.occ.toFixed(1)}%
                  </span>{" "}
                  <span className="text-muted">
                    occupancy covers expenses, reserves, and this debt service —
                    the model underwrites {breakeven.underwritten.toFixed(0)}%.
                  </span>
                  {breakeven.occ >= breakeven.underwritten && (
                    <span className="font-medium text-kill">
                      {" "}
                      No cushion at this sizing.
                    </span>
                  )}
                </p>
              </>
            )}

            {amortRows.length > 0 && !io && (
              <details className="mt-5">
                <summary className="cursor-pointer list-none text-sm font-medium text-brand transition-colors hover:text-brand-strong [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                  Amortization preview ({amortRows.length} years)
                </summary>
                <div className="scroll-shadows-x mt-2 overflow-x-auto">
                  <table className="w-full min-w-105 text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted">
                        <th className="py-1.5 pr-3 font-medium">Year</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Opening balance</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Interest</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Principal</th>
                        <th className="py-1.5 text-right font-medium">Closing balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {amortRows.map((r) => (
                        <tr key={r.year}>
                          <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">{r.year}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">{fmtUsdCol(r.begin)}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">{fmtUsdCol(r.interest)}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">{fmtUsdCol(r.principal)}</td>
                          <td className="py-1.5 text-right font-mono text-xs tabular-nums">{fmtUsdCol(r.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Add a price or a year-1 NOI above and the sizing appears here.
          </p>
        )}

        <SubHead>Capital expenditures</SubHead>
        {capex.source ? (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  [
                    "Capital reserves",
                    capex.reserveAnnual != null
                      ? `${fmtUsd(capex.reserveAnnual)}/yr${
                          capex.reservePsf != null
                            ? ` · $${capex.reservePsf.toFixed(2)}/SF`
                            : ""
                        }`
                      : "—",
                  ],
                  [
                    "Year-1 capital plan",
                    capex.capYr1 != null
                      ? capex.capYr1 > 0
                        ? fmtUsd(capex.capYr1)
                        : "$0 underwritten"
                      : "—",
                  ],
                  [
                    "Tenant improvements",
                    capex.tiPsf != null ? `$${capex.tiPsf.toFixed(2)}/SF/yr` : "—",
                  ],
                  [
                    "Leasing commissions",
                    capex.lcPct != null
                      ? `${(capex.lcPct * 100).toFixed(1)}% of rent`
                      : "—",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">
              {capex.source === "model"
                ? "Reserves from your generated model; TI / LC from the derived screening model. Reserves are deducted below NOI."
                : "From the derived screening model — reserves are deducted below NOI."}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No capital figures yet — run the screen (or generate the model) and
            the reserve, TI / LC, and year-1 plan appear here.
          </p>
        )}
      </div>
    </details>
  );
}
