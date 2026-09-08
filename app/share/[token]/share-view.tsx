import Link from "next/link";
import type {
  BrokerCompsResult,
  ExtractionResult,
  MarketResult,
  ScreenRange,
  VerdictCall,
  VerdictResult,
  VerdictScenario,
} from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { keyTermRows } from "@/lib/key-terms";
import { SharePlan } from "./plan-facts";

/**
 * The read-only shared screen, as pure markup. `page.tsx` is the loader: it
 * checks the token, the link's expiry and revocation and the sender's
 * access, then hands this view the deal row. Nothing here reads a clock or
 * a database, so the render tests draw it on the deal fixtures and the
 * phone walk can reach the one signed-out surface it could not before.
 *
 * Deliberately excluded: documents, notes, the buyer's buy box, and
 * anything editable — this is the page an analyst forwards to a partner or
 * lender.
 */
export interface ShareViewProps {
  dealName: string;
  assetClass: string | null;
  /** the link's expiry, ISO */
  expiresAt: string;
  /** the sender's latest screen failed before it reached the verdict */
  verdictStale: boolean;
  extraction: ExtractionResult | null;
  comps: BrokerCompsResult | null;
  market: MarketResult | null;
  verdict: VerdictResult;
}

// A range's confidence, in the deal page's colours (RANGE_CONF there).
const RANGE_CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

// The deal page's verdict hero, reduced to its mark: the disc, the word and
// the rail in the call's colour.
const VERDICT_META: Record<
  VerdictCall,
  { label: string; cls: string; border: string; disc: string; dot: string }
> = {
  pass: { label: "Go", cls: "text-pass", border: "border-pass", disc: "bg-pass/15 text-pass", dot: "bg-pass" },
  caution: {
    label: "Caution",
    cls: "text-caution",
    border: "border-caution",
    disc: "bg-caution/15 text-caution",
    dot: "bg-caution",
  },
  pass_on: { label: "No-go", cls: "text-kill", border: "border-kill", disc: "bg-kill/15 text-kill", dot: "bg-kill" },
};
const UNKNOWN_VERDICT = {
  label: "Screened",
  cls: "text-ink",
  border: "border-line",
  disc: "bg-faint text-muted",
  dot: "bg-muted",
};

const LEVER_LABEL: Record<string, string> = { basis: "Basis", exit: "Exit", debt: "Debt" };
const SCENARIO_LABEL: Record<VerdictScenario["scenario"], string> = {
  conservative: "Conservative",
  base: "Base",
  sponsor: "Sponsor",
};
const SCENARIO_ORDER: VerdictScenario["scenario"][] = ["conservative", "base", "sponsor"];

