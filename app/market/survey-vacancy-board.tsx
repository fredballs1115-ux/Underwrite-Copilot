import Link from "next/link";
import { metroSeriesFor, periodLabel, periodOf, type LiveRate, type MetroSeriesMeta } from "@/lib/live-rates";
import type { BoardMarket } from "./sector-jobs-board";

/**
 * Where rental vacancy is lowest, by the survey: the Census Bureau's Housing
 * Vacancy Survey figure for every metro area the site reads — the briefed
 * markets and the ones read without a brief alike — in order, lowest first,
 * each bar carrying the survey's own margin of error as a whisker. It is the
 * one vacancy figure every metro has on the same basis (the tracker figures
 * on the sector pages are a research house's count of the units it tracks,
 * and each house counts differently), and the one whose honesty is in the
 * whisker: a quarter's figure for one metro is a sample, wide enough that two
 * metro areas whose whiskers overlap are not ordered by it.
 *
 * So the board is an ORDER, never a ranking (the research pass of
 * 2026-10-01): it numbered the rows 1 to 39 although nearly every margin of
 * ±2 to 4.4 points overlaps another, and printed the margin with no unit
 * ("±4.3"). The rows keep their order and lose their numbers, and the margin
 * says its points. And it is one quarter's: the rows are the newest quarter
 * any fresh figure is of — a quarter stays fresh for months after the next
 * is out, so a fresh row of an older quarter is listed after the ordered
 * ones with its own quarter, never placed among them; a stale figure is
 * listed with its date, shown rather than ordered.
 *
 * Each row is named for the area the survey publishes the figure for — the
 * series table's own name for it ("Washington MSA") — and links to the
 * market's page where it has one: the board's "Washington DC" and "New York
 * City" were the metro areas' figures under the city's name.
 *
 * Pure: the page reads the metric across the metros (`liveMetricRates`,
 * one cached read) and the national rate off the strip's own read, and
 * hands the rows in with the markets. A suburb has no series of its own and
 * is not a row; nothing renders until a pull has written a fresh row.
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
    return meta && r ? [{ market, meta, r }] : [];
  });
  const fresh = rows.filter((x) => x.r.fresh && Number.isFinite(x.r.value));
  // The board's quarter: the newest any fresh figure is of.
  const newest = fresh.map((x) => x.r.obsDate).sort().at(-1) ?? null;
  const ordered = fresh.filter((x) => x.r.obsDate === newest).sort((a, b) => a.r.value - b.r.value);
  if (!newest || ordered.length === 0) return null;
  const olderQuarter = fresh.filter((x) => x.r.obsDate !== newest);
  const stale = rows.filter((x) => !fresh.includes(x));
  const top = Math.max(1, ...ordered.map((x) => x.r.value + (x.r.moe ?? 0)), us && us.fresh ? us.value : 0);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  const usLine = us && us.fresh ? us : null;
  const name = (x: { market: BoardMarket; meta: MetroSeriesMeta }) => x.meta.area;
  const listed = (xs: typeof rows) => xs.map((x) => `${name(x)} ${x.r.value.toFixed(1)}% (${periodOf(x.r)})`).join("; ");
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5" data-qa="survey-vacancy-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {`Where rental vacancy is lowest — the survey's figure for ${rows.length} metro areas, each with its margin`}
        </h2>
        <span className="text-[11px] text-muted">
          {`${ordered.length} metro area${ordered.length === 1 ? "" : "s"} in order, lowest first · ${periodLabel(newest, "quarterly")}`}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {ordered.map((x) => {
          const { market, r } = x;
          const lo = r.moe !== null ? pct(r.value - r.moe) : null;
          const hi = r.moe !== null ? pct(r.value + r.moe) : null;
          return (
            <li key={market.id} className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-2 text-xs" data-survey-row={market.id}>
              {market.briefed === false ? (
                <span className="font-medium text-ink" title="Read without a brief — the same survey figure, no market page behind it">
                  {name(x)}
                </span>
              ) : (
                <Link
                  href={`/market?metro=${market.id}`}
                  prefetch={false}
                  title={`${market.name}'s market page; the figure is the ${name(x)}'s`}
                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                >
                  {name(x)}
                </Link>
              )}
              <div
                className="relative h-3 overflow-hidden rounded-full bg-faint"
                data-bar="surveyvac"
                title={`${r.meta.label} — ${periodLabel(r.obsDate, "quarterly")}${r.moe !== null ? `; the whisker is the survey's ±${r.moe} pts margin of error` : ""}`}
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand/70" style={{ width: `${pct(r.value)}%` }} />
                {lo !== null && hi !== null && (
                  <div className="absolute top-1/2 h-px -translate-y-1/2 bg-ink/60" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
                )}
                {usLine && <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${pct(usLine.value)}%` }} />}
              </div>
              <span className="font-mono tabular-nums text-ink">
                {`${r.value.toFixed(1)}%`}
                {r.moe !== null && <span className="text-muted">{` ±${r.moe} pts`}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {olderQuarter.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">{`An older quarter, listed rather than placed: ${listed(olderQuarter)}`}</p>
      )}
      {stale.length > 0 && <p className="mt-2 text-[11px] text-muted">{`Not updating, shown rather than placed: ${listed(stale)}`}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {`The Census Bureau's Housing Vacancy Survey publishes a rental vacancy rate for the 75 largest metro areas each quarter, and it is a sample: the whisker on each bar is the survey's own 90% margin of error, and two metro areas whose whiskers overlap are not ordered by it, whatever the order says — so the rows carry no rank numbers.${
          usLine ? ` The thin vertical line is the national rate, ${usLine.value.toFixed(1)}% in ${periodLabel(usLine.obsDate, "quarterly")}.` : ""
        } The tracker figures on the sector pages above are a different measure — a research house's count of the units it tracks — and the two need not agree; the metro areas read without a brief have this figure and no tracker.`}
      </p>
    </section>
  );
}
