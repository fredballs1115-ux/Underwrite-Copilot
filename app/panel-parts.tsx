import type { ReactNode } from "react";

/**
 * The parts every deal-type panel draws with (research pass 36) — its
 * heading, its read and fold, the key under a picture, a tick on a track and
 * a row of label, bar and figure — so the eighteen panels, the lease-term bar
 * and the portfolio card say each thing the same way. Pure, and it imports
 * nothing but React's types: the leasehold card reaches it through the
 * lease-term bar from a client component, and no data table may ride along
 * (lib/client-bundle-tables.test.ts).
 *
 * Two track heights, no more: a panel's own picture is a primary track,
 * `h-3` (12px); a row of bars set against each other, and a thin companion
 * under a primary one, is a secondary track, `h-2` (8px).
 */

/** A line of a panel's prose stops near 68 characters, however wide the
 *  panel is: at 1280 a sentence had run to 153. */
export const MEASURE = "max-w-[68ch]";

/**
 * A panel's heading row: its eyebrow is the panel's `h2`, in the eyebrow's
 * own styles, and whatever the panel says beside it follows. The panels sit
 * under the deal's `h1` on the deal page and the shared screen, before the
 * sections' own `h2`s; with no heading of their own, a screen reader moving
 * by headings went from the deal's name past every panel.
 */
export function PanelHead({ title, tone, children }: { title: string; tone: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className={`text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{title}</h2>
      {children}
    </div>
  );
}

/**
 * The rest of a read, one tap away and whole in the HTML. On a touch screen
 * the control is a thumb's height (36px, where it was 16): it is the one a
 * phone reader taps most on the deal page.
 */
export function PanelFold({ rest }: { rest: readonly string[] }) {
  if (rest.length === 0) return null;
  return (
    <details className={`group mt-1 ${MEASURE} text-sm leading-relaxed`}>
      <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline pointer-coarse:py-2.5">
        <span className="group-open:hidden">{`Read the rest (${rest.length} more)`}</span>
        <span className="hidden group-open:inline">Less</span>
      </summary>
      <p className="mt-1">{rest.join(" ")}</p>
    </details>
  );
}

/** A panel's read: its first sentence (or its first `lead`) in the open, the
 *  rest folded under it. Nothing where the reader said nothing. */
export function PanelRead({ sentences, lead = 1, className = "mt-1" }: { sentences: readonly string[]; lead?: number; className?: string }) {
  if (sentences.length === 0) return null;
  return (
    <>
      <p className={`${className} ${MEASURE} text-sm leading-relaxed`}>{sentences.slice(0, lead).join(" ")}</p>
      <PanelFold rest={sentences.slice(lead)} />
    </>
  );
}

/** The muted line a panel closes on — what the model does with it. */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className={`mt-2 ${MEASURE} text-xs leading-relaxed text-muted`}>{children}</p>;
}

/** What a key's mark is: a swatch of a fill, a tick, or a dashed tick. */
export type KeyMark = "swatch" | "tick" | "dashed";

// One swatch size and one tick shape for every key. The key's lines are
// 16px (`leading-4` on the list), so each mark is set down to the middle of
// its label's FIRST line: a label that wraps keeps its mark beside the words
// it begins, where `items-center` had sat it between the lines.
const MARK: Record<KeyMark, string> = {
  swatch: "mt-[3px] h-2.5 w-2.5 rounded-sm",
  tick: "mt-0.5 h-3 w-0.5 rounded-full",
  dashed: "mt-0.5 h-3 w-0 border-l-2 border-dashed",
};

/** A picture's key: its marks and their words, in the panels' small type. */
export function Key({
  children,
  className = "mt-1.5",
  stack = false,
  qa,
}: {
  children: ReactNode;
  className?: string;
  /** one item a line, where the items are sentences */
  stack?: boolean;
  qa?: string;
}) {
  const layout = stack ? "flex flex-col gap-y-0.5" : "flex flex-wrap gap-x-3 gap-y-0.5";
  return (
    <ul className={`${className ? `${className} ` : ""}${layout} text-[11px] leading-4 text-muted`} data-qa={qa}>
      {children}
    </ul>
  );
}

/** One line of a key: the mark (in `tone`: a background for a swatch or a
 *  tick, a border colour for a dashed tick) and its words. No mark, words
 *  alone. */
export function KeyItem({ mark, tone = "", children }: { mark?: KeyMark; tone?: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      {mark && <span aria-hidden className={`inline-block shrink-0 ${MARK[mark]} ${tone}`} />}
      {children}
    </li>
  );
}

/**
 * A tick on a track, centred on its value and kept inside the track: it is
 * placed in a box a pixel in from each end and pulled back by half its own
 * width, so a tick at 0% or 100% ends at the track's edge rather than hanging
 * past it, and every tick sits on its value rather than a pixel or two to its
 * right. The track holding it is `relative`.
 */
export function Tick({
  at,
  bar,
  tone = "bg-ink",
  dashed = false,
  track = "primary",
}: {
  /** where the value falls, a CSS percentage of the track ("85%") */
  at: string;
  /** the tick's `data-bar` marker, where it has one */
  bar?: string;
  /** a background for a solid tick, a border colour for a dashed one */
  tone?: string;
  dashed?: boolean;
  /** the track it stands on: past a primary track by 4px a side, past a
   *  secondary one by 2px */
  track?: "primary" | "secondary";
}) {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-px right-px">
      <div
        className={`absolute ${track === "primary" ? "-inset-y-1" : "-inset-y-0.5"} -translate-x-1/2 ${
          dashed ? "w-0 border-l-2 border-dashed" : "w-0.5 rounded-full"
        } ${tone}`}
        data-bar={bar}
        style={{ left: at }}
      />
    </div>
  );
}

/**
 * Rows of label, bar and figure that are set against each other, on one
 * layout for every panel. The label's and the figure's columns are each one
 * width, so every bar in the group starts at the same x and runs on a track
 * of the same length — where the figure's column had sized itself, two bars
 * on one scale were drawn on tracks 5% apart. Until the group itself is
 * 24rem wide each row stacks, its label over its bar and figure, as the
 * clocks do: on a phone a label's column had left a bar 15px.
 */
export function BarRows({ children, className = "", qa }: { children: ReactNode; className?: string; qa?: string }) {
  return (
    <div className={className ? `@container/bars ${className}` : "@container/bars"} data-qa={qa}>
      {children}
    </div>
  );
}

/** One row of a `BarRows` group: the bar is a secondary track, `relative`,
 *  its fill and any tick the children. */
export function BarRow({ label, figure, children }: { label: ReactNode; figure: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-2 gap-y-0.5 @sm/bars:grid-cols-[9rem_minmax(0,1fr)_4rem]">
      <span className="col-span-2 text-muted @sm/bars:col-span-1">{label}</span>
      <div className="relative h-2 rounded-full bg-faint" aria-hidden>
        {children}
      </div>
      <span className="whitespace-nowrap text-right font-mono tabular-nums text-ink">{figure}</span>
    </div>
  );
}

/**
 * A tile's width below `sm`: a tile whose value is words — a name, a
 * clause, the memorandum's own phrase — spans both columns, so the words get
 * the width and the figures stay two-up. At 390 a two-up tile is 122px, a
 * dozen characters a line, and "Ridgeline Logistics Partners" ran to three
 * lines in it. Words are a value with a run of letters and more characters
 * than two of those lines hold; a figure, and a short phrase, stay two-up.
 */
export function tileSpan(value: string): string {
  return /[A-Za-z]{3,}/.test(value) && value.length > 20 ? "col-span-2 sm:col-span-1" : "";
}
