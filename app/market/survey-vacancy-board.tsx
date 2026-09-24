import Link from "next/link";
import { metroSeriesFor, shortDate, type LiveRate } from "@/lib/live-rates";
import { periodLabel } from "@/lib/live-market-brief";
import type { BoardMarket } from "./sector-jobs-board";

/**
 * Where rental vacancy is lowest, by the survey: the Census Bureau's Housing
 * Vacancy Survey figure for every metro area the site reads — the briefed
 * markets and the ones read without a brief alike, forty of them — ranked
 * tightest first, each bar carrying the survey's own margin of error as a
 * whisker. It is the one vacancy figure every metro has on the same basis
 * (the tracker figures on the sector pages are a research house's count of
 * the units it tracks, and each house counts differently), and the one
 * whose honesty is in the whisker: a quarter's figure for one metro is a
 * sample, wide enough that two metro areas whose whiskers overlap are not
 * ordered by it, whatever the ranking says.
 *
 * Pure: the page reads the metric across the metros (`liveMetricRates`,
 * one cached read) and the national rate off the strip's own read, and
 * hands the rows in with the markets. A suburb has no series of its own
 * and is not a row; a stale figure is listed after the ranked ones with
 * its date, shown rather than ranked; nothing renders until a pull has
 * written a fresh row.
 */
export function SurveyVacancyBoard({
  markets,
  rates,
  us,
}: {
  /** the briefed markets, then the metro areas read without a brief */
  markets: readonly BoardMarket[];
  /** `liveMetricRates("rental_vacancy_msa")` */
  rates: readonly LiveRate[];
  /** the national rate, `RRVRUSQ156N` off `liveRates()`, or null */
  us: LiveRate | null;
}) {
  const byId = new Map(rates.map((r) => [r.meta.id, r]));
  const rows = markets.flatMap((market) => {
    const meta = metroSeriesFor(market.id).series.find((s) => s.metric === "rental_vacancy_msa" && s.metro === market.id);
    const r = meta ? byId.get(meta.id) : undefined;
    return r ? [{ market, r }] : [];
  });
  const ranked = rows.filter((x) => x.r.fresh && Number.isFinite(x.r.value)).sort((a, b) => a.r.value - b.r.value);
  if (ranked.length === 0) return null;
  const stale = rows.filter((x) => !ranked.includes(x));
  const top = Math.max(1, ...ranked.map((x) => x.r.value + (x.r.moe ?? 0)), us && us.fresh ? us.value : 0);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  const newest = ranked.map((x) => x.r.obsDate).sort().at(-1) ?? ranked[0].r.obsDate;
  const usLine = us && us.fresh ? us : null;
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5" data-qa="survey-vacancy-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Where rental vacancy is lowest — the survey&apos;s figure, forty metro areas, each with its margin</h2>
        <span className="text-[11px] text-muted">
          {`${ranked.length} metro areas ranked, tightest first · ${periodLabel(newest, "quarterly")}`}
        </span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {ranked.map(({ market, r }, i) => {
          const lo = r.moe !== null ? pct(r.value - r.moe) : null;
          const hi = r.moe !== null ? pct(r.value + r.moe) : null;
          return (
            <li key={market.id} className="grid grid-cols-[1.25rem_minmax(7rem,11rem)_1fr_auto] items-center gap-2 text-xs">
              <span className="font-mono text-[10px] tabular-nums text-muted">{i + 1}</span>
              {market.briefed === false ? (
                <span className="truncate font-medium text-ink" title="Read without a brief — the same survey figure, no market page behind it">
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
                data-bar="surveyvac"
                title={`${r.meta.label} — ${periodLabel(r.obsDate, "quarterly")}${r.moe !== null ? `; the whisker is the survey's ±${r.moe} pt margin of error` : ""}`}
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand/70" style={{ width: `${pct(r.value)}%` }} />
                {lo !== null && hi !== null && (
                  <div className="absolute top-1/2 h-px -translate-y-1/2 bg-ink/60" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
                )}
                {usLine && <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${pct(usLine.value)}%` }} />}
              </div>
              <span className="font-mono tabular-nums text-ink">
                {`${r.value.toFixed(1)}%`}
                {r.moe !== null && <span className="text-muted">{` ±${r.moe}`}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {stale.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {"Not updating, shown rather than ranked: "}
          {stale.map((x, i) => `${i > 0 ? "; " : ""}${x.market.name} ${x.r.value.toFixed(1)}% (${shortDate(x.r.obsDate)})`).join("")}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {`The Census Bureau's Housing Vacancy Survey publishes a rental vacancy rate for the 75 largest metro areas each quarter, and it is a sample: the whisker on each bar is the survey's own 90% margin of error, and two metro areas whose whiskers overlap are not ordered by it, whatever the ranking says.${
          usLine ? ` The thin vertical line is the national rate, ${usLine.value.toFixed(1)}% in ${periodLabel(usLine.obsDate, "quarterly")}.` : ""
        } The tracker figures on the sector pages above are a different measure — a research house's count of the units it tracks — and the two need not agree; the metro areas read without a brief have this figure and no tracker.`}
      </p>
    </section>
  );
}
