"use client";

import { useMemo, useState } from "react";
import { readFigure } from "@/lib/money";
import {
  breakEvenOccupancyPct,
  capRatePct,
  noiFromCap,
  per,
  rentQuote,
  sizeLoan,
  valueFromCap,
  yieldOnCost,
} from "@/lib/tools/deal-math";

/**
 * The four calculations an analyst leaves a screening tool to do.
 *
 * All of it runs in the browser off lib/tools/deal-math — no request, no
 * database, nothing stored. That is worth saying on the page, because the
 * reason people paste deal numbers into a spreadsheet instead of a website
 * is that they do not want the numbers going anywhere.
 *
 * Each tool answers with a PICTURE first and the figure second, which is the
 * house rule: the debt sizer draws its three tests as bars so the binding one
 * is visible before it is read, and the build-or-buy tool draws its spread
 * from a centre line so a negative one looks wrong rather than merely reading
 * as a smaller number.
 */

// ── the input layer ────────────────────────────────────────────────────────

// What someone types, read as a number. `readFigure` (lib/money) is the one
// reader behind every field here, and it takes the shorthand an analyst
// actually uses — "$20M", "500k", "1.2mm" — because a field that quietly
// ignores "$20M" answers a page of em dashes to a perfectly ordinary price.
const num = readFigure;

