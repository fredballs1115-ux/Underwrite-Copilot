import Link from "next/link";
import { LeaseTermBar } from "@/app/lease-term-bar";
import type { LeaseholdExitView } from "@/lib/leasehold-exit";

/**
 * A leasehold's exit, valued on the term left at the sale (#421) — the pure
 * card for `lib/leasehold-exit`, drawn on the Financials tab under the debt
 * sizer. It takes plain data (`leaseholdExitView`), so the engine stays on
 * the server.
 *
 * Two pictures and the answer. The term: the years left from today, the
 * model's hold marked on them, and the options dashed after — or, where
 * the lease ends inside the hold, the hold's years past its end in the
 * warning tone. The exit: the model's capitalised sale and the same sale
 * valued on the years left, on one track. Then the model's own returns at
 * that exit, and the one sentence.
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
const pct1 = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
};
const yrs = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const width = (share: number) => `${Math.max(1.5, Math.min(1, share) * 100)}%`;

export function LeaseholdExitCard({ view }: { view: LeaseholdExitView | null }) {
  if (!view) return null;
  const v = view;
  const tiles = [
    v.yearsAtSale != null
      ? { label: "Left at the sale", value: `${yrs(v.yearsAtSale)} yrs`, sub: `of ${yrs(v.yearsLeft)} today` }
      : null,
    v.sharePct != null
      ? { label: "The term's share", value: v.sharePct >= 99.5 ? "within 1%" : `${Math.round(v.sharePct)}%`, sub: "of the capitalised exit" }
      : null,
    v.termCapPct != null ? { label: "Exit cap, on the term", value: pct2(v.termCapPct), sub: `the model runs ${pct2(v.exitCapPct)}` } : null,
    v.sharePct != null
      ? {
          label: "Levered IRR, on the term",
          value: v.leveredIrrOnTermPct != null ? pct1(v.leveredIrrOnTermPct) : "none",
          sub: v.leveredIrrOnTermPct != null ? (v.leveredIrrPct != null ? `${pct1(v.leveredIrrPct)} as it runs` : "") : "the sale does not repay the loan",
        }
      : null,
  ].filter((t): t is { label: string; value: string; sub: string } => t != null);
  const top = Math.max(v.capitalised, v.onTerm ?? 0) * 1.1 || 1;

  return (
    <section
      className="rounded-2xl border border-line bg-surface shadow-card print:break-inside-avoid"
      data-qa="leasehold-exit"
      aria-labelledby="leasehold-exit-heading"
    >
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 id="leasehold-exit-heading" className="text-sm font-semibold tracking-tight">
            The exit, on the ground lease&rsquo;s term
          </h2>
          {v.page && <span className="font-mono text-[10px] text-muted">{v.page}</span>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{`${v.termLine}.`}</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">The term</p>
          <LeaseTermBar yearsLeft={v.yearsLeft} endLabel={v.endLabel} optionYears={v.optionYears} holdYears={v.holdYears} />
        </div>
        {v.onTerm != null && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">The exit</p>
            {[
              { label: "Capitalised, as the model runs it", value: v.capitalised, tone: "bg-ink/40", marker: "lh-capitalised" },
              {
                label: `On the ${yrs(v.yearsAtSale ?? 0)} years left at the sale`,
                value: v.onTerm,
                tone: "bg-brand/70",
                marker: "lh-term",
              },
            ].map((r) => (
              <div key={r.marker} className="mt-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span>{r.label}</span>
                  <span className="font-mono tabular-nums">{money(r.value)}</span>
                </div>
                <div className="mt-0.5 h-2 rounded-full bg-faint" aria-hidden>
                  <div className={`h-2 rounded-full ${r.tone}`} data-bar={r.marker} style={{ width: width(r.value / top) }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {tiles.length > 0 && (
          <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-qa="leasehold-figures">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-line bg-faint px-2.5 py-1.5">
                <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted">{t.label}</dt>
                <dd className="font-mono text-base font-semibold tabular-nums">{t.value}</dd>
                {t.sub && <dd className="text-[10px] leading-snug text-muted">{t.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm leading-relaxed">{v.sentence}</p>
        {(v.optionsLine || v.lenderLine || v.basisLine) && (
          <ul className="space-y-0.5 text-[11px] leading-snug text-muted">
            {v.optionsLine && <li>{v.optionsLine}</li>}
            {v.lenderLine && <li>{v.lenderLine}</li>}
            {v.basisLine && <li>{v.basisLine}</li>}
          </ul>
        )}
        <p className="text-xs">
          <Link href="/tools#ground-lease" prefetch={false} className="font-medium text-brand underline-offset-2 hover:underline">
            Value the leasehold with its ground rent and resets
          </Link>
        </p>
      </div>
    </section>
  );
}
