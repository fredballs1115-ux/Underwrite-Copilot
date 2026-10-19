"use client";

// The recorded sales as a list a reader can order (the comps page and the
// deal page's panel): nearest first as the search found them, or the most
// recent, the dearest, the dearest a square foot — each row keeping its pin
// number, so the map and the list still read together. A phone gets a card
// a sale (a 600px table scrolled sideways hid the price behind the
// address); from `sm` up the table takes over. Each sale's $/SF is a bar on
// one scale with the median's tick where the readout names one
// (lib/public-comps/picture `perSfBars`). On /comps the order is kept in the
// page's address (`?sort=`), so a reload or a shared link opens on it; the
// deal page's panel keeps it for the visit only. Where the readout hands it
// the control (./comps-readout), each sale can be left out of the readout
// with a reason, the way an appraiser's grid does: it stays listed, dimmed
// and struck through, says why, draws no $/SF bar, and is marked in the CSV
// (lib/public-comps/kept).

import { useState, type ReactNode } from "react";
import { compactUsd } from "@/lib/money";
import { fmtMiles } from "@/lib/geo";
import { safeHttpUrl } from "@/lib/safe-url";
import type { RecordComp } from "@/lib/public-comps/core";
import {
  LEAVE_OUT_REASONS,
  barsOnList,
  isLeaveOutReason,
  keptSales,
  leaveOutLabel,
  type LeaveOutReason,
  type SalesOut,
} from "@/lib/public-comps/kept";
import {
  SALES_SORTS,
  SALES_SORT_PARAM,
  compsCsv,
  compsCsvFileName,
  perSfBars,
  perSfSortOffered,
  perSqftOf,
  perUnitOf,
  readSalesSort,
  salesHeading,
  salesOrder,
  type CompsCsvSource,
  type PerSfBars,
  type SalesSort,
} from "@/lib/public-comps/picture";
import { ScrollRegion } from "@/app/scroll-region";
import { CopySalesButton, DownloadSalesButton } from "./record-sales-map";
import { addressParam, useAddressParam } from "./address-param";

/** The list shows this many sales; the rest fold behind "Show all". */
export const SALES_SHOWN = 12;

const fmtMoney = (n: number) => compactUsd(n, { millions: 2, thousandsFrom: Infinity });

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

/**
 * The order in the page's address (./address-param: replaceState, debounced,
 * read through useSyncExternalStore with the page's own searchParams as the
 * server snapshot). Nearest first is the bare link.
 */
const SORT_IN_ADDRESS = addressParam(SALES_SORT_PARAM);
const setSortInAddress = (by: SalesSort) => SORT_IN_ADDRESS.set(by === "nearest" ? null : by);

