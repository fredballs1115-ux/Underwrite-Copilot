"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { readFigure } from "@/lib/money";
import { analyzeStrip, readStrip } from "@/lib/tools/cashflow-math";
import { readDebt, testRefi } from "@/lib/tools/debt-math";
import { readLease, readOpex } from "@/lib/tools/lease-math";
import { readAfterTax } from "@/lib/tools/after-tax";
import { EXCHANGE_DAYS, IDENTIFY_DAYS, readExchange } from "@/lib/tools/exchange-1031";
import { readRecovery } from "@/lib/tools/expense-recovery";
import { readPercentageRent } from "@/lib/tools/percentage-rent";
import { readProration } from "@/lib/tools/proration";
import { readGroundLease } from "@/lib/tools/ground-lease";
import { readBelief } from "@/lib/tools/what-you-believe";
import { readReassessment } from "@/lib/tools/tax-reassessment";
import { NO_SEEDS, type RateSeeds } from "@/lib/live-rates";
import { groupedTools } from "@/lib/tools/catalog";
import { readResidual } from "@/lib/tools/land-residual";
import { readLand, readSpace } from "@/lib/tools/measure-math";
import { readStack } from "@/lib/tools/capital-stack";
import { readTrailing } from "@/lib/tools/trailing-window";
import { readEgi } from "@/lib/tools/economic-occupancy";
import { readHold } from "@/lib/tools/hold-or-sell";
import { readBuyout } from "@/lib/tools/lease-buyout";
import { readDraw } from "@/lib/tools/construction-draw";
import { readFloating } from "@/lib/tools/floating-rate";
import { readPrepayment } from "@/lib/tools/prepayment";
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
      // `print:hidden` belongs here rather than at each call site: a copy
      // button on paper is dead ink under every circumstance, and a rule
      // that has to be remembered three times is a rule that gets missed
      // the fourth time.
      className={`rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand print:hidden ${className}`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

// ── the output layer ───────────────────────────────────────────────────────

// The sign goes OUTSIDE the dollar. Interpolating a negative straight in
// gives "$-385,213", which is not how money is written anywhere, and it
// shows up wherever a figure can legitimately go below zero — a stack
// oversized against its basis, a residual that does not work at any
// price, a defeasance that pays you. Ninety-odd call sites share these
// two helpers, so it is fixed once here.
const money = (n: number, body: (abs: number) => string) =>
  `${n < 0 ? "-" : ""}$${body(Math.abs(n))}`;

const usd = (n: number | null) =>
  n === null
    ? "—"
    : money(n, (a) =>
        a >= 1_000_000
          ? `${(a / 1_000_000).toFixed(2)}M`
          : Math.round(a).toLocaleString("en-US"),
      );

const usdExact = (n: number | null) =>
  n === null ? "—" : money(n, (a) => Math.round(a).toLocaleString("en-US"));

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

/**
 * A choice between two named conventions.
 *
 * A `<select>` with its own `<label>`, not a pair of unlabelled buttons:
 * `lib/a11y-source.test.ts` scans every page's source for a form control
 * with no accessible name, and a segmented control built from bare buttons
 * is exactly what it fails.
 */
function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="block w-full">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The page's index, in the order the cards appear.
 *
 * The list itself lives in `lib/tools/catalog.ts` because the HOMEPAGE
 * reads it too — it advertised "size a loan, or run the cap rate math"
 * long after this page had grown past that, and one list imported by both
 * makes that drift impossible rather than merely unlikely.
 *
 * The jump nav renders from it, and each Card takes its `id` from it. A
 * label here with no card is a link to nowhere — the accessibility lint
 * fails an in-page link whose target id is missing, and the render test
 * holds every href in this list up to the ids actually emitted, so the two
 * cannot drift apart silently.
 */
// The nav renders through `groupedTools()`, which filters this same list
// into the index's clusters — so the page still has exactly one source of
// truth for what is on it, reached one function further along.

function Card({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // The index links here, so leave room for the header rather than
      // landing with the eyebrow under it.
      //
      // On paper a card must not split: the bar and the figure it belongs
      // to would land on different sheets, which is worse than a short
      // page. Three cards are taller than a Letter page's ~883px of
      // content on their own (the loan schedule at 960, the exchange at
      // 1150, the reconciliation at 1114) — a browser cannot honour
      // break-inside on those and ignores it, which is the right
      // degradation and the reason this is safe to apply to all of them.
      className="scroll-mt-4 rounded-2xl border border-line bg-white p-5 sm:p-6 print:break-inside-avoid print:border-line"
    >
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
    <Card id="size-the-loan" eyebrow="Debt" title="Size the loan">
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
    <Card id="cap-rate-triangle" eyebrow="Value" title="Cap rate, price, NOI">
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
    <Card id="build-or-buy" eyebrow="Development" title="Build or buy">
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
    <Card id="rent-converter" eyebrow="Rent" title="One rent, four ways">
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
    <Card id="cash-flow-strip" eyebrow="Returns" title="Paste a cash flow">
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
                        data-bar="year"
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
    <Card id="net-effective-rent" eyebrow="Leasing" title="What the lease is really worth">
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

// ── 7a. the site, and what it carries ──────────────────────────────────────

/**
 * The measures printed on the first page of every offering memorandum.
 *
 * These are the smallest calculations on this site and the ones people most
 * reliably leave it for, because nobody keeps 43,560 in their head. Acres
 * and square feet are one measurement entered from whichever side the
 * document stated, and everything else — density, the floor area ratio
 * against the zoning limit, land per unit, the average unit, parking said
 * both ways — falls out of the same six fields.
 *
 * The picture is the built floor area inside what the zoning allows, so the
 * unbuilt part of a site is a visible gap rather than a subtraction.
 */
function SiteMeasures() {
  const [acres, setAcres] = useShared("sac", "2.5");
  const [landSf, setLandSf] = useShared("slsf", "");
  const [buildingSf, setBuildingSf] = useShared("sbsf", "165,000");
  const [units, setUnits] = useShared("sun", "180");
  const [spaces, setSpaces] = useShared("spk", "270");
  const [farLimit, setFarLimit] = useShared("sfar", "1.75");

  const r = useMemo(
    () =>
      readLand({
        acres: num(acres),
        landSf: num(landSf),
        buildingSf: num(buildingSf),
        units: num(units),
        spaces: num(spaces),
        farLimit: num(farLimit),
      }),
    [acres, landSf, buildingSf, units, spaces, farLimit],
  );

  const over = r.headroomSf !== null && r.headroomSf < 0;

  return (
    <Card id="the-site" eyebrow="The dirt" title="The site, and what it carries">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Acres" value={acres} onChange={setAcres} placeholder="2.5" />
        <Field label="or Land SF" value={landSf} onChange={setLandSf} placeholder="108,900" />
        <Field label="Building SF, gross" value={buildingSf} onChange={setBuildingSf} placeholder="165,000" />
        <Field label="Units" value={units} onChange={setUnits} placeholder="180" />
        <Field label="Parking spaces" value={spaces} onChange={setSpaces} placeholder="270" />
        <Field label="FAR allowed" value={farLimit} onChange={setFarLimit} placeholder="1.75" />
      </div>

      {r.landSf !== null && (
        <p className="mt-5 text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">
            {r.acres?.toLocaleString("en-US")} acres
          </span>{" "}
          is{" "}
          <span className="font-semibold tabular-nums text-ink">
            {r.landSf.toLocaleString("en-US")} SF
          </span>
          . One acre is 43,560 square feet.
        </p>
      )}

      {r.allowedSf !== null && r.far !== null && (
        <div className="mt-5">
          <div className="h-4 overflow-hidden rounded-full bg-faint">
            <div
              data-bar="far"
              className={`h-full rounded-full ${over ? "bg-kill" : "bg-brand"}`}
              style={{
                width: `${Math.min(100, ((r.far ?? 0) / (num(farLimit) || 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            Built at{" "}
            <span className="font-semibold tabular-nums text-ink">{r.far.toFixed(2)} FAR</span>{" "}
            of an allowed {num(farLimit)?.toFixed(2)} —{" "}
            {over ? (
              <span className="font-semibold tabular-nums text-kill">
                {Math.abs(r.headroomSf ?? 0).toLocaleString("en-US")} SF over the limit
              </span>
            ) : (
              <span className="font-semibold tabular-nums text-ink">
                {(r.headroomSf ?? 0).toLocaleString("en-US")} SF unbuilt
              </span>
            )}
            .
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Units / acre"
          value={r.unitsPerAcre === null ? "—" : r.unitsPerAcre.toFixed(1)}
          tone="brand"
        />
        <Stat
          label="Land SF / unit"
          value={r.landSfPerUnit === null ? "—" : r.landSfPerUnit.toLocaleString("en-US")}
        />
        <Stat
          label="Avg unit, gross"
          value={r.avgUnitSf === null ? "—" : `${r.avgUnitSf.toLocaleString("en-US")} SF`}
        />
        <Stat label="FAR" value={r.far === null ? "—" : r.far.toFixed(2)} />
        <Stat
          label="Spaces / unit"
          value={r.spacesPerUnit === null ? "—" : r.spacesPerUnit.toFixed(2)}
          tone="muted"
        />
        <Stat
          label="Spaces / 1,000 SF"
          value={r.spacesPer1000Sf === null ? "—" : r.spacesPer1000Sf.toFixed(2)}
          tone="muted"
        />
      </div>

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7b. what the land can be worth ─────────────────────────────────────────

/**
 * The one calculation on this page that solves for a price instead of
 * judging one.
 *
 * A developer looking at a site does not ask whether the asking price is
 * good; they ask what they can pay and still make their number. The answer
 * is whatever is left of the finished building's value after the cost of
 * building it and the return required for doing so — which makes the land a
 * SMALL difference between two LARGE numbers, and that is the whole point of
 * drawing it. The land segment is visibly the thin one, and the two shock
 * lines under the bar say what a quarter point or a 5% overrun does to it.
 */
function ResidualLand() {
  const [buildable, setBuildable] = useShared("rbsf", "165,000");
  const [units, setUnits] = useShared("run", "180");
  const [noi, setNoi] = useShared("rnoi", "4,200,000");
  const [exitCap, setExitCap] = useShared("rcap", "5.5");
  const [hardPerSf, setHardPerSf] = useShared("rhc", "270");
  const [softPct, setSoftPct] = useShared("rsc", "22");
  const [carry, setCarry] = useShared("rcy", "6");
  const [profit, setProfit] = useShared("rpc", "15");
  const [yoc, setYoc] = useShared("ryc", "6.25");

  const r = useMemo(
    () =>
      readResidual({
        buildableSf: num(buildable),
        units: num(units),
        stabilizedNoi: num(noi),
        exitCapPct: num(exitCap),
        hardCostPerSf: num(hardPerSf),
        softCostPct: num(softPct),
        carryPct: num(carry),
        profitOnCostPct: num(profit),
        targetYieldOnCostPct: num(yoc),
      }),
    [buildable, units, noi, exitCap, hardPerSf, softPct, carry, profit, yoc],
  );

  // The costs recede in one dark tone, the two things the deal is FOR — the
  // developer's margin and the land — come forward in the brand colour, and
  // the land is solid because it is the answer.
  const tone: Record<string, string> = {
    "Hard costs": "bg-sidebar",
    "Soft costs": "bg-sidebar/60",
    Carry: "bg-sidebar/35",
    "Developer profit": "bg-brand/40",
    Land: "bg-brand",
  };
  const negative = r.land !== null && r.land < 0;

  return (
    <Card id="residual-land" eyebrow="Development" title="What the land can be worth">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Buildable SF" value={buildable} onChange={setBuildable} placeholder="165,000" />
        <Field label="Units" value={units} onChange={setUnits} placeholder="180" />
        <Field label="Stabilized NOI" value={noi} onChange={setNoi} placeholder="4,200,000" />
        <Field label="Exit cap" suffix="%" value={exitCap} onChange={setExitCap} placeholder="5.5" />
        <Field label="Hard cost / SF" value={hardPerSf} onChange={setHardPerSf} placeholder="270" />
        <Field label="Soft, % of hard" suffix="%" value={softPct} onChange={setSoftPct} placeholder="22" />
        <Field label="Carry" suffix="%" value={carry} onChange={setCarry} placeholder="6" />
        <Field label="Profit on cost" suffix="%" value={profit} onChange={setProfit} placeholder="15" />
        <Field label="Target yield on cost" suffix="%" value={yoc} onChange={setYoc} placeholder="6.25" />
      </div>

      {r.lines.length > 0 && r.completedValue !== null && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">Finished building, at the exit cap</span>
            <span className="font-semibold tabular-nums">{usd(r.completedValue)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-faint">
            {r.lines.map((l) => (
              <div
                key={l.label}
                data-bar="residual"
                title={`${l.label} · ${usdExact(l.amount)}`}
                className={`h-full ${l.label === "Land" && negative ? "bg-kill" : tone[l.label]}`}
                style={{ width: `${Math.max(0, l.sharePct)}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {r.lines.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${
                    l.label === "Land" && negative ? "bg-kill" : tone[l.label]
                  }`}
                />
                <span className={l.label === "Land" ? "font-semibold" : "text-muted"}>
                  {l.label}
                </span>
                <span className="font-mono tabular-nums text-muted">{usd(l.amount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {r.land !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Land, residual" value={usd(r.land)} tone={negative ? "muted" : "brand"} />
          <Stat
            label="Per buildable SF"
            value={r.landPerBuildableSf === null ? "—" : `$${r.landPerBuildableSf.toFixed(2)}`}
          />
          <Stat label="Per unit" value={usdExact(r.landPerUnit)} />
          <Stat
            label="Binding test"
            value={r.binding === "profit" ? "Profit on cost" : r.binding === "yield" ? "Yield on cost" : "—"}
            tone="muted"
          />
        </div>
      )}

      {r.byProfit && r.byYield && (
        <p className="mt-4 text-sm text-muted">
          At {num(profit)?.toFixed(0)}% profit on cost the site is worth{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.byProfit.land)}</span>; at a{" "}
          {num(yoc)?.toFixed(2)}% yield on cost,{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.byYield.land)}</span>. You
          can only pay the lower of two tests you have agreed to meet.
        </p>
      )}

      {r.capShockLand !== null && r.costShockLand !== null && r.land !== null && r.land > 0 && (
        <p className="mt-3 text-sm text-muted">
          A quarter point wider on the exit cap takes it to{" "}
          <span className="font-semibold tabular-nums text-caution">{usd(r.capShockLand)}</span>; a
          5% overrun on the build, to{" "}
          <span className="font-semibold tabular-nums text-caution">{usd(r.costShockLand)}</span>.
          The land is a small difference between large numbers, so everything
          upstream of it arrives here multiplied — which is why a residual is a
          range and not a number.
        </p>
      )}

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7ba. the settlement statement ──────────────────────────────────────────

/**
 * Who owes whom on the day of closing.
 *
 * Every other card answers a question about whether to buy. This one comes
 * after yes — and it is the calculation people get BACKWARDS rather than
 * merely wrong, because two of its rules reverse the direction of a payment
 * depending on a fact about the jurisdiction rather than about the deal.
 *
 * The picture is therefore a signed one: each line draws from a centre,
 * right for a credit to the buyer and left for a credit to the seller, so
 * the direction is visible before any figure is read. Reading arrears as
 * advance does not change a number, it flips a bar.
 */
function Proration() {
  const [closing, setClosing] = useShared("pcd", "2026-04-15");
  const [taxStart, setTaxStart] = useShared("pts", "2026-01-01");
  const [taxEnd, setTaxEnd] = useShared("pte", "2026-12-31");
  const [taxAmount, setTaxAmount] = useShared("ptx", "240,000");
  const [timing, setTiming] = useShared("ptm", "arrears");
  const [dayTo, setDayTo] = useShared("pdy", "seller");
  const [rent, setRent] = useShared("prc", "150,000");
  const [deposits, setDeposits] = useShared("psd", "92,000");
  const [price, setPrice] = useShared("ppr", "$20M");
  const [escrow, setEscrow] = useShared("pem", "500,000");

  const r = useMemo(
    () =>
      readProration({
        closing: closing.trim() || null,
        taxPeriodStart: taxStart.trim() || null,
        taxPeriodEnd: taxEnd.trim() || null,
        taxAmount: num(taxAmount),
        taxTiming: timing === "advance" ? "advance" : "arrears",
        closingDayTo: dayTo === "buyer" ? "buyer" : "seller",
        rentCollected: num(rent),
        securityDeposits: num(deposits),
        price: num(price),
        deposit: num(escrow),
      }),
    [closing, taxStart, taxEnd, taxAmount, timing, dayTo, rent, deposits, price, escrow],
  );

  const widest = Math.max(1, ...r.lines.map((l) => l.amount));

  return (
    <Card id="closing-proration" eyebrow="Closing" title="Who owes whom at closing">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Closing date" value={closing} onChange={setClosing} placeholder="2026-04-15" />
        <Field label="Tax period start" value={taxStart} onChange={setTaxStart} placeholder="2026-01-01" />
        <Field label="Tax period end" value={taxEnd} onChange={setTaxEnd} placeholder="2026-12-31" />
        <Field label="Tax bill" value={taxAmount} onChange={setTaxAmount} placeholder="240,000" />
        <Choice
          label="Taxes paid"
          value={timing}
          onChange={setTiming}
          options={[
            { value: "arrears", label: "In arrears" },
            { value: "advance", label: "In advance" },
          ]}
        />
        <Choice
          label="Closing day charged to"
          value={dayTo}
          onChange={setDayTo}
          options={[
            { value: "seller", label: "The seller" },
            { value: "buyer", label: "The buyer" },
          ]}
        />
        <Field label="Rent collected, this month" value={rent} onChange={setRent} placeholder="150,000" />
        <Field label="Security deposits held" value={deposits} onChange={setDeposits} placeholder="92,000" />
        <Field label="Price" value={price} onChange={setPrice} placeholder="$20M" />
        <Field label="Earnest money in escrow" value={escrow} onChange={setEscrow} placeholder="500,000" />
      </div>

      {r.lines.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
            <span>To the seller</span>
            <span>To the buyer</span>
          </div>
          <div className="space-y-2">
            {r.lines.map((l) => (
              <div key={l.label}>
                {/* The label and the figure on one line, the note beneath.
                    Truncating them onto a single line loses the note at
                    phone width — and the note is the part that teaches: it
                    says WHY the money moves, which is the whole point of a
                    card about a payment people send the wrong way. */}
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{l.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">{usdExact(l.amount)}</span>
                </div>
                <p className="text-xs text-muted">{l.note}</p>
                {/* One track, a centre line, and the bar on the side the
                    money actually moves to. */}
                <div className="mt-1 flex h-2.5 items-stretch overflow-hidden rounded-full bg-faint">
                  <div className="flex w-1/2 justify-end">
                    {l.to === "seller" && (
                      <div
                        data-bar="proration"
                        className="h-full rounded-l-full bg-caution"
                        style={{ width: `${(l.amount / widest) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="w-px bg-line" />
                  <div className="flex w-1/2 justify-start">
                    {l.to === "buyer" && (
                      <div
                        data-bar="proration"
                        className="h-full rounded-r-full bg-brand"
                        style={{ width: `${(l.amount / widest) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.taxLine && r.taxPeriodDays !== null && (
        <p className="mt-4 text-sm text-muted">
          {timing === "advance" ? (
            <>
              The seller has already paid the whole period, so the{" "}
              <span className="font-semibold tabular-nums text-ink">{r.buyerDays}</span> days after
              closing come back to them. Paid{" "}
              <span className="font-semibold text-ink">in arrears</span> instead, the same bill
              would move{" "}
              <span className="font-semibold text-ink">to the buyer</span> — which is why the
              wrong reading misses by the sum of the two figures, not the difference.
            </>
          ) : (
            <>
              The bill is not paid yet, so the{" "}
              <span className="font-semibold tabular-nums text-ink">{r.sellerDays}</span> days the
              seller owned are handed to the buyer, who will pay the whole thing. Paid{" "}
              <span className="font-semibold text-ink">in advance</span> instead, the same bill
              would move{" "}
              <span className="font-semibold text-ink">to the seller</span> — which is why the
              wrong reading misses by the sum of the two figures, not the difference.
            </>
          )}
        </p>
      )}

      {r.netToBuyer !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Tax period" value={r.taxPeriodDays === null ? "—" : `${r.taxPeriodDays} days`} tone="muted" />
          <Stat
            label="Seller / buyer days"
            value={r.sellerDays === null ? "—" : `${r.sellerDays} / ${r.buyerDays}`}
            tone="muted"
          />
          <Stat label="Net credit to buyer" value={usdExact(r.netToBuyer)} tone="brand" />
          <Stat label="Buyer wires" value={usd(r.cashToClose)} />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7c. depreciation, and what the sale takes back ─────────────────────────

/**
 * The write-off while you hold, and the bill when you sell.
 *
 * Every other card here answers a question about the property. This one
 * answers a question about the OWNER, which is why it is the calculation
 * people most reliably leave a screening tool to do — and why the errors in
 * it are the largest on the page.
 *
 * The picture is the sale's tax bill split into its three rates, because
 * the single most expensive mistake is running the whole gain at the
 * capital gains rate. The line under it is the one the card exists for:
 * depreciation is a TIMING benefit, and what survives the sale is only the
 * gap between the rate that sheltered it and the rate that recaptures it.
 */
function AfterTax() {
  const [price, setPrice] = useShared("atp", "$20M");
  const [landPct, setLandPct] = useShared("atl", "25");
  const [life, setLife] = useShared("atlife", "27.5");
  const [segPct, setSegPct] = useShared("atseg", "0");
  const [bonus, setBonus] = useShared("atb", "0");
  const [noi, setNoi] = useShared("atnoi", "1,200,000");
  const [interest, setInterest] = useShared("ati", "845,000");
  const [hold, setHold] = useShared("ath", "10");
  const [sale, setSale] = useShared("ats", "$26M");
  const [ordinary, setOrdinary] = useShared("ator", "37");
  const [capGains, setCapGains] = useShared("atcg", "20");

  const terms = useMemo(
    () => ({
      price: num(price),
      landPct: num(landPct),
      lifeYears: num(life),
      costSegPct: num(segPct),
      costSegLifeYears: 5,
      bonusPct: num(bonus),
      noi: num(noi),
      interest: num(interest),
      holdYears: num(hold),
      salePrice: num(sale),
      ordinaryRatePct: num(ordinary),
      capGainsRatePct: num(capGains),
      recaptureRatePct: 25,
    }),
    [price, landPct, life, segPct, bonus, noi, interest, hold, sale, ordinary, capGains],
  );

  const r = useMemo(() => readAfterTax(terms), [terms]);
  // The same deal with no cost segregation, so the card can say what the
  // study actually bought — which on a long hold is often less than the
  // year-one number suggests.
  const plain = useMemo(
    () => readAfterTax({ ...terms, costSegPct: 0, bonusPct: 0 }),
    [terms],
  );
  const segOn = (num(segPct) ?? 0) > 0;

  const slice: { label: string; amount: number; rate: string; tone: string }[] = r.sale
    ? [
        {
          label: "Section 1245 recapture",
          amount: r.sale.ordinaryRecapture,
          rate: `${(num(ordinary) ?? 0).toFixed(0)}%`,
          tone: "bg-kill",
        },
        {
          label: "Unrecaptured 1250",
          amount: r.sale.unrecaptured1250,
          rate: "25%",
          tone: "bg-caution",
        },
        {
          label: "Capital gain",
          amount: r.sale.capitalGain,
          rate: `${(num(capGains) ?? 0).toFixed(0)}%`,
          tone: "bg-brand",
        },
      ].filter((x) => x.amount > 0)
    : [];
  const gain = r.totalGain ?? 0;

  return (
    <Card id="after-tax" eyebrow="After tax" title="Depreciation, and what the sale takes back">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Price" value={price} onChange={setPrice} placeholder="$20M" />
        <Field label="Land, % of price" suffix="%" value={landPct} onChange={setLandPct} placeholder="25" />
        <Field label="Life (27.5 or 39)" value={life} onChange={setLife} placeholder="27.5" />
        <Field label="Cost seg, % of price" suffix="%" value={segPct} onChange={setSegPct} placeholder="0" />
        <Field label="Bonus on that" suffix="%" value={bonus} onChange={setBonus} placeholder="0" />
        <Field label="NOI" value={noi} onChange={setNoi} placeholder="1,200,000" />
        <Field label="Interest" value={interest} onChange={setInterest} placeholder="845,000" />
        <Field label="Hold, years" value={hold} onChange={setHold} placeholder="10" />
        <Field label="Sale price" value={sale} onChange={setSale} placeholder="$26M" />
        <Field label="Ordinary rate" suffix="%" value={ordinary} onChange={setOrdinary} placeholder="37" />
        <Field label="Capital gains" suffix="%" value={capGains} onChange={setCapGains} placeholder="20" />
      </div>

      {r.yearOneTaxable !== null && (
        <p className="mt-5 text-sm text-muted">
          Land is never depreciable, so the basis is{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.depreciableBasis)}</span>,
          not the price. That writes off{" "}
          <span className="font-semibold tabular-nums text-ink">{usdExact(r.yearOneDepreciation)}</span>{" "}
          in year one and turns {usd(num(noi))} of NOI into{" "}
          {r.yearOneTaxable < 0 ? (
            <>
              {/* The sign goes in the words, not in front of the dollar
                  sign: "$-190,455" is not how anyone writes a loss. */}
              <span className="font-semibold tabular-nums text-brand">
                a {usdExact(Math.abs(r.yearOneTaxable))} paper loss
              </span>{" "}
              on a building that made money.
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums text-ink">
                {usdExact(r.yearOneTaxable)} of taxable income
              </span>
              .
            </>
          )}
        </p>
      )}

      {slice.length > 0 && gain > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">The gain at the sale, by the rate it is taxed at</span>
            <span className="font-semibold tabular-nums">{usd(gain)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-faint">
            {slice.map((s) => (
              <div
                key={s.label}
                data-bar="gain-slice"
                title={`${s.label} · ${usdExact(s.amount)} at ${s.rate}`}
                className={`h-full ${s.tone}`}
                style={{ width: `${Math.max(0, (s.amount / gain) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {slice.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-xs">
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${s.tone}`} />
                <span className="text-muted">{s.label}</span>
                <span className="font-mono tabular-nums">{usd(s.amount)}</span>
                <span className="text-muted">at {s.rate}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            Running the whole gain at the capital gains rate would say{" "}
            <span className="font-semibold tabular-nums text-ink">
              {usd(gain * ((num(capGains) ?? 0) / 100))}
            </span>
            . The bill is{" "}
            <span className="font-semibold tabular-nums text-kill">{usd(r.sale!.tax)}</span>,
            because what you depreciated comes back at a higher rate than what
            you made.
          </p>
        </div>
      )}

      {r.netOfRecapture !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Written off over the hold" value={usd(r.totalDepreciation)} />
          <Stat label="Worth, at your rate" value={usd(r.shelterValue)} tone="muted" />
          <Stat label="Taken back at the sale" value={usd((r.shelterValue ?? 0) - r.netOfRecapture)} tone="muted" />
          <Stat label="What you keep" value={usd(r.netOfRecapture)} tone="brand" />
        </div>
      )}

      {r.netOfRecapture !== null && (
        <p className="mt-4 text-sm text-muted">
          Depreciation is a <span className="font-semibold text-ink">timing</span> benefit,
          not a permanent one: shelter and recapture at the same rate and it nets
          to nothing. What survives here is the gap between the{" "}
          {(num(ordinary) ?? 0).toFixed(0)}% that sheltered it and the 25% that
          recaptures it — plus the time value of having had the money in
          between, which this does not count.
        </p>
      )}

      {segOn && plain.netOfRecapture !== null && r.netOfRecapture !== null && (
        <p className="mt-3 rounded-xl bg-faint p-3 text-sm text-muted">
          <span className="font-semibold text-ink">Cost segregation is not a free lunch.</span>{" "}
          It moves {usdExact(plain.yearOneDepreciation)} of year-one write-off up to{" "}
          {usdExact(r.yearOneDepreciation)} — but the carved-out part comes back
          under section 1245 at {(num(ordinary) ?? 0).toFixed(0)}%, not at 25%. In
          raw dollars this deal keeps{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.netOfRecapture)}</span>{" "}
          with the study against{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(plain.netOfRecapture)}</span>{" "}
          without it. The study wins on getting the money early, not on the total.
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        Screening arithmetic, federal only — no state tax, no passive-activity
        limits, no net investment income tax, and the mid-month convention is
        ignored. Not tax advice. Rolling the gain forward instead of paying it
        is the <a href="#exchange-1031" className="underline hover:text-brand">next card</a>.
      </p>

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7c-ii. the exchange, and what it actually defers ───────────────────────

/**
 * Rolling the gain into the next deal.
 *
 * The card above prices the bill at a sale; this one answers the question
 * that follows it. It sits here rather than anywhere else on the page
 * because the after-tax card's own fine print says it does not do a 1031 —
 * and an analyst reading that sentence is one scroll from needing this.
 *
 * The picture is three tests drawn as bars, the same grammar the debt sizer
 * uses, because an exchange is sized by whichever of the three binds — and
 * the seeded deal deliberately PASSES the price test while still owing tax.
 * That is the trap: trading up in price does not cure cash taken off the
 * table, and a tool that tests only the price says "fully deferred" on a
 * deal with a bill.
 *
 * The clock is drawn rather than listed, because the 45 and the 180 run
 * from the same day and a list of two dates hides that. The seeded closing
 * is in November so the shortened window shows on first load.
 */
function Exchange1031() {
  const [sale, setSale] = useShared("xsp", "$26M");
  const [costs, setCosts] = useShared("xsc", "780,000");
  const [basis, setBasis] = useShared("xab", "14,500,000");
  const [depreciation, setDepreciation] = useShared("xdp", "5,500,000");
  const [payoff, setPayoff] = useShared("xmp", "$12M");
  const [closing, setClosing] = useShared("xcd", "2026-11-15");
  const [replacement, setReplacement] = useShared("xrp", "$30M");
  const [newLoan, setNewLoan] = useShared("xnm", "$18M");
  const [recapture, setRecapture] = useShared("xrr", "25");
  const [capGains, setCapGains] = useShared("xcg", "20");

  const r = useMemo(
    () =>
      readExchange({
        salePrice: num(sale),
        sellingCosts: num(costs),
        adjustedBasis: num(basis),
        depreciationTaken: num(depreciation),
        mortgagePayoff: num(payoff),
        replacementPrice: num(replacement),
        newMortgage: num(newLoan),
        closing: closing.trim() || null,
        recaptureRatePct: num(recapture),
        capGainsRatePct: num(capGains),
      }),
    [sale, costs, basis, depreciation, payoff, replacement, newLoan, closing, recapture, capGains],
  );

  const gain = r.realizedGain ?? 0;

  return (
    <Card id="exchange-1031" eyebrow="Exchange" title="Roll it into the next deal">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Field label="Sale price" value={sale} onChange={setSale} placeholder="$26M" />
        <Field label="Costs of selling" value={costs} onChange={setCosts} placeholder="780,000" />
        <Field label="Adjusted basis" value={basis} onChange={setBasis} placeholder="14,500,000" />
        <Field
          label="Depreciation taken"
          value={depreciation}
          onChange={setDepreciation}
          placeholder="5,500,000"
        />
        <Field label="Loan paid off" value={payoff} onChange={setPayoff} placeholder="$12M" />
        <Field label="Replacement price" value={replacement} onChange={setReplacement} placeholder="$30M" />
        <Field label="New loan" value={newLoan} onChange={setNewLoan} placeholder="$18M" />
        <Field label="Closing date" value={closing} onChange={setClosing} placeholder="2026-11-15" />
        <Field label="Recapture rate" suffix="%" value={recapture} onChange={setRecapture} placeholder="25" />
        <Field label="Capital gains" suffix="%" value={capGains} onChange={setCapGains} placeholder="20" />
      </div>

      {r.tests.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted">
            Three tests, and the gain is fully deferred only when all three are met.
          </p>
          {r.tests.map((x) => {
            const share = x.required <= 0 ? 1 : Math.min(1, x.actual / x.required);
            return (
              <div key={x.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{x.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {usd(x.actual)} of {usd(x.required)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="exchange-test"
                    className={`h-full rounded-full ${x.met ? "bg-pass" : "bg-kill"}`}
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {x.met ? x.note : `Short by ${usdExact(x.shortfall)}. ${x.note}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {r.totalBoot !== null && gain > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">The gain, and where it goes</span>
            <span className="font-semibold tabular-nums">{usd(gain)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-faint">
            <div
              data-bar="gain-split"
              title={`Deferred · ${usdExact(r.deferredGain)}`}
              className="h-full bg-brand"
              style={{ width: `${((r.deferredGain ?? 0) / gain) * 100}%` }}
            />
            <div
              data-bar="gain-split"
              title={`Taxed now · ${usdExact(r.recognizedGain)}`}
              className="h-full bg-kill"
              style={{ width: `${((r.recognizedGain ?? 0) / gain) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
              <span className="text-muted">Rolled into the replacement</span>
              <span className="font-mono tabular-nums">{usd(r.deferredGain)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-kill" />
              <span className="text-muted">Taxed now, as boot</span>
              <span className="font-mono tabular-nums">{usd(r.recognizedGain)}</span>
            </span>
          </div>
        </div>
      )}

      {r.clock && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">The clock, both windows from the day you close</span>
            <span className="font-semibold tabular-nums">{r.clock.closeDays} days</span>
          </div>
          {/* The full 180 is the track. The identification deadline sits at
              45/180 of it, and anything the return's due date takes off the
              back is drawn as lost rather than left off — a window that got
              shorter is the thing a Q4 seller has to see. */}
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-3 flex h-2.5 overflow-hidden rounded-full bg-faint">
              <div
                data-bar="clock"
                className="h-full bg-brand/30"
                style={{ width: `${(IDENTIFY_DAYS / EXCHANGE_DAYS) * 100}%` }}
              />
              <div
                data-bar="clock"
                className="h-full bg-brand/60"
                style={{ width: `${((r.clock.closeDays - IDENTIFY_DAYS) / EXCHANGE_DAYS) * 100}%` }}
              />
              {r.clock.cutShort && (
                <div
                  data-bar="clock-lost"
                  className="h-full bg-kill/30"
                  style={{
                    width: `${((EXCHANGE_DAYS - r.clock.closeDays) / EXCHANGE_DAYS) * 100}%`,
                  }}
                />
              )}
            </div>
            <span
              aria-hidden="true"
              className="absolute top-2 h-4 w-px bg-ink"
              style={{ left: `${(IDENTIFY_DAYS / EXCHANGE_DAYS) * 100}%` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>
              <span className="text-muted">Identify by</span>{" "}
              <span className="font-mono tabular-nums">{r.clock.identifyBy}</span>
            </span>
            <span>
              <span className="text-muted">Close by</span>{" "}
              <span className="font-mono tabular-nums">{r.clock.closeBy}</span>
            </span>
          </div>
          {r.clock.cutShort && (
            <p className="mt-2 text-sm text-caution">
              This closing loses{" "}
              <span className="font-semibold tabular-nums">
                {EXCHANGE_DAYS - r.clock.closeDays} days
              </span>{" "}
              off the back of the window: the replacement has to be acquired before
              the return for {closing.slice(0, 4)} is filed, due{" "}
              <span className="font-mono tabular-nums">{r.clock.returnDueBy}</span>. An
              extension restores the full {EXCHANGE_DAYS} days, which is why a
              fourth-quarter exchange files one first.
            </p>
          )}
        </div>
      )}

      {r.tax && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {/* Boot is loud when there is any and quiet at zero — the one
              figure on the row whose SIZE is not the news, its existence
              is. */}
          <Stat label="Boot" value={usd(r.totalBoot)} tone={(r.totalBoot ?? 0) > 0 ? "ink" : "muted"} />
          <Stat label="Tax now" value={usdExact(r.tax.total)} />
          <Stat label="Tax deferred" value={usd(r.taxDeferred)} tone="brand" />
          <Stat label="Basis of the replacement" value={usd(r.newBasis)} tone="muted" />
        </div>
      )}

      {r.tax && r.newBasis !== null && (
        <p className="mt-4 text-sm text-muted">
          Deferred is not forgiven. The replacement cost{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(num(replacement))}</span>{" "}
          but carries a basis of{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.newBasis)}</span> — the
          rolled-in gain comes off it, so the depreciation on the new building runs
          on the old basis and the gain is standing there again at the next sale.
          What the exchange buys is the use of{" "}
          <span className="font-semibold tabular-nums text-ink">{usd(r.taxDeferred)}</span>{" "}
          in the meantime.
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        Screening arithmetic, federal only — and since 2017 only REAL property is
        like-kind, so anything a cost segregation study carved out is a taxable
        disposition of its own and is not counted here. No state tax, no net
        investment income tax, no related-party rules. Not tax advice.
      </p>

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7c-iii. the operating-expense reconciliation ───────────────────────────

/**
 * What the tenant actually owes when the statement lands.
 *
 * The most input-heavy card here, and it earns it: a reconciliation is
 * checked against a lease, and the lease has four separate levers in it.
 * The fields are grouped the way the lease is — the premises, the floor,
 * this year, the cap — rather than as one sixteen-box grid.
 *
 * Two pictures, because there are two questions. The two years drawn as
 * stacked bars answer "is the comparison fair", and the gross-up segment on
 * the base year is the whole story: on the seeded building it is $287,500
 * against $12,553 this year, because the base year was struck at 72%. The
 * honest share against the one-sided share answers "what is it worth to
 * catch it".
 */
function Recovery() {
  const [tenantSf, setTenantSf] = useShared("rts", "12,000");
  const [buildingSf, setBuildingSf] = useShared("rbs", "100,000");
  const [basis, setBasis] = useShared("rbasis", "base year");
  const [stop, setStop] = useShared("rstop", "16.00");
  const [baseFixed, setBaseFixed] = useShared("rbf", "640,000");
  const [baseVar, setBaseVar] = useShared("rbv", "900,000");
  const [baseOcc, setBaseOcc] = useShared("rbo", "72");
  const [curFixed, setCurFixed] = useShared("rcf", "720,000");
  const [curVar, setCurVar] = useShared("rcv", "1,180,000");
  const [curOcc, setCurOcc] = useShared("rco", "94");
  const [grossTo, setGrossTo] = useShared("rgu", "95");
  const [capPct, setCapPct] = useShared("rcap", "5");
  const [capType, setCapType] = useShared("rct", "cumulative");
  const [controllable, setControllable] = useShared("rctrl", "60");
  const [years, setYears] = useShared("ryr", "3");
  const [paid, setPaid] = useShared("rpaid", "30,000");

  const stopBasis = basis === "expense stop";

  const r = useMemo(
    () =>
      readRecovery({
        tenantSf: num(tenantSf),
        buildingSf: num(buildingSf),
        basis: stopBasis ? "expense stop" : "base year",
        base: { fixed: num(baseFixed), variable: num(baseVar), occupancyPct: num(baseOcc) },
        stopPerSf: num(stop),
        current: { fixed: num(curFixed), variable: num(curVar), occupancyPct: num(curOcc) },
        grossUpToPct: num(grossTo),
        capPct: num(capPct),
        capType:
          capType === "none" ? "none" : capType === "non-cumulative" ? "non-cumulative" : "cumulative",
        controllablePct: num(controllable),
        yearsSinceBase: num(years),
        estimatedPaid: num(paid),
      }),
    [
      tenantSf, buildingSf, stopBasis, baseFixed, baseVar, baseOcc,
      curFixed, curVar, curOcc, grossTo, capPct, capType, controllable, years, paid, stop,
    ],
  );

  // Both years on ONE scale, so the bars are comparable rather than merely
  // adjacent. The gross-up segment is the point of the picture.
  const widest = Math.max(1, r.baseGrossedUp ?? 0, r.currentGrossedUp ?? 0);
  const yearBars = [
    {
      label: stopBasis ? "The stop" : "Base year",
      fixed: stopBasis ? 0 : num(baseFixed) ?? 0,
      variable: stopBasis ? r.baseGrossedUp ?? 0 : num(baseVar) ?? 0,
      adj: r.baseGrossUpAdj ?? 0,
      occ: stopBasis ? null : num(baseOcc),
    },
    {
      label: "This year",
      fixed: num(curFixed) ?? 0,
      variable: num(curVar) ?? 0,
      adj: r.currentGrossUpAdj ?? 0,
      occ: num(curOcc),
    },
  ];

  const owed = (r.dueFromTenant ?? 0) > 0;

  return (
    <Card id="expense-recovery" eyebrow="Recovery" title="What the tenant actually owes">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            The premises
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Tenant SF" value={tenantSf} onChange={setTenantSf} placeholder="12,000" />
            <Field label="Building SF" value={buildingSf} onChange={setBuildingSf} placeholder="100,000" />
            <Field label="Estimates paid" value={paid} onChange={setPaid} placeholder="30,000" />
            <Field label="Gross up to" suffix="%" value={grossTo} onChange={setGrossTo} placeholder="95" />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            The floor the lease gives
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Choice
              label="Basis"
              value={basis}
              onChange={setBasis}
              options={[
                { value: "base year", label: "Base year" },
                { value: "expense stop", label: "Expense stop" },
              ]}
            />
            {stopBasis ? (
              <Field label="Stop, $ per SF" value={stop} onChange={setStop} placeholder="16.00" />
            ) : (
              <>
                <Field label="Base fixed" value={baseFixed} onChange={setBaseFixed} placeholder="640,000" />
                <Field label="Base variable" value={baseVar} onChange={setBaseVar} placeholder="900,000" />
                <Field label="Occupied then" suffix="%" value={baseOcc} onChange={setBaseOcc} placeholder="72" />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            This year, and the cap
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Fixed" value={curFixed} onChange={setCurFixed} placeholder="720,000" />
            <Field label="Variable" value={curVar} onChange={setCurVar} placeholder="1,180,000" />
            <Field label="Occupied now" suffix="%" value={curOcc} onChange={setCurOcc} placeholder="94" />
            <Field label="Cap" suffix="%" value={capPct} onChange={setCapPct} placeholder="5" />
            <Choice
              label="Cap type"
              value={capType}
              onChange={setCapType}
              options={[
                { value: "cumulative", label: "Cumulative" },
                { value: "non-cumulative", label: "Non-cumulative" },
                { value: "none", label: "None" },
              ]}
            />
            <Field label="Controllable" suffix="%" value={controllable} onChange={setControllable} placeholder="60" />
          </div>
          {!stopBasis && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Years since base" value={years} onChange={setYears} placeholder="3" />
            </div>
          )}
        </div>
      </div>

      {r.baseGrossedUp !== null && r.currentGrossedUp !== null && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-muted">
            Both years grossed up to the same occupancy, so the comparison is like
            for like.
          </p>
          <div className="space-y-3">
            {yearBars.map((y) => (
              <div key={y.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {y.label}
                    {y.occ !== null && (
                      <span className="ml-2 text-xs font-normal text-muted">{y.occ}% full</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {usd(y.fixed + y.variable + y.adj)}
                  </span>
                </div>
                <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="recovery-year"
                    title={`Fixed · ${usdExact(y.fixed)}`}
                    className="h-full bg-ink/70"
                    style={{ width: `${(y.fixed / widest) * 100}%` }}
                  />
                  <div
                    data-bar="recovery-year"
                    title={`Variable · ${usdExact(y.variable)}`}
                    className="h-full bg-brand"
                    style={{ width: `${(y.variable / widest) * 100}%` }}
                  />
                  <div
                    data-bar="recovery-grossup"
                    title={`Added by gross-up · ${usdExact(y.adj)}`}
                    className="h-full bg-brand/35"
                    style={{ width: `${(y.adj / widest) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/70" />
              <span className="text-muted">Fixed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
              <span className="text-muted">Variable, as spent</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-brand/35" />
              <span className="text-muted">Added by gross-up</span>
            </span>
          </div>
        </div>
      )}

      {r.tenantShare !== null && (r.oneSidedCost ?? 0) > 0 && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            Gross up this year and leave the base year alone, and this tenant
            pays {usdExact(r.oneSidedCost)} it does not owe.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { label: "Both years grossed up", amount: r.tenantShare, tone: "bg-brand" },
              { label: "Only this year", amount: r.oneSidedShare ?? 0, tone: "bg-kill" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usdExact(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="one-sided"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{
                      width: `${(row.amount / Math.max(1, r.oneSidedShare ?? 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.dueFromTenant !== null && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
            <Stat label="Pro rata share" value={pct(r.sharePct, 2)} tone="muted" />
            <Stat label="Increase over the floor" value={usd(r.increase)} tone="muted" />
            <Stat label="Held back by the cap" value={usd(r.capSaved)} tone="muted" />
            <Stat label="The tenant's share" value={usdExact(r.tenantShare)} />
          </div>
          <p className={`mt-4 text-sm font-medium ${owed ? "text-caution" : "text-brand"}`}>
            {owed ? (
              <>
                Against {usdExact(num(paid))} of estimates, the tenant owes{" "}
                <span className="font-semibold tabular-nums">{usdExact(r.dueFromTenant)}</span>.
              </>
            ) : (
              <>
                Against {usdExact(num(paid))} of estimates, the tenant is owed{" "}
                <span className="font-semibold tabular-nums">
                  {usdExact(Math.abs(r.dueFromTenant))}
                </span>{" "}
                back.
              </>
            )}
            {(r.carvedOut ?? 0) > 0 && (
              <>
                {" "}
                {/* Lead with what the cap actually DID. Saying "$34,021 is
                    outside the cap" beside a stat reading "held back $0"
                    implies the cap bit and the carve-out blunted it, when
                    in fact the cap never came near binding. */}
                <span className="font-normal text-muted">
                  {(r.capSaved ?? 0) > 0 ? (
                    <>
                      The cap held {usd(r.capSaved)} back, and a further{" "}
                      {usd(r.carvedOut)} of the increase was never inside it:
                      taxes, insurance and utilities are carved out by convention.
                    </>
                  ) : (
                    <>
                      The cap did not bind. When it does it reaches only the
                      controllable {controllable}% — {usd((r.increase ?? 0) - (r.carvedOut ?? 0))}{" "}
                      of an increase this size — which is why a {capPct}% cap is
                      worth less than it sounds in a year the insurance jumps.
                    </>
                  )}
                </span>
              </>
            )}
          </p>
        </>
      )}

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7c-iv. percentage rent, and what the tenant can carry ──────────────────

/**
 * The retail lease's own arithmetic.
 *
 * The picture is twelve months with a twelfth of the breakpoint drawn
 * across them, because that line is the whole card: the seeded tenant's
 * year lands UNDER the breakpoint, so nothing is owed — and two months of
 * Christmas sail straight over the line. A landlord billing monthly with
 * no year-end reconciliation keeps $22,300 of percentage rent on a lease
 * whose annual figure is zero, and no single month's statement shows it.
 *
 * The sales column reads through `readStrip` — the same reader the cash
 * flow card uses, so a paste out of a spreadsheet lands the same way here
 * and the comma-as-thousands-mark trap is already solved in one place.
 */
function PercentageRent() {
  const [base, setBase] = useShared("prb", "120,000");
  const [rate, setRate] = useShared("prr", "6");
  const [stated, setStated] = useShared("prbk", "");
  const [recoveries, setRecoveries] = useShared("prcam", "58,000");
  const [sf, setSf] = useShared("prsf", "3,000");
  const [ceiling, setCeiling] = useShared("prc", "10");
  const [raw, setRaw] = useShared(
    "prs",
    "90,000\n85,000\n110,000\n120,000\n130,000\n140,000\n135,000\n130,000\n125,000\n150,000\n280,000\n425,000",
  );

  const sales = useMemo(() => readStrip(raw).values, [raw]);
  const r = useMemo(
    () =>
      readPercentageRent({
        baseRent: num(base),
        ratePct: num(rate),
        statedBreakpoint: num(stated),
        monthlySales: sales,
        recoveries: num(recoveries),
        tenantSf: num(sf),
        healthyCeilingPct: num(ceiling),
      }),
    [base, rate, stated, sales, recoveries, sf, ceiling],
  );

  const monthlyBreak = (r.breakpointUsed ?? 0) / 12;
  const tallest = Math.max(1, monthlyBreak, ...sales);
  const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

  return (
    <Card id="percentage-rent" eyebrow="Retail" title="Percentage rent, and the breakpoint">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Base rent, year" value={base} onChange={setBase} placeholder="120,000" />
        <Field label="Rate over it" suffix="%" value={rate} onChange={setRate} placeholder="6" />
        <Field
          label="Breakpoint, if stated"
          value={stated}
          onChange={setStated}
          placeholder="natural"
        />
        <Field label="CAM, tax, insurance" value={recoveries} onChange={setRecoveries} placeholder="58,000" />
        <Field label="Tenant SF" value={sf} onChange={setSf} placeholder="3,000" />
        <Field label="Cost ceiling" suffix="%" value={ceiling} onChange={setCeiling} placeholder="10" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
            Sales, month by month
          </span>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm tabular-nums outline-none transition-colors focus:border-brand"
          />
          <span className="mt-1.5 block text-[11px] leading-relaxed text-muted">
            Twelve figures in the lease year&apos;s order. The monthly shape is
            what the year-end reconciliation exists for.
          </span>
        </label>

        {sales.length > 0 && r.breakpointUsed !== null && (
          <div>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-muted">
                A twelfth of the breakpoint, drawn across the year
              </span>
              <span className="font-semibold tabular-nums">{usdExact(monthlyBreak)}</span>
            </div>
            {/* The line is the point. A month above it is billed on its own
                under a monthly regime; the months below give nothing back,
                and that asymmetry is what the annual figure nets out. */}
            <div className="relative h-36">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-ink/50"
                style={{ bottom: `${(monthlyBreak / tallest) * 100}%` }}
              />
              <div className="flex h-full items-end gap-1">
                {sales.map((m, i) => (
                  <div
                    key={i}
                    data-bar="month"
                    title={`Month ${i + 1} · ${usdExact(m)}`}
                    className={`flex-1 rounded-t-sm ${m > monthlyBreak ? "bg-kill" : "bg-brand"}`}
                    style={{ height: `${Math.max(2, (m / tallest) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-1 flex gap-1">
              {sales.map((_, i) => (
                <span key={i} className="flex-1 text-center text-[10px] text-muted">
                  {MONTHS[i] ?? i + 1}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {r.percentageRent !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            {(r.trueUpOwed ?? 0) > 0 ? (
              <>
                Billed monthly and never reconciled, this lease collects{" "}
                {usdExact(r.trueUpOwed)}{" "}
                that the year&apos;s sales do not support.
              </>
            ) : (
              <>
                The monthly bills and the year agree — no month breached the
                line on its own, so there is nothing for a true-up to give back.
              </>
            )}
          </p>
          <div className="mt-3 space-y-2">
            {[
              { label: "Owed on the year's sales", amount: r.percentageRent, tone: "bg-brand" },
              {
                label: `Billed monthly, no true-up (${r.monthsOver} month${r.monthsOver === 1 ? "" : "s"} over)`,
                amount: r.monthlyBasisRent ?? 0,
                tone: "bg-kill",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usdExact(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="true-up"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{
                      width: `${(row.amount / Math.max(1, r.monthlyBasisRent ?? 1, r.percentageRent ?? 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.naturalBreakpoint !== null && (
        <p className="mt-4 text-sm text-muted">
          The natural breakpoint is the base rent over the rate —{" "}
          <span className="font-semibold tabular-nums text-ink">
            {usd(r.naturalBreakpoint)}
          </span>
          , the sales at which the percentage rent would equal the base rent.
          {r.artificial ? (
            <>
              {" "}
              This lease states{" "}
              <span className="font-semibold tabular-nums text-ink">
                {usd(r.breakpointUsed)}
              </span>{" "}
              instead, which is an{" "}
              <span className="font-semibold text-ink">artificial</span>{" "}
              breakpoint and starts the landlord&apos;s participation{" "}
              {r.favours === "landlord" ? "sooner" : "later"} — it favours the{" "}
              <span className="font-semibold text-ink">{r.favours}</span>.
            </>
          ) : (
            <> Nothing else is stated, so that is the one in use.</>
          )}
        </p>
      )}

      {r.occupancyCostPct !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Sales, the year" value={usd(r.annualSales)} tone="muted" />
          <Stat label="All-in occupancy cost" value={usd(r.totalOccupancyCost)} tone="muted" />
          <Stat label="Of sales" value={pct(r.occupancyCostPct, 2)} />
          <Stat
            label={`Sales to reach ${ceiling}%`}
            value={r.salesToClearCeiling === null ? "never" : usd(r.salesToClearCeiling)}
            tone="muted"
          />
        </div>
      )}

      {r.allInPsf !== null && r.baseRentPsf !== null && (
        <p className="mt-4 text-sm text-muted">
          {/* Cents, not whole dollars: usdExact would round $59.33 to $59,
              and a rent per foot is quoted to the cent everywhere it is
              quoted at all. */}
          ${r.baseRentPsf.toFixed(2)} a foot base, ${r.allInPsf.toFixed(2)} all in.
          {r.salesToClearCeiling === null ? (
            <>
              {" "}
              A {ceiling}% ceiling on a {rate}% lease is unreachable: above the
              breakpoint every further dollar of sales brings {rate}c of rent
              with it, so the ratio falls toward {rate}% and stops.
            </>
          ) : (
            <>
              {" "}
              What counts as a healthy ratio is the tenant&apos;s category, not a
              universal number — a jeweller and a restaurant are nowhere near
              each other, so the ceiling above is yours to set.
            </>
          )}
        </p>
      )}

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 7d. rentable, usable, and the rent you actually pay ────────────────────

/**
 * What you would have to believe.
 *
 * The only card here that runs backwards: it takes the price and the
 * return, and reports the growth rate the deal is quietly assuming. A pro
 * forma is a set of assumptions chosen to reach a conclusion, and a deal
 * that pencils at 3% growth and one that pencils at 9% look identical on
 * a summary page — so the picture is the required growth drawn against
 * the growth the reader called ordinary, and the second lever (the exit
 * cap) drawn against the cap they are buying at.
 *
 * The return is UNLEVERED and the card says so, because typing a levered
 * target into an unlevered solve makes every deal look heroic.
 */
function WhatYouBelieve() {
  const [price, setPrice] = useShared("wbp", "25,000,000");
  const [noi, setNoi] = useShared("wbn", "1,500,000");
  const [hold, setHold] = useShared("wbh", "5");
  const [exitCap, setExitCap] = useShared("wbx", "6.25");
  const [target, setTarget] = useShared("wbt", "12");
  const [saleCost, setSaleCost] = useShared("wbs", "2");
  const [market, setMarket] = useShared("wbm", "3");

  const r = useMemo(
    () =>
      readBelief({
        price: num(price),
        noi: num(noi),
        holdYears: num(hold),
        exitCapPct: num(exitCap),
        targetIrrPct: num(target),
        sellingCostPct: num(saleCost),
        marketGrowthPct: num(market),
      }),
    [price, noi, hold, exitCap, target, saleCost, market],
  );

  const widestGrowth = Math.max(
    0.5,
    Math.abs(r.requiredGrowthPct ?? 0),
    Math.abs(num(market) ?? 0),
  );
  const widestCap = Math.max(0.5, r.goingInCapPct ?? 0, r.requiredExitCapPct ?? 0);

  return (
    <Card
      id="what-you-believe"
      eyebrow="The inversion"
      title="What you would have to believe"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Price" value={price} onChange={setPrice} placeholder="$25M" />
        <Field label="NOI, year one" value={noi} onChange={setNoi} placeholder="1,500,000" />
        <Field label="Hold" suffix="yr" value={hold} onChange={setHold} placeholder="5" />
        <Field label="Exit cap" suffix="%" value={exitCap} onChange={setExitCap} placeholder="6.25" />
        <Field label="Target, unlevered" suffix="%" value={target} onChange={setTarget} placeholder="12" />
        <Field label="Cost of sale" suffix="%" value={saleCost} onChange={setSaleCost} placeholder="2" />
        <Field label="Ordinary growth" suffix="%" value={market} onChange={setMarket} placeholder="3" />
      </div>

      {r.requiredGrowthPct !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            This deal is assuming NOI grows{" "}
            <span className="tabular-nums">{pct(r.requiredGrowthPct, 2)}</span>{" "}
            a year. Nothing on a summary page says so.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                label: "What the return requires",
                amount: r.requiredGrowthPct,
                tone: r.reach === "at market" ? "bg-brand" : "bg-kill",
              },
              {
                label: "What you called ordinary",
                amount: num(market) ?? 0,
                tone: "bg-ink/25",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {pct(row.amount, 2)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="growth"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{
                      width: `${(Math.max(0, row.amount) / widestGrowth) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.requiredExitCapPct !== null && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Or leave growth at ordinary and move the exit instead
          </p>
          <div className="mt-2 space-y-2">
            {[
              { label: "The cap you are buying at", amount: r.goingInCapPct, tone: "bg-ink/25" },
              {
                label: "The exit cap the target then needs",
                amount: r.requiredExitCapPct,
                tone: (r.capShiftBps ?? 0) < 0 ? "bg-kill" : "bg-brand",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {pct(row.amount, 2)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="exit"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${((row.amount ?? 0) / widestCap) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.exitPrice !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Going-in cap" value={pct(r.goingInCapPct, 2)} tone="muted" />
          <Stat label="Growth required" value={pct(r.requiredGrowthPct, 2)} />
          <Stat label={`NOI in year ${(num(hold) ?? 5) + 1}`} value={usd(r.exitNoi)} tone="muted" />
          <Stat label="Exit price, net of sale" value={usd(r.exitPrice)} tone="muted" />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        This return is unlevered. Most stated targets are not: a 12% levered
        on 60% debt is a far smaller ask than a 12% unlevered one, so a
        levered number typed here will make any deal look heroic. Size the
        debt separately above.
      </p>
    </Card>
  );
}

/**
 * A building on someone else's land.
 *
 * One card for the structure where ordinary screening arithmetic is not
 * merely imprecise but wrong by a multiple, in the flattering direction:
 * a leasehold is a WASTING asset, so capitalising its NOI values a
 * perpetuity that expires. The two figures are drawn side by side because
 * the gap between them is the entire content.
 *
 * The coverage pair underneath is the lender's test rather than DSCR,
 * since on an unsubordinated lease the ground rent outranks the mortgage
 * — and a reset to a share of land value can halve it without anything in
 * the lease having changed.
 */
function GroundLease() {
  const [noi, setNoi] = useShared("gln", "8,000,000");
  const [rent, setRent] = useShared("glr", "2,000,000");
  const [esc, setEsc] = useShared("gle", "2");
  const [growth, setGrowth] = useShared("glg", "2.5");
  const [years, setYears] = useShared("gly", "40");
  const [disc, setDisc] = useShared("gld", "8");
  const [feeCap, setFeeCap] = useShared("glc", "5");
  const [loan, setLoan] = useShared("gll", "10");
  const [land, setLand] = useShared("glv", "60,000,000");
  const [reset, setReset] = useShared("glp", "6");
  const [resetIn, setResetIn] = useShared("glri", "15");
  const [sub, setSub] = useShared("gls", "no");

  const r = useMemo(
    () =>
      readGroundLease({
        noi: num(noi),
        groundRent: num(rent),
        escalationPct: num(esc),
        noiGrowthPct: num(growth),
        yearsRemaining: num(years),
        discountRatePct: num(disc),
        feeSimpleCapPct: num(feeCap),
        subordinated: sub === "yes",
        loanTermYears: num(loan),
        yearsToReset: num(resetIn),
        resetPctOfLand: num(reset),
        landValue: num(land),
      }),
    [noi, rent, esc, growth, years, disc, feeCap, sub, loan, reset, resetIn, land],
  );

  const widestValue = Math.max(1, r.asIfPerpetual ?? 0, r.leaseholdValue ?? 0);
  const widestCover = Math.max(0.01, r.coverage ?? 0, r.resetCoverage ?? 0);

  return (
    <Card
      id="ground-lease"
      eyebrow="Ground lease"
      title="A building on someone else's land"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Building NOI" value={noi} onChange={setNoi} placeholder="8,000,000" />
        <Field label="Ground rent" value={rent} onChange={setRent} placeholder="2,000,000" />
        <Field label="Rent escalation" suffix="%" value={esc} onChange={setEsc} placeholder="2" />
        <Field label="NOI growth" suffix="%" value={growth} onChange={setGrowth} placeholder="2.5" />
        <Field label="Years left" suffix="yr" value={years} onChange={setYears} placeholder="40" />
        <Field label="Discount rate" suffix="%" value={disc} onChange={setDisc} placeholder="8" />
        <Field label="Fee-simple cap" suffix="%" value={feeCap} onChange={setFeeCap} placeholder="5" />
        <Field label="Loan term" suffix="yr" value={loan} onChange={setLoan} placeholder="10" />
        <Field label="Land value" value={land} onChange={setLand} placeholder="60,000,000" />
        <Field label="Reset, of land" suffix="%" value={reset} onChange={setReset} placeholder="6" />
        <Field label="Reset in" suffix="yr" value={resetIn} onChange={setResetIn} placeholder="15" />
        <Choice
          label="Fee owner"
          value={sub}
          onChange={setSub}
          options={[
            { value: "no", label: "Unsubordinated" },
            { value: "yes", label: "Subordinated" },
          ]}
        />
      </div>

      {r.leaseholdValue !== null && r.asIfPerpetual !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            The lease ends, so the leasehold ends with it. Capitalising its
            NOI values a building you hand back.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                label: "Capitalised as though it ran forever",
                amount: r.asIfPerpetual,
                tone: "bg-kill",
              },
              {
                label: `Worth over the ${years} years that are left`,
                amount: r.leaseholdValue,
                tone: "bg-brand",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="leasehold"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${(Math.max(0, row.amount) / widestValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.coverage !== null && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Ground rent coverage — the lender&apos;s test, not the DSCR
          </p>
          <div className="mt-2 space-y-2">
            {[
              { label: "Today", amount: r.coverage, tone: "bg-brand" },
              ...(r.resetCoverage !== null
                ? [
                    {
                      label: `After the reset to ${reset}% of land value`,
                      amount: r.resetCoverage,
                      tone: r.resetCoverage < 2 ? "bg-kill" : "bg-brand",
                    },
                  ]
                : []),
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {row.amount.toFixed(2)}×
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="coverage"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${(row.amount / widestCover) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.leasedFeeValue !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Leasehold NOI" value={usd(r.leaseholdNoi)} tone="muted" />
          <Stat label="Leasehold, over the term" value={usd(r.leaseholdValue)} />
          <Stat label="Leased fee, the other half" value={usd(r.leasedFeeValue)} tone="muted" />
          <Stat
            label="Financeable"
            value={r.financeable ? "Yes" : "No"}
            tone={r.financeable ? "brand" : "ink"}
          />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        The clock that destroys the leasehold is the same clock that brings
        the land back sooner, so the two halves of one lease move in
        opposite directions as it runs. That is why they trade to different
        buyers at different rates.
      </p>
    </Card>
  );
}

/**
 * What it costs to get out of the loan early.
 *
 * Two pictures, and the first has to be signed from a centre line: on a
 * loan struck when rates were low, defeasance is a GAIN and yield
 * maintenance sits on its floor, so the two routes out point in opposite
 * directions. Drawn from a common zero they can be read at a glance; on
 * separate tracks a negative would have nowhere to go.
 *
 * The second draws the penalty against what the debt is worth to a buyer
 * who could assume it, because the same rate move drives both and drives
 * them the OPPOSITE way. Those two numbers belong on one picture and
 * almost never appear on one page.
 */
// ── the construction draw, and the reserve it funds ────────────────────────

function ConstructionDraw() {
  const [land, setLand] = useShared("cdl", "5,000,000");
  const [hard, setHard] = useShared("cdh", "20,000,000");
  const [soft, setSoft] = useShared("cds", "5,000,000");
  const [atClose, setAtClose] = useShared("cdc", "30");
  const [months, setMonths] = useShared("cdm", "24");
  const [rate, setRate] = useShared("cdr", "8.5");
  const [ltc, setLtc] = useShared("cdt", "65");
  const [curve, setCurve] = useShared("cdv", "s-curve");
  const [order, setOrder] = useShared("cdo", "equity-first");

  const r = useMemo(
    () =>
      readDraw({
        landCost: num(land),
        hardCost: num(hard),
        softCost: num(soft),
        softAtCloseP: num(atClose),
        months: num(months),
        ratePct: num(rate),
        ltcPct: num(ltc),
        curve: curve === "straight-line" ? "straight-line" : "s-curve",
        order: order === "pari-passu" ? "pari-passu" : "equity-first",
      }),
    [land, hard, soft, atClose, months, rate, ltc, curve, order],
  );

  const widest = Math.max(
    1,
    r.reserveIfDrawnAtOnce ?? 0,
    r.reserveAtShortcut ?? 0,
    r.interestReserve ?? 0,
  );
  const peak = Math.max(1, r.peakBalance ?? 1);

  return (
    <Card
      id="construction-draw"
      eyebrow="Construction draw"
      title="The interest reserve, run month by month"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Land" value={land} onChange={setLand} placeholder="5,000,000" />
        <Field label="Hard costs" value={hard} onChange={setHard} placeholder="20,000,000" />
        <Field label="Soft costs" value={soft} onChange={setSoft} placeholder="5,000,000" />
        <Field label="Soft at closing" suffix="%" value={atClose} onChange={setAtClose} placeholder="30" />
        <Field label="Works" suffix="mo" value={months} onChange={setMonths} placeholder="24" />
        <Field label="Loan rate" suffix="%" value={rate} onChange={setRate} placeholder="8.5" />
        <Field label="Loan to cost" suffix="%" value={ltc} onChange={setLtc} placeholder="65" />
        <Choice
          label="Draw curve"
          value={curve}
          onChange={setCurve}
          options={[
            { value: "s-curve", label: "S-curve" },
            { value: "straight-line", label: "Straight line" },
          ]}
        />
        <Choice
          label="Funding order"
          value={order}
          onChange={setOrder}
          options={[
            { value: "equity-first", label: "Equity first" },
            { value: "pari-passu", label: "Pari passu" },
          ]}
        />
      </div>

      {r.interestReserve !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Interest reserve" value={usd(r.interestReserve)} />
          <Stat label="Total cost" value={usd(r.totalCost)} tone="muted" />
          <Stat label="Loan" value={usd(r.loan)} tone="muted" />
          <Stat label="Equity" value={usd(r.equity)} tone="muted" />
        </div>
      )}

      {r.schedule.length > 0 && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            The loan outstanding, month by month.
          </p>
          <div className="mt-3 flex h-24 items-end gap-px">
            {r.schedule.map((m) => (
              <div
                key={m.month}
                data-bar="draw"
                className="flex-1 rounded-t-sm bg-brand"
                style={{ height: `${Math.max(1, (m.balance / peak) * 100)}%` }}
                title={`Month ${m.month}: ${usd(m.balance)}`}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Closing on the left, completion on the right. The flat start is the
            equity going in ahead of the loan.
          </p>
        </div>
      )}

      {r.interestReserve !== null && r.reserveAtShortcut !== null && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm font-semibold">
            Three ways to state the same reserve.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { label: "The schedule, run", amount: r.interestReserve, tone: "bg-brand" },
              { label: "Average-balance shortcut", amount: r.reserveAtShortcut, tone: "bg-kill" },
              { label: "As if drawn at closing", amount: r.reserveIfDrawnAtOnce, tone: "bg-line" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="reserve"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${((row.amount ?? 0) / widest) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.impliedDrawProfile !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Average outstanding" value={`${(r.impliedDrawProfile * 100).toFixed(0)}% of loan`} />
          <Stat
            label="First advance"
            value={r.firstAdvanceMonth !== null ? `Month ${r.firstAdvanceMonth}` : "—"}
            tone="muted"
          />
          <Stat
            label="Reserve, share of loan"
            value={r.reserveShareOfLoanPct !== null ? `${r.reserveShareOfLoanPct.toFixed(2)}%` : "—"}
            tone="muted"
          />
          <Stat label="Shortcut is over by" value={usd(r.shortcutOverstatesBy)} tone="muted" />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        A construction loan funds its own interest, so the reserve is a fixed
        point rather than a formula and it is iterated here rather than
        approximated. The shortcut every screening model uses assumes the loan
        is outstanding for a fixed share of the term; where the lender requires
        equity in first, it is not. Being too HIGH is what hides it — an
        overstated reserve overstates cost and understates yield on cost, which
        reads as prudence rather than as a mistake.
      </p>
    </Card>
  );
}

// ── the floating-rate loan, and the cap ────────────────────────────────────

function FloatingRate({
  sofrPct,
  sofrAsOf,
}: {
  sofrPct: number | null;
  sofrAsOf: string | null;
}) {
  const [loan, setLoan] = useShared("fra", "20,000,000");
  // The only field on this page a live figure fills exactly. A floating note
  // references SOFR by name — no spread to add, no term to match — so
  // today's is the index, full stop. Where the table is unreachable or the
  // series has stopped, the worked example stands.
  const [idx, setIdx] = useShared("fri", sofrPct !== null ? String(sofrPct) : "3.64");
  const [spread, setSpread] = useShared("frs", "300");
  const [floorPct, setFloorPct] = useShared("frf", "3.00");
  const [strike, setStrike] = useShared("frk", "4.00");
  const [premium, setPremium] = useShared("frp", "300,000");
  const [capTerm, setCapTerm] = useShared("frt", "24");
  const [amort, setAmort] = useShared("frm", "");
  const [noi, setNoi] = useShared("frn", "1,660,000");
  const [cov, setCov] = useShared("frc", "1.20");
  const [extNoi, setExtNoi] = useShared("fre", "1,750,000");

  const r = useMemo(
    () =>
      readFloating({
        loanAmount: num(loan),
        indexPct: num(idx),
        spreadBps: num(spread),
        indexFloorPct: num(floorPct),
        capStrikePct: num(strike),
        capPremium: num(premium),
        capTermMonths: num(capTerm),
        amortYears: num(amort),
        noi: num(noi),
        covenantDscr: num(cov),
        extensionNoi: num(extNoi),
      }),
    [loan, idx, spread, floorPct, strike, premium, capTerm, amort, noi, cov, extNoi],
  );

  // One track for the index, from the floor to a little past the worse of
  // the strike and the breach, so the three marks sit on one scale and
  // which comes first is visible before it is read.
  const lo = r.rateBandLowPct !== null && r.allInRatePct !== null
    ? Math.min(num(floorPct) ?? 0, num(idx) ?? 0)
    : 0;
  const hi = Math.max(
    num(strike) ?? 0,
    r.breachIndexPct ?? 0,
    (num(idx) ?? 0) + 1,
    lo + 1,
  );
  const at = (v: number | null) =>
    v === null ? null : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  return (
    <Card
      id="floating-rate"
      eyebrow="Floating rate"
      title="The bridge loan, and whether its cap protects anything"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Loan" value={loan} onChange={setLoan} placeholder="20,000,000" />
        <Field
          label={sofrAsOf ? "SOFR — live" : "Index (SOFR)"}
          suffix="%"
          value={idx}
          onChange={setIdx}
          placeholder="3.64"
        />
        <Field label="Spread" suffix="bps" value={spread} onChange={setSpread} placeholder="300" />
        <Field label="Index floor" suffix="%" value={floorPct} onChange={setFloorPct} placeholder="3.00" />
        <Field label="Cap strike" suffix="%" value={strike} onChange={setStrike} placeholder="4.00" />
        <Field label="Cap premium" value={premium} onChange={setPremium} placeholder="300,000" />
        <Field label="Cap term" suffix="mo" value={capTerm} onChange={setCapTerm} placeholder="24" />
        <Field label="Amortisation" suffix="yr" value={amort} onChange={setAmort} placeholder="IO" />
        <Field label="NOI" value={noi} onChange={setNoi} placeholder="1,660,000" />
        <Field label="DSCR covenant" suffix="x" value={cov} onChange={setCov} placeholder="1.20" />
        <Field label="NOI at extension" value={extNoi} onChange={setExtNoi} placeholder="1,750,000" />
      </div>

      {r.allInRatePct !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Rate today" value={`${r.allInRatePct.toFixed(2)}%`} />
          <Stat label="DSCR" value={r.dscr !== null ? `${r.dscr.toFixed(2)}x` : "—"} />
          <Stat label="Debt service" value={usd(r.debtServiceAnnual)} tone="muted" />
          <Stat
            label="With the cap's cost"
            value={r.allInWithCapPct !== null ? `${r.allInWithCapPct.toFixed(2)}%` : "—"}
            tone="muted"
          />
        </div>
      )}

      {r.breachIndexPct !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            {r.capProtects === false
              ? "The cap is on the wrong side of the covenant."
              : "The cap engages before the covenant does."}
          </p>
          <div className="relative mt-4 h-2 w-full rounded-full bg-white">
            <div
              data-bar="float"
              className="absolute inset-y-0 left-0 rounded-l-full bg-brand/30"
              style={{ width: `${at(r.breachIndexPct) ?? 0}%` }}
            />
            {[
              { key: "index", label: "Today", v: num(idx), colour: "bg-ink" },
              { key: "breach", label: "Breach", v: r.breachIndexPct, colour: "bg-kill" },
              { key: "strike", label: "Strike", v: num(strike), colour: "bg-brand" },
            ].map((m) =>
              at(m.v) === null ? null : (
                <div
                  key={m.key}
                  data-bar="float"
                  className={`absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full ${m.colour}`}
                  style={{ left: `${at(m.v)}%` }}
                  title={`${m.label} ${m.v!.toFixed(2)}%`}
                />
              ),
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ink align-middle" />
              Today {(num(idx) ?? 0).toFixed(2)}%
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-kill align-middle" />
              Covenant breaks {r.breachIndexPct.toFixed(2)}%
            </span>
            {num(strike) !== null && (
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand align-middle" />
                Cap strike {num(strike)!.toFixed(2)}%
              </span>
            )}
          </div>
          {r.note && <p className="mt-3 text-xs text-muted">{r.note}</p>}
        </div>
      )}

      {r.capCostBps !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Cap costs, a year" value={`${r.capCostBps} bps`} />
          <Stat
            label="Headroom to breach"
            value={r.breachHeadroomBps !== null ? `${r.breachHeadroomBps} bps` : "—"}
            tone={r.breachHeadroomBps !== null && r.breachHeadroomBps < 0 ? "brand" : "muted"}
          />
          <Stat
            label="DSCR at the strike"
            value={r.worstCaseDscr !== null ? `${r.worstCaseDscr.toFixed(2)}x` : "—"}
            tone="muted"
          />
          <Stat
            label="Strike the extension allows"
            value={r.extensionStrikePct !== null ? `${r.extensionStrikePct.toFixed(2)}%` : "—"}
            tone="muted"
          />
        </div>
      )}

      <p className="mt-5 text-xs text-muted">
        The premium is what a broker quoted you, never a number this works out:
        pricing a cap needs a volatility surface, which is not screening
        arithmetic. It is a use funded at closing, not a haircut on the loan.
        {sofrAsOf ? ` SOFR is today's, as of ${sofrAsOf}.` : ""}
      </p>
    </Card>
  );
}

function Prepayment() {
  const [bal, setBal] = useShared("ppb", "20,000,000");
  const [rate, setRate] = useShared("ppr", "3.75");
  const [months, setMonths] = useShared("ppm", "30");
  const [amort, setAmort] = useShared("ppa", "30");
  // Deliberately NOT seeded from the live 10-year, although the strip above
  // has it. The clause prices at the Treasury matched to the REMAINING term
  // — thirty months here, not ten years — and on a normal curve that sits
  // below the 10-year. A lower discount rate makes the present value of the
  // remaining payments larger, so the penalty is larger: filling this with
  // the 10-year would understate what it costs to get out, quietly, in the
  // direction that flatters the deal. The note under the card says so.
  const [tsy, setTsy] = useShared("ppt", "4.75");
  const [floor, setFloor] = useShared("ppf", "1");
  const [costs, setCosts] = useShared("ppc", "75,000");
  const [open, setOpen] = useShared("ppo", "24");
  const [mkt, setMkt] = useShared("ppk", "6.5");

  const r = useMemo(
    () =>
      readPrepayment({
        balance: num(bal),
        loanRatePct: num(rate),
        monthsRemaining: num(months),
        amortYears: num(amort),
        treasuryRatePct: num(tsy),
        floorPct: num(floor),
        defeasanceCosts: num(costs),
        monthsToOpen: num(open),
        marketLoanRatePct: num(mkt),
      }),
    [bal, rate, months, amort, tsy, floor, costs, open, mkt],
  );

  const widestWay = Math.max(
    1,
    Math.abs(r.yieldMaintenance ?? 0),
    Math.abs(r.defeasance ?? 0),
  );

  return (
    <Card
      id="prepayment"
      eyebrow="Prepayment"
      title="What it costs to get out of the loan early"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Balance" value={bal} onChange={setBal} placeholder="20,000,000" />
        <Field label="Loan rate" suffix="%" value={rate} onChange={setRate} placeholder="3.75" />
        <Field label="Months left" suffix="mo" value={months} onChange={setMonths} placeholder="30" />
        <Field label="Amortisation" suffix="yr" value={amort} onChange={setAmort} placeholder="30" />
        <Field label="Treasury, that term" suffix="%" value={tsy} onChange={setTsy} placeholder="4.75" />
        <Field label="Penalty floor" suffix="%" value={floor} onChange={setFloor} placeholder="1" />
        <Field label="Defeasance costs" value={costs} onChange={setCosts} placeholder="75,000" />
        <Field label="Open in" suffix="mo" value={open} onChange={setOpen} placeholder="24" />
        <Field label="Market loan rate" suffix="%" value={mkt} onChange={setMkt} placeholder="6.5" />
      </div>

      {r.yieldMaintenance !== null && r.defeasance !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            Two ways out, and they do not move together. A penalty cannot
            go below its floor; a Treasury portfolio can cost less than
            the balance it retires.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                label: r.atFloor
                  ? "Yield maintenance — all of it the floor"
                  : "Yield maintenance",
                amount: r.yieldMaintenance,
              },
              {
                label: "Defeasance, hard costs included",
                amount: r.defeasance,
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                <div className="relative mt-1 flex h-2 w-full overflow-hidden rounded-full bg-white">
                  <div className="flex h-full w-1/2 justify-end">
                    <div
                      data-bar="prepay"
                      className="h-full rounded-l-full bg-brand"
                      style={{ width: `${(Math.max(0, -row.amount) / widestWay) * 100}%` }}
                    />
                  </div>
                  <div className="h-full w-1/2">
                    <div
                      data-bar="prepay"
                      className="h-full rounded-r-full bg-kill"
                      style={{ width: `${(Math.max(0, row.amount) / widestWay) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Left of the line is money back. Right of it is money out.
          </p>
        </div>
      )}

      {r.cost !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Cheaper route" value={r.cheaper ?? "—"} />
          <Stat label="What it costs" value={usd(r.cost)} />
          <Stat label="Below market by" value={usd(r.debtMarkToMarket)} tone="muted" />
          <Stat label="Balloon at maturity" value={usd(r.balloon)} tone="muted" />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Yield maintenance is cheap when rates have risen and dear when
        they have fallen, which is the opposite of most intuitions —
        because the lender is being made whole on interest it can now
        earn elsewhere. The same move makes the loan more valuable to a
        buyer who could assume it. Both are worth having; only one can be
        had. The Treasury here is the one matched to the REMAINING term,
        not the 10-year in the strip above — on a normal curve it sits
        lower, and a lower rate makes the penalty bigger, so reaching for
        the 10-year understates what getting out costs.
      </p>
    </Card>
  );
}

/**
 * A below-market lease, and what it is worth to end it.
 *
 * Two pictures, and the first is the argument. The honest answer and the
 * spread calculation are drawn as two bars from a CENTRE LINE, because on
 * a modest spread they point in opposite directions — the spread says pay
 * the tenant to go, the streams say pay them to stay — and a pair of bars
 * on a common axis is the only drawing where that reads instantly.
 *
 * The second is the bargain: the landlord's ceiling and the tenant's floor
 * on one track, with the gap between them shaded. Where they overlap there
 * is a deal; where they do not, the shading is the distance something
 * outside the rent has to cover.
 */
function LeaseBuyout() {
  const [sf, setSf] = useShared("lbs", "40,000");
  const [inPlace, setInPlace] = useShared("lbi", "28");
  const [market, setMarket] = useShared("lbm", "42");
  const [years, setYears] = useShared("lby", "6");
  const [esc, setEsc] = useShared("lbe", "2.5");
  const [growth, setGrowth] = useShared("lbg", "3");
  const [llRate, setLlRate] = useShared("lbl", "8");
  const [tenRate, setTenRate] = useShared("lbt", "15");
  const [down, setDown] = useShared("lbd", "9");
  const [ti, setTi] = useShared("lbti", "60");
  const [comm, setComm] = useShared("lbc", "4");
  const [newTerm, setNewTerm] = useShared("lbn", "10");
  const [outside, setOutside] = useShared("lbo", "0");
  const [moving, setMoving] = useShared("lbmv", "750,000");

  const r = useMemo(
    () =>
      readBuyout({
        sf: num(sf),
        inPlaceRentPsf: num(inPlace),
        marketRentPsf: num(market),
        yearsRemaining: num(years),
        inPlaceEscalationPct: num(esc),
        marketGrowthPct: num(growth),
        landlordRatePct: num(llRate),
        tenantRatePct: num(tenRate),
        downtimeMonths: num(down),
        tiPsf: num(ti),
        commissionPct: num(comm),
        newTermYears: num(newTerm),
        outsideValue: num(outside),
        tenantMovingCost: num(moving),
      }),
    [sf, inPlace, market, years, esc, growth, llRate, tenRate, down, ti, comm, newTerm, outside, moving],
  );

  // One axis for the pair, signed, so a negative answer draws to the left
  // of the same centre line the positive one draws to the right of.
  const widestValue = Math.max(
    1,
    Math.abs(r.naiveSpreadPv ?? 0),
    Math.abs(r.buyoutValue ?? 0),
  );
  const widestSide = Math.max(
    1,
    Math.abs(r.landlordCeiling ?? 0),
    Math.abs(r.tenantFloor ?? 0),
  );

  return (
    <Card
      id="lease-buyout"
      eyebrow="Lease buyout"
      title="What a below-market lease is worth to end"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Space" suffix="SF" value={sf} onChange={setSf} placeholder="40,000" />
        <Field label="Rent in place" suffix="/SF" value={inPlace} onChange={setInPlace} placeholder="28" />
        <Field label="Market rent" suffix="/SF" value={market} onChange={setMarket} placeholder="42" />
        <Field label="Years left" suffix="yr" value={years} onChange={setYears} placeholder="6" />
        <Field label="Lease steps" suffix="%" value={esc} onChange={setEsc} placeholder="2.5" />
        <Field label="Market growth" suffix="%" value={growth} onChange={setGrowth} placeholder="3" />
        <Field label="Downtime" suffix="mo" value={down} onChange={setDown} placeholder="9" />
        <Field label="Allowance" suffix="/SF" value={ti} onChange={setTi} placeholder="60" />
        <Field label="Commission" suffix="%" value={comm} onChange={setComm} placeholder="4" />
        <Field label="New term" suffix="yr" value={newTerm} onChange={setNewTerm} placeholder="10" />
        <Field label="Landlord rate" suffix="%" value={llRate} onChange={setLlRate} placeholder="8" />
        <Field label="Tenant rate" suffix="%" value={tenRate} onChange={setTenRate} placeholder="15" />
        <Field label="Vacant possession worth" value={outside} onChange={setOutside} placeholder="0" />
        <Field label="Tenant moving cost" value={moving} onChange={setMoving} placeholder="750,000" />
      </div>

      {r.buyoutValue !== null && r.naiveSpreadPv !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            The spread is not the answer. The turnover is owed either way —
            a buyout only brings it forward.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                label: "The spread over the term, which is where people start",
                amount: r.naiveSpreadPv,
              },
              {
                label: "What ending the lease is actually worth",
                amount: r.buyoutValue,
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                {/* A centre line, because the two can point opposite ways. */}
                <div className="relative mt-1 flex h-2 w-full overflow-hidden rounded-full bg-white">
                  <div className="flex h-full w-1/2 justify-end">
                    <div
                      data-bar="buyout"
                      className="h-full rounded-l-full bg-kill"
                      style={{
                        width: `${(Math.max(0, -row.amount) / widestValue) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="h-full w-1/2">
                    <div
                      data-bar="buyout"
                      className="h-full rounded-r-full bg-brand"
                      style={{
                        width: `${(Math.max(0, row.amount) / widestValue) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.tenantFloor !== null && r.landlordCeiling !== null && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            The bargain — what each side can live with
          </p>
          <div className="mt-2 space-y-2">
            {[
              {
                label: "Most the landlord can pay",
                amount: r.landlordCeiling,
                tone: "bg-brand",
              },
              {
                label: "Least the tenant should take",
                amount: r.tenantFloor,
                tone: (r.zopa ?? 0) >= 0 ? "bg-brand" : "bg-kill",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="side"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{
                      width: `${(Math.max(0, row.amount) / widestSide) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.reTenantingCost !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {/* Cents, not whole dollars: `usd` rounds, and a rent is quoted
              to the cent. A "$14 / SF" spread beside a "$41.50" market
              rent reads as a different kind of number. */}
          <Stat
            label="Under market by"
            value={r.spreadPsf === null ? "—" : `$${r.spreadPsf.toFixed(2)} / SF`}
          />
          <Stat label="A year, across the space" value={usd(r.spreadAnnual)} tone="muted" />
          <Stat label="Turnover bill" value={usd(r.reTenantingCost)} tone="muted" />
          <Stat label="Rent lost to downtime" value={usd(r.downtimeCost)} tone="muted" />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        A lease with nothing left to run is worth nothing to end, however
        far under market it is — the spread is still there on the last day.
        And the spread cancels between the two sides, so with no frictions
        and one discount rate there is exactly nothing on the table. What
        makes a buyout happen is vacant possession being worth something
        the rent does not contain, or a tenant who discounts the future far
        harder than the landlord does.
      </p>
    </Card>
  );
}

/**
 * The layers between the senior loan and the common equity.
 *
 * Two pictures, and the second is the point of the card. The first is the
 * stack itself — one bar, bottom to top, because that is literally what a
 * capital stack is and drawing it any other way throws away the one thing
 * about it everybody already understands.
 *
 * The second draws every layer's rate against the yield on cost as a line
 * across the chart. That single line is the whole argument: the blend sits
 * to the left of it and reads fine, and the two layers that matter sit to
 * the right of it. A table of rates cannot show that; a bar chart with a
 * threshold on it shows it before you have read a word.
 */
function CapitalStack() {
  const [cost, setCost] = useShared("csc", "100,000,000");
  const [noi, setNoi] = useShared("csn", "6,500,000");
  const [senior, setSenior] = useShared("css", "60,000,000");
  const [seniorRate, setSeniorRate] = useShared("cssr", "5");
  const [amort, setAmort] = useShared("csa", "30");
  const [mezz, setMezz] = useShared("csm", "10,000,000");
  const [mezzRate, setMezzRate] = useShared("csmr", "9");
  const [pref, setPref] = useShared("csp", "8,000,000");
  const [prefRate, setPrefRate] = useShared("cspr", "11");
  const [accrues, setAccrues] = useShared("csac", "yes");
  const [hold, setHold] = useShared("csh", "5");
  const [target, setTarget] = useShared("cst", "15");

  const r = useMemo(
    () =>
      readStack({
        totalCost: num(cost),
        noi: num(noi),
        seniorAmount: num(senior),
        seniorRatePct: num(seniorRate),
        seniorAmortYears: num(amort),
        mezzAmount: num(mezz),
        mezzRatePct: num(mezzRate),
        prefAmount: num(pref),
        prefRatePct: num(prefRate),
        prefAccrues: accrues === "yes",
        holdYears: num(hold),
        targetEquityReturnPct: num(target),
      }),
    [
      cost,
      noi,
      senior,
      seniorRate,
      amort,
      mezz,
      mezzRate,
      pref,
      prefRate,
      accrues,
      hold,
      target,
    ],
  );

  const TONE: Record<string, string> = {
    senior: "bg-ink",
    mezz: "bg-brand",
    pref: "bg-accent",
    common: "bg-muted",
  };

  // The rate chart's scale. The yield-on-cost line has to land inside it
  // whatever the rates are, or the threshold is off the page exactly when
  // every layer is above it.
  const rates = r.layers.map((l) => l.ratePct ?? 0);
  const widestRate = Math.max(1, ...rates, r.yieldOnCostPct ?? 0, r.blendedRatePct ?? 0);

  return (
    <Card
      id="capital-stack"
      eyebrow="Capital stack"
      title="What each layer costs, and whether it earns its place"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Total cost" value={cost} onChange={setCost} placeholder="100,000,000" />
        <Field label="Year 1 NOI" value={noi} onChange={setNoi} placeholder="6,500,000" />
        <Field label="Senior loan" value={senior} onChange={setSenior} placeholder="60,000,000" />
        <Field label="Senior rate" suffix="%" value={seniorRate} onChange={setSeniorRate} placeholder="5" />
        <Field label="Amortisation" suffix="yr" value={amort} onChange={setAmort} placeholder="30" />
        <Field label="Mezzanine" value={mezz} onChange={setMezz} placeholder="10,000,000" />
        <Field label="Mezz rate" suffix="%" value={mezzRate} onChange={setMezzRate} placeholder="9" />
        <Field label="Preferred" value={pref} onChange={setPref} placeholder="8,000,000" />
        <Field label="Pref rate" suffix="%" value={prefRate} onChange={setPrefRate} placeholder="11" />
        <Field label="Hold" suffix="yr" value={hold} onChange={setHold} placeholder="5" />
        <Field label="Equity target" suffix="%" value={target} onChange={setTarget} placeholder="15" />
        <Choice
          label="Preferred"
          value={accrues}
          onChange={setAccrues}
          options={[
            { value: "yes", label: "Accrues" },
            { value: "no", label: "Pays current" },
          ]}
        />
      </div>

      {r.layers.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            The stack, bottom to top
          </p>
          <div className="mt-2 flex h-10 w-full overflow-hidden rounded-lg bg-faint">
            {r.layers.map((l) => (
              <div
                key={l.key}
                data-bar="layer"
                className={`h-full ${TONE[l.key]}`}
                style={{ width: `${Math.max(0, l.sharePct)}%` }}
                title={`${l.label} — ${usd(l.amount)}`}
              />
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {r.layers.map((l) => (
              <div key={l.key} className="flex items-baseline gap-2 text-sm">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${TONE[l.key]}`} />
                <span className="text-muted">{l.label}</span>
                <span className="flex-1 border-b border-dashed border-line" />
                <span className="shrink-0 font-mono tabular-nums">{usd(l.amount)}</span>
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                  {l.sharePct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.yieldOnCostPct !== null && r.layers.some((l) => l.ratePct !== null) && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            Every layer against what the building earns. A layer past the
            line costs more than the deal makes.
          </p>
          <div className="relative mt-3 space-y-2">
            {[
              ...r.layers
                .filter((l) => l.ratePct !== null && l.key !== "common")
                .map((l) => ({
                  label: l.label,
                  rate: l.ratePct!,
                  over: l.accretive === false,
                })),
              ...(r.blendedRatePct !== null
                ? [
                    {
                      label: "Blended, all layers",
                      rate: r.blendedRatePct,
                      over: r.blendedRatePct > r.yieldOnCostPct,
                    },
                  ]
                : []),
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {pct(row.rate)}
                  </span>
                </div>
                <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="rate"
                    className={`h-full rounded-full ${row.over ? "bg-kill" : "bg-brand"}`}
                    style={{ width: `${(row.rate / widestRate) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {/* The threshold, drawn once across all of them. */}
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-ink"
              style={{ left: `${(r.yieldOnCostPct / widestRate) * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            The line is the {pct(r.yieldOnCostPct)} yield on cost.
          </p>
        </div>
      )}

      {r.commonEquity !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Common equity" value={usd(r.commonEquity)} />
          <Stat label="Cash-on-cash" value={pct(r.cashOnCashPct)} tone="muted" />
          <Stat label="Senior alone would give" value={pct(r.cashOnCashSeniorOnlyPct)} tone="muted" />
          <Stat
            label="Blended cost"
            value={pct(r.blendedRatePct)}
            tone={r.blendHidesIt ? "ink" : "brand"}
          />
        </div>
      )}

      {r.seniorDscr !== null && (
        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-5">
          <Stat
            label="Senior DSCR"
            value={r.seniorDscr === null ? "—" : `${r.seniorDscr.toFixed(2)}×`}
            tone="muted"
          />
          <Stat
            label="With the mezzanine"
            value={r.combinedDscr === null ? "—" : `${r.combinedDscr.toFixed(2)}×`}
          />
          <Stat
            label="Fixed-charge coverage"
            value={
              r.fixedChargeCoverage === null ? "—" : `${r.fixedChargeCoverage.toFixed(2)}×`
            }
            tone="muted"
          />
        </div>
      )}

      {r.prefBalanceAtExit !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <Stat label="Preferred owed at the sale" value={usd(r.prefBalanceAtExit)} />
          <Stat label="Of which accrual" value={usd(r.prefAccrued)} tone="muted" />
          <Stat label="Compounding alone" value={usd(r.accrualCost)} tone="muted" />
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Leverage is judged layer by layer, never on the average — a big
        cheap senior drags a blended rate under the yield on cost while the
        expensive layers above it take from the equity. Amortisation is a
        transfer, not a cost, so the rate is what decides whether a layer
        earns its place and the constant is what the coverage ratio is
        sized on.
      </p>
    </Card>
  );
}

/**
 * What the property taxes become once you own it.
 *
 * The card exists for one sentence: the memorandum's tax line is the
 * SELLER's. In a jurisdiction that reassesses on transfer, the purchase
 * resets the assessment to the price, and every figure downstream of the
 * expense line — NOI, cap rate, debt service coverage — was computed on a
 * bill that stops existing at closing. Nothing in the memorandum is
 * false; it is simply describing someone else's ownership.
 *
 * Two pictures. The caps side by side, because that is the number people
 * quote to each other, and the prices side by side, because that is the
 * number they negotiate with. The second is SOLVED rather than scaled —
 * paying less lowers the assessment, which lowers the tax, which raises
 * the NOI — and the module's own test pins the round trip.
 */
function TaxReassessment() {
  const [price, setPrice] = useShared("txp", "25,000,000");
  const [assessed, setAssessed] = useShared("txa", "14,000,000");
  const [bill, setBill] = useShared("txb", "210,000");
  const [ratio, setRatio] = useShared("txr", "100");
  const [rate, setRate] = useShared("txt", "1.5");
  const [phase, setPhase] = useShared("txph", "3");
  const [noi, setNoi] = useShared("txn", "1,500,000");
  const [rule, setRule] = useShared("txrule", "yes");

  const r = useMemo(
    () =>
      readReassessment({
        price: num(price),
        currentAssessed: num(assessed),
        currentTax: num(bill),
        assessmentRatioPct: num(ratio),
        taxRatePct: num(rate),
        reassessesOnSale: rule === "yes",
        phaseInYears: num(phase),
        omNoi: num(noi),
      }),
    [price, assessed, bill, ratio, rate, rule, phase, noi],
  );

  const widestCap = Math.max(0.01, r.omCapPct ?? 0, r.realCapPct ?? 0);
  const widestPrice = Math.max(1, num(price) ?? 0, r.priceForOmCap ?? 0);

  return (
    <Card
      id="tax-reassessment"
      eyebrow="Taxes"
      title="What the taxes become when you own it"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Price" value={price} onChange={setPrice} placeholder="$25M" />
        <Field label="NOI in the OM" value={noi} onChange={setNoi} placeholder="1,500,000" />
        <Field
          label="Assessed today"
          value={assessed}
          onChange={setAssessed}
          placeholder="14,000,000"
        />
        <Field
          label="Tax bill today"
          value={bill}
          onChange={setBill}
          placeholder="210,000"
        />
        <Field label="Assessment ratio" suffix="%" value={ratio} onChange={setRatio} placeholder="100" />
        <Field label="Tax rate" suffix="%" value={rate} onChange={setRate} placeholder="1.5" />
        <Field label="Phase-in" suffix="yr" value={phase} onChange={setPhase} placeholder="1" />
        <Choice
          label="On transfer"
          value={rule}
          onChange={setRule}
          options={[
            { value: "yes", label: "Reassessed to price" },
            { value: "no", label: "Assessment carries over" },
          ]}
        />
      </div>

      {r.newTax !== null && (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Assessed after closing" value={usd(r.newAssessed)} tone="muted" />
          <Stat label="Your bill, stabilized" value={usd(r.newTax)} />
          <Stat label="Year one" value={usd(r.year1Tax)} tone="muted" />
          <Stat
            label="Added to the expense line"
            value={r.increase === null ? "—" : usd(r.increase)}
            tone={(r.increase ?? 0) > 0 ? "ink" : "muted"}
          />
        </div>
      )}

      {r.omCapPct !== null && r.realCapPct !== null && (
        <div className="mt-6 rounded-xl bg-faint p-4">
          <p className="text-sm font-semibold">
            {(r.capLostBps ?? 0) > 0 ? (
              <>
                You are buying a{" "}
                <span className="tabular-nums">{pct(r.realCapPct, 2)}</span>, not
                the{" "}
                <span className="tabular-nums">{pct(r.omCapPct, 2)}</span>{" "}
                on the cover.
              </>
            ) : (
              <>The assessor changes nothing here — the cap on the cover is the cap you get.</>
            )}
          </p>

          <div className="mt-3 space-y-2">
            {[
              { label: "The cap on the cover", amount: r.omCapPct, tone: "bg-brand" },
              {
                label: "The cap after the assessor catches up",
                amount: r.realCapPct,
                tone: (r.capLostBps ?? 0) > 0 ? "bg-kill" : "bg-brand",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {pct(row.amount, 2)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    data-bar="cap"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${((row.amount ?? 0) / widestCap) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.priceForOmCap !== null && r.overpayment !== null && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Said as a price, which is the number you negotiate with
          </p>
          <div className="mt-2 space-y-2">
            {[
              { label: "Asking", amount: num(price) ?? 0, tone: "bg-ink/25" },
              {
                label: `Where the ${pct(r.omCapPct, 2)} is actually true`,
                amount: r.priceForOmCap,
                tone: "bg-brand",
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {usd(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-faint">
                  <div
                    data-bar="price"
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${(row.amount / widestPrice) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {r.overpayment > 0 && (
            <p className="mt-3 text-sm">
              <span className="font-semibold tabular-nums text-kill">
                {usd(r.overpayment)}
              </span>{" "}
              of the price is the assessor&apos;s, not the seller&apos;s. The
              gap is solved rather than scaled: paying less lowers the
              assessment that caused it.
            </p>
          )}
        </div>
      )}

      {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Which jurisdictions reassess on transfer, what they assess at and how
        long a phase-in runs are facts about a place rather than arithmetic, so
        they are inputs here. Check them against the county before you price a
        deal on this.
      </p>
    </Card>
  );
}

/**
 * The load factor, and what it does to a quoted rent.
 *
 * The whole card exists for one inversion: two buildings quoting different
 * rents per rentable foot can rank the other way round per foot a tenant
 * can furnish, and the load factor is the only thing standing between the
 * two readings. A $40 quote at an 18% load is $47.20 of usable space; a $42
 * quote at 10% is $46.20. The cheaper-looking quote is the dearer space.
 *
 * The picture is one rentable foot split into what the tenant occupies and
 * what it pays for in the lobby, the corridors and the core.
 */
function RentableUsable() {
  const [grossSf, setGrossSf] = useShared("mgs", "100,000");
  const [rentableSf, setRentableSf] = useShared("mrs", "92,000");
  const [usableSf, setUsableSf] = useShared("mus", "80,000");
  const [rentPerRsf, setRentPerRsf] = useShared("mrr", "38");

  const r = useMemo(
    () =>
      readSpace({
        grossSf: num(grossSf),
        rentableSf: num(rentableSf),
        usableSf: num(usableSf),
        rentPerRsf: num(rentPerRsf),
      }),
    [grossSf, rentableSf, usableSf, rentPerRsf],
  );

  const usableShare =
    r.commonAreaSharePct === null ? null : 100 - r.commonAreaSharePct;

  return (
    <Card
      id="rentable-vs-usable"
      eyebrow="Leasing"
      title="Rentable, usable, and the rent you actually pay"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Building SF, gross" value={grossSf} onChange={setGrossSf} placeholder="100,000" />
        <Field label="Rentable SF" value={rentableSf} onChange={setRentableSf} placeholder="92,000" />
        <Field label="Usable SF" value={usableSf} onChange={setUsableSf} placeholder="80,000" />
        <Field label="Rent / RSF, annual" value={rentPerRsf} onChange={setRentPerRsf} placeholder="38" />
      </div>

      {usableShare !== null && (
        <div className="mt-6">
          <div className="flex h-4 overflow-hidden rounded-full bg-faint">
            <div
              data-bar="load-usable"
              className="h-full bg-brand"
              style={{ width: `${Math.max(0, Math.min(100, usableShare))}%` }}
            />
            <div
              data-bar="load-common"
              className="h-full bg-sidebar"
              style={{ width: `${Math.max(0, Math.min(100, r.commonAreaSharePct ?? 0))}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            Every 100 rentable feet is{" "}
            <span className="font-semibold tabular-nums text-ink">
              {usableShare.toFixed(0)} you occupy
            </span>{" "}
            and{" "}
            <span className="font-semibold tabular-nums text-ink">
              {(r.commonAreaSharePct ?? 0).toFixed(0)} of lobby, corridor and core
            </span>
            .
          </p>
        </div>
      )}

      {r.rentPerUsf !== null && (
        <p className="mt-4 text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">
            ${(num(rentPerRsf) ?? 0).toFixed(2)} per rentable foot
          </span>{" "}
          is{" "}
          <span className="font-semibold tabular-nums text-brand">
            ${r.rentPerUsf.toFixed(2)} per foot you can furnish
          </span>
          . That is the figure that compares two buildings, because a lower
          quote at a heavier load can be the more expensive space.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Load factor" value={pct(r.loadFactorPct, 1)} tone="brand" />
        <Stat label="Common area share" value={pct(r.commonAreaSharePct, 1)} tone="muted" />
        <Stat label="Efficiency" value={pct(r.efficiencyPct, 1)} tone="muted" />
        <Stat label="Rent, monthly" value={usdExact(r.monthlyRent)} />
      </div>

      {r.note && <p className="mt-4 text-sm text-caution">{r.note}</p>}
    </Card>
  );
}

// ── 8. one operating expense, three ways ───────────────────────────────────

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
    <Card id="operating-expense" eyebrow="Operations" title="One expense, three ways">
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
    <Card id="sources-and-uses" eyebrow="Capital" title="Sources and uses">
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
// ── which trailing window the memorandum chose ─────────────────────────────

/**
 * The seeded column: fifteen months of a stabilized building's NOI.
 *
 * Deliberately an ORDINARY deal rather than a dramatic one. The building
 * really is growing about 3½% a year AND its last three months are its peak
 * season — both true at once, which is the situation that makes the trap
 * invisible. Nothing here is a mistake; the seller simply quotes the window
 * that pays best, and the card prices that choice.
 */
const TRAILING_SEED = [
  "138,000",
  "140,000",
  "137,000",
  "128,000",
  "124,000",
  "121,000",
  "119,000",
  "122,000",
  "128,000",
  "133,000",
  "137,000",
  "140,000",
  "143,000",
  "145,000",
  "142,000",
].join("\n");

// ── the doors against the dollars ──────────────────────────────────────────

// ── when to sell ───────────────────────────────────────────────────────────

function HoldOrSell() {
  const [value, setValue] = useShared("hsV", "34M");
  const [noi, setNoi] = useShared("hsN", "1,870,000");
  const [growth, setGrowth] = useShared("hsG", "3");
  const [cap, setCap] = useShared("hsC", "5.5");
  const [cost, setCost] = useShared("hsS", "2");
  const [hurdle, setHurdle] = useShared("hsR", "12.5");
  const [loan, setLoan] = useShared("hsL", "18.5M");
  const [rate, setRate] = useShared("hsI", "4.25");
  const [amort, setAmort] = useShared("hsA", "30");
  const [tax, setTax] = useShared("hsT", "");

  const r = useMemo(
    () =>
      readHold({
        currentValue: num(value) ?? 0,
        nextYearNoi: num(noi) ?? 0,
        noiGrowthPct: num(growth) ?? 0,
        exitCapPct: num(cap) ?? 0,
        sellingCostPct: num(cost) ?? 0,
        reinvestmentRatePct: num(hurdle) ?? 0,
        loanBalance: num(loan) ?? 0,
        ratePct: num(rate) ?? 0,
        amortYears: num(amort) ?? 0,
        taxOnSaleNow: num(tax),
        horizonYears: 10,
      }),
    [value, noi, growth, cap, cost, hurdle, loan, rate, amort, tax],
  );

  // Every year drawn against the first year's return, so the DECAY is the
  // shape of the picture — the thing a lifetime IRR can never show. The
  // hurdle is a line across all of them, and the bars past it are muted.
  const top = Math.max(1, ...r.years.map((y) => y.marginalReturnPct ?? 0));
  const hurdlePct = num(hurdle);
  const hurdleAt = hurdlePct !== null && top > 0 ? (hurdlePct / top) * 100 : null;

  return (
    <Card id="hold-or-sell" eyebrow="Returns" title="Hold it or sell it">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Worth today" value={value} onChange={setValue} placeholder="34M" />
          <Field label="Next year's NOI" value={noi} onChange={setNoi} placeholder="1,870,000" />
          <Field label="NOI growth" suffix="%" value={growth} onChange={setGrowth} placeholder="3" />
          <Field label="Exit cap" suffix="%" value={cap} onChange={setCap} placeholder="5.5" />
          <Field label="Cost to sell" suffix="%" value={cost} onChange={setCost} placeholder="2" />
          <Field
            label="Next deal earns"
            suffix="%"
            value={hurdle}
            onChange={setHurdle}
            placeholder="12.5"
          />
          <Field label="Loan balance" value={loan} onChange={setLoan} placeholder="18.5M" />
          <Field label="Loan rate" suffix="%" value={rate} onChange={setRate} placeholder="4.25" />
          <Field label="Amortisation" suffix="yr" value={amort} onChange={setAmort} placeholder="30" />
          <Field label="Tax on a sale now" value={tax} onChange={setTax} placeholder="optional" />
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Cheque if you sell today" value={usd(r.netProceedsNow)} />
            <Stat label="Holding one more year" value={pct(r.nextYearReturnPct, 1)} tone="brand" />
            <Stat
              label="The year to sell"
              value={r.sellYear === null ? "not yet" : `Year ${r.sellYear}`}
              tone={r.sellYear === null ? "muted" : undefined}
            />
            <Stat
              label="Cap the price implies"
              value={pct(r.impliedCapNowPct, 2)}
              tone="muted"
            />
          </div>

          {r.years.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                The return on holding, year by year
              </p>
              <div className="mt-2 space-y-1.5">
                {r.years.map((y) => (
                  <div key={y.year} className="flex items-center gap-3 text-xs">
                    <span className="w-12 shrink-0 text-muted">Yr {y.year}</span>
                    <span className="relative h-2.5 flex-1 rounded-full bg-faint">
                      <span
                        data-bar="hold"
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          y.clears === false ? "bg-kill/60" : "bg-brand"
                        }`}
                        style={{
                          width: `${Math.max(0, Math.min(100, ((y.marginalReturnPct ?? 0) / top) * 100))}%`,
                        }}
                      />
                      {hurdleAt !== null && (
                        <span
                          className="absolute inset-y-0 w-px bg-ink/50"
                          style={{ left: `${Math.max(0, Math.min(100, hurdleAt))}%` }}
                        />
                      )}
                    </span>
                    <span
                      className={`w-14 shrink-0 text-right font-semibold tabular-nums ${
                        y.clears === false ? "text-kill" : ""
                      }`}
                    >
                      {pct(y.marginalReturnPct, 1)}
                    </span>
                    <span className="hidden w-24 shrink-0 text-right tabular-nums text-muted sm:inline">
                      {usd(y.netProceeds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {r.note && <p className="mt-3 text-sm text-caution">{r.note}</p>}

          {r.naiveNextYearReturnPct !== null && r.nextYearReturnPct !== null && (
            <p className="mt-2 text-sm">
              <span className="text-muted">
                Charge the whole cost of selling against the hold year, as though holding
                avoided it, and the same year reads{" "}
              </span>
              <span className="font-semibold tabular-nums text-kill">
                {pct(r.naiveNextYearReturnPct, 1)}
              </span>
              <span className="text-muted">
                {" "}
                instead. You pay that cost whenever you sell, so it belongs on both sides.
              </span>
            </p>
          )}

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            A lifetime IRR is an average over the whole hold and is dominated
            by what already happened, so it cannot tell you about next year.
            The capital at stake is the cheque you could take out today, not
            the building&apos;s value and not what you put in. And the return
            decays on its own: the cash flow grows with rents, but the equity
            underneath it grows faster, because the loan amortises and the
            value rises on top. A good deal becomes a mediocre hold with
            nothing going wrong.
          </p>
        </div>
      </div>
    </Card>
  );
}

function EconomicOccupancy() {
  const [units, setUnits] = useShared("eoU", "200");
  const [market, setMarket] = useShared("eoM", "1,850");
  const [occ, setOcc] = useShared("eoO", "95");
  const [ltl, setLtl] = useShared("eoL", "3.5");
  const [conc, setConc] = useShared("eoC", "1.5");
  const [nonRev, setNonRev] = useShared("eoN", "3");
  const [bad, setBad] = useShared("eoB", "1.2");
  const [other, setOther] = useShared("eoI", "310,000");
  const [opex, setOpex] = useShared("eoX", "1,950,000");
  const [price, setPrice] = useShared("eoP", "52M");

  const r = useMemo(
    () =>
      readEgi({
        units: num(units) ?? 0,
        marketRentPerUnit: num(market) ?? 0,
        physicalOccupancyPct: num(occ) ?? -1,
        lossToLeasePct: num(ltl),
        concessionsPct: num(conc),
        nonRevenueUnits: num(nonRev),
        badDebtPct: num(bad),
        otherIncomeAnnual: num(other),
        opexAnnual: num(opex),
        priceUsd: num(price),
      }),
    [units, market, occ, ltl, conc, nonRev, bad, other, opex, price],
  );

  // The two occupancies on ONE track, because the whole point is that they
  // are answers to the same question and they disagree. The economic bar
  // sits under the physical one so the overhang IS the gap.
  const phys = r.physicalOccupancyPct;
  const econ = r.economicOccupancyPct;
  // Each deduction as a share of the widest one, so the bridge reads as a
  // ranking before any figure is.
  const widestLine = Math.max(1, ...r.lines.map((l) => l.amount));

  const tone = (kind: string) =>
    kind === "vacancy"
      ? "bg-sidebar"
      : kind === "below-market"
        ? "bg-brand"
        : kind === "concession"
          ? "bg-caution"
          : "bg-kill";

  return (
    <Card id="economic-occupancy" eyebrow="The statement" title="The doors against the dollars">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Units" value={units} onChange={setUnits} placeholder="200" />
          <Field label="Market rent" suffix="/mo" value={market} onChange={setMarket} placeholder="1,850" />
          <Field label="Occupancy" suffix="%" value={occ} onChange={setOcc} placeholder="95" />
          <Field label="Loss to lease" suffix="%" value={ltl} onChange={setLtl} placeholder="3.5" />
          <Field label="Concessions" suffix="%" value={conc} onChange={setConc} placeholder="1.5" />
          <Field label="Non-revenue units" value={nonRev} onChange={setNonRev} placeholder="3" />
          <Field label="Bad debt" suffix="%" value={bad} onChange={setBad} placeholder="1.2" />
          <Field label="Other income" suffix="/yr" value={other} onChange={setOther} placeholder="310,000" />
          <Field label="Operating expenses" value={opex} onChange={setOpex} placeholder="1,950,000" />
          <Field label="Price" value={price} onChange={setPrice} placeholder="52M" />
        </div>

        <div>
          {phys !== null && econ !== null && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                What the cover says, and what the building banks
              </p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted">Doors</span>
                  <span className="relative h-3 flex-1 rounded-full bg-faint">
                    <span
                      data-bar="occ"
                      className="absolute inset-y-0 left-0 rounded-full bg-sidebar"
                      style={{ width: `${Math.max(0, Math.min(100, phys))}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
                    {pct(phys, 1)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted">Dollars</span>
                  <span className="relative h-3 flex-1 rounded-full bg-faint">
                    <span
                      data-bar="occ"
                      className="absolute inset-y-0 left-0 rounded-full bg-brand"
                      style={{ width: `${Math.max(0, Math.min(100, econ))}%` }}
                    />
                    <span
                      className="absolute inset-y-0 w-px bg-ink/50"
                      style={{ left: `${Math.max(0, Math.min(100, phys))}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-brand">
                    {pct(econ, 1)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {r.lines.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {usdExact(r.gpr)} of gross potential rent, less
              </p>
              <div className="mt-2 space-y-1.5">
                {r.lines.map((l) => (
                  <div key={l.label} className="flex items-center gap-3 text-xs">
                    <span className="w-32 shrink-0 text-muted">{l.label}</span>
                    <span className="relative h-2.5 flex-1 rounded-full bg-faint">
                      <span
                        data-bar="egi"
                        className={`absolute inset-y-0 left-0 rounded-full ${tone(l.kind)}`}
                        style={{ width: `${(l.amount / widestLine) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums">
                      {usdExact(l.amount)}
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-muted">
                      {l.pctOfGpr}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm">
                <span className="text-muted">Effective gross income </span>
                <span className="font-semibold tabular-nums">{usdExact(r.egi)}</span>
                <span className="text-muted">
                  , of which {usdExact(r.otherIncome)} is other income — which is in the
                  EGI and deliberately out of the ratio above.
                </span>
              </p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
            <Stat label="The gap" value={r.gapPoints === null ? "—" : `${r.gapPoints} pts`} />
            <Stat label="Rent per full unit" value={usdExact(r.collectedRentPerUnit)} />
            <Stat label="Going-in cap" value={pct(r.capPct, 2)} tone="brand" />
            <Stat
              label="Cap on doors alone"
              value={pct(r.capIfVacancyOnlyPct, 2)}
              tone="muted"
            />
          </div>

          {r.capOverstatementBps !== null && r.valueOfGap !== null && (
            <p className="mt-3 text-sm">
              <span className="text-muted">Underwrite the cover page — vacancy off the top and nothing else — and the going-in cap reads </span>
              <span className="font-semibold tabular-nums">{pct(r.capIfVacancyOnlyPct, 2)}</span>
              <span className="text-muted">, </span>
              <span className="font-semibold tabular-nums text-kill">{r.capOverstatementBps}bp</span>
              <span className="text-muted"> too high. At the cap this NOI really supports that is </span>
              <span className="font-semibold tabular-nums text-kill">{usdExact(r.valueOfGap)}</span>
              <span className="text-muted"> of price.</span>
            </p>
          )}

          {r.note && <p className="mt-2 text-sm text-caution">{r.note}</p>}

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            Physical occupancy counts doors and economic occupancy counts
            dollars, and the denominator here is market rent rather than the
            in-place rent roll — divide by the rents currently charged and
            loss to lease disappears into the denominator. Loss to lease
            closes as leases roll; a concession reverses when the market
            does; bad debt does neither. A model unit is physically full and
            pays nothing, so it gets its own line.
          </p>
        </div>
      </div>
    </Card>
  );
}

function TrailingWindow() {
  const [raw, setRaw] = useShared("tw", TRAILING_SEED);
  const [kind, setKind] = useShared("twk", "noi");
  const [cap, setCap] = useShared("twc", "5.5");

  const read = useMemo(() => readStrip(raw), [raw]);
  const r = useMemo(
    () =>
      readTrailing({
        monthly: read.values,
        kind: kind === "revenue" || kind === "expense" ? kind : "noi",
        capPct: num(cap),
      }),
    [read.values, kind, cap],
  );

  // Every window drawn on one track, scaled to the largest, so the shape of
  // the claim — a short window standing well clear of the full year — is
  // visible before a single figure is read. The FULL YEAR is the reference
  // line, which is the point: it is the only window holding a whole season.
  const widest = Math.max(1, ...r.windows.map((w) => Math.abs(w.annualized)));
  const t12Share = r.t12 !== null && widest > 0 ? (Math.abs(r.t12) / widest) * 100 : null;
  const expense = kind === "expense";

  return (
    <Card id="trailing-window" eyebrow="The statement" title="Which trailing window">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Monthly figures — oldest first
            </span>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={9}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs tabular-nums outline-none transition-colors focus:border-brand"
            />
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Fifteen months lets it check the last quarter against the same
            quarter a year earlier — the only honest short-window read.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Choice
              label="This column is"
              value={kind}
              onChange={setKind}
              options={[
                { value: "noi", label: "NOI" },
                { value: "revenue", label: "Revenue" },
                { value: "expense", label: "Expenses" },
              ]}
            />
            <Field label="Cap rate" suffix="%" value={cap} onChange={setCap} placeholder="5.5" />
          </div>
          {read.skipped.length > 0 && (
            <p className="mt-2 text-xs text-caution">
              Ignored: {read.skipped.slice(0, 4).join(", ")}
              {read.skipped.length > 4 ? ` and ${read.skipped.length - 4} more` : ""}.
            </p>
          )}
        </div>

        <div>
          {r.windows.length > 0 && (
            <div className="space-y-2">
              {r.windows.map((w) => {
                const lead = r.flattering?.months === w.months && r.windows.length > 1;
                return (
                  <div key={w.months} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 text-muted">{w.label}</span>
                    <span className="relative h-3 flex-1 rounded-full bg-faint">
                      <span
                        data-bar="window"
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          w.months === 12 ? "bg-sidebar" : lead ? "bg-caution" : "bg-brand/50"
                        }`}
                        style={{ width: `${(Math.abs(w.annualized) / widest) * 100}%` }}
                      />
                      {t12Share !== null && w.months !== 12 && (
                        <span
                          className="absolute inset-y-0 w-px bg-ink/50"
                          style={{ left: `${t12Share}%` }}
                        />
                      )}
                    </span>
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                      {usdExact(w.annualized)}
                    </span>
                    <span
                      className={`w-14 shrink-0 text-right tabular-nums ${
                        w.months === 12 ? "text-muted" : "text-muted"
                      }`}
                    >
                      {w.months === 12 ? "—" : `${w.vsT12Pct > 0 ? "+" : ""}${w.vsT12Pct}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {r.flattering && r.unflattering && (
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Stat label="Seller quotes" value={r.flattering.label} />
              <Stat
                label={expense ? "Understated by" : "Spread"}
                value={usdExact(r.spread)}
              />
              <Stat
                label="Worth, at that cap"
                value={usdExact(r.valueSpread)}
                tone={r.valueSpread === null ? "muted" : "brand"}
              />
              <Stat
                label="Same quarter, a year on"
                value={r.yoyQuarterPct === null ? "—" : pct(r.yoyQuarterPct, 1)}
                tone={r.yoyQuarterPct === null ? "muted" : undefined}
              />
            </div>
          )}

          {r.note && <p className="mt-3 text-sm text-caution">{r.note}</p>}

          {r.yoyQuarterPct !== null && r.flattering && r.flattering.months === 3 && (
            <p className="mt-2 text-sm text-muted">
              T-3 reads {r.windows.find((w) => w.months === 3)?.vsT12Pct}% above the
              full year, but against the same three months a year earlier the
              building is up {r.yoyQuarterPct}%. The rest is the season, not the
              trend.
            </p>
          )}

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            Annualizing a short window annualizes its seasonality too, and on
            an expense column it annualizes a year that never pays the tax
            bill — so the window a memorandum chose is an argument, not a
            fact. Only the full year holds a whole seasonal cycle.
          </p>
        </div>
      </div>
    </Card>
  );
}

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
    <Card id="unit-mix" eyebrow="Multifamily" title="Read the unit mix">
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
    <Card id="the-waterfall" eyebrow="Structure" title="Who actually gets the return">
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
    <Card id="the-loan-over-the-hold" eyebrow="Debt" title="What the loan does, and the refinance at the end">
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
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
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
              {/* The schedule is the one table here a reader most often wants
                  OUT of the page: it goes into a model, a lender's file or a
                  memo. Tab-delimited with headers and the numbers RAW — no
                  dollar signs, no commas, no compacting to "$11.02M" — so a
                  paste lands in a spreadsheet as numbers rather than as text
                  somebody then has to clean. The same rule as the cash-flow
                  strip's button, and the reason both exist.
                  `io` ships as a plain Yes/No column because "was this year
                  interest-only" is the fact that explains a flat balance,
                  and a schedule that does not say so reads as broken. */}
              <CopyButton
                label="Copy as table"
                text={() =>
                  ["Year\tOpening\tInterest\tPrincipal\tDebt service\tClosing\tInterest-only"]
                    .concat(
                      d.years.map((y) =>
                        [
                          y.year,
                          y.opening,
                          y.interest,
                          y.principal,
                          y.debtService,
                          y.closing,
                          y.io ? "Yes" : "No",
                        ].join("\t"),
                      ),
                    )
                    .join("\n")
                }
              />
            </div>
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

export function DealMathTools({ seeds = NO_SEEDS }: { seeds?: RateSeeds }) {
  return (
    <div className="space-y-6">
      {/* The index, clustered.
          
          It was one flat row, written when there were thirteen cards, and
          a flat row of twenty-six is a wall rather than a directory — the
          page measures 187KB of HTML, 4,165 words and 189 input fields,
          so finding the one card you came for is the page's real problem
          now, not having enough of them. Six named clusters of three to
          six scan at a glance, and the shape holds as the page grows
          instead of degrading with every addition.

          The grouping lives in the catalog beside the list, so it cannot
          drift from the cards it files. */}
      <nav aria-label="The calculators on this page" className="rounded-2xl border border-line bg-white p-4 sm:p-5 print:hidden">
        {/* The block still needs a name of its own. Six cluster headings
            tell you what is in it; this tells you what it is FOR, and
            the render test holds it there. */}
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-ink">
          Jump to
        </p>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupedTools().map(({ group, tools }) => (
            <div key={group}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {group}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tools.map((x) => (
                  <a
                    key={x.id}
                    href={`#${x.id}`}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium transition-colors hover:border-brand hover:text-brand"
                  >
                    {x.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* "Send me that sizing" is the sentence this answers. Every field on
          the page writes itself into the query string (useShared), so the
          link carries the whole state of every calculator — and carries
          only what was CHANGED, so an untouched page copies as a bare
          /tools rather than a paragraph of defaults. */}
      <div className="flex items-center justify-end print:hidden">
        <CopyButton
          label="Copy link to this sizing"
          text={() => window.location.href}
        />
      </div>
      <DebtSizer />
      <LoanOverTime />
      <CashFlowStrip />
      <HoldOrSell />
      <WhatYouBelieve />
      <SourcesUses />
      <CapitalStack />
      <LeaseBuyout />
      <FloatingRate sofrPct={seeds.sofrPct} sofrAsOf={seeds.sofrAsOf} />
      <ConstructionDraw />
      <Prepayment />
      <TrailingWindow />
      <EconomicOccupancy />
      <UnitMix />
      <SiteMeasures />
      <ResidualLand />
      <Waterfall />
      <NetEffectiveRent />
      <RentableUsable />
      <AfterTax />
      <Exchange1031 />
      <Recovery />
      <PercentageRent />
      <TaxReassessment />
      <GroundLease />
      <Proration />
      <div className="grid gap-6 lg:grid-cols-2">
        <CapTriangle />
        <RentConverter />
      </div>
      <OpexTranslator />
      <BuildOrBuy />
    </div>
  );
}
