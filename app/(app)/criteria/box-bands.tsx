// The buy box, drawn: each band the box sets as a track with the band
// filled, its red line, and the reader's live deals as dots on it, each at
// the figure its check judged and in that check's call (lib/box-bands). The
// form below says the box in fields; this says what the box does to the
// pipeline at a glance.
//
// Pure (no hooks, no I/O): the page builds the bands server-side.
import { Key, KeyItem, Tick } from "@/app/panel-parts";
import { DOT_WORDS, notJudgedText, type BandDot, type BandDotTone, type BoxBand } from "@/lib/box-bands";

const DOT_CLS: Record<BandDotTone, string> = {
  pass: "bg-pass",
  near: "bg-caution",
  miss: "bg-kill",
  line: "bg-ink",
};

/** A key's dot: the dots' own shape, set to its label's first line. */
function Dot({ tone }: { tone: string }) {
  return <span aria-hidden className={`mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />;
}

/** A row's lift, in px: a dot is 10px and the rows 12px apart. */
const LANE_PX = 12;

/** The line under the heading: how many live deals the dots are of. */
export function bandsCountLine(deals: number): string {
  if (deals === 0) return "No live deals to place on it yet.";
  return `Your ${deals === 1 ? "one live deal" : `${deals} live deals`} on each band, as saved.`;
}

function dotLabel(d: BandDot, label: string): string {
  const call = d.tone === "line" ? "" : `, ${DOT_WORDS[d.tone]}`;
  const off = d.off ? `, ${d.off === "low" ? "below" : "past"} the track's end` : "";
  return `${d.name}: ${label.toLowerCase()} ${d.text}${call}${off}`;
}

function Band({ band }: { band: BoxBand }) {
  const lift = (band.lanes - 1) * LANE_PX;
  const missing = notJudgedText(band.notJudged);
  return (
    <li data-band={band.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span>
          <span className="font-medium text-ink">{band.label}</span>{" "}
          <span className="text-muted tabular-nums">{band.bandText}</span>
        </span>
        {missing && (
          <span
            className="text-[11px] text-muted"
            title="The screen read no figure the box can judge this band on — none stated, or a cap or basis the price does not carry"
            data-qa="band-not-judged"
          >
            {missing}
          </span>
        )}
      </div>
      <div className="relative h-2 rounded-full bg-faint" style={{ marginTop: `${8 + lift}px` }} data-bar="buybox-track">
        {band.fill && (
          <div
            aria-hidden
            className="absolute inset-y-0 rounded-full bg-brand/25 ring-1 ring-inset ring-brand/40"
            data-bar="buybox-fill"
            style={{ left: `${band.fill.from}%`, width: `${Math.max(0, Math.round((band.fill.to - band.fill.from) * 10) / 10)}%` }}
          />
        )}
        {band.redLine && <Tick at={`${band.redLine.at}%`} bar="buybox-redline" tone="bg-kill" />}
        {band.dots.map((d) =>
          d.range ? (
            <div
              key={`${d.id}-range`}
              aria-hidden
              className="absolute h-0.5 -translate-y-1/2 rounded-full bg-ink/40"
              data-bar="buybox-range"
              style={{ left: `${d.range.from}%`, width: `${Math.max(0, Math.round((d.range.to - d.range.from) * 10) / 10)}%`, top: `${4 - d.lane * LANE_PX}px` }}
            />
          ) : null,
        )}
        {band.dots.map((d) => (
          <a
            key={d.id}
            href={`/deals/${encodeURIComponent(d.id)}`}
            aria-label={dotLabel(d, band.label)}
            title={dotLabel(d, band.label)}
            data-bar="buybox-deal"
            data-tone={d.tone}
            className={`absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface ${DOT_CLS[d.tone]} ${d.off ? "outline-1 outline-dashed outline-ink" : ""}`}
            style={{ left: `${d.at}%`, bottom: `${-1 + d.lane * LANE_PX}px` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums" aria-hidden>
        <span>{band.ends.low}</span>
        <span>{band.ends.high}</span>
      </div>
    </li>
  );
}

/**
 * The box's bands, the deals on each. `readOnly` is a teammate's view of the
 * team's box, which says the box is the owner's to set.
 */
export function BoxBands({ bands, deals, readOnly = false }: { bands: readonly BoxBand[]; deals: number; readOnly?: boolean }) {
  if (!bands.length) return null;
  const tones = new Set(bands.flatMap((b) => b.dots.map((d) => d.tone)));
  const red = bands.some((b) => b.redLine);
  return (
    <section aria-labelledby="box-bands-h" data-qa="box-bands" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="box-bands-h" className="text-sm font-semibold tracking-tight">
        {readOnly ? "The box, drawn" : "Your box, drawn"}
      </h2>
      <p className="mt-0.5 text-xs text-muted">{bandsCountLine(deals)}</p>
      <ul className="mt-4 space-y-5">
        {bands.map((b) => (
          <Band key={b.key} band={b} />
        ))}
      </ul>
      <Key className="mt-4">
        <KeyItem mark="swatch" tone="bg-brand/25 ring-1 ring-inset ring-brand/40">
          The band
        </KeyItem>
        {red && (
          <KeyItem mark="tick" tone="bg-kill">
            Red line
          </KeyItem>
        )}
        {tones.has("pass") && (
          <KeyItem>
            <Dot tone="bg-pass" />
            Inside
          </KeyItem>
        )}
        {tones.has("near") && (
          <KeyItem>
            <Dot tone="bg-caution" />
            Near-miss
          </KeyItem>
        )}
        {tones.has("miss") && (
          <KeyItem>
            <Dot tone="bg-kill" />
            Outside
          </KeyItem>
        )}
        {tones.has("line") && (
          <KeyItem>
            <Dot tone="bg-ink" />
            A deal, held to the red line alone
          </KeyItem>
        )}
      </Key>
    </section>
  );
}
