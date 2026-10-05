import type { ReactNode } from "react";
import { priceRange, priceRangeShort } from "@/lib/criteria";
import { ToolRow } from "./tool-row";

/**
 * The deal's header, laid out the way a listing opens (#433): the
 * building's picture beside its name and its figures where the header is
 * wide — CoStar's property record, a Crexi listing — and the picture first,
 * then the name and the figures, where it is not, the way every listing app
 * opens on a phone. Below them the deal's own tools, then the panels that
 * say what the figures mean (the plan, what is being sold, what does not
 * tie).
 *
 * The header reads its OWN width (a container query), not the window's:
 * the sidebar takes 240px of every desktop, so the window says little about
 * how much room the header has. And it splits only while a picture is
 * actually there — `data-hero-picture`, which the picture unmounts with
 * when every one of its views fails — so a header whose picture came to
 * nothing is never half an empty column.
 *
 * Pure: the page hands in the picture, the chips and the controls, and the
 * render test draws it on a fixture.
 */
export interface HeroFigure {
  label: string;
  value: string | null;
  /** a figure, set in the mono face; a word like the deal type is not */
  figure?: boolean;
  /** hover text — the deal type's one-line summary, or a price range as
   *  the memorandum states it */
  title?: string;
}

/**
 * The price slot's figure. A price the memorandum states as a range (#466)
 * is drawn the way the pipeline draws it — "$9–9.5M", `priceRangeShort` —
 * with the range as stated in its title: a tile holds one figure on one
 * line, and "$9,000,000 – $9,500,000" ran 192px in a phone's 121px tile,
 * cut to "$9,000,000 – $9". A single figure, or words, stay as stated. The
 * header and the bar that keeps the deal in view both draw this one figure,
 * so the two say the price word for word.
 */
export function priceFigureOf(label: string, stated: string | null): HeroFigure {
  const range = stated ? priceRange(stated) : null;
  return range && stated
    ? { label, value: priceRangeShort(range), title: `As stated: ${stated.trim()}`, figure: true }
    : { label, value: stated, figure: true };
}

// One column by default: the picture, the facts, the tools, the panels.
// Split at the header's own 48rem, and only while a picture is there.
const GRID = [
  "grid grid-cols-1 [grid-template-areas:'pic'_'facts'_'actions'_'panels']",
  "@3xl:has-[[data-hero-picture]]:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]",
  "@3xl:has-[[data-hero-picture]]:[grid-template-areas:'pic_facts'_'actions_actions'_'panels_panels']",
].join(" ");

export function DealHero({
  title,
  chips,
  subtitle,
  figures,
  picture,
  actions,
  controls,
  children,
  reading = false,
}: {
  title: string;
  /** the call and the buy-box fit, beside the name */
  chips?: ReactNode;
  /** the address and the asset class */
  subtitle: ReactNode;
  figures: HeroFigure[];
  /** the building's picture (PropertyVisual); null where the deal has no
   *  address and no photograph */
  picture?: ReactNode;
  /** the documents and the deal's own tools */
  actions?: ReactNode;
  /** the deal's state — offers due, the stage, the menu — at the toolbar's end */
  controls?: ReactNode;
  /** the panels under the toolbar: each is a boxed card of its own */
  children?: ReactNode;
  /** the deal's screen is still reading the memorandum (lib/screen-reading):
   *  a figure not read yet shimmers in place of the dash a finished screen
   *  gives a figure its memorandum does not state */
  reading?: boolean;
}) {
  return (
    // No overflow-hidden on the card: the share panel and the deal's menu open
    // out of the toolbar as popovers and must not be clipped by it. The
    // picture rounds its own corners, and the toolbar its own bottom when it
    // is the card's last row.
    <header data-deal-hero className="@container shadow-card rounded-2xl border border-line bg-surface">
      <div className={GRID}>
        {/* The name, the call and the figures: the block the bar that keeps
            the deal in view watches (`DealStickyBar`), never the whole
            header, whose deal-kind panels run on for screens below it. */}
        <div data-deal-hero-facts className="@container/facts flex min-w-0 flex-col justify-center gap-4 px-6 py-5 [grid-area:facts]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Focusable from script only: "Back to the top" lands here,
                  out of the sticky bar that hides as it goes. */}
              <h1 id="deal-title" tabIndex={-1} className="text-xl font-semibold tracking-tight @3xl:text-2xl">
                {title}
              </h1>
              {chips}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{subtitle}</p>
          </div>
          {/* Four across only where a tile holds a nine-figure price on one
              line; a figure never breaks inside itself. A label may take two
              lines — "Price · Leasehold, 45 yrs left" is the fact the price
              turns on, and one truncated line cut it off at every width —
              and a row's figures stay on one line with each other, each at
              the foot of its tile. */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line @2xl/facts:grid-cols-4">
            {figures.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col justify-between bg-surface px-3.5 py-2.5">
                <dt className="line-clamp-2 text-[11px] uppercase tracking-wide text-muted">{f.label}</dt>
                <dd
                  className={`mt-0.5 text-base font-semibold @xs/facts:text-lg ${
                    f.figure ? "whitespace-nowrap font-mono tabular-nums" : "break-words"
                  }`}
                  title={f.title}
                >
                  {f.value ??
                    (reading ? (
                      // Not read yet, rather than not stated: a quiet
                      // shimmer (still under prefers-reduced-motion — the
                      // .skeleton sweep only runs where motion is welcome).
                      // A picture with a name, not a live region: four
                      // figures announcing themselves at once is noise.
                      <span
                        role="img"
                        aria-label="Reading the memorandum"
                        data-qa="figure-reading"
                        className="skeleton inline-block h-[1.1em] w-20 max-w-full rounded align-middle"
                      />
                    ) : (
                      "—"
                    ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {picture ? <div className="min-w-0 [grid-area:pic]">{picture}</div> : null}

        {/* The tools, then the deal's state: on a phone a row each that
            scrolls sideways (ToolRow), from `sm` one wrapping row. */}
        {actions || controls ? (
          <div className="flex flex-col gap-2 border-t border-line bg-faint/50 px-4 py-3 [grid-area:actions] sm:flex-row sm:flex-wrap sm:items-center [&:has(+_div:empty)]:rounded-b-[15px]">
            {actions ? <ToolRow row="tools">{actions}</ToolRow> : null}
            {controls ? <ToolRow row="controls">{controls}</ToolRow> : null}
          </div>
        ) : null}

        {/* The panels' well: 12px inside the card on a phone, where 24px of
            it, the card's border and each panel's own edge and padding left
            a 263px column of text on a 390px screen (research pass 36). */}
        <div className="px-3 pb-5 sm:px-6 [grid-area:panels] empty:hidden">{children}</div>
      </div>
    </header>
  );
}
