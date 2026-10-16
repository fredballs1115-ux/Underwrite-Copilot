import Link from "next/link";
import { assetClassLabel } from "@/lib/asset-class";
import { metroForName } from "@/lib/market-match";
import {
  basisLabel,
  fmtBasisRange,
  fmtCapRange,
  type MarketGroup,
} from "@/lib/market-memory";
import { OVERHEAD_GRID_CREDIT, galleryCredit, hasSkyline } from "@/lib/skyline";
import { marketPath } from "@/lib/public-pages";
import { GalleryCreditText } from "@/app/photo-credit";
import { CityPhoto } from "@/app/city-photo";

const CALL_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "text-pass" },
  caution: { label: "Caution", cls: "text-caution" },
  pass_on: { label: "No-go", cls: "text-kill" },
};

/**
 * The reader's own market memory as cards, one market × one asset class,
 * each opening on its market's photograph where the market the memorandum
 * named is one the site has a page for (`metroForName`, the reader the
 * submarket cards use: the site's own name for a market, or a city with its
 * state — nothing guessed). The strip wears the market's name, since the
 * picture is the metro's and not the deal's submarket, and links to the
 * market's brief. One credit line under the grid names every photographer
 * shown, as the submarket cards' does (`galleryCredit`).
 *
 * Pure: the page reads the memory and hands the groups in, so the render
 * test draws this on a fixture.
 */
export function MarketMemoryCards({ groups }: { groups: readonly MarketGroup[] }) {
  const cards = groups.map((g) => ({ g, market: metroForName(g.market) }));
  const pictured = [...new Set(cards.flatMap((c) => (c.market ? [c.market.id] : [])))];
  const credit = galleryCredit(pictured);
  const anyOverhead = pictured.some((id) => !hasSkyline(id));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ g, market }) => (
          <MarketCard key={`${g.assetClass}|${g.marketKey}`} g={g} market={market} />
        ))}
      </div>
      {credit || anyOverhead ? (
        <p className="text-[11px] leading-relaxed text-muted" data-qa="memory-credit">
          {credit ? (
            <>
              <GalleryCreditText ids={pictured} linkClassName="underline decoration-dotted underline-offset-2 hover:text-ink" />{" "}
            </>
          ) : null}
          {anyOverhead ? OVERHEAD_GRID_CREDIT : null}
        </p>
      ) : null}
    </>
  );
}

function MarketCard({ g, market }: { g: MarketGroup; market: { id: string; name: string } | null }) {
  const calls = (
    [
      ["pass", g.calls.pass],
      ["caution", g.calls.caution],
      ["pass_on", g.calls.pass_on],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <section className="shadow-card flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {market ? (
        <Link
          href={marketPath(market.id)}
          className="group relative block h-24 shrink-0 bg-faint outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60"
          data-picture="memory"
        >
          {/* A strip wider than the panorama is covered by its width: one
              card a row on a phone, two, then three (the submarket cards'
              sizes). */}
          <CityPhoto
            metro={market.id}
            width={480}
            height={192}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 47vw, 92vw"
            showCredit={false}
            className="h-full w-full object-cover object-[50%_42%] transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
          <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">
            <span className="sr-only">Open the market brief: </span>
            {market.name}
          </span>
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{g.market}</h2>
            <p className="mt-0.5 text-xs text-muted">{assetClassLabel(g.assetClass)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-faint px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
            {g.count} screen{g.count === 1 ? "" : "s"}
          </span>
        </div>

        <dl className="mt-4 space-y-2.5">
          <Stat label="Going-in cap" value={g.cap ? fmtCapRange(g.cap) : null} />
          <Stat label={basisLabel(g)} value={g.perUnit ? fmtBasisRange(g.perUnit) : null} />
        </dl>

        {calls.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
            {calls.map(([key, n]) => (
              <span key={key} className={CALL_META[key].cls}>
                <span className="font-mono tabular-nums">{n}</span> {CALL_META[key].label}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">
        {value ?? <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}
