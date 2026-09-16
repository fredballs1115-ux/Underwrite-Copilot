"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { readFigure } from "@/lib/money";
import { analyzeStrip, readStrip } from "@/lib/tools/cashflow-math";
import { readDebt, testRefi } from "@/lib/tools/debt-math";
import { readLease, readOpex } from "@/lib/tools/lease-math";
import { buildStack } from "@/lib/tools/sources-uses";
import { readMix, totalMix } from "@/lib/tools/unit-mix";
import { runWaterfall } from "@/lib/tools/waterfall-math";
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
 * The calculations an analyst leaves a screening tool to do.
 *
 * All of it runs in the browser off the pure modules in lib/tools — no
 * request, no database, nothing stored. That is worth saying on the page,
 * because the reason people paste deal numbers into a spreadsheet instead of
 * a website is that they do not want the numbers going anywhere.
 *
 * Each tool answers with a PICTURE first and the figure second, which is the
 * house rule: the debt sizer draws its three tests as bars so the binding one
 * is visible before it is read, the build-or-buy tool draws its spread from a
 * centre line so a negative one looks wrong rather than merely reading as a
 * smaller number, and the loan schedule draws each year's debt service split
 * into interest and principal, because the widening principal sliver is the
 * only way to see that amortisation is equity rather than cost.
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


// ── the link ───────────────────────────────────────────────────────────────

/**
 * Every field's value in the URL, so a sizing is a link.
 *
 * "Send me that" is the sentence this exists for. An analyst who has just
 * dragged a loan to where it works has to be able to paste it into a
 * message, and a calculator whose state lives only in its own inputs makes
 * them screenshot it instead.
 *
 * It is deliberately NOT the Next router. `history.replaceState` writes the
 * query string without a navigation, so nothing re-renders on the server
 * and — replace, not push — the Back button still leaves the page rather
 * than walking back through the keystrokes.
 *
 * The URL is read in an effect rather than during render: reading
 * `window.location` while rendering makes the server's HTML and the
 * browser's first paint disagree, which React calls a hydration error and a
 * reader sees as a flash of the wrong numbers. So a shared link paints the
 * seeded figures for one frame and then its own.
 */
/** The page's live field values, and the subscribers to tell when one moves. */
const live = new Map<string, string>();
const seeded = new Map<string, string>();
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function writeUrl() {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  // Only what differs from the seed: an untouched page copies as a bare
  // /tools, not a paragraph of defaults.
  for (const [k, v] of live) if (v !== seeded.get(k)) q.set(k, v);
  const query = q.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/** One field's current value in the browser: the URL's, else the seed. */
function snapshot(key: string, initial: string): string {
  seeded.set(key, initial);
  if (!live.has(key)) {
    const fromUrl =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get(key);
    live.set(key, fromUrl ?? initial);
  }
  return live.get(key) ?? initial;
}

function useShared(key: string, initial: string): [string, (v: string) => void] {
  // useSyncExternalStore rather than a useState + useEffect pair, and for
  // the reason the API exists: the server has no URL, so it renders the
  // seed, and the browser swaps in the link's own values on the render
  // after hydration. Reading window.location during render instead would
  // make the two disagree, which a reader sees as a flash of the wrong
  // numbers and React calls a hydration error.
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(key, initial),
    () => initial,
  );
  const set = useCallback(
    (next: string) => {
      live.set(key, next);
      for (const fn of listeners) fn();
      if (writeTimer) clearTimeout(writeTimer);
      // Debounced: every keystroke writing the URL is work nobody asked for.
      writeTimer = setTimeout(writeUrl, 400);
    },
    [key],
  );
  return [value, set];
}

/** A button that puts something on the clipboard and says it did. */
function CopyButton({
  label,
  text,
  className = "",
}: {
  label: string;
  /** computed at click time, so it is never a stale closure's copy */
  text: () => string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          // A browser that refuses the clipboard (no permission, insecure
          // origin) must not look like it worked.
          setDone(false);
        }
      }}
      className={`rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand ${className}`}
    >
      {done ? "Copied" : label}
    </button>
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
  const [price, setPrice] = useShared("p", "$20M");
  const [noi, setNoi] = useShared("noi", "1,200,000");
  const [rate, setRate] = useShared("r", "6.5");
  const [amort, setAmort] = useShared("am", "30");
  const [io, setIo] = useState(false);
  const [ltv, setLtv] = useShared("ltv", "65");
  const [dscr, setDscr] = useShared("dscr", "1.25");
  const [dy, setDy] = useShared("dy", "9");
  const [gpr, setGpr] = useShared("gpr", "2,000,000");
  const [opex, setOpex] = useShared("opex", "700,000");

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
                  {/* A hook, not a style: three of these bars exist and the
                      binding one must be countable on its own, now that
                      other cards on the page draw bars in the same colour. */}
                  <div
                    data-bar="lender-test"
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
  const [noi, setNoi] = useShared("cnoi", "1,200,000");
  const [price, setPrice] = useShared("cp", "$20M");
  const [cap, setCap] = useShared("cap", "");
  const [units, setUnits] = useShared("cu", "120");
  const [sf, setSf] = useShared("csf", "");

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
  const [land, setLand] = useShared("land", "$5M");
  const [hard, setHard] = useShared("hard", "$30M");
  const [soft, setSoft] = useShared("soft", "$6M");
  const [conting, setConting] = useShared("cont", "5");
  const [stabNoi, setStabNoi] = useShared("snoi", "2,975,000");
  const [exitCap, setExitCap] = useShared("xcap", "5.5");

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
  const [amount, setAmount] = useShared("amt", "36");
  const [sf, setSf] = useShared("rsf", "100,000");
  const [units, setUnits] = useShared("ru", "120");
  const [expenses, setExpenses] = useShared("exp", "12.50");

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


