"use client";

// The recorded sales as a list a reader can order (the comps page and the
// deal page's panel): nearest first as the search found them, or the most
// recent, the dearest, the dearest a square foot — each row keeping its pin
// number, so the map and the list still read together. A phone gets a card
// a sale (a 600px table scrolled sideways hid the price behind the
// address); from `sm` up the table takes over. Each sale's $/SF is a bar on
// one scale with the median's tick where the readout names one
// (lib/public-comps/picture `perSfBars`).

import { useState, type ReactNode } from "react";
import { compactUsd } from "@/lib/money";
import { fmtMiles } from "@/lib/geo";
import { safeHttpUrl } from "@/lib/safe-url";
import type { RecordComp } from "@/lib/public-comps/core";
import {
  SALES_SORTS,
  perSfBars,
  perSqftOf,
  perUnitOf,
  salesHeading,
  salesOrder,
  type PerSfBars,
  type SalesSort,
} from "@/lib/public-comps/picture";
import { ScrollRegion } from "@/app/scroll-region";
import { CopySalesButton } from "./record-sales-map";

/** The list shows this many sales; the rest fold behind "Show all". */
export const SALES_SHOWN = 12;

const fmtMoney = (n: number) => compactUsd(n, { millions: 2, thousandsFrom: Infinity });

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

const SORT_ARIA: Record<SalesSort, "ascending" | "descending"> = {
  nearest: "ascending",
  newest: "descending",
  price: "descending",
  perSf: "descending",
};

