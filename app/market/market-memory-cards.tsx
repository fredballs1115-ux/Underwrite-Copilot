import Link from "next/link";
import { assetClassLabel } from "@/lib/asset-class";
import { metroForName } from "@/lib/market-match";
import {
  basisLabel,
  fmtBasisRange,
  fmtCapRange,
  type MarketGroup,
  type Stat,
} from "@/lib/market-memory";
import { MEDIAN_FLOOR } from "@/lib/public-comps/core";
import { coverFor } from "@/lib/deal-cover";
import { DealCover } from "@/app/(app)/deals/deal-cover";
import { Key, KeyItem, Tick } from "@/app/panel-parts";
import { OVERHEAD_GRID_CREDIT } from "@/lib/skyline";
import { marketPath } from "@/lib/public-pages";
import { CityPhoto } from "@/app/city-photo";
import { ShownCreditGrid } from "@/app/shown-credit";
import { gridPictures } from "@/app/market/grid-credit";
import { marketPageWord } from "@/app/market/market-lead";

const CALL_META: Record<string, { label: string; cls: string; fill: string }> = {
  pass: { label: "Go", cls: "text-pass", fill: "bg-pass" },
  caution: { label: "Caution", cls: "text-caution", fill: "bg-caution" },
  pass_on: { label: "No-go", cls: "text-kill", fill: "bg-kill" },
};

/** One scale a range bar is drawn on: the lowest and highest figure across
 *  the cards it is shared by. A scale of one figure is widened a little each
 *  way, so its one figure sits in the middle. */
type Scale = { lo: number; hi: number };
function scaleOf(stats: readonly (Stat | null)[]): Scale | null {
  const own = stats.filter((s): s is Stat => s != null);
  if (own.length === 0) return null;
  const lo = Math.min(...own.map((s) => s.min));
  const hi = Math.max(...own.map((s) => s.max));
  if (hi > lo) return { lo, hi };
  const pad = Math.abs(lo) * 0.05 || 1;
  return { lo: lo - pad, hi: hi + pad };
}

/**
 * The reader's own market memory as cards, one market × one asset class,
 * each opening on its market's photograph where the market the memorandum
 * named is one the site has a page for (`metroForName`, the reader the
 * submarket cards use: the site's own name for a market, or a city with its
 * state — nothing guessed). The strip wears the market's name, since the
 * picture is the metro's and not the deal's submarket, and links to the
 * market's page (its brief, or its figures where it has none). One credit
 * line under the grid names the pictures the strips actually show
 * (app/shown-credit): a photograph that fails takes its photographer off it.
 *
 * Pure: the page reads the memory and hands the groups in, so the render
 * test draws this on a fixture.
 */
export function MarketMemoryCards({ groups }: { groups: readonly MarketGroup[] }) {
  const cards = groups.map((g) => ({ g, market: metroForName(g.market) }));
  const pictured = [...new Set(cards.flatMap((c) => (c.market ? [c.market.id] : [])))];
  // The caps share one scale across the cards; a basis shares one only with
  // the cards quoting it on the same basis and noun ("Basis / key" is never
  // set against "Basis / SF").
  const capScale = scaleOf(groups.map((g) => g.cap));
  const basisScales = new Map<string, Scale | null>();
  for (const label of new Set(groups.map((g) => basisLabel(g)))) {
    basisScales.set(label, scaleOf(groups.filter((g) => basisLabel(g) === label).map((g) => g.perUnit)));
  }
  return (
    <ShownCreditGrid
      pictures={gridPictures(pictured)}
      overheadLine={OVERHEAD_GRID_CREDIT}
      qa="memory-credit"
      className="text-[11px] leading-relaxed text-muted"
      linkClassName="underline decoration-dotted underline-offset-2 hover:text-ink"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ g, market }) => (
          <MarketCard
            key={`${g.assetClass}|${g.marketKey}`}
            g={g}
            market={market}
            capScale={capScale}
            basisScale={basisScales.get(basisLabel(g)) ?? null}
          />
        ))}
      </div>
    </ShownCreditGrid>
  );
}

