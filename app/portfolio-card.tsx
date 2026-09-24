import Link from "next/link";
import { assetWords } from "@/lib/asset-words";
import { isStateMarket } from "@/lib/market-match";
import { portfolioFacts, propertyFigures, shareBasisWord, type PortfolioRead } from "@/lib/portfolio";

/**
 * A portfolio OM's properties, drawn — the pure card for `lib/portfolio`.
 *
 * One row a property: its share of the portfolio's count (or area) as a
 * bar, its share of the NOI as a second bar where EVERY property states
 * one, and the figures the memorandum states for it — never a figure it
 * does not. Above the rows, the markets the properties sit in (each a link
 * to its market page where the site has one) and the facts a buyer should
 * see before pricing any of it. The sentences are `lib/portfolio`'s
 * (`portfolioFacts`, `propertyFigures`), the same ones the report's
 * portfolio page and the shared screen print.
 */
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
  const basisWord = shareBasisWord(p, noun);
  const widest = Math.max(1, ...(p.shares ?? []), ...(p.noiShares ?? []));
  const width = (v: number) => `${Math.max(1.5, (v / widest) * 100)}%`;
  const facts = portfolioFacts(p);

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
          {p.shares && basisWord && (
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
        {p.assets.map((a, i) => (
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
            <p className="mt-1 text-xs text-muted">{propertyFigures(p, i, noun).join(" · ")}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
