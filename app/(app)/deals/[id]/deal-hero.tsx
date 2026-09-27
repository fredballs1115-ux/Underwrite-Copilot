import type { ReactNode } from "react";

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
  /** hover text — the deal type's one-line summary */
  title?: string;
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
}) {
  return (
    // No overflow-hidden on the card: the share panel and the deal's menu open
    // out of the toolbar as popovers and must not be clipped by it. The
    // picture rounds its own corners, and the toolbar its own bottom when it
    // is the card's last row.
    <header data-deal-hero className="@container shadow-card rounded-2xl border border-line bg-surface">
      <div className={GRID}>
        <div className="@container/facts flex min-w-0 flex-col justify-center gap-4 px-6 py-5 [grid-area:facts]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight @3xl:text-2xl">{title}</h1>
              {chips}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{subtitle}</p>
          </div>
          {/* Four across only where a tile holds a nine-figure price on one
              line; a figure never breaks inside itself. */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line @2xl/facts:grid-cols-4">
            {figures.map((f) => (
              <div key={f.label} className="min-w-0 bg-surface px-3.5 py-2.5">
                <dt className="truncate text-[11px] uppercase tracking-wide text-muted">{f.label}</dt>
                <dd
                  className={`mt-0.5 text-base font-semibold @xs/facts:text-lg ${
                    f.figure ? "whitespace-nowrap font-mono tabular-nums" : "break-words"
                  }`}
                  title={f.title}
                >
                  {f.value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {picture ? <div className="min-w-0 [grid-area:pic]">{picture}</div> : null}

        {actions || controls ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-faint/50 px-4 py-3 [grid-area:actions] [&:has(+_div:empty)]:rounded-b-[15px]">
            {actions}
            {controls ? <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{controls}</div> : null}
          </div>
        ) : null}

        <div className="px-6 pb-5 [grid-area:panels] empty:hidden">{children}</div>
      </div>
    </header>
  );
}
