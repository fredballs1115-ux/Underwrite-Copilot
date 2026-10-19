import { Key, KeyItem, Tick } from "@/app/panel-parts";

/**
 * The leverage check as one percent track (the deal page's research panel,
 * and /demo's): the deal's going-in cap a dark tick; the 30-year mortgage
 * survey a dashed tick with the ground past it shaded — a one-sided floor,
 * an owner-occupier rate investor debt usually prices above, never a quote;
 * the screening rate the model was seeded with (the latest index plus the
 * class spread) a brand tick; and the 10-year Treasury a muted one. Every
 * figure is dated in the key. Pure: it draws what it is handed, and the
 * panel hands nothing where the model's reads are withheld.
 */
export interface LeverageFigures {
  /** the deal's going-in cap, percent */
  capPct: number;
  /** the survey: its rate, publisher and date as the panel words them */
  survey: { pct: number; source: string; dated: string } | null;
  /** the seeded screening rate and its note, which names its index's date */
  seed: { pct: number; note: string } | null;
  /** the 10-year: its rate and the date it was observed, in words */
  tenYear: { pct: number; dated: string } | null;
}

function at(value: number, [a, b]: readonly [number, number]): string {
  const share = b > a ? (value - a) / (b - a) : 0.5;
  return `${(Math.min(1, Math.max(0, share)) * 100).toFixed(2)}%`;
}

export function LeverageTrack({ figures }: { figures: LeverageFigures }) {
  const { capPct, survey, seed, tenYear } = figures;
  const values = [capPct, survey?.pct, seed?.pct, tenYear?.pct].filter((v): v is number => v != null && Number.isFinite(v));
  // One figure is no comparison: the track draws the cap against at least
  // one rate.
  if (values.length < 2 || !Number.isFinite(capPct)) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, 0.25);
  // The ends rounded outward to the half percent, so they read as a scale
  // ("4.0%" to "7.0%"), never as figures of their own.
  const domain: [number, number] = [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
  // A screening rate under the owner-occupier survey is under a floor
  // investor debt usually prices above: said, so it is not read as a quote.
  const seedUnderSurvey = seed != null && survey != null && seed.pct < survey.pct;
  return (
    <figure className="m-0 mt-2" data-qa="leverage-track">
      <div className="relative h-3 rounded-full bg-faint" aria-hidden>
        {survey && (
          // The floor, one-sided: debt priced above the survey, never at it.
          <div className="absolute inset-y-0 left-px right-px">
            <div
              className="absolute inset-y-0 right-0 rounded-r-full bg-linear-to-r from-caution/20 to-caution/0"
              data-bar="lev-floor"
              style={{ left: at(survey.pct, domain) }}
            />
          </div>
        )}
        {tenYear && <Tick at={at(tenYear.pct, domain)} bar="lev-tenyear" tone="bg-muted" />}
        {survey && <Tick at={at(survey.pct, domain)} bar="lev-survey" tone="border-caution" dashed />}
        {seed && <Tick at={at(seed.pct, domain)} bar="lev-seed" tone="bg-brand" />}
        <Tick at={at(capPct, domain)} bar="lev-cap" tone="bg-ink" />
      </div>
      {/* The track's two ends, so a reader can place the ticks without the key. */}
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted" aria-hidden>
        <span>{`${domain[0].toFixed(1)}%`}</span>
        <span>{`${domain[1].toFixed(1)}%`}</span>
      </div>
      <Key stack>
        <KeyItem mark="tick" tone="bg-ink">
          {`Going-in cap ${capPct.toFixed(2)}%, the deal's own`}
        </KeyItem>
        {survey && (
          <KeyItem mark="dashed" tone="border-caution">
            {`30-yr fixed ${survey.pct.toFixed(2)}% (${survey.source}, ${survey.dated}) — an owner-occupier floor investor debt usually prices above, never a quote`}
          </KeyItem>
        )}
        {seed && (
          <KeyItem mark="tick" tone="bg-brand">
            {`Screening rate ${seed.pct.toFixed(2)}%: ${seed.note}`}
            {seedUnderSurvey
              ? `${/[.!?]$/.test(seed.note.trim()) ? "" : "."} The screening rate sits under the owner-occupier survey, so a lender's quote is likely higher.`
              : null}
          </KeyItem>
        )}
        {tenYear && (
          <KeyItem mark="tick" tone="bg-muted">
            {`10-yr Treasury ${tenYear.pct.toFixed(2)}% (FRED, ${tenYear.dated})`}
          </KeyItem>
        )}
      </Key>
    </figure>
  );
}
