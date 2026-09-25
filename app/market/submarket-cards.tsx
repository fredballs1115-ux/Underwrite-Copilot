import Link from "next/link";
import type { Submarket } from "@/lib/market/types";
import { assetClassLabel } from "@/lib/asset-class";
import { metroForName } from "@/lib/market-match";
import { OVERHEAD_GRID_CREDIT, galleryCredit, hasSkyline } from "@/lib/skyline";
import { CityPhoto } from "@/app/city-photo";

/** One line naming what a submarket's persistent exclusion rules drop. */
export function exclusionLine(rules: Submarket["exclusionRules"]): string | null {
  const bits = [
    ...rules.subtypes,
    ...rules.namePatterns,
    rules.minSf != null ? `under ${rules.minSf.toLocaleString("en-US")} SF` : null,
    rules.maxSf != null ? `over ${rules.maxSf.toLocaleString("en-US")} SF` : null,
  ].filter((b): b is string => !!b);
  return bits.length ? bits.join(", ") : null;
}

/**
 * The user's submarkets as cards, each opening on its metro's photograph
 * where the metro its owner typed names a market (`metroForName` — the
 * site's own name for one, or a city with its state; nothing guessed). The
 * strip wears the market's name, because the picture is the metro's and
 * not the submarket's. One credit line under the grid names every
 * photographer shown, the way the homepage's gallery does.
 *
 * Pure: the panel reads the list and hands it in, so the render test draws
 * this on a fixture.
 */
export function SubmarketCards({ submarkets }: { submarkets: readonly Submarket[] }) {
  const cards = submarkets.map((s) => ({ s, market: metroForName(s.metro) }));
  const pictured = [...new Set(cards.flatMap((c) => (c.market ? [c.market.id] : [])))];
  const credit = galleryCredit(pictured);
  const anyOverhead = pictured.some((id) => !hasSkyline(id));

  return (
    <>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ s, market }) => {
          const excl = exclusionLine(s.exclusionRules);
          return (
            <li key={s.id}>
              <Link
                href={`/submarkets/${s.id}`}
                className="hover-lift flex h-full flex-col overflow-hidden rounded-lg border border-line bg-canvas/60 transition hover:border-brand/40"
              >
                {market ? (
                  <div className="relative h-24 shrink-0 bg-faint" data-picture="submarket">
                    <CityPhoto
                      metro={market.id}
                      width={480}
                      height={192}
                      showCredit={false}
                      className="h-full w-full object-cover object-[50%_42%]"
                    />
                    <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">
                      {market.name}
                    </span>
                  </div>
                ) : null}
                <span className="flex flex-col gap-1 p-3.5">
                  <span className="text-sm font-medium text-ink">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.metro ? `${s.metro} · ` : ""}
                    <span>{assetClassLabel(s.assetClass)}</span>
                    {" · "}warns past {s.supplyWarningMonths} mo of supply
                  </span>
                  {excl ? <span className="text-xs text-muted">Excludes: {excl}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {credit || anyOverhead ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {credit ? <>{credit} </> : null}
          {anyOverhead ? OVERHEAD_GRID_CREDIT : null}
        </p>
      ) : null}
    </>
  );
}
