import Link from "next/link";
import type { AssumableView } from "@/lib/assumable-debt";

/**
 * The seller's loan, offered for assumption (#417) — the pure card for
 * `lib/assumable-debt`, drawn on the Financials tab under the debt sizer.
 * It takes plain data (`assumableView`), so the engine and the /tools
 * arithmetic stay on the server.
 *
 * Two pictures and the answer. The rate: the loan's coupon and the rate
 * the model gives a new loan today, on one track. The coverage: the
 * model's year-1 NOI over each loan's debt service — the assumption buys
 * coverage as well as rate. Then what it is worth, and the one sentence
 * that says why, since the rate on its own never does. No absolute return
 * is drawn: the two positions run on the model's NOI before reserves and
 * sale costs, so only the difference between them is a figure worth
 * printing beside the model's own.
 */
// Rounded on the tenths, never a float's toFixed.
const money = (n: number) =>
  Math.abs(n) >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : Math.abs(n) >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
const pct2 = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;
const times = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}×`;
const width = (share: number) => `${Math.max(1.5, Math.min(1, share) * 100)}%`;

function Pair({
  title,
  rows,
  marker,
  format,
}: {
  title: string;
  rows: Array<{ label: string; value: number; tone: string }>;
  marker: string;
  format: (n: number) => string;
}) {
  const top = Math.max(...rows.map((r) => r.value)) * 1.1 || 1;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="mt-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span>{r.label}</span>
            <span className="font-mono tabular-nums">{format(r.value)}</span>
          </div>
          <div className="mt-0.5 h-2 rounded-full bg-faint" aria-hidden>
            <div className={`h-2 rounded-full ${r.tone}`} data-bar={marker} style={{ width: width(r.value / top) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssumableLoanCard({ view }: { view: AssumableView | null }) {
  if (!view) return null;
  const v = view;
  const tiles = [
    v.pricePremium != null
      ? { label: "Worth in price", value: money(v.pricePremium), sub: `${v.pricePremiumPct ?? 0}% of the ask` }
      : null,
    v.irrGapPts != null
      ? {
          label: "Against a new loan",
          value: `${v.irrGapPts > 0 ? "+" : v.irrGapPts < 0 ? "−" : ""}${Math.abs(v.irrGapPts).toFixed(1)} pts`,
          sub: "levered return, the two positions run whole",
        }
      : null,
    v.extraEquity != null
      ? {
          label: v.extraEquity >= 0 ? "More equity" : "Less equity",
          value: money(Math.abs(v.extraEquity)),
          sub: "the smaller balance, a larger cheque",
        }
      : null,
    v.debtServiceSaved != null
      ? {
          label: v.debtServiceSaved >= 0 ? "Debt service saved" : "More debt service",
          value: money(Math.abs(v.debtServiceSaved)),
          sub: "in year one",
        }
      : null,
  ].filter((t): t is { label: string; value: string; sub: string } => t != null);

  return (
    <section
      className="rounded-2xl border border-line bg-surface shadow-card print:break-inside-avoid"
      data-qa="assumable-loan"
      aria-labelledby="assumable-heading"
    >
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 id="assumable-heading" className="text-sm font-semibold tracking-tight">
            The loan in place, offered for assumption
          </h2>
          {v.page && <span className="font-mono text-[10px] text-muted">{v.page}</span>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{v.termsLine}</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        {v.couponPct != null && v.marketPct != null && (
          <div>
            <Pair
              title="The rate"
              marker="assume-rate"
              format={pct2}
              rows={[
                { label: "The loan in place", value: v.couponPct, tone: "bg-brand/70" },
                { label: "A new loan today", value: v.marketPct, tone: "bg-ink/40" },
              ]}
            />
            {v.underMarketBps != null && v.underMarketBps !== 0 && (
              <p className="mt-1 text-xs text-muted">
                {`${Math.abs(v.underMarketBps)} bps ${v.underMarketBps > 0 ? "under" : "over"} a new loan's rate`}
              </p>
            )}
            {v.rateLine && <p className="mt-0.5 text-[11px] leading-snug text-muted">{v.rateLine}</p>}
          </div>
        )}
        {v.dscrAssume != null && v.dscrNew != null && (
          <Pair
            title="Coverage, year one"
            marker="assume-dscr"
            format={times}
            rows={[
              { label: "Assuming the loan", value: v.dscrAssume, tone: "bg-brand/70" },
              { label: "The model's new loan", value: v.dscrNew, tone: "bg-ink/40" },
            ]}
          />
        )}
        {tiles.length > 0 && (
          <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-qa="assumable-figures">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-line bg-faint px-2.5 py-1.5">
                <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted">{t.label}</dt>
                <dd className="font-mono text-base font-semibold tabular-nums">{t.value}</dd>
                <dd className="text-[10px] leading-snug text-muted">{t.sub}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm leading-relaxed">{v.sentence}</p>
        {(v.basisLine || v.feeLine) && (
          <ul className="space-y-0.5 text-[11px] leading-snug text-muted">
            {v.basisLine && <li>{v.basisLine}</li>}
            {v.feeLine && <li>{v.feeLine}</li>}
          </ul>
        )}
        <p className="text-xs">
          <Link
            href="/tools#loan-assumption"
            prefetch={false}
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Run the assumption with other terms
          </Link>
        </p>
      </div>
    </section>
  );
}
