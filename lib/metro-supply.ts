import { PERMIT_WINDOW_MONTHS, permitsTrailingYear, seriesUrl, type LiveRate, type MetroSeriesMeta } from "@/lib/live-rates";
import { monthOf } from "@/lib/zori";

/**
 * The supply side of a rental market: the units the metro area has
 * permitted in buildings of two or more — the pipeline an apartment
 * underwrite is competing with — read out of the two counts the Census
 * Bureau publishes and FRED carries for a metro: every unit permitted, and
 * the single-family ones. FRED publishes no multi-unit series for any
 * metro or state (probed 2026-09-23: `BP5FH` and `BP24FH` exist for none),
 * so the multi-unit figure is the total less the single-family series,
 * month by month, and every surface says so.
 *
 * Three rules. A month of permits is the season, so the figure is twelve
 * months against the twelve before (`permitsTrailingYear`'s rule), and a
 * partial year answers null rather than scaling. The two series are
 * aligned by their own dates — a month one of them lacks is left out of
 * BOTH sums, so the subtraction never runs across different months. And
 * the share is of the same window, so a metro that permits nothing but
 * apartments reads 100% rather than more.
 *
 * Pure, and the result is plain data: the deal page's client card draws
 * it as one line, the market brief says it as one sentence with its own
 * figure key, and the market page draws the two years as stacked bars.
 */
export interface SupplyMonth {
  obsDate: string;
  total: number;
  single: number;
  /** the total less the single-family units */
  multi: number;
}

export interface MetroSupply {
  /** the metro the permit series are filed under — the MSA's, for a suburb that borrows them */
  metro: string;
  /** what FRED's title calls the area ("Philadelphia MSA") */
  area: string;
  /** the last of the twelve months summed, as an observation date */
  to: string;
  /** "Jul 2026" */
  toMonth: string;
  /** every unit permitted over the window */
  total: number;
  totalPrior: number | null;
  totalChangePct: number | null;
  single: number;
  singlePrior: number | null;
  /** units in buildings of two or more over the window */
  multi: number;
  multiPrior: number | null;
  multiChangePct: number | null;
  /** the multi-unit share of the window's units, percent; null where nothing was permitted */
  multiSharePct: number | null;
  hrefTotal: string;
  hrefSingle: string;
  /** both series young enough for their cadence */
  fresh: boolean;
  /** the aligned months, oldest first */
  months: SupplyMonth[];
}

export function metroSupply(rates: readonly LiveRate[]): MetroSupply | null {
  const total = rates.find((r) => (r.meta as MetroSeriesMeta).metric === "permits") ?? null;
  const single = rates.find((r) => (r.meta as MetroSeriesMeta).metric === "permits_1unit") ?? null;
  if (!total || !single) return null;
  const singleByDate = new Map(single.history.map((o) => [o.obsDate, o.value]));
  const months: SupplyMonth[] = [];
  for (const o of total.history) {
    const s = singleByDate.get(o.obsDate);
    if (s === undefined) continue;
    months.push({ obsDate: o.obsDate, total: o.value, single: s, multi: o.value - s });
  }
  const all = permitsTrailingYear({ history: months.map((m) => ({ obsDate: m.obsDate, value: m.total })) });
  const multi = permitsTrailingYear({ history: months.map((m) => ({ obsDate: m.obsDate, value: m.multi })) });
  if (!all || !multi) return null;
  const last = months.slice(-PERMIT_WINDOW_MONTHS);
  const before = months.length >= 2 * PERMIT_WINDOW_MONTHS ? months.slice(-2 * PERMIT_WINDOW_MONTHS, -PERMIT_WINDOW_MONTHS) : null;
  const sum = (xs: readonly SupplyMonth[]) => Math.round(xs.reduce((a, m) => a + m.single, 0));
  return {
    metro: (total.meta as MetroSeriesMeta).metro,
    area: (total.meta as MetroSeriesMeta).area,
    to: multi.to,
    toMonth: monthOf(multi.to),
    total: all.units,
    totalPrior: all.priorUnits,
    totalChangePct: all.changePct,
    single: sum(last),
    singlePrior: before ? sum(before) : null,
    multi: multi.units,
    multiPrior: multi.priorUnits,
    multiChangePct: multi.changePct,
    multiSharePct: all.units > 0 ? Math.round((multi.units / all.units) * 1000) / 10 : null,
    hrefTotal: seriesUrl(total.meta.id),
    hrefSingle: seriesUrl(single.meta.id),
    fresh: total.fresh && single.fresh,
    months,
  };
}

/** "8,100 units in buildings of two or more, twelve months to Jul 2026 (−9.8% on the twelve months before), 57.0% of the 14,200 permitted" */
export function supplySentence(s: MetroSupply): string {
  const change =
    s.multiChangePct === null
      ? ""
      : ` (${s.multiChangePct > 0 ? "+" : s.multiChangePct < 0 ? "−" : ""}${Math.abs(s.multiChangePct).toFixed(1)}% on the twelve months before)`;
  const share = s.multiSharePct === null ? "" : `, ${s.multiSharePct.toFixed(1)}% of the ${s.total.toLocaleString("en-US")} permitted`;
  return `${s.multi.toLocaleString("en-US")} units in buildings of two or more, twelve months to ${s.toMonth}${change}${share}`;
}