const NONE_OUT: SalesOut = new Map();

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
  provenance = null,
  mapped = false,
  keepSortInUrl = false,
  sortParam = null,
  children,
  out = NONE_OUT,
  onOut,
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
  /** the dataset, the day it was retrieved and the address searched, for
   *  the "Download CSV" beside the copy (every sale, in the list's order,
   *  lib/public-comps/picture `compsCsv`); none draws no download */
  provenance?: Omit<CompsCsvSource, "comps"> | null;
  /** the sales are drawn as numbered pins on a map beside the list (the
   *  comps page): each number says it is its pin */
  mapped?: boolean;
  /** keep the order in the page's address (the comps page; never the deal
   *  page's panel, which sits on a page with an address of its own) */
  keepSortInUrl?: boolean;
  /** the page's own `?sort=` as its searchParams read it, where the order is
   *  kept there: the server's render and the first client render open on it
   *  (`readSalesSort` holds it to the orders offered) */
  sortParam?: string | null;
  /** set between the heading and the list (the comp grid's hand-off) */
  children?: ReactNode;
  /** the sales the reader left out of the readout, by their place in the
   *  nearest-first list (lib/public-comps/kept): each stays listed, dimmed
   *  and struck through with its reason, draws no $/SF bar, and is marked
   *  in the CSV */
  out?: SalesOut;
  /** keep a sale again (null) or leave it out for a reason; given, each
   *  sale gets the control that does it */
  onOut?: (at: number, reason: LeaveOutReason | null) => void;
}) {
  const [local, setLocal] = useState<SalesSort>("nearest");
  const [inAddress] = useAddressParam(SORT_IN_ADDRESS, sortParam);
  // $/SF is offered as an order only where two sales or more state an area.
  const perSfOffered = perSfSortOffered(comps);
  const by = keepSortInUrl ? readSalesSort(inAddress, perSfOffered) : local;
  const setBy = keepSortInUrl ? setSortInAddress : setLocal;
  const order = salesOrder(comps, by);
  // The bars are the kept sales' (the readout's own set), drawn through the
  // one function on that set and put back on their pins. A row possibly of
  // one deed across parcels — flagged on the FULL list, so a deed whose other
  // rows are left out is still one — sets no scale and draws no bar.
  const kept = keptSales(comps, out);
  const bars = barsOnList(perSfBars(kept.comps, medianPerSqft, kept.at.map((i) => shared[i] ?? 0)), kept.at, comps.length);
  const first = order.slice(0, SALES_SHOWN);
  const rest = order.slice(SALES_SHOWN);
  const noArea = comps.filter((c) => perSqftOf(c) === null).length;
  const sorts = SALES_SORTS.filter((s) => s.key !== "perSf" || perSfOffered);
  const anyOut = out.size > 0;
  const rowsOf = { comps, shared, showUnits, bars, sortedBy: by, mapped, out, onOut };
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
          {provenance && comps.length > 0 && (
            <DownloadSalesButton fileName={compsCsvFileName(provenance)} csv={() => compsCsv({ ...provenance, comps }, order, out)} />
          )}
        </div>
      </div>
      {by === "perSf" && noArea > 0 && (
        <p className="mt-1 text-[11px] text-muted" data-qa="comps-sort-note">
          {noArea === 1 ? "One sale states no area; it is listed after the rest." : `${noArea} sales state no area; they are listed after the rest.`}
        </p>
      )}
      {children}
      <SalesRows {...rowsOf} order={first} label="Recorded sales" />
      {rest.length > 0 && (
        <details className="group mt-1.5">
          <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-strong">
            Show all {comps.length}
          </summary>
          <SalesRows {...rowsOf} order={rest} label="More recorded sales" />
        </details>
      )}
      {bars && (
        <p className="mt-1.5 text-[11px] text-muted" data-qa="comps-psf-caption">
          {/* Where rows may be one deed across parcels, the caption counts
              rows, as the readout does ("2 rows of one deed counted once");
              where the reader left sales out, it counts the kept. */}
          {`Bars: the price a square foot that ${psfCount(bars, kept.comps.length, anyOut)}, from zero to the highest, ${fmtPsf(bars.max)}${
            bars.medianShare !== null && medianPerSqft !== null ? `; the tick is the median, ${fmtPsf(medianPerSqft)}` : ""
          }.${
            bars.leftOut > 0
              ? ` ${bars.leftOut === 1 ? "One row" : `${bars.leftOut} rows`} possibly of one deed across parcels ${bars.leftOut === 1 ? "draws" : "draw"} no bar, and the median leaves ${bars.leftOut === 1 ? "it" : "them"} out.`
              : ""
          }${anyOut ? " A sale left out draws none." : ""}`}
        </p>
      )}
    </>
  );
}

const fmtPsf = (n: number) => `$${Math.round(n).toLocaleString("en-US")}/SF`;

/** Whose areas the bars are: "all 6 sales state", "3 of the 6 sales state",
 *  "3 of the 4 kept sales state" — rows where a deed may span parcels. */
function psfCount(bars: PerSfBars, total: number, anyOut: boolean): string {
  const noun = `${anyOut ? "kept " : ""}${bars.leftOut > 0 ? "rows" : "sales"}`;
  const n = bars.drawn + bars.leftOut;
  return n === total ? `all ${total} ${noun} state` : `${n} of the ${total} ${noun} state`;
}

/**
 * A sale's place in the readout: kept, or left out for one of the reasons
 * (lib/public-comps/kept). A select, so one control both toggles the sale and
 * says why, named for its pin for a screen reader.
 */
function KeepControl({
  at,
  reason,
  onOut,
}: {
  at: number;
  reason: LeaveOutReason | undefined;
  onOut: (at: number, reason: LeaveOutReason | null) => void;
}) {
  return (
    <select
      aria-label={`Sale ${at + 1} in the readout: kept, or left out with a reason`}
      value={reason ?? ""}
      onChange={(e) => onOut(at, isLeaveOutReason(e.target.value) ? e.target.value : null)}
      className={`max-w-full rounded-md border px-1 py-0.5 text-[11px] print:hidden ${
        reason ? "border-caution/50 text-caution" : "border-line text-muted"
      }`}
      data-qa="comps-keep"
    >
      <option value="">Kept</option>
      {LEAVE_OUT_REASONS.map((r) => (
        <option key={r.key} value={r.key}>
          {`Out: ${r.label.toLowerCase()}`}
        </option>
      ))}
    </select>
  );
}