function VerdictIcon({ call, className }: { call: VerdictCall | null; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (call === "pass") {
    return (
      <svg {...common}>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    );
  }
  if (call === "pass_on") {
    return (
      <svg {...common}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (call === "caution") {
    return (
      <svg {...common}>
        <path d="M12 3.5L2.5 20h19L12 3.5z" />
        <path d="M12 9.5v4.5" />
        <path d="M12 17.25h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

/** Pull the first numeric out of a display string ("$1,495" → 1495). */
function firstNum(sv: string): number | null {
  const m = sv.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Where the base sits inside low→high — the deal page's positional read. */
function basePosition(r: ScreenRange): number | null {
  const lo = firstNum(r.low);
  const hi = firstNum(r.high);
  const base = firstNum(r.base);
  return lo != null && hi != null && base != null && hi > lo
    ? Math.min(1, Math.max(0, (base - lo) / (hi - lo)))
    : null;
}

/** A first sentence in the open, the rest one click away (the Market data
 *  page's fold). The whole text stays in the HTML. */
function Fold({ text, className = "" }: { text: string; className?: string }) {
  const m = /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(text);
  if (!m) return <p className={className}>{text}</p>;
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {m[1]} <span className="text-[11px] font-medium text-brand">more</span>
      </summary>
      <p className="mt-1">{m[2]}</p>
    </details>
  );
}

export function Expired({ reason }: { reason: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-tight">Underwrite Copilot</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        This link isn&rsquo;t available
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{reason}</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        What is Underwrite Copilot?
      </Link>
    </main>
  );
}

function FlipDots({ scenarios }: { scenarios: VerdictScenario[] }) {
  const ordered = [...scenarios].sort(
    (a, b) => SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario),
  );
  if (ordered.length === 0) return null;
  return (
    <ol
      aria-label="The call across the range"
      className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0"
    >
      {ordered.map((s, i) => {
        const meta = VERDICT_META[s.call] ?? UNKNOWN_VERDICT;
        return (
          <li key={s.scenario} className="flex items-center sm:flex-1">
            {i > 0 && <span aria-hidden className="hidden h-px flex-1 bg-line sm:block" />}
            <span
              className="flex items-center gap-1.5 text-xs"
              title={s.note}
            >
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <span className="text-muted">{SCENARIO_LABEL[s.scenario] ?? s.scenario}</span>
              <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ShareView({
  dealName,
  assetClass,
  expiresAt,
  verdictStale,
  extraction,
  comps,
  market,
  verdict,
}: ShareViewProps) {
  const vmeta = VERDICT_META[verdict.verdict] ?? UNKNOWN_VERDICT;
  const call: VerdictCall | null = VERDICT_META[verdict.verdict] ? verdict.verdict : null;

  const screen = verdict.screen;
  // The deal's kind first — a partner reading "$21M stabilized NOI" beside a
  // $20M price needs to know it is a conversion's finished-project figure.
  const safeExtraction = extraction
    ? { ...extraction, metrics: extraction.metrics ?? [] }
    : null;
  const strategy = inferStrategy(safeExtraction);
  const plan = planSummary(safeExtraction, strategy);
  // The deal-defining rows first, as the memo orders them (lib/key-terms.ts).
  const metrics = keyTermRows(safeExtraction?.metrics ?? [], strategy.kind, 8);
  const ranges = (screen?.ranges ?? []).slice(0, 6);
  const killers = (screen?.dealKillers ?? []).slice(0, 3);

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          Underwrite Copilot
        </p>
        <p className="text-xs text-muted">
          Shared read-only screen · expires{" "}
          {new Date(expiresAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </header>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{dealName}</h1>
      <p className="mt-1 text-sm capitalize text-muted">
        {[
          extraction?.market,
          assetClass,
          strategy.kind !== "unknown" ? strategy.label : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <section
        className={`mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm border-l-4 ${vmeta.border}`}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          First-pass verdict
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${vmeta.disc}`}
          >
            <VerdictIcon call={call} className="h-5 w-5" />
          </span>
          <p className={`text-3xl font-semibold leading-none tracking-tight ${vmeta.cls}`}>
            {vmeta.label}
          </p>
        </div>
        {verdictStale && (
          <p className="mt-2 text-xs text-caution">
            From the previous completed screen — the sender&rsquo;s latest run of this
            deal did not finish.
          </p>
        )}
        {verdict.reason && (
          <p className="mt-3 text-sm leading-relaxed">{verdict.reason}</p>
        )}
        {screen && (screen.sensitivity ?? []).length > 0 && (
          <FlipDots scenarios={screen.sensitivity} />
        )}
        {(verdict.topRisks ?? []).length > 0 && (
          <ul className="mt-4 space-y-1.5" aria-label="Top risks">
            {verdict.topRisks.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SharePlan strategy={strategy} plan={plan} />

      {ranges.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            The screen — ranges, not hero numbers
          </h2>
          {/* The deal page's range cards, not a table: a table had to scroll
              sideways on a phone, leaving a lender with the Low column. */}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Screening ranges">
            {ranges.map((r, i) => {
              // The honesty markers the deal page shows on every range card:
              // the model's confidence, where the base sits inside the range
              // (hugging the sponsor's end is a tell), and what drives the
              // spread.
              const conf = RANGE_CONF[r.confidence];
              const pos = basePosition(r);
              const posLabel =
                pos != null && pos > 0.7
                  ? "Base sits near the optimistic end of the range"
                  : "Where the base sits inside the range";
              return (
                <li key={i} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.label}</p>
                    {conf && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium uppercase ${conf.cls}`}
                        title={`${conf.label} confidence`}
                      >
                        {conf.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
                    <div className="bg-surface px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">Low</p>
                      <p className="mt-0.5 text-sm tabular-nums">{r.low}</p>
                    </div>
                    <div className="bg-brand/10 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">Base</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-brand">{r.base}</p>
                    </div>
                    <div className="bg-surface px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">High</p>
                      <p className="mt-0.5 text-sm tabular-nums">{r.high}</p>
                    </div>
                  </div>
                  {pos != null && (
                    <span
                      role="img"
                      aria-label={posLabel}
                      title={posLabel}
                      className="relative mt-2.5 block h-1 rounded-full bg-line"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-brand/30"
                        style={{ width: `${pos * 100}%` }}
                      />
                      <span
                        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
                          pos > 0.7 ? "bg-caution" : "bg-brand"
                        }`}
                        style={{ left: `${pos * 100}%` }}
                      />
                    </span>
                  )}
                  <p className="mt-2 text-xs text-muted">{r.source}</p>
                  {r.basis && <p className="mt-0.5 text-[11px] text-muted">{r.basis}</p>}
                </li>
              );
            })}
          </ul>

          {killers.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {killers.map((k, i) => (
                <div key={i}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] tabular-nums"
                    >
                      {i + 1}
                    </span>
                    {LEVER_LABEL[k.lever] ?? k.lever}
                  </p>
                  <p className="mt-1 text-sm text-muted">{k.read}</p>
                  {k.risk && (
                    <p className="mt-1 text-xs text-kill">Breaks if: {k.risk}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {metrics.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Key terms</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m, i) => (
              <div key={i} className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs uppercase tracking-wider text-muted">
                  {/* A lender reading "PRO FORMA …" beside 5.7% learns nothing:
                      the label wraps to a second line rather than truncating,
                      and the badge drops under it when the column is narrow. */}
                  <span className="line-clamp-2">{m.label}</span>
                  {/* The same badge the deal page puts on every metric card:
                      a bare "NOI" or "Cap rate" label says nothing about
                      whether the figure is today's or the sponsor's story. */}
                  {m.basis === "pro_forma" && (
                    <span className="shrink-0 rounded bg-caution/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-caution">
                      pro forma
                    </span>
                  )}
                  {m.basis === "in_place" && (
                    <span className="shrink-0 rounded bg-pass/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-pass">
                      in place
                    </span>
                  )}
                </p>
                {/* Two columns on a phone: "$68,000,000" ran into the cap
                    beside it at full size. */}
                <p className="mt-0.5 text-sm font-semibold tabular-nums sm:text-base">{m.value}</p>
                {m.flagged && (
                  <p className="text-[11px] text-caution">verify vs. source</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(comps?.summary || market?.summary) && (
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          {comps?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">Comp read</h2>
              <Fold text={comps.summary} className="mt-2 text-sm leading-relaxed text-muted" />
            </div>
          )}
          {market?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">Market read</h2>
              <Fold text={market.summary} className="mt-2 text-sm leading-relaxed text-muted" />
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-center">
        <p className="text-xs text-muted">
          First-pass screen, not investment advice. Figures flagged
          &ldquo;verify vs. source&rdquo; deserve independent confirmation.
        </p>
        <p className="mt-3 text-sm">
          Screened with{" "}
          <Link
            href="/"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Underwrite Copilot
          </Link>{" "}
          — the disciplined first pass for CRE deals.
        </p>
      </footer>
    </main>
  );
}
