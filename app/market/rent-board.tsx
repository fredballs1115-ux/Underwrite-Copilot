import Link from "next/link";
import { ZORI_CREDIT, ZORI_SOURCE_URL, monthOf, type ZoriRead } from "@/lib/zori";
import type { BoardMarket } from "./sector-jobs-board";

/**
 * Where apartment asking rents are moving: Zillow's index over multifamily
 * listings alone for every metro area the site reads — the briefed markets
 * and the ones read without a brief, forty-four of them — each against the
 * same month a year earlier, ranked fastest first with a signed bar from a
 * centre line, and beside each the typical home's price in years of the
 * all-homes asking rent, the arithmetic that keeps a renter renting. The
 * apartment figure ranks the board because an apartment underwrite should
 * read it; the all-homes one adds houses and condos and runs higher
 * wherever the houses are dear.
 *
 * Pure: the page reads every metro's rows in one query (`liveZoriAll`) and
 * hands the reads in with the markets. A suburb shares its metro area's
 * row and is not listed twice (`shared`); a metro whose read lacks the
 * apartment figure is listed after the ranked ones with its all-homes
 * change, never ranked on a different measure; nothing renders until the
 * monthly pull has written a row. Zillow's condition for the data is the
 * credit, which is part of the note and not the page's to forget.
 */
export function RentBoard({
  markets,
  reads,
}: {
  /** the briefed markets, then the metro areas read without a brief */
  markets: readonly BoardMarket[];
  /** `liveZoriAll(names)`, keyed by the market's name */
  reads: ReadonlyMap<string, ZoriRead | null>;
}) {
  const rows = markets.flatMap((market) => {
    const z = reads.get(market.name);
    return z && !z.shared ? [{ market, z }] : [];
  });
  const ranked = rows
    .filter((x): x is typeof x & { z: ZoriRead & { mfrYoyPct: number } } => x.z.mfrYoyPct !== null && Number.isFinite(x.z.mfrYoyPct))
    .sort((a, b) => b.z.mfrYoyPct - a.z.mfrYoyPct);
  if (ranked.length === 0) return null;
  const unranked = rows.filter((x) => !ranked.includes(x as (typeof ranked)[number]));
  const widest = Math.max(0.5, ...ranked.map((x) => Math.abs(x.z.mfrYoyPct)));
  const half = (v: number) => `${Math.min(50, (Math.abs(v) / widest) * 50)}%`;
  const newest = ranked.map((x) => x.z.asOf).sort().at(-1) ?? ranked[0].z.asOf;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5" data-qa="rent-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Where apartment asking rents are moving — every metro area the site reads, against a year ago</h2>
        <span className="text-[11px] text-muted">{`${ranked.length} metro areas ranked, fastest first · ${monthOf(newest)}`}</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {ranked.map(({ market, z }, i) => (
          <li key={market.id} className="grid grid-cols-[1.25rem_minmax(7rem,11rem)_1fr_auto_auto] items-center gap-2 text-xs">
            <span className="font-mono text-[10px] tabular-nums text-muted">{i + 1}</span>
            {market.briefed === false ? (
              <span className="truncate font-medium text-ink" title="Read without a brief — the same Zillow figure, no market page behind it">
                {market.name}
              </span>
            ) : (
              <Link
                href={`/market?metro=${market.id}`}
                prefetch={false}
                className="truncate font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {market.name}
              </Link>
            )}
            <div
              className="relative h-3 overflow-hidden rounded-full bg-faint"
              data-bar="rentboard"
              title={`Apartment asking rent $${z.mfrRent?.toLocaleString("en-US") ?? "—"}/mo, ${signed(z.mfrYoyPct)} from a year ago; all homes $${z.rent.toLocaleString("en-US")}/mo${z.yoyPct !== null ? `, ${signed(z.yoyPct)}` : ""} — ${monthOf(z.asOf)}`}
            >
              <div className="absolute inset-y-0 left-1/2 w-px bg-ink/40" />
              <div
                className={`absolute inset-y-0 rounded-full ${z.mfrYoyPct >= 0 ? "left-1/2 bg-brand/70" : "right-1/2 bg-amber-500/70"}`}
                style={{ width: half(z.mfrYoyPct) }}
              />
            </div>
            <span className="font-mono tabular-nums text-ink">{signed(z.mfrYoyPct)}</span>
            <span className="font-mono text-[11px] tabular-nums text-muted" title="A typical home's price in years of the all-homes asking rent">
              {z.priceToRentYears !== null ? `${z.priceToRentYears.toFixed(1)} yrs` : "—"}
            </span>
          </li>
        ))}
      </ol>
      {unranked.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {"No apartment figure this month, all homes shown rather than ranked: "}
          {unranked.map((x, i) => `${i > 0 ? "; " : ""}${x.market.name}${x.z.yoyPct !== null ? ` ${signed(x.z.yoyPct)}` : ""}`).join("")}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {`Zillow's Observed Rent Index over multifamily listings alone — this month's listings before concessions, each against the same month a year earlier — ranks the board; a suburb shares its metro area's row and is not listed twice. The years beside each bar are the typical home's price in years of the all-homes asking rent, and the sitting-tenant rent index on the metro tiles is a different measure: what leases already signed pay, where this is what a vacant unit re-lets at. ${ZORI_CREDIT}.`}{" "}
        <a href={ZORI_SOURCE_URL} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
          Zillow Research
        </a>
      </p>
    </section>
  );
}
