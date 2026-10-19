import { Key, KeyItem, Tick } from "@/app/panel-parts";
import type { RangeTrack } from "@/lib/comp-range";

/** Where a value falls on a track's scale, a CSS percentage. Kept here, not
 *  in lib/comp-range, so the client view imports that module's types alone. */
function rangeAt(value: number, domain: readonly [number, number]): string {
  const [a, b] = domain;
  const share = b > a ? (value - a) / (b - a) : 0.5;
  return `${(Math.min(1, Math.max(0, share)) * 100).toFixed(2)}%`;
}

/**
 * The reader's own comparables as tracks (lib/comp-range): one track a
 * figure — the going-in cap, the basis, a plan deal's all-in basis on its
 * own — each from the lowest comparable to the highest, a dot a deal, this
 * deal a dark tick and, from three deals up, the median dashed. Pure: it
 * draws the numbers and words it is handed, so the deal page's client view
 * carries no reader. `bar` names the picture's `data-bar` markers
 * ("pastscreens", "pipelinecomps"), one family a block.
 */
export function CompRangeTracks({ tracks, bar, qa }: { tracks: readonly RangeTrack[]; bar: string; qa?: string }) {
  if (tracks.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3" data-qa={qa}>
      {tracks.map((t) => (
        <figure key={t.key} className="m-0" data-qa={`${qa ?? bar}-${t.key}`}>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
            <span className="text-muted">{t.label}</span>
            <span className="font-mono tabular-nums text-ink">{t.rangeText}</span>
          </figcaption>
          <div className="relative mt-1.5 h-3 rounded-full bg-faint" aria-hidden>
            {/* The comparables' own span, lowest to highest. */}
            <div className="absolute inset-y-0 left-px right-px">
              <div
                className="absolute inset-y-0 rounded-full bg-brand/15"
                data-bar={`${bar}-span`}
                style={{
                  left: rangeAt(t.lo, t.domain),
                  width: `calc(${rangeAt(t.hi, t.domain)} - ${rangeAt(t.lo, t.domain)})`,
                }}
              />
            </div>
            {t.median != null && <Tick at={rangeAt(t.median, t.domain)} bar={`${bar}-median`} tone="border-muted" dashed />}
            <div className="absolute inset-y-0 left-px right-px">
              {t.dots.map((d, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-1 ring-surface"
                  data-bar={`${bar}-dot`}
                  title={d.title}
                  style={{ left: rangeAt(d.value, t.domain) }}
                />
              ))}
            </div>
            {t.subject != null && <Tick at={rangeAt(t.subject, t.domain)} bar={`${bar}-subject`} tone="bg-ink" />}
          </div>
          <Key>
            <KeyItem mark="swatch" tone="bg-brand">
              {t.dots.length === 1 ? "One past screen" : `${t.dots.length} past screens`}
            </KeyItem>
            {t.subjectText != null && (
              <KeyItem mark="tick" tone="bg-ink">
                {`This deal, ${t.subjectText}`}
              </KeyItem>
            )}
            {t.medianText != null && (
              <KeyItem mark="dashed" tone="border-muted">
                {`Median, ${t.medianText}`}
              </KeyItem>
            )}
          </Key>
        </figure>
      ))}
    </div>
  );
}