export function SalesList({
  comps,
  shared,
  showUnits,
  medianPerSqft,
  copyText,
  mapped = false,
  children,
}: {
  /** the sales nearest first — each one's place is its pin number */
  comps: RecordComp[];
  /** for each sale, how many rows share its day, buyer and price, or 0
   *  (lib/public-comps/picture `sharedDeedCounts`) */
  shared: number[];
  showUnits: boolean;
  /** the $/SF median, only where the readout names one; null draws no tick */
  medianPerSqft: number | null;
  /** the tab-delimited table "Copy as table" writes (nearest first) */
  copyText: string;
  /** the sales are drawn as numbered pins on a map beside the list (the
   *  comps page): each number says it is its pin */
  mapped?: boolean;
  /** set between the heading and the list (the comp grid's hand-off) */
  children?: ReactNode;
}) {
  const [by, setBy] = useState<SalesSort>("nearest");
  const order = salesOrder(comps, by);
  const bars = perSfBars(comps, medianPerSqft);
  const first = order.slice(0, SALES_SHOWN);
  const rest = order.slice(SALES_SHOWN);
  const noArea = comps.filter((c) => perSqftOf(c) === null).length;
  // $/SF is offered as an order only where two sales or more state an area.
  const sorts = SALES_SORTS.filter((s) => s.key !== "perSf" || comps.length - noArea >= 2);
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted" aria-live="polite">
          {salesHeading(by, comps.length, SALES_SHOWN)}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {comps.length > 1 && (
            <div role="group" aria-label="Sort the sales" className="inline-flex rounded-lg border border-line p-0.5" data-qa="comps-sort">
              {sorts.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={by === s.key}
                  onClick={() => setBy(s.key)}
                  className={`min-h-7 rounded-md px-2 text-[11px] font-medium transition-colors ${
                    by === s.key ? "bg-brand text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <CopySalesButton text={copyText} />
        </div>
      </div>
      {by === "perSf" && noArea > 0 && (
        <p className="mt-1 text-[11px] text-muted" data-qa="comps-sort-note">
          {noArea === 1 ? "One sale states no area; it is listed after the rest." : `${noArea} sales state no area; they are listed after the rest.`}
        </p>
      )}
      {children}
      <SalesRows comps={comps} order={first} shared={shared} showUnits={showUnits} bars={bars} sortedBy={by} mapped={mapped} label="Recorded sales" />
      {rest.length > 0 && (
        <details className="group mt-1.5">
          <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-strong">
            Show all {comps.length}
          </summary>
          <SalesRows comps={comps} order={rest} shared={shared} showUnits={showUnits} bars={bars} sortedBy={by} mapped={mapped} label="More recorded sales" />
        </details>
      )}
      {bars && (
        <p className="mt-1.5 text-[11px] text-muted" data-qa="comps-psf-caption">
          {`Bars: the price a square foot that ${bars.drawn === comps.length ? `all ${bars.drawn} sales state` : `${bars.drawn} of the ${comps.length} sales state`}, from zero to the highest, ${fmtPsf(bars.max)}${
            bars.medianShare !== null && medianPerSqft !== null ? `; the tick is the median, ${fmtPsf(medianPerSqft)}` : ""
          }.`}
        </p>
      )}
    </>
  );
}

const fmtPsf = (n: number) => `$${Math.round(n).toLocaleString("en-US")}/SF`;

/** A sale's $/SF on the set's one scale, the median's tick over it. */
function PerSfBar({ bars, at }: { bars: PerSfBars; at: number }) {
  const share = bars.shares[at];
  if (share == null) return null;
  return (
    <span aria-hidden data-bar="comps-psf" className="relative mt-1 ml-auto block h-1 w-16 rounded-full bg-faint">
      <span className="absolute inset-y-0 left-0 rounded-full bg-brand/50" style={{ width: `${Math.round(share * 100)}%` }} />
      {bars.medianShare !== null && (
        <span
          data-bar="comps-psf-median"
          className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink"
          style={{ left: `calc(${Math.round(bars.medianShare * 100)}% - 1px)` }}
        />
      )}
    </span>
  );
}

/** The record's parties and deed type as it states them, or none. */
function partiesOf(c: RecordComp): string[] {
  return [
    c.buyer ? `Buyer ${c.buyer}` : "",
    c.seller ? `seller ${c.seller}` : "",
    c.deedType ? `deed type ${c.deedType}, as recorded` : "",
  ].filter(Boolean);
}

function sharedLine(group: number): string {
  return `Same day, buyer and price as ${group - 1} other ${group - 1 === 1 ? "row" : "rows"} — possibly one deed across ${group} parcels, each at its whole price.`;
}

/** A sale's address, linked to its record where the link is a web page. */
function AddressLink({ c }: { c: RecordComp }) {
  const href = safeHttpUrl(c.sourceUrl);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="break-words underline decoration-dotted underline-offset-2 hover:text-brand">
      {c.address}
    </a>
  ) : (
    <span className="break-words">{c.address}</span>
  );
}

/** A sale's place nearest first — its pin's number where a map draws the
 *  sales — kept whatever order the list is in. */
function PinNumber({ n, mapped }: { n: number; mapped: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white"
      title={mapped ? `Pin ${n} on the map` : `Number ${n} by distance`}
    >
      <span className="sr-only">{mapped ? "Pin " : "No. "}</span>
      {n}
    </span>
  );
}

function SalesRows({
  comps,
  order,
  shared,
  showUnits,
  bars,
  sortedBy,
  mapped,
  label,
}: {
  comps: RecordComp[];
  /** the indexes (nearest-first places) to draw, in the order to draw them */
  order: number[];
  shared: number[];
  showUnits: boolean;
  bars: PerSfBars | null;
  sortedBy: SalesSort;
  mapped: boolean;
  /** what the table (and its phone cards) are called to a screen reader */
  label: string;
}) {
  const sortOf = (col: SalesSort) => (sortedBy === col ? SORT_ARIA[col] : undefined);
  return (
    <>
      {/* Phone: a card a sale — the price beside the address, the rest
          under it — so a phone reads a whole sale without scrolling sideways. */}
      <ul className="mt-1.5 grid gap-2 sm:hidden" aria-label={`${label} as cards`}>
        {order.map((at) => {
          const c = comps[at];
          const psf = perSqftOf(c);
          const perUnit = perUnitOf(c);
          const group = shared[at] ?? 0;
          const parties = partiesOf(c);
          return (
            <li key={`${c.address}|${c.saleDate}|${at}`} className="rounded-xl border border-line bg-surface p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <PinNumber n={at + 1} mapped={mapped} />
                <p className="min-w-0 flex-1 text-sm font-medium">
                  <AddressLink c={c} />
                </p>
                <p className="shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{fmtMoney(c.price)}</p>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-7 text-xs text-muted">
                <span>{`Sold ${fmtDate(c.saleDate)}`}</span>
                <span className="tabular-nums">{fmtMiles(c.distanceKm)}</span>
                <span>{c.propertyType.toLowerCase()}</span>
                {psf !== null && <span className="font-mono tabular-nums">{`$${psf.toLocaleString("en-US")}/SF`}</span>}
                {showUnits && c.units != null && (
                  <span className="tabular-nums">
                    {`${c.units.toLocaleString("en-US")} ${c.units === 1 ? "unit" : "units"}`}
                    {perUnit != null ? `, ${fmtMoney(perUnit)}/unit` : ""}
                  </span>
                )}
              </p>
              {bars && psf !== null && (
                <div className="pl-7">
                  <PerSfBar bars={bars} at={at} />
                </div>
              )}
              {parties.length > 0 && <p className="mt-1 pl-7 text-[11px] text-muted">{parties.join(" · ")}</p>}
              {group >= 2 && <p className="mt-1 pl-7 text-[11px] text-caution">{sharedLine(group)}</p>}
            </li>
          );
        })}
      </ul>
      <ScrollRegion label={label} className="mt-1.5 hidden sm:block">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="w-8 py-1.5 pr-2 font-medium">
                <span className="sr-only">Pin</span>
              </th>
              <th className="py-1.5 pr-3 font-medium" aria-sort={sortOf("newest")}>Sold</th>
              <th className="py-1.5 pr-3 font-medium">Address</th>
              <th className="py-1.5 pr-3 text-right font-medium" aria-sort={sortOf("price")}>Price</th>
              <th className="py-1.5 pr-3 text-right font-medium" aria-sort={sortOf("perSf")}>$/SF</th>
              {showUnits && (
                <>
                  <th className="py-1.5 pr-3 text-right font-medium">Units</th>
                  <th className="py-1.5 pr-3 text-right font-medium">$/unit</th>
                </>
              )}
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 text-right font-medium" aria-sort={sortOf("nearest")}>Dist.</th>
            </tr>
          </thead>
          <tbody>
            {order.map((at) => {
              const c = comps[at];
              const psf = perSqftOf(c);
              const perUnit = perUnitOf(c);
              const group = shared[at] ?? 0;
              const parties = partiesOf(c);
              return (
                <tr key={`${c.address}|${c.saleDate}|${at}`} className="border-b border-line/60 align-top">
                  <td className="py-1.5 pr-2">
                    <PinNumber n={at + 1} mapped={mapped} />
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{fmtDate(c.saleDate)}</td>
                  <td className="py-1.5 pr-3">
                    <AddressLink c={c} />
                    {parties.length > 0 && (
                      <span className="mt-0.5 block text-[11px] text-muted" data-qa="comps-parties">
                        {parties.join(" · ")}
                      </span>
                    )}
                    {group >= 2 && (
                      <span className="mt-0.5 block text-[11px] text-caution" data-qa="comps-shared-deed">
                        {sharedLine(group)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{fmtMoney(c.price)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {psf !== null ? `$${psf.toLocaleString("en-US")}` : "—"}
                    {bars && <PerSfBar bars={bars} at={at} />}
                  </td>
                  {showUnits && (
                    <>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{c.units != null ? c.units.toLocaleString("en-US") : "—"}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{perUnit != null ? fmtMoney(perUnit) : "—"}</td>
                    </>
                  )}
                  <td className="py-1.5 pr-3 text-xs text-muted">{c.propertyType.toLowerCase()}</td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-muted">{fmtMiles(c.distanceKm)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </>
  );
}
