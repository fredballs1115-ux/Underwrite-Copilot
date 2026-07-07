"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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

/** Counts a stat up from 0 when it scrolls into view. */
export function CountUp({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || value === 0) {
      const id = requestAnimationFrame(() => setN(value));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        const t0 = performance.now();
        const dur = 900;
        const tick = (t: number) => {
          if (cancelled) return;
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(eased * value));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {n}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive demo — what the screen looks like, tab by tab.          */
/* All data below is an ILLUSTRATIVE SAMPLE, clearly labeled in the UI. */
/* ------------------------------------------------------------------ */

const TABS = ["Ranges", "Deal-killers", "Comps", "Verdict"] as const;
type Tab = (typeof TABS)[number];

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

function DemoPanel({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Ranges":
      return (
        <div className="space-y-3">
          <RangeRow
            label="Exit cap"
            low="5.25%"
            base="5.50%"
            high="5.75%"
            src="submarket trades 5.25–5.75%; broker holds 5.25%."
          />
          <RangeRow
            label="Market rent (1BR)"
            low="$1,410"
            base="$1,465"
            high="$1,540"
            src="rent roll actuals · OM p.34 pro forma flagged +9%."
          />
        </div>
      );
    case "Deal-killers":
      return (
        <div className="space-y-3">
          <Killer
            n={1}
            name="Basis"
            read="$285k/unit is 12% above the last two comparable trades with no renovation premium to justify it."
            severity="kill"
          />
          <Killer
            n={2}
            name="Exit"
            read="Underwriting exits 25 bps below the going-in cap after a 5-year hold — the spread does the returns' heavy lifting."
            severity="caution"
          />
          <Killer
            n={3}
            name="Debt"
            read="65% LTV at a fixed rate with two years IO — coverage holds in the base and low cases."
            severity="pass"
          />
        </div>
      );
    case "Comps":
      return (
        <div className="space-y-2.5">
          <CompRow
            name="The Wells at Preston Creek"
            meta="2019 build · 2.1 mi · traded 14 months ago"
            rating="support"
          />
          <CompRow
            name="Lakeline Commons"
            meta="1998 build, renovated · 5.8 mi · smaller units"
            rating="leans"
          />
          <CompRow
            name="Axis on Fifth"
            meta="urban core, different tenant base · 11 mi"
            rating="stretched"
          />
          <p className="text-[10px] leading-relaxed text-muted">
            Every comp is pulled from the broker&apos;s own deck and ranked for
            how hard it supports the asking price.
          </p>
        </div>
      );
    case "Verdict":
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
              Caution
            </span>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            {[
              ["Conservative", "No-go", "text-kill"],
              ["Base", "Caution", "text-caution"],
              ["Sponsor", "Go", "text-pass"],
            ].map(([k, v, c]) => (
              <div key={k} className="bg-surface px-2 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted">{k}</p>
                <p className={`mt-0.5 text-xs font-semibold ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            The verdict flips across scenarios — that spread <em>is</em> the
            finding. This deal earns a model only at the right basis.
          </p>
        </div>
      );
  }
}

/** Tabbed walkthrough of the screen's output — pure sample data. */
export function DemoTabs() {
  const [tab, setTab] = useState<Tab>("Ranges");

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
          className="flex gap-1"
        >
          {TABS.map((t) => (
            <button
              key={t}
              id={`demo-tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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
      <div role="tabpanel" className="animate-fade min-h-[21rem] p-4" key={tab}>
        <DemoPanel tab={tab} />
      </div>
    </div>
  );
}
