import type { DeliveryQuarter } from "@/lib/market/metrics";
import type { Submarket } from "@/lib/market/types";
import { assetClassLabel } from "@/lib/asset-class";
import { coverFor } from "@/lib/deal-cover";
import { DealCover } from "@/app/(app)/deals/deal-cover";
import { BarRow, BarRows } from "@/app/panel-parts";

/**
 * The submarket page's pictures (pure, so the render test draws them on a
 * fixture; the page itself reads a database no test can reach): the
 * construction pipeline's deliveries a bar a quarter on one scale, each
 * building's size a bar on one scale in the pipeline table, and — where the
 * metro its owner typed names no market the site has a photograph for — the
 * drawn cover of its class over the page's heading, as its card on /market
 * opens (app/market/submarket-cards).
 */

/** A pipeline's square feet, short: "120k SF", "1.2M SF", "800 SF". */
export function sfShort(sf: number): string {
  if (sf >= 999_500) return `${(sf / 1_000_000).toFixed(1).replace(/\.0$/, "")}M SF`;
  if (sf >= 1_000) return `${Math.round(sf / 1_000)}k SF`;
  return `${Math.round(sf)} SF`;
}

/** A quarter's figure: its square feet, and where some of its buildings
 *  state no size, how many — "120k SF (1 of 2 buildings states no size)",
 *  since the sum is then a floor, not the quarter's total. A quarter none of
 *  whose buildings states a size says that. */
export function deliveryFigure(d: Pick<DeliveryQuarter, "sf" | "count" | "unsized">): string {
  const unsized = d.unsized ?? 0;
  if (!(d.sf > 0)) return "SF not stated";
  if (unsized <= 0) return sfShort(d.sf);
  return `${sfShort(d.sf)} (${unsized} of ${d.count} building${d.count === 1 ? "" : "s"} ${unsized === 1 ? "states" : "state"} no size)`;
}

/**
 * The dated deliveries, a bar a quarter on one scale (the largest quarter's
 * square feet), each with its figure and how many buildings make it. A
 * quarter whose buildings state no size has no bar and says so, never a bar
 * of nothing. A quarter holding a building flagged for review says that too.
 */
export function DeliveryBars({ deliveries }: { deliveries: readonly DeliveryQuarter[] }) {
  if (deliveries.length === 0) return <p className="text-xs text-muted">No dated deliveries</p>;
  const max = Math.max(...deliveries.map((d) => d.sf));
  return (
    <BarRows className="text-xs" qa="sub-deliveries">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Deliveries by quarter</h3>
      <div className="flex flex-col gap-1.5">
        {deliveries.map((d) => (
          <BarRow
            key={d.quarter}
            label={
              <span title={d.names.join(" · ") || undefined}>
                {`${d.quarter} · ${d.count} building${d.count === 1 ? "" : "s"}`}
                {d.hasStale ? <span className="text-caution">{" · review"}</span> : null}
              </span>
            }
            figure={deliveryFigure(d)}
          >
            {d.sf > 0 && max > 0 ? (
              // A quarter with a building of no stated size is at least its
              // bar: the bar ends in a dashed edge, never a closed one.
              <div
                className={`absolute inset-y-0 left-0 ${
                  (d.unsized ?? 0) > 0
                    ? "rounded-l-full border-r-2 border-dashed border-ink/70"
                    : "rounded-full"
                } ${d.hasStale ? "bg-caution" : "bg-brand"}`}
                style={{ width: `${Math.max(2, (d.sf / max) * 100)}%` }}
                data-bar="sub-delivery"
                data-partial={(d.unsized ?? 0) > 0 ? "" : undefined}
              />
            ) : null}
          </BarRow>
        ))}
      </div>
    </BarRows>
  );
}

/** One building's size in the pipeline table: its figure, and under it a bar
 *  on the table's one scale (the largest building's). A blank size is a
 *  dash and no bar. */
export function PipelineSfCell({ sf, max }: { sf: number | null; max: number }) {
  if (sf == null) return <>—</>;
  return (
    <span className="inline-flex w-28 flex-col items-end gap-1">
      <span>{`${Math.round(sf).toLocaleString("en-US")} SF`}</span>
      {max > 0 ? (
        <span aria-hidden className="relative block h-2 w-full rounded-full bg-faint">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-brand/70"
            style={{ width: `${Math.max(2, (sf / max) * 100)}%` }}
            data-bar="sub-pipeline-sf"
          />
        </span>
      ) : null}
    </span>
  );
}

/** The page's heading where its metro names no market with a photograph: the
 *  drawn cover of the submarket's class (lib/deal-cover, the pipeline's last
 *  resort) wearing the class, then the name as the page's `h1`. An
 *  illustration owes no credit; it is hidden from a screen reader, since the
 *  class is said in the line under the heading. */
export function SubmarketCoverHead({ submarket }: { submarket: Pick<Submarket, "id" | "name" | "assetClass"> }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden
        className="relative h-28 overflow-hidden rounded-2xl bg-faint sm:h-36"
        data-picture="submarket-head-cover"
      >
        <DealCover
          cover={coverFor({ seed: submarket.id, assetClass: submarket.assetClass })}
          label={submarket.name}
          words={false}
          className="absolute inset-0"
        />
        <span className="absolute bottom-2 left-3 rounded bg-black/60 px-1.5 py-px text-[11px] font-medium text-white">
          {assetClassLabel(submarket.assetClass)}
        </span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{submarket.name}</h1>
    </div>
  );
}
