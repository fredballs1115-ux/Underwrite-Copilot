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

/** Whose live deals the dots are, and how many there are in all. */
export interface BandsCountOf {
  /** the team's deals (a box held by a team), not the reader's own */
  team?: boolean;
  /** every live deal the read matched, where more than it drew
   *  (`BAND_DEALS_MAX`, newest first) */
  total?: number | null;
}

/**
 * The line under the heading: how many live deals the dots are of, and
 * whose — the team's where the box is a team's, a teammate's view
 * included. Past the read's limit it says the dots are the newest of how
 * many. Null where the read failed: a count of the deals it never read is
 * no count.
 */
export function bandsCountLine(deals: number | null, of: BandsCountOf = {}): string | null {
  if (deals === null) return null;
  if (deals === 0) return of.team ? "No live team deals to place on it yet." : "No live deals to place on it yet.";
  const whose = of.team ? "The team’s" : "Your";
  if (of.total != null && of.total > deals) {
    return `${whose} newest ${deals} of ${of.total} live deals on each band, as saved.`;
  }
  return `${whose} ${deals === 1 ? "one live deal" : `${deals} live deals`} on each band, as saved.`;
}

/** What a dot says of its deal on this band: "price $42.0M, inside the box". */
function dotFacts(d: BandDot, label: string): string {
  const call = d.tone === "line" ? "" : `, ${DOT_WORDS[d.tone]}`;
  const off = d.off ? `, ${d.off === "low" ? "below" : "past"} the track's end` : "";
  return `${label.toLowerCase()} ${d.text}${call}${off}`;
}

function dotLabel(d: BandDot, label: string): string {
  return `${d.name}: ${dotFacts(d, label)}`;
}

/** The deals on a band as a list of links: the way a keyboard and a screen
 *  reader reach them, since the dots themselves are no tab stops (a pipeline
 *  of 200 deals on five bands would be a thousand). */
function BandDealList({ band }: { band: BoxBand }) {
  if (!band.dots.length) return null;
  const n = band.dots.length;
  return (
    <details className="mt-1 text-[11px]" data-qa="band-deals">
      <summary className="inline-flex min-h-6 cursor-pointer items-center rounded text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40">
        {n === 1 ? "The one deal on it" : `The ${n} deals on it`}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {band.dots.map((d) => (
          <li key={d.id}>
            <a href={`/deals/${encodeURIComponent(d.id)}`} className="font-medium text-brand underline-offset-2 hover:underline">
              {d.name}
            </a>
            <span className="text-muted">: {dotFacts(d, band.label)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
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
          // A pointer's way to the deal; the list under the track is the
          // keyboard's and the screen reader's, so a dot is no tab stop.
          <a
            key={d.id}
            href={`/deals/${encodeURIComponent(d.id)}`}
            tabIndex={-1}
            aria-hidden
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
      <BandDealList band={band} />
    </li>
  );
}

/**
 * The bands and their key, with no card around them: the editable page's
 * card below, and a teammate's read-only view of the team's box, which
 * draws them inside its own card in place of a list of the criteria.
 */
export function BoxBandsBody({
  bands,
  deals,
  of = {},
}: {
  bands: readonly BoxBand[];
  /** the live deals drawn; null where the read failed */
  deals: number | null;
  of?: BandsCountOf;
}) {
  if (!bands.length) return null;
  const tones = new Set(bands.flatMap((b) => b.dots.map((d) => d.tone)));
  const red = bands.some((b) => b.redLine);
  const count = bandsCountLine(deals, of);
  return (
    <div data-qa="box-bands-body">
      {count && <p className="text-xs text-muted">{count}</p>}
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
    </div>
  );
}

/**
 * A teammate's read-only view of the team's box: the box drawn, the same
 * tracks the owner's page draws, then the criteria no track draws (the
 * classes, the territory, the return floors, the rules among the red lines)
 * in the box's own words. Where the owner has set nothing, it says so.
 */
export function ReadOnlyBox({
  teamName,
  mandate,
  bands,
  deals,
  total = null,
  lines,
}: {
  teamName: string | null;
  /** the active mandate, where the team holds more than one */
  mandate: { name: string; of: number } | null;
  bands: readonly BoxBand[];
  /** the team's live deals drawn; null where the read failed */
  deals: number | null;
  /** every live deal the read matched, where more than it drew */
  total?: number | null;
  /** the criteria beyond the bands (lib/box-bands `boxLinesBeyondBands`);
   *  null where the team has no box */
  lines: readonly string[] | null;
}) {
  return (
    <section aria-labelledby="team-box-h" data-qa="team-box" className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <h2 id="team-box-h" className="text-sm font-semibold tracking-tight">
        {teamName ? `${teamName}’s criteria` : "The team’s criteria"}
      </h2>
      {mandate && (
        <p className="mt-1 text-xs text-muted">
          Active mandate: <span className="font-medium text-ink">{mandate.name}</span> (of {mandate.of}).
        </p>
      )}
      {lines === null ? (
        <p className="mt-2 text-sm text-muted">No criteria set yet — ask the team owner to define them here.</p>
      ) : (
        <>
          {bands.length > 0 && (
            <div className="mt-4">
              <BoxBandsBody bands={bands} deals={deals} of={{ team: true, total }} />
            </div>
          )}
          {lines.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm text-muted" data-qa="team-box-lines">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** The box's bands, the deals on each, in a card of their own. */
export function BoxBands({
  bands,
  deals,
  of = {},
}: {
  bands: readonly BoxBand[];
  /** the live deals drawn; null where the read failed */
  deals: number | null;
  /** whose they are (a team's box draws the team's) and how many in all */
  of?: BandsCountOf;
}) {
  if (!bands.length) return null;
  return (
    <section aria-labelledby="box-bands-h" data-qa="box-bands" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="box-bands-h" className="text-sm font-semibold tracking-tight">
        Your box, drawn
      </h2>
      <div className="mt-0.5">
        <BoxBandsBody bands={bands} deals={deals} of={of} />
      </div>
    </section>
  );
}