function Field({
  label,
  suffix,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="relative block">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm tabular-nums outline-none transition-colors focus:border-brand ${
            suffix ? "pr-9" : ""
          }`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

// ── the output layer ───────────────────────────────────────────────────────

const usd = (n: number | null) =>
  n === null
    ? "—"
    : Math.abs(n) >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString("en-US")}`;

const usdExact = (n: number | null) =>
  n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

const pct = (n: number | null, places = 2) =>
  n === null ? "—" : `${n.toFixed(places)}%`;

const mult = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}x`);

/** A figure with its name under it — the shape every result here takes. */
function Stat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "brand" | "muted";
}) {
  const colour =
    tone === "brand" ? "text-brand" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${colour}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ── 1. the debt sizer ──────────────────────────────────────────────────────

function DebtSizer() {
  const [price, setPrice] = useState("$20M");
  const [noi, setNoi] = useState("1,200,000");
  const [rate, setRate] = useState("6.5");
  const [amort, setAmort] = useState("30");
  const [io, setIo] = useState(false);
  const [ltv, setLtv] = useState("65");
  const [dscr, setDscr] = useState("1.25");
  const [dy, setDy] = useState("9");
  const [gpr, setGpr] = useState("2,000,000");
  const [opex, setOpex] = useState("700,000");

  const s = useMemo(
    () =>
      sizeLoan({
        price: num(price),
        noi: num(noi),
        ratePct: num(rate),
        amortYears: num(amort),
        io,
        maxLtvPct: num(ltv),
        minDscr: num(dscr),
        minDebtYieldPct: num(dy),
      }),
    [price, noi, rate, amort, io, ltv, dscr, dy],
  );

  const breakEven = breakEvenOccupancyPct(num(gpr), num(opex), s.annualDebtService);
  // Every bar is drawn against the most permissive test, so the binding one
  // is visibly the short bar rather than a number you have to compare.
  const widest = s.tests.length ? Math.max(...s.tests.map((t) => t.maxLoan)) : 0;
  const binding = s.tests.find((t) => t.binding);

  return (
    <Card eyebrow="Debt" title="Size the loan">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Price" value={price} onChange={setPrice} placeholder="$20M" />
        <Field label="NOI" value={noi} onChange={setNoi} placeholder="1,200,000" />
        <Field label="Rate" suffix="%" value={rate} onChange={setRate} placeholder="6.5" />
        <Field label="Amort" suffix="yr" value={amort} onChange={setAmort} placeholder="30" />
        <label className="flex items-end pb-2">
          <input
            type="checkbox"
            checked={io}
            onChange={(e) => setIo(e.target.checked)}
            className="mr-2 h-4 w-4 rounded border-line accent-brand"
          />
          <span className="text-sm">Interest only</span>
        </label>
      </div>

      <p className="mt-5 text-[11px] font-medium uppercase tracking-wide text-muted">
        Lender tests — leave one blank and it is not applied
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Field label="Max LTV" suffix="%" value={ltv} onChange={setLtv} placeholder="65" />
        <Field label="Min DSCR" suffix="x" value={dscr} onChange={setDscr} placeholder="1.25" />
        <Field label="Min debt yield" suffix="%" value={dy} onChange={setDy} placeholder="9" />
      </div>

      {s.tests.length === 0 ? (
        <p className="mt-6 rounded-lg bg-faint px-4 py-3 text-sm text-muted">
          Set at least one lender test above and the loan sizes itself.
        </p>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {s.tests.map((t) => (
              <div key={t.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className={t.binding ? "font-semibold text-ink" : "text-muted"}>
                    {t.label}
                    <span className="ml-2 text-xs text-muted">at {t.setAt}</span>
                  </span>
                  <span
                    className={`tabular-nums ${
                      t.binding ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    {usd(t.maxLoan)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-faint">
                  <div
                    className={`h-full rounded-full ${t.binding ? "bg-brand" : "bg-line"}`}
                    style={{
                      width: `${widest > 0 ? Math.max(2, (t.maxLoan / widest) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {binding ? (
            <p className="mt-4 text-sm text-ink">
              <span className="font-semibold">{binding.label}</span> governs at{" "}
              {binding.setAt}. That is the constraint to negotiate.
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Loan" value={usdExact(s.loan)} tone="brand" />
            <Stat label="Equity" value={usdExact(s.equity)} />
            <Stat label="Debt service / yr" value={usdExact(s.annualDebtService)} />
            <Stat label="DSCR" value={mult(s.dscr)} />
            <Stat label="Debt yield" value={pct(s.debtYieldPct)} />
            <Stat label="LTV" value={pct(s.ltvPct, 1)} />
          </div>
        </>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Break-even occupancy
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Gross potential rent" value={gpr} onChange={setGpr} />
          <Field label="Operating expenses" value={opex} onChange={setOpex} />
          <div className="col-span-2 flex items-end pb-1">
            <div>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  breakEven !== null && breakEven > 100 ? "text-kill" : "text-ink"
                }`}
              >
                {pct(breakEven, 1)}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {breakEven !== null && breakEven > 100
                  ? "does not cover even when full"
                  : "occupancy needed to cover opex and debt"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted">
        Mortgage constant{" "}
        {s.constant === null ? "—" : `${(s.constant * 100).toFixed(3)}%`} — the annual
        debt service each dollar of loan carries.
      </p>
    </Card>
  );
}

// ── 2. the cap rate triangle ───────────────────────────────────────────────

function CapTriangle() {
  const [noi, setNoi] = useState("1,200,000");
  const [price, setPrice] = useState("$20M");
  const [cap, setCap] = useState("");
  const [units, setUnits] = useState("120");
  const [sf, setSf] = useState("");

  const n = num(noi);
  const p = num(price);
  const c = num(cap);

  // Whichever slot is blank is the one that gets solved. Two blanks and
  // there is nothing to say — which is the honest answer, not a zero.
  const solved =
    c === null && n !== null && p !== null
      ? { key: "cap" as const, value: capRatePct(n, p) }
      : p === null && n !== null && c !== null
        ? { key: "price" as const, value: valueFromCap(n, c) }
        : n === null && p !== null && c !== null
          ? { key: "noi" as const, value: noiFromCap(p, c) }
          : null;

  const shownPrice = solved?.key === "price" ? solved.value : p;
  const perUnit = per(shownPrice, num(units));
  const perSf = per(shownPrice, num(sf));

  return (
    <Card eyebrow="Value" title="Cap rate, price, NOI">
      <p className="text-sm text-muted">Fill any two. The third solves.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="NOI" value={noi} onChange={setNoi} placeholder="1,200,000" />
        <Field label="Price" value={price} onChange={setPrice} placeholder="$20M" />
        <Field label="Cap rate" suffix="%" value={cap} onChange={setCap} placeholder="6.00" />
      </div>

      <div className="mt-5 rounded-xl bg-faint px-4 py-4">
        {solved && solved.value !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums text-brand">
              {solved.key === "cap"
                ? pct(solved.value)
                : usdExact(solved.value)}
            </span>
            <span className="text-sm text-muted">
              {solved.key === "cap"
                ? "going-in cap rate"
                : solved.key === "price"
                  ? "value at that cap"
                  : "NOI that price implies"}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Two of the three, and the third appears here.
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Units / keys" value={units} onChange={setUnits} placeholder="120" />
        <Field label="Square feet" value={sf} onChange={setSf} placeholder="100,000" />
        <div className="flex items-end pb-1">
          <Stat label="Per unit" value={usdExact(perUnit)} />
        </div>
        <div className="flex items-end pb-1">
          <Stat label="Per SF" value={perSf === null ? "—" : `$${perSf.toFixed(0)}`} />
        </div>
      </div>
    </Card>
  );
}

// ── 3. build or buy ────────────────────────────────────────────────────────

function BuildOrBuy() {
  const [land, setLand] = useState("$5M");
  const [hard, setHard] = useState("$30M");
  const [soft, setSoft] = useState("$6M");
  const [conting, setConting] = useState("5");
  const [stabNoi, setStabNoi] = useState("2,975,000");
  const [exitCap, setExitCap] = useState("5.5");

  const y = useMemo(
    () =>
      yieldOnCost(
        {
          land: num(land),
          hardCost: num(hard),
          softCost: num(soft),
          contingencyPct: num(conting),
        },
        num(stabNoi),
        num(exitCap),
      ),
    [land, hard, soft, conting, stabNoi, exitCap],
  );

  // The spread reads from a centre line: to the right it is the profit in
  // the trade, to the left there is no reason to take the risk. 300 bps of
  // travel each way covers the range anyone actually argues about.
  const SPAN = 300;
  const bps = y.spreadBps ?? 0;
  const reach = Math.min(50, (Math.abs(bps) / SPAN) * 50);
  const healthy = bps >= 0;

  return (
    <Card eyebrow="Development" title="Build or buy">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Land" value={land} onChange={setLand} />
        <Field label="Hard cost" value={hard} onChange={setHard} />
        <Field label="Soft cost" value={soft} onChange={setSoft} />
        <Field
          label="Contingency"
          suffix="%"
          value={conting}
          onChange={setConting}
          placeholder="5"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Stabilized NOI" value={stabNoi} onChange={setStabNoi} />
        <Field label="Exit cap" suffix="%" value={exitCap} onChange={setExitCap} />
        <div className="flex items-end pb-1">
          <Stat label="Contingency $" value={usdExact(y.contingency)} tone="muted" />
        </div>
        <div className="flex items-end pb-1">
          <Stat label="Total cost" value={usd(y.totalCost)} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-3xl font-semibold tabular-nums text-brand">
          {pct(y.yieldOnCostPct)}
        </span>
        <span className="text-sm text-muted">yield on cost</span>
      </div>

      {y.spreadBps !== null ? (
        <div className="mt-4">
          <div className="relative h-3 rounded-full bg-faint">
            <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
            <div
              className={`absolute inset-y-0 rounded-full ${
                healthy ? "bg-pass" : "bg-kill"
              }`}
              style={
                healthy
                  ? { left: "50%", width: `${reach}%` }
                  : { right: "50%", width: `${reach}%` }
              }
            />
          </div>
          <p className="mt-2 text-sm">
            <span
              className={`font-semibold tabular-nums ${
                healthy ? "text-ink" : "text-kill"
              }`}
            >
              {bps > 0 ? "+" : ""}
              {bps} bps
            </span>
            <span className="text-muted">
              {" "}
              over the exit cap.{" "}
              {bps >= 150
                ? "That is a spread worth building into."
                : bps >= 0
                  ? "Thin — the risk is not obviously paid for."
                  : "Below the cap it would sell at. There is no trade here."}
            </span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}

// ── 4. one rent, four ways ─────────────────────────────────────────────────

function RentConverter() {
  const [basis, setBasis] = useState<"perSfYear" | "perSfMonth" | "perUnitMonth">(
    "perSfYear",
  );
  const [amount, setAmount] = useState("36");
  const [sf, setSf] = useState("100,000");
  const [units, setUnits] = useState("120");
  const [expenses, setExpenses] = useState("12.50");

  const q = useMemo(
    () =>
      rentQuote({
        [basis]: num(amount),
        sf: num(sf),
        units: num(units),
      }),
    [basis, amount, sf, units],
  );

  const exp = num(expenses);
  const gross = q.perSfYear !== null && exp !== null ? q.perSfYear + exp : null;

  const BASES: Array<{ key: typeof basis; label: string }> = [
    { key: "perSfYear", label: "$ / SF / yr" },
    { key: "perSfMonth", label: "$ / SF / mo" },
    { key: "perUnitMonth", label: "$ / unit / mo" },
  ];

  return (
    <Card eyebrow="Rent" title="One rent, four ways">
      <div className="flex flex-wrap gap-2">
        {BASES.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBasis(b.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              basis === b.key
                ? "bg-brand text-white"
                : "bg-faint text-muted hover:text-ink"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Amount" value={amount} onChange={setAmount} />
        <Field label="Square feet" value={sf} onChange={setSf} />
        <Field label="Units" value={units} onChange={setUnits} />
        <Field
          label="Expense load"
          suffix="/SF"
          value={expenses}
          onChange={setExpenses}
          placeholder="12.50"
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <Stat
          label="$ / SF / yr"
          value={q.perSfYear === null ? "—" : `$${q.perSfYear.toFixed(2)}`}
        />
        <Stat
          label="$ / SF / mo"
          value={q.perSfMonth === null ? "—" : `$${q.perSfMonth.toFixed(2)}`}
        />
        <Stat
          label="$ / unit / mo"
          value={q.perUnitMonth === null ? "—" : usdExact(q.perUnitMonth)}
        />
        <Stat label="Annual total" value={usd(q.annualTotal)} />
      </div>

      <p className="mt-4 text-sm text-muted">
        Gross equivalent of that net rent:{" "}
        <span className="font-semibold tabular-nums text-ink">
          {gross === null ? "—" : `$${gross.toFixed(2)}`}
        </span>{" "}
        per SF per year.
      </p>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export function DealMathTools() {
  return (
    <div className="space-y-6">
      <DebtSizer />
      <div className="grid gap-6 lg:grid-cols-2">
        <CapTriangle />
        <RentConverter />
      </div>
      <BuildOrBuy />
    </div>
  );
}
