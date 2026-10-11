// /comps' search as its query string, so a search is a link: `r` the radius
// in miles, `m` the window in months, `cls` the class key. Each is read only
// as one of the choices offered (lib/public-record-asks, lib/public-comps/
// classes); anything else is the default — the deal panel's fixed ask, a
// mile over two years widened once when thin, every recorded sale.
//
// Pure.

import { RECORDED_SALES_MONTH_CHOICES, RECORDED_SALES_RADIUS_CHOICES } from "@/lib/public-record-asks";
import { compsClassKey } from "./classes";

export interface CompsQuery {
  /** miles as offered, or null for the default (widened when thin) */
  radiusMiles: number | null;
  /** months as offered, or null for the default */
  monthsBack: number | null;
  /** the class key, "" for every sale */
  cls: string;
}

export function readCompsQuery(p: { r?: string; m?: string; cls?: string }): CompsQuery {
  const r = Number(p.r);
  const m = Number(p.m);
  return {
    radiusMiles: RECORDED_SALES_RADIUS_CHOICES.some((c) => c.miles === r) ? r : null,
    monthsBack: RECORDED_SALES_MONTH_CHOICES.includes(m) ? m : null,
    cls: compsClassKey(p.cls),
  };
}

/** The ask a query hands the engine: kilometres as the asks file states
 *  them, or none where the reader set neither. */
export function askOf(q: CompsQuery): { radiusKm?: number; monthsBack?: number } | null {
  if (q.radiusMiles == null && q.monthsBack == null) return null;
  const km = RECORDED_SALES_RADIUS_CHOICES.find((c) => c.miles === q.radiusMiles)?.km;
  return {
    ...(km != null ? { radiusKm: km } : {}),
    ...(q.monthsBack != null ? { monthsBack: q.monthsBack } : {}),
  };
}