// ── 5. paste a cash flow ───────────────────────────────────────────────────

/**
 * The reason an analyst opens Excel mid-call: a column of numbers and the
 * question "what does that IRR to".
 *
 * The rate, the multiple, the profit and the payback are the easy half. The
 * half nothing else here does is the SPLIT — how much of the return is the
 * sale. A 17% that is three-quarters residual and a 17% that is a quarter
 * are different deals wearing the same number, and which one it is decides
 * how hard to argue about the exit cap.
 */
function CashFlowStrip() {
  const [raw, setRaw] = useShared(
    "cf",
    "-10,000,000\n650,000\n700,000\n750,000\n800,000\n15,200,000",
  );
  const [residual, setResidual] = useShared("res", "14,400,000");
  const [discount, setDiscount] = useShared("disc", "10");

  const read = useMemo(() => readStrip(raw), [raw]);
  const r = useMemo(
    () =>
      analyzeStrip(read.values, {
        discountPct: num(discount),
        residual: num(residual),
      }),
    [read.values, discount, residual],
  );

  // Every year drawn against the largest flow in the strip, from a centre
  // line, so the shape of the deal — one big outflow, a thin middle, a fat
  // exit — is visible before a single figure is read.
  const widest = Math.max(1, ...r.rows.map((x) => Math.abs(x.flow)));
  const split = r.fromResidualPct;

  return (
    <Card eyebrow="Returns" title="Paste a cash flow">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              The strip — year 0 first
            </span>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none transition-colors focus:border-brand"
            />
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Paste a column straight out of a model. Tabs, line breaks,
            {" "}
            <span className="font-mono">(1,200)</span> and{" "}
            <span className="font-mono">$1.2M</span> all read.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field
              label="Of which, the sale"
              value={residual}
              onChange={setResidual}
              placeholder="14,400,000"
            />
            <Field
              label="Discount rate"
              suffix="%"
              value={discount}
              onChange={setDiscount}
              placeholder="10"
            />
          </div>
          {read.skipped.length > 0 && (
            <p className="mt-2 text-xs text-caution">
              Ignored: {read.skipped.slice(0, 4).join(", ")}
              {read.skipped.length > 4 ? ` and ${read.skipped.length - 4} more` : ""}.
            </p>
          )}
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="IRR" value={pct(r.irrPct, 1)} tone="brand" />
            <Stat label="Equity multiple" value={mult(r.equityMultiple)} />
            <Stat label="Profit" value={usd(r.profit)} />
            <Stat
              label="Payback"
              value={r.paybackYears === null ? "—" : `${r.paybackYears.toFixed(1)} yr`}
            />
            <Stat label={`NPV at ${num(discount) ?? "—"}%`} value={usd(r.npv)} />
            <Stat label="Invested" value={usd(-r.invested)} tone="muted" />
          </div>

          {r.note && <p className="mt-3 text-sm text-caution">{r.note}</p>}

          {split !== null && (
            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Where the return comes from
              </p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-faint">
                <div className="bg-brand" style={{ width: `${100 - split}%` }} />
                <div className="bg-sidebar" style={{ width: `${split}%` }} />
              </div>
              <p className="mt-2 text-sm">
                <span className="font-semibold tabular-nums text-brand">
                  {Math.round(100 - split)}%
                </span>
                <span className="text-muted"> from cash flow, </span>
                <span className="font-semibold tabular-nums text-sidebar">
                  {Math.round(split)}%
                </span>
                <span className="text-muted">
                  {" "}
                  from the sale.{" "}
                  {split >= 70
                    ? "Most of this deal is the exit — the cap you sell at is the argument."
                    : split >= 40
                      ? "A balanced return; the exit matters but does not decide it."
                      : "The return is in the operations, so the exit cap is the smaller risk."}
                </span>
              </p>
            </div>
          )}

          {r.rows.length > 1 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="space-y-1.5">
                {r.rows.map((row) => (
                  <div key={row.year} className="flex items-center gap-3 text-xs">
                    <span className="w-10 shrink-0 text-muted">
                      {row.year === 0 ? "Now" : `Yr ${row.year}`}
                    </span>
                    <span className="relative h-2.5 flex-1 rounded-full bg-faint">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                      <span
                        className={`absolute inset-y-0 rounded-full ${
                          row.flow >= 0 ? "bg-brand" : "bg-kill"
                        }`}
                        style={
                          row.flow >= 0
                            ? { left: "50%", width: `${(row.flow / widest) * 50}%` }
                            : { right: "50%", width: `${(-row.flow / widest) * 50}%` }
                        }
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono tabular-nums">
                      {usd(row.flow)}
                    </span>
                    <span className="hidden w-24 shrink-0 text-right font-mono tabular-nums text-muted sm:block">
                      {usd(row.cumulative)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted">
                  Each year against the largest flow; the right column is the running total.
                </p>
                {/* Tab-delimited with headers, and the numbers RAW — no
                    dollar signs, no commas, no compacting to "$8.10M" — so
                    they land in a spreadsheet as numbers rather than as
                    text somebody then has to clean. That is the whole
                    point of a copy button on a table. */}
                <CopyButton
                  label="Copy as table"
                  text={() =>
                    ["Year\tCash flow\tCumulative"]
                      .concat(r.rows.map((x) => `${x.year}\t${x.flow}\t${x.cumulative}`))
                      .join("\n")
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}


// ── 6. net effective rent ──────────────────────────────────────────────────

/**
 * What a lease is worth after what it cost to sign.
 *
 * Every office and industrial rent in an OM is a STARTING rent, and the
 * gap to net effective is where the broker's number lives. The picture is
 * the point: the face rent as a bar, with the free months, the tenant
 * improvements and the commission taken out of it in their own colours, so
 * the size of the concession is visible before the figure is read.
 */
function NetEffectiveRent() {
  const [months, setMonths] = useShared("lt", "120");
  const [rent, setRent] = useShared("lr", "36");
  const [free, setFree] = useShared("lf", "12");
  const [ti, setTi] = useShared("lti", "90");
  const [lc, setLc] = useShared("llc", "4");
  const [esc, setEsc] = useShared("lesc", "3");
  const [disc, setDisc] = useShared("ldisc", "8");

  const r = useMemo(
    () =>
      readLease({
        months: num(months),
        startingRentPsf: num(rent),
        freeMonths: num(free),
        tiPsf: num(ti),
        lcPct: num(lc),
        escalationPct: num(esc),
        discountPct: num(disc),
      }),
    [months, rent, free, ti, lc, esc, disc],
  );

  const gross = r.grossRentPsf ?? 0;
  const cost = r.costOfDeal;
  const share = (n: number) => (gross > 0 ? Math.max(0, (n / gross) * 100) : 0);

  return (
    <Card eyebrow="Leasing" title="What the lease is really worth">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Term" suffix="mo" value={months} onChange={setMonths} placeholder="120" />
        <Field label="Starting rent" suffix="/SF" value={rent} onChange={setRent} placeholder="36" />
        <Field label="Free rent" suffix="mo" value={free} onChange={setFree} placeholder="12" />
        <Field label="TI" suffix="/SF" value={ti} onChange={setTi} placeholder="90" />
        <Field label="Commission" suffix="%" value={lc} onChange={setLc} placeholder="4" />
        <Field label="Escalation" suffix="%" value={esc} onChange={setEsc} placeholder="3" />
        <Field label="Discount rate" suffix="%" value={disc} onChange={setDisc} placeholder="8" />
      </div>

      {r.nerPsfYr === null ? (
        <p className="mt-6 rounded-lg bg-faint px-4 py-3 text-sm text-muted">{r.note}</p>
      ) : (
        <>
          {cost && gross > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Where the face rent goes
              </p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-faint">
                <div
                  className="bg-brand"
                  style={{ width: `${share(Math.max(0, r.netPsf ?? 0))}%` }}
                />
                <div className="bg-caution" style={{ width: `${share(cost.free)}%` }} />
                <div className="bg-sidebar" style={{ width: `${share(cost.ti)}%` }} />
                <div className="bg-line" style={{ width: `${share(cost.lc)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                <span className="font-semibold text-brand">kept</span>
                {" · "}
                <span className="font-semibold text-caution">free rent</span>
                {" · "}
                <span className="font-semibold text-sidebar">TI</span>
                {" · "}
                <span className="font-semibold">commission</span>
              </p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Net effective"
              value={r.nerPsfYr === null ? "—" : `$${r.nerPsfYr.toFixed(2)}`}
              tone="brand"
            />
            <Stat
              label="…discounted"
              value={
                r.discountedNerPsfYr === null ? "—" : `$${r.discountedNerPsfYr.toFixed(2)}`
              }
            />
            <Stat label="Below face" value={pct(r.discountToFacePct, 1)} />
            <Stat
              label="Collected / SF"
              value={r.collectedPsf === null ? "—" : `$${r.collectedPsf.toFixed(0)}`}
              tone="muted"
            />
            <Stat
              label="Cost to sign / SF"
              value={
                cost === null ? "—" : `$${(cost.free + cost.ti + cost.lc).toFixed(0)}`
              }
              tone="muted"
            />
          </div>

          <p className="mt-4 text-sm text-muted">
            The face rent is{" "}
            <span className="font-semibold tabular-nums text-ink">
              ${num(rent)?.toFixed(2) ?? "—"}
            </span>
            . Straight-line net effective is the simple one most memoranda quote;
            the discounted figure charges the landlord for waiting, so it is
            always the lower of the two on a deal with free rent up front.
          </p>
          {r.note && <p className="mt-2 text-sm text-caution">{r.note}</p>}
        </>
      )}
    </Card>
  );
}

// ── 7. one operating expense, three ways ───────────────────────────────────

function OpexTranslator() {
  const [opex, setOpex] = useShared("ox", "504,000");
  const [units, setUnits] = useShared("oxu", "120");
  const [sf, setSf] = useShared("oxsf", "96,000");
  const [egi, setEgi] = useShared("egi", "1,680,000");

  const r = useMemo(
    () => readOpex({ opex: num(opex), units: num(units), sf: num(sf), egi: num(egi) }),
    [opex, units, sf, egi],
  );
  const ratio = r.ratioPct;

  return (
    <Card eyebrow="Operations" title="One expense, three ways">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Operating expenses" value={opex} onChange={setOpex} placeholder="504,000" />
        <Field label="Units" value={units} onChange={setUnits} placeholder="120" />
        <Field label="Square feet" value={sf} onChange={setSf} placeholder="96,000" />
        <Field label="Effective gross income" value={egi} onChange={setEgi} placeholder="1,680,000" />
      </div>

      {ratio !== null && (
        <div className="mt-6">
          <div className="h-3 overflow-hidden rounded-full bg-faint">
            <div
              className={`h-full rounded-full ${ratio >= 100 ? "bg-kill" : "bg-brand"}`}
              style={{ width: `${Math.min(100, ratio)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            <span className="font-semibold tabular-nums text-ink">{ratio.toFixed(1)}%</span> of
            the income goes out as expenses.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Per unit" value={usdExact(r.perUnit)} tone="brand" />
        <Stat
          label="Per SF"
          value={r.perSf === null ? "—" : `$${r.perSf.toFixed(2)}`}
        />
        <Stat label="Expense ratio" value={pct(ratio, 1)} />
        <Stat label="NOI" value={usd(r.noi)} />
      </div>

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 8. sources and uses ────────────────────────────────────────────────────

/**
 * What the deal costs and where the money comes from.
 *
 * The picture is two bars of the SAME LENGTH, segmented — which is what
 * "the sides balance" means, said as a shape rather than as a pair of
 * totals a reader has to compare. The equity segment is the cheque, and
 * seeing it sit beside the purchase price is the point: $20M at 65% is not
 * $7M of equity once closing, capital and a reserve are counted.
 */
function SourcesUses() {
  const [price, setPrice] = useShared("sp", "$20M");
  const [capital, setCapital] = useShared("scap", "$3M");
  const [closing, setClosing] = useShared("scl", "2");
  const [reserve, setReserve] = useShared("sres", "500,000");
  const [other, setOther] = useShared("soth", "");
  const [loan, setLoan] = useShared("sln", "$13M");
  const [fee, setFee] = useShared("sfee", "1");

  const s = useMemo(
    () =>
      buildStack({
        price: num(price),
        capital: num(capital),
        closingPct: num(closing),
        closingAmount: null,
        reserve: num(reserve),
        other: num(other),
        loan: num(loan),
        loanFeePct: num(fee),
      }),
    [price, capital, closing, reserve, other, loan, fee],
  );

  // One palette per side, walked in order, so a segment's colour is stable
  // as figures move.
  const useTone = ["bg-brand", "bg-brand/70", "bg-brand/45", "bg-brand/30", "bg-brand/20", "bg-brand/10"];
  // Debt dark, equity in the brand colour. NOT bg-accent: globals.css
  // marks that token "dark surfaces only", and this card sits on white.
  const sourceTone = ["bg-sidebar", "bg-brand"];

  return (
    <Card eyebrow="Capital" title="Sources and uses">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Price" value={price} onChange={setPrice} placeholder="$20M" />
        <Field label="Capital" value={capital} onChange={setCapital} placeholder="$3M" />
        <Field label="Closing" suffix="%" value={closing} onChange={setClosing} placeholder="2" />
        <Field label="Reserves" value={reserve} onChange={setReserve} placeholder="500,000" />
        <Field label="Other" value={other} onChange={setOther} placeholder="—" />
        <Field label="Loan" value={loan} onChange={setLoan} placeholder="$13M" />
        <Field label="Loan fee" suffix="%" value={fee} onChange={setFee} placeholder="1" />
      </div>

      {s.totalUses > 0 && (
        <>
          <div className="mt-6 space-y-5">
            {[
              { side: "Uses", lines: s.uses, total: s.totalUses, tones: useTone },
              { side: "Sources", lines: s.sources, total: s.totalSources, tones: sourceTone },
            ].map((b) => (
              <div key={b.side}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{b.side}</span>
                  <span className="font-mono font-semibold tabular-nums">{usd(b.total)}</span>
                </div>
                {/* Both bars run the full width, because both sides are the
                    same total — that identity IS the balance. */}
                <div className="mt-1.5 flex h-4 w-full overflow-hidden rounded-full bg-faint">
                  {b.lines.map((l, i) => (
                    <div
                      key={l.label}
                      data-bar="stack"
                      className={`h-full ${b.tones[i % b.tones.length]}`}
                      style={{ width: `${Math.max(0, l.sharePct)}%` }}
                    />
                  ))}
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  {b.lines.map((l, i) => (
                    <span key={l.label} className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-sm ${b.tones[i % b.tones.length]}`}
                      />
                      {l.label} {usd(l.amount)}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="The cheque" value={usd(s.equity)} tone="brand" />
            <Stat label="Loan to cost" value={pct(s.loanToCostPct, 1)} />
            <Stat label="Loan to price" value={pct(s.loanToPricePct, 1)} tone="muted" />
            <Stat label="Over the price" value={pct(s.overPricePct, 1)} tone="muted" />
          </div>

          <p className="mt-4 text-sm text-muted">
            The price less the loan is {usd((num(price) ?? 0) - (num(loan) ?? 0))}. The cheque is{" "}
            <span className="font-semibold text-ink">{usd(s.equity)}</span> — everything below the
            purchase price is equity too, and it is where a screening model most often comes up
            short.
          </p>
        </>
      )}

      {s.note && <p className="mt-4 text-sm text-caution">{s.note}</p>}
    </Card>
  );
}

// ── 9. the unit mix ────────────────────────────────────────────────────────

/**
 * The table every multifamily memorandum prints, read into the four figures
 * an underwriter actually wants out of it.
 *
 * The picture is a row per unit type, width by unit count — so a mix that is
 * two-thirds one-bedrooms looks like it, rather than reading as one row of
 * four. Each row's in-place rent sits on a track with its market rent as a
 * tick, which is loss to lease drawn per type instead of only totalled.
 */
function UnitMix() {
  const [raw, setRaw] = useShared(
    "mix",
    "Studio\t24\t520\t1,395\t1,525\n1 Bed / 1 Bath\t60\t715\t1,650\t1,795\n2 Bed / 2 Bath\t48\t1,040\t2,150\t2,340\n3 Bed / 2 Bath\t12\t1,320\t2,650\t2,795",
  );

  const read = useMemo(() => readMix(raw), [raw]);
  const t = useMemo(() => totalMix(read.rows), [read.rows]);

  // Each row's bar is scaled to the highest rent in the table, so the types
  // are comparable to each other rather than each filling its own track.
  const topRent = Math.max(
    1,
    ...read.rows.flatMap((r) => [r.inPlace ?? 0, r.market ?? 0]),
  );

  return (
    <Card eyebrow="Multifamily" title="Read the unit mix">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Type, units, SF, in-place, market
            </span>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={7}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs tabular-nums outline-none transition-colors focus:border-brand"
            />
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Paste the table straight out of the memorandum. Leave the market
            column off and it reads the rest.
          </p>
          {read.skipped.length > 0 && (
            <p className="mt-2 text-xs text-caution">
              Ignored: {read.skipped.slice(0, 3).join(", ")}
              {read.skipped.length > 3 ? ` and ${read.skipped.length - 3} more` : ""}.
            </p>
          )}
        </div>

        <div>
          {t.units > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Units" value={t.units.toLocaleString("en-US")} />
                <Stat
                  label="Avg rent, weighted"
                  value={t.avgInPlace === null ? "—" : usdExact(t.avgInPlace)}
                />
                <Stat label="GPR, in place" value={usd(t.gprInPlace)} />
                <Stat
                  label="Loss to lease"
                  value={usd(t.lossToLease)}
                  tone={t.lossToLease && t.lossToLease > 0 ? "brand" : "ink"}
                />
              </div>

              {read.rows.length > 0 && (
                <div className="mt-5 space-y-2">
                  {read.rows.map((r) => (
                    <div key={`${r.label}|${r.units}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate">
                          <span className="font-medium">{r.label}</span>{" "}
                          <span className="text-muted">
                            · {r.units} {r.units === 1 ? "unit" : "units"}
                            {r.sf !== null && <> · {r.sf.toLocaleString("en-US")} SF</>}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {r.inPlace === null ? "—" : usdExact(r.inPlace)}
                          {r.market !== null && (
                            <span className="text-muted"> → {usdExact(r.market)}</span>
                          )}
                        </span>
                      </div>
                      {/* The row's width is its share of the building, so the
                          mix is visible before any figure is read. */}
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-faint"
                        style={{ width: `${Math.max(6, (r.units / t.units) * 100)}%` }}
                      >
                        <div
                          data-bar="mix-row"
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${((r.inPlace ?? 0) / topRent) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-muted">
                    Each row is as wide as its share of the building; the fill is
                    its rent against the highest in the table.
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Avg SF" value={t.avgSf === null ? "—" : t.avgSf.toLocaleString("en-US")} tone="muted" />
                <Stat
                  label="Rent / SF, in place"
                  value={t.inPlacePerSf === null ? "—" : `$${t.inPlacePerSf.toFixed(2)}`}
                  tone="muted"
                />
                <Stat label="GPR at market" value={usd(t.gprMarket)} tone="muted" />
                <Stat label="Under market by" value={pct(t.lossToLeasePct, 1)} tone="muted" />
              </div>
            </>
          )}

          {t.note && <p className="mt-4 text-sm text-caution">{t.note}</p>}
        </div>
      </div>
    </Card>
  );
}

// ── 10. the LP / GP split ──────────────────────────────────────────────────

/**
 * The property's IRR is not anybody's IRR.
 *
 * This is the calculation a deal page structurally cannot show, because it
 * depends on a term sheet rather than on the building. A deal at 16% with an
 * 8% pref and a 20% promote pays the LP nearer 14% and the GP nearer 30%,
 * and which of those is "the return" depends on which side of the table you
 * sit. An analyst who cannot run it here builds it in Excel, every time.
 *
 * It reads the SAME pasted strip as the cash-flow card above — the deal's
 * cash is the deal's cash — so the two answer the same column from two
 * different seats.
 */
function Waterfall() {
  const [raw, setRaw] = useShared(
    "wcf",
    "-10,000,000\n400,000\n500,000\n600,000\n15,000,000",
  );
  const [lpPct, setLpPct] = useShared("lp", "90");
  const [pref, setPref] = useShared("pref", "8");
  const [h1, setH1] = useShared("h1", "12");
  const [s1, setS1] = useShared("s1", "80");
  const [h2, setH2] = useShared("h2", "18");
  const [s2, setS2] = useShared("s2", "70");

  const read = useMemo(() => readStrip(raw), [raw]);
  const w = useMemo(
    () =>
      runWaterfall({
        cashFlows: read.values,
        lpEquityPct: num(lpPct),
        prefPct: num(pref),
        tiers: [
          { hurdlePct: num(h1) ?? NaN, lpSharePct: num(s1) ?? NaN },
          { hurdlePct: num(h2) ?? NaN, lpSharePct: num(s2) ?? NaN },
        ].filter((t) => Number.isFinite(t.hurdlePct) && Number.isFinite(t.lpSharePct)),
      }),
    [read.values, lpPct, pref, h1, s1, h2, s2],
  );

  const totalOut = w.lp.distributed + w.gp.distributed;

  return (
    <Card eyebrow="Structure" title="Who actually gets the return">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              The deal&apos;s cash — year 0 first
            </span>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none transition-colors focus:border-brand"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="LP equity" suffix="%" value={lpPct} onChange={setLpPct} placeholder="90" />
            <Field label="Pref" suffix="%" value={pref} onChange={setPref} placeholder="8" />
            <Field label="Hurdle 1" suffix="%" value={h1} onChange={setH1} placeholder="12" />
            <Field label="LP above it" suffix="%" value={s1} onChange={setS1} placeholder="80" />
            <Field label="Hurdle 2" suffix="%" value={h2} onChange={setH2} placeholder="18" />
            <Field label="LP above it" suffix="%" value={s2} onChange={setS2} placeholder="70" />
          </div>
        </div>

        <div>
          {w.dealIrrPct !== null && (
            <>
              {/* The three IRRs side by side is the whole argument: one
                  property, three different answers. */}
              <div className="grid grid-cols-3 gap-4">
                <Stat label="The property" value={pct(w.dealIrrPct, 1)} tone="muted" />
                <Stat label="The LP gets" value={pct(w.lp.irrPct, 1)} />
                <Stat label="The GP gets" value={pct(w.gp.irrPct, 1)} tone="brand" />
              </div>

              {totalOut > 0 && (
                <div className="mt-5">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Every dollar back, by tier
                  </p>
                  <div className="space-y-2">
                    {w.byTier.map((t) => (
                      <div key={t.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-muted">{t.label}</span>
                          <span className="font-mono tabular-nums">{usd(t.total)}</span>
                        </div>
                        <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-faint">
                          <div
                            data-bar="tier-lp"
                            className="h-full bg-brand"
                            style={{ width: `${(t.toLp / totalOut) * 100}%` }}
                          />
                          <div
                            data-bar="tier-gp"
                            className="h-full bg-sidebar"
                            style={{ width: `${(t.toGp / totalOut) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
                      To the LP
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sidebar" />
                      To the GP
                    </span>
                    <span>Each bar is its tier&apos;s share of everything distributed.</span>
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="LP multiple" value={mult(w.lp.multiple)} />
                <Stat label="GP multiple" value={mult(w.gp.multiple)} />
                <Stat label="The promote" value={usd(w.promote)} tone="brand" />
                <Stat label="LP gives up" value={`${Math.abs(w.lpDragPts ?? 0).toFixed(1)} pts`} tone="muted" />
              </div>

              <p className="mt-4 text-sm text-muted">
                {w.promote > 0 ? (
                  <>
                    The GP put in {usd(w.gp.contributed)} and takes {usd(w.gp.distributed)} —{" "}
                    <span className="font-semibold text-ink">{usd(w.promote)}</span> of that is
                    promote, above its share of the equity
                    {w.promoteSharePct !== null && <> and {pct(w.promoteSharePct, 0)} of the deal&apos;s profit</>}
                    .
                  </>
                ) : (
                  <>
                    The deal never clears the {trimPct(pref)}% pref, so there is no promote — the
                    GP takes its share of the equity and nothing more.
                  </>
                )}
              </p>
            </>
          )}

          {w.note && <p className="mt-2 text-sm text-caution">{w.note}</p>}
          {read.skipped.length > 0 && (
            <p className="mt-2 text-xs text-caution">
              Ignored: {read.skipped.slice(0, 4).join(", ")}
              {read.skipped.length > 4 ? ` and ${read.skipped.length - 4} more` : ""}.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** A percent the user typed, shown back without its trailing zeroes. */
const trimPct = (raw: string) => {
  const n = num(raw);
  return n === null ? raw : String(n);
};

// ── 11. what the loan does over the hold, and the refinance at the end ────

/**
 * These two read as one question, so they share a card and the schedule's
 * balloon feeds the refinance test directly — an analyst should never have
 * to retype a figure this page just computed.
 *
 * The picture is the year-by-year split of debt service into interest and
 * principal. It is the one thing about a loan that reading the payment
 * cannot tell you: year one of a thirty-year schedule is ~85% interest, and
 * the principal sliver widening across the columns is amortisation being
 * equity rather than cost.
 */
function LoanOverTime() {
  const [loan, setLoan] = useShared("dl", "$13M");
  const [rate, setRate] = useShared("dr", "6.5");
  const [amort, setAmort] = useShared("dam", "30");
  const [ioYears, setIoYears] = useShared("dio", "0");
  const [term, setTerm] = useShared("dt", "10");

  // The refinance's own inputs. The balloon is NOT among them: it comes from
  // the schedule above.
  const [noiRefi, setNoiRefi] = useShared("rn", "1,450,000");
  const [exitCap, setExitCap] = useShared("rc", "6.5");
  const [newRate, setNewRate] = useShared("rr", "7.25");
  const [newAmort, setNewAmort] = useShared("ram", "30");
  const [rLtv, setRLtv] = useShared("rltv", "65");
  const [rDscr, setRDscr] = useShared("rdscr", "1.25");
  const [rDy, setRDy] = useShared("rdy", "9");

  const d = useMemo(
    () =>
      readDebt({
        loan: num(loan),
        ratePct: num(rate),
        amortYears: num(amort),
        ioYears: num(ioYears),
        termYears: num(term),
      }),
    [loan, rate, amort, ioYears, term],
  );

  const r = useMemo(
    () =>
      testRefi({
        balloon: d.balloon,
        noiAtRefi: num(noiRefi),
        exitCapPct: num(exitCap),
        newRatePct: num(newRate),
        newAmortYears: num(newAmort),
        maxLtvPct: num(rLtv),
        minDscr: num(rDscr),
        minDebtYieldPct: num(rDy),
      }),
    [d.balloon, noiRefi, exitCap, newRate, newAmort, rLtv, rDscr, rDy],
  );

  // Every column is scaled to the biggest year's debt service, so the IO
  // years read as visibly cheaper rather than merely all-interest.
  const tallest = d.years.length ? Math.max(...d.years.map((y) => y.debtService)) : 0;
  const widest = Math.max(r.newLoan ?? 0, d.balloon ?? 0);

  const verdictTone =
    r.verdict === "cash out" ? "text-pass" : r.verdict === "cash in" ? "text-kill" : "text-ink";

  return (
    <Card eyebrow="Debt" title="What the loan does, and the refinance at the end">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Loan" value={loan} onChange={setLoan} placeholder="$13M" />
        <Field label="Rate" suffix="%" value={rate} onChange={setRate} placeholder="6.5" />
        <Field label="Amort" suffix="yr" value={amort} onChange={setAmort} placeholder="30" />
        <Field
          label="Interest-only"
          suffix="yr"
          value={ioYears}
          onChange={setIoYears}
          placeholder="0"
        />
        <Field label="Term" suffix="yr" value={term} onChange={setTerm} placeholder="10" />
      </div>

      {d.years.length > 0 && (
        <>
          <div className="mt-6">
            <div className="flex items-end gap-1 sm:gap-1.5" aria-hidden="true">
              {d.years.map((y) => {
                const h = tallest > 0 ? (y.debtService / tallest) * 100 : 0;
                const principalShare = y.debtService > 0 ? (y.principal / y.debtService) * 100 : 0;
                return (
                  <div key={y.year} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-faint"
                      style={{ height: "5rem" }}
                    >
                      <div className="w-full bg-brand" style={{ height: `${(h * principalShare) / 100}%` }} />
                      <div
                        className="w-full bg-brand/30"
                        style={{ height: `${(h * (100 - principalShare)) / 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted">{y.year}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand/30" />
                Interest
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
                Principal — equity, returned at sale
              </span>
              <span>Each column is one year of debt service.</span>
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label={d.amortisingPayment === null ? "Annual interest" : "Annual payment"}
              value={usdExact(d.amortisingPayment ?? d.ioPayment)}
            />
            <Stat label={`Balloon, year ${d.years.length}`} value={usd(d.balloon)} tone="brand" />
            <Stat label="Principal repaid" value={usd(d.principalPaid)} />
            <Stat label="Interest paid" value={usd(d.interestPaid)} tone="muted" />
          </div>

          <p className="mt-3 text-sm text-muted">
            {d.retiredInYear !== null ? (
              <>The loan retires itself in year {d.retiredInYear} — there is no balloon.</>
            ) : (
              <>
                {pct(d.paidOffPct, 1)} of the loan is repaid over the term
                {d.interestSharePct !== null && (
                  <>
                    ; {pct(d.interestSharePct, 0)} of everything paid is interest
                  </>
                )}
                .
              </>
            )}
          </p>
        </>
      )}

      {d.note && <p className="mt-3 text-sm text-caution">{d.note}</p>}

      {/* ── the refinance ── */}
      <div className="mt-8 border-t border-line pt-6">
        <h3 className="text-sm font-semibold">
          Can the balloon be refinanced?
        </h3>
        <p className="mt-1 text-sm text-muted">
          The take-out is sized on the same three tests as any loan, then held
          against what is owed.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Field label="NOI then" value={noiRefi} onChange={setNoiRefi} placeholder="1,450,000" />
          <Field label="Exit cap" suffix="%" value={exitCap} onChange={setExitCap} placeholder="6.5" />
          <Field label="New rate" suffix="%" value={newRate} onChange={setNewRate} placeholder="7.25" />
          <Field label="Amort" suffix="yr" value={newAmort} onChange={setNewAmort} placeholder="30" />
          <Field label="Max LTV" suffix="%" value={rLtv} onChange={setRLtv} placeholder="65" />
          <Field label="Min DSCR" suffix="x" value={rDscr} onChange={setRDscr} placeholder="1.25" />
          <Field label="Min debt yield" suffix="%" value={rDy} onChange={setRDy} placeholder="9" />
        </div>

        {r.newLoan !== null && widest > 0 && (
          <>
            <div className="mt-5 space-y-2.5">
              {[
                { label: "Owed at the balloon", amount: d.balloon ?? 0, tone: "bg-ink/25" },
                { label: "New loan", amount: r.newLoan, tone: "bg-brand" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-mono font-semibold tabular-nums">{usd(row.amount)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-faint">
                    <div
                      data-bar="refi"
                      className={`h-full rounded-full ${row.tone}`}
                      style={{ width: `${(row.amount / widest) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Value at refinance" value={usd(r.value)} />
              <Stat
                label={r.verdict === "cash in" ? "Cash in" : "Cash out"}
                value={usd(Math.abs(r.proceeds ?? 0))}
              />
              <Stat label="New LTV" value={pct(r.newLtvPct, 1)} tone="muted" />
              <Stat label="Binds on" value={r.binding?.label ?? "—"} tone="muted" />
            </div>

            <p className={`mt-4 text-sm font-medium ${verdictTone}`}>
              {r.verdict === "cash out" && (
                <>
                  The take-out covers the balloon and returns {usd(r.proceeds)} —
                  a cash-out refinance.
                </>
              )}
              {r.verdict === "covers it" && (
                <>The take-out covers the balloon almost exactly. No capital moves either way.</>
              )}
              {r.verdict === "cash in" && (
                <>
                  The take-out falls {usd(r.shortfall)} short — a cash-in refinance, written
                  the day the term is up.
                  {r.noiToClear !== null && (
                    <>
                      {" "}
                      NOI of {usdExact(r.noiToClear)} clears it on the{" "}
                      {r.binding?.label.toLowerCase()} test.
                    </>
                  )}
                </>
              )}
            </p>
          </>
        )}

        {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export function DealMathTools() {
  return (
    <div className="space-y-6">
      {/* "Send me that sizing" is the sentence this answers. Every field on
          the page writes itself into the query string (useShared), so the
          link carries the whole state of all five calculators — and carries
          only what was CHANGED, so an untouched page copies as a bare
          /tools rather than a paragraph of defaults. */}
      <div className="flex items-center justify-end">
        <CopyButton
          label="Copy link to this sizing"
          text={() => window.location.href}
        />
      </div>
      <DebtSizer />
      <LoanOverTime />
      <CashFlowStrip />
      <SourcesUses />
      <UnitMix />
      <Waterfall />
      <NetEffectiveRent />
      <div className="grid gap-6 lg:grid-cols-2">
        <CapTriangle />
        <RentConverter />
      </div>
      <OpexTranslator />
      <BuildOrBuy />
    </div>
  );
}
