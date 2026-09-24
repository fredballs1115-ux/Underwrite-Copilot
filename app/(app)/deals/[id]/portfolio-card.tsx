import Link from "next/link";
import { assetWords } from "@/lib/asset-words";
import { isStateMarket } from "@/lib/market-match";
import { ALLOCATION_TOLERANCE_PCT, CONCENTRATION_PCT, type PortfolioRead } from "@/lib/portfolio";

/**
 * A portfolio OM's properties, drawn — the pure card for `lib/portfolio`.
 *
 * One row a property: its share of the portfolio's count (or area) as a
 * bar, its share of the NOI as a second bar where EVERY property states
 * one, and the figures the memorandum states for it — never a figure it
 * does not. Above the rows, the markets the properties sit in (each a link
 * to its market page where the site has one) and the facts a buyer should
 * see before pricing any of it: one property carrying the income, an
 * allocation that does not add up to the ask, a property whose address
 * names no state.
 */
// Rounded on the integer tenths, not by toFixed on a float: $2,050,000 is
// $2.1M, where (2.05).toFixed(1) prints "2.0".
const money = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
const pct0 = (n: number) => `${Math.round(n)}%`;

export function PortfolioCard({
  portfolio,
  assetClass,
}: {
  portfolio: PortfolioRead | null;
  assetClass?: string | null;
}) {
  if (!portfolio) return null;
  const p = portfolio;
  const noun = assetWords(assetClass ?? undefined).noun ?? { one: "unit", many: "units" };
  const basisWord = p.shareBasis === "area" ? "SF" : noun.many;
  const widest = Math.max(1, ...(p.shares ?? []), ...(p.noiShares ?? []));
  const width = (v: number) => `${Math.max(1.5, (v / widest) * 100)}%`;

  const facts: string[] = [];
  if (p.largest?.of === "noi" && p.largest.sharePct >= CONCENTRATION_PCT) {
    facts.push(`${p.largest.name} carries ${pct0(p.largest.sharePct)} of the stated NOI — the portfolio's income rides on one property.`);
  }
  if (!p.noiShares && p.noiStated > 0) {
    facts.push(`${p.noiStated} of the ${p.assets.length} properties state an NOI of their own, so the income's split is not drawn.`);
  } else if (p.noiStated === 0) {
    facts.push("No property states an NOI of its own — the memorandum prices the portfolio on its total alone.");
  }
  if (p.allocationGapPct != null) {
    facts.push(
      Math.abs(p.allocationGapPct) > ALLOCATION_TOLERANCE_PCT
        ? `The allocated prices sum to ${money(p.allocationTotal as number)} against the ${money(p.askingPrice as number)} ask (${p.allocationGapPct > 0 ? "+" : ""}${p.allocationGapPct.toFixed(1)}%) — the memorandum does not add up.`
        : `The allocated prices sum to the ${money(p.askingPrice as number)} ask. An allocation is the seller's split, not a value.`,
    );
  }
  if (p.unplaced > 0) {
    facts.push(`${p.unplaced === 1 ? "One property's address names" : `${p.unplaced} properties' addresses name`} no state, so no market is read for ${p.unplaced === 1 ? "it" : "them"}.`);
  }

  return (
    <section
      className="rounded-2xl border border-line bg-surface shadow-card"
      data-qa="portfolio-card"
      aria-labelledby="portfolio-heading"
    >
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="portfolio-heading" className="text-sm font-semibold tracking-tight">
            {`The portfolio — ${p.assets.length} properties`}
          </h2>
          {p.shares && (
            <span className="text-[11px] text-muted">
              {`Bars: each property's share of the ${basisWord}${p.noiShares ? ", and beneath it of the NOI" : ""}`}
            </span>
          )}
        </div>
        {p.markets.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="The markets the properties sit in">
            {p.markets.map((m) => (
              <li key={m.id}>
                {isStateMarket(m.id) ? (
                  <span className="inline-flex rounded-full bg-faint px-2 py-0.5 text-[11px] text-muted">
                    {`${m.name} · ${m.properties}`}
                  </span>
                ) : (
                  <Link
                    href={`/market?metro=${m.id}`}
                    prefetch={false}
                    className="inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/20"
                  >
                    {`${m.name} · ${m.properties}`}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {facts.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-muted">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
      <ol className="divide-y divide-line">
        {p.assets.map((a, i) => {
          const figures = [
            a.count != null ? `${a.count.toLocaleString("en-US")} ${a.count === 1 ? noun.one : noun.many}` : null,
            a.area != null ? `${a.area.toLocaleString("en-US")} SF` : null,
            a.occupancy != null ? `${a.occupancy}% occupied` : null,
            a.yearBuilt != null ? `built ${a.yearBuilt}` : null,
            a.noi != null ? `NOI ${money(a.noi)}` : null,
            a.allocated != null
              ? `allocated ${money(a.allocated)}${a.allocatedPerCount != null ? ` (${money(a.allocatedPerCount)} per ${noun.one})` : ""}${
                  a.allocationCapPct != null ? `, a ${a.allocationCapPct.toFixed(1)}% cap on the allocation` : ""
                }`
              : null,
          ].filter((x): x is string => !!x);
          return (
            <li key={`${a.name}-${i}`} className="px-5 py-3" data-qa="portfolio-property">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{a.name}</span>
                {a.place && <span className="text-xs text-muted">{a.place}</span>}
                {a.page && <span className="ml-auto font-mono text-[10px] text-muted">{a.page}</span>}
              </div>
              {p.shares && (
                <div className="mt-1.5 space-y-1" aria-hidden>
                  <div className="h-2 rounded-full bg-faint">
                    <div className="h-2 rounded-full bg-brand/70" data-bar="portfolio" style={{ width: width(p.shares[i]) }} />
                  </div>
                  {p.noiShares && (
                    <div className="h-1.5 rounded-full bg-faint">
                      <div className="h-1.5 rounded-full bg-ink/50" data-bar="portfolio-noi" style={{ width: width(p.noiShares[i]) }} />
                    </div>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-muted">
                {[
                  p.shares ? `${pct0(p.shares[i])} of the ${basisWord}` : null,
                  p.noiShares ? `${pct0(p.noiShares[i])} of the NOI` : null,
                  ...figures,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