function MarketCard({
  g,
  market,
  capScale,
  basisScale,
}: {
  g: MarketGroup;
  market: { id: string; name: string } | null;
  capScale: Scale | null;
  basisScale: Scale | null;
}) {
  const calls = (
    [
      ["pass", g.calls.pass],
      ["caution", g.calls.caution],
      ["pass_on", g.calls.pass_on],
    ] as const
  ).filter(([, n]) => n > 0);
  const called = calls.reduce((t, [, n]) => t + n, 0);

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
            reportShown
            className="h-full w-full object-cover object-[50%_42%] transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
          <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">
            <span className="sr-only">
              {marketPageWord(market.id) === "brief" ? "Open the market brief: " : "Open the market page: "}
            </span>
            {market.name}
          </span>
        </Link>
      ) : (
        // No market the site has a photograph for: the drawn cover of the
        // group's class (lib/deal-cover, the pipeline's last resort), so
        // every card opens on a picture and the grid keeps one rhythm. An
        // illustration owes no credit, and its class is said in the card's
        // words below, so it is hidden from a screen reader.
        <div className="relative h-24 shrink-0 bg-faint" data-picture="memory-cover" aria-hidden>
          <DealCover
            cover={coverFor({ seed: `${g.assetClass}|${g.marketKey}`, assetClass: g.assetClass })}
            label={g.market}
            words={false}
            className="absolute inset-0"
          />
          <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">
            {assetClassLabel(g.assetClass)}
          </span>
        </div>
      )}
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

        <dl className="mt-4 space-y-3">
          <RangeStat
            label="Going-in cap"
            stat={g.cap}
            scale={capScale}
            fmt={(v) => fmtCapRange({ min: v, median: v, max: v })}
            value={g.cap ? fmtCapRange(g.cap) : null}
            bar="memory-cap"
          />
          <RangeStat
            label={basisLabel(g)}
            stat={g.perUnit}
            scale={basisScale}
            fmt={(v) => (g.perUnit ? fmtBasisRange({ ...g.perUnit, min: v, median: v, max: v }) : "")}
            value={g.perUnit ? fmtBasisRange(g.perUnit) : null}
            bar="memory-basis"
          />
        </dl>

        {called > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            {/* The calls as one split bar, a segment a call in its tone —
                the pipeline's verdict split, drawn small. */}
            <div aria-hidden className="flex h-2 gap-px overflow-hidden rounded-full bg-faint">
              {calls.map(([key, n]) => (
                <span
                  key={key}
                  className={`h-full ${CALL_META[key].fill}`}
                  style={{ width: `${(n / called) * 100}%` }}
                  data-bar="memory-calls"
                />
              ))}
            </div>
            <Key className="mt-1.5">
              {calls.map(([key, n]) => (
                <KeyItem key={key} mark="swatch" tone={CALL_META[key].fill}>
                  <span className={CALL_META[key].cls}>
                    <span className="font-mono tabular-nums">{n}</span> {CALL_META[key].label}
                  </span>
                </KeyItem>
              ))}
            </Key>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * A range, drawn: the figure in words, and under it the range from its
 * lowest to its highest screen as a fill on the scale the cards share, with
 * a tick at the median only from three screens up (lib/public-comps
 * `MEDIAN_FLOOR` — one or two screens make no median, and their range is
 * the figures themselves).
 */
function RangeStat({
  label,
  stat,
  scale,
  fmt,
  value,
  bar,
}: {
  label: string;
  stat: Stat | null;
  scale: Scale | null;
  fmt: (v: number) => string;
  value: string | null;
  bar: string;
}) {
  const at = (v: number) => (scale ? ((v - scale.lo) / (scale.hi - scale.lo)) * 100 : 0);
  const showMedian = stat != null && (stat.n ?? 0) >= MEDIAN_FLOOR;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-mono text-sm tabular-nums">{value ?? <span className="text-muted">—</span>}</dd>
      </div>
      {stat && scale ? (
        <>
          <div aria-hidden className="relative mt-1 h-2 rounded-full bg-faint">
            <div
              className="absolute inset-y-0 rounded-full bg-brand/45"
              style={{ left: `${at(stat.min)}%`, width: `${Math.max(1.5, at(stat.max) - at(stat.min))}%` }}
              data-bar={bar}
            />
            {showMedian ? <Tick at={`${at(stat.median)}%`} bar={`${bar}-median`} track="secondary" /> : null}
          </div>
          {showMedian ? (
            <p className="mt-0.5 text-right text-[11px] text-muted">{`median ${fmt(stat.median)} of ${stat.n} screens`}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
