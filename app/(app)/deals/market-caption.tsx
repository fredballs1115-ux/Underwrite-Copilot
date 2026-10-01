import type { ReactNode } from "react";

/**
 * A market photograph's caption (#438, #439): "Market photo" over the
 * market's name, on a shade at the foot of the picture, with the
 * photographer and licence beside it. It is the place the deal is in, said
 * on the picture's face, so a skyline never passes for the building. One
 * markup for the pipeline's card and the deal page's picture.
 *
 * The caption lets a click through to the picture under it. The credit's
 * own links, where it has them, take it back (`pointer-events-auto` on the
 * link): the deal page's picture is no link, so its caption links the
 * photographer to the file's page and the licence to its text; a pipeline
 * card is itself a link, so its credit is words, and the page's one linked
 * line under the cards carries the links.
 */
export function MarketCaption({
  market,
  credit,
  size = "card",
}: {
  /** the market's name as the site names it: "Pittsburgh PA" */
  market: string;
  /** the photographer and the licence (lib/skyline `photographerLine`), as
   *  words or drawn with their links (app/credit-parts) */
  credit: ReactNode;
  /** a card's caption, or the deal page's larger picture's */
  size?: "card" | "hero";
}) {
  return (
    <span
      data-picture="market"
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent ${
        size === "hero" ? "px-4 pb-3 pt-12" : "px-3 pb-2 pt-9"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/90">Market photo</span>{" "}
        <span className={`block truncate font-semibold leading-tight text-white ${size === "hero" ? "text-base" : "text-[13px]"}`}>
          {market}
        </span>
      </span>{" "}
      <span className="max-w-[55%] text-right text-[9px] leading-tight text-white/85">{credit}</span>
    </span>
  );
}