/** What a left-out row says under its address. */
function OutLine({ reason }: { reason: LeaveOutReason }) {
  return (
    <span className="mt-0.5 block text-[11px] font-medium text-caution no-underline" data-qa="comps-left-out">
      {`Left out of the readout: ${leaveOutLabel(reason).toLowerCase()}`}
    </span>
  );
}

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
function AddressLink({ c, out = false }: { c: RecordComp; out?: boolean }) {
  const href = safeHttpUrl(c.sourceUrl);
  // A sale left out of the readout is struck through, its link kept.
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`break-words hover:text-brand ${out ? "text-muted line-through" : "underline decoration-dotted underline-offset-2"}`}
    >
      {c.address}
    </a>
  ) : (
    <span className={`break-words ${out ? "text-muted line-through" : ""}`}>{c.address}</span>
  );
}

/** A left-out sale's figures: dimmed and struck through. */
const STRUCK = "text-muted line-through";

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
  out,
  onOut,
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
  out: SalesOut;
  onOut?: (at: number, reason: LeaveOutReason | null) => void;
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
          const reason = out.get(at);
          return (
            <li
              key={`${c.address}|${c.saleDate}|${at}`}
              className={`rounded-xl border p-3 shadow-sm ${reason ? "border-dashed border-line bg-faint/40" : "border-line bg-surface"}`}
              data-left-out={reason ? "true" : undefined}
            >
              <div className="flex items-start gap-2">
                <PinNumber n={at + 1} mapped={mapped} />
                <p className="min-w-0 flex-1 text-sm font-medium">
                  <AddressLink c={c} out={!!reason} />
                </p>
                <p className={`shrink-0 text-right font-mono text-sm font-semibold tabular-nums ${reason ? STRUCK : ""}`}>{fmtMoney(c.price)}</p>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-7 text-xs text-muted">
                <span>{`Sold ${fmtDate(c.saleDate)}`}</span>
                <span className="tabular-nums">{fmtMiles(c.distanceKm)}</span>
                <span>{c.propertyType.toLowerCase()}</span>
                {psf !== null && <span className={`font-mono tabular-nums ${reason ? "line-through" : ""}`}>{`$${psf.toLocaleString("en-US")}/SF`}</span>}
                {showUnits && c.units != null && (
                  <span className="tabular-nums">
                    {`${c.units.toLocaleString("en-US")} ${c.units === 1 ? "unit" : "units"}`}
                    {perUnit != null ? `, ${fmtMoney(perUnit)}/unit` : ""}
                  </span>
                )}
              </p>
              {bars && bars.shares[at] != null && (
                <div className="pl-7">
                  <PerSfBar bars={bars} at={at} />
                </div>
              )}
              {parties.length > 0 && <p className="mt-1 pl-7 text-[11px] text-muted">{parties.join(" · ")}</p>}
              {group >= 2 && <p className="mt-1 pl-7 text-[11px] text-caution">{sharedLine(group)}</p>}
              {(reason || onOut) && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pl-7">
                  {reason ? <OutLine reason={reason} /> : <span />}
                  {onOut && <KeepControl at={at} reason={reason} onOut={onOut} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ScrollRegion label={label} className="mt-1.5 hidden sm:block">
        <table className={`w-full text-left text-sm ${onOut ? "min-w-[720px]" : "min-w-[600px]"}`}>
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
              <th className={`py-1.5 text-right font-medium ${onOut ? "pr-3" : ""}`} aria-sort={sortOf("nearest")}>Dist.</th>
              {onOut && <th className="py-1.5 font-medium">Readout</th>}
            </tr>
          </thead>
          <tbody>
            {order.map((at) => {
              const c = comps[at];
              const psf = perSqftOf(c);
              const perUnit = perUnitOf(c);
              const group = shared[at] ?? 0;
              const parties = partiesOf(c);
              const reason = out.get(at);
              return (
                <tr
                  key={`${c.address}|${c.saleDate}|${at}`}
                  className={`border-b border-line/60 align-top ${reason ? "bg-faint/40" : ""}`}
                  data-left-out={reason ? "true" : undefined}
                >
                  <td className="py-1.5 pr-2">
                    <PinNumber n={at + 1} mapped={mapped} />
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{fmtDate(c.saleDate)}</td>
                  <td className="py-1.5 pr-3">
                    <AddressLink c={c} out={!!reason} />
                    {reason && <OutLine reason={reason} />}
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
                  <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${reason ? STRUCK : ""}`}>{fmtMoney(c.price)}</td>
                  <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${reason && psf !== null ? STRUCK : ""}`}>
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
                  <td className={`py-1.5 text-right font-mono text-xs tabular-nums text-muted ${onOut ? "pr-3" : ""}`}>{fmtMiles(c.distanceKm)}</td>
                  {onOut && (
                    <td className="py-1 text-right">
                      <KeepControl at={at} reason={reason} onOut={onOut} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </>
  );
}
