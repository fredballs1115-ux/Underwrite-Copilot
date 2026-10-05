import type { ReactNode } from "react";

/**
 * The scrim under a market photograph's caption, black from the caption's
 * foot up: `foot` at the foot, `words` at the top of the words, and clear
 * by the caption's top. The stops are the caption's own box, not fixed px:
 * the words fill its content box, so every word stands on at least `words`
 * however its lines wrap, and the fade runs across the padding above them
 * (`MARKET_CAPTION[size].fade`), where no word is. A caption over a picture,
 * not a box: the photograph shows above the words.
 *
 * lib/market-caption.contrast.test.ts holds each line's white to AA against
 * a pure white frame, the worst photograph a market could have, at every
 * point the line can reach.
 *
 * The fade is eased (`fade`: each stop's height up the fade, and its share
 * of `words`): a straight fall from the words' alpha to nothing drew its
 * knee as a line across the photograph.
 */
export const MARKET_CAPTION_SCRIM = {
  foot: 0.8,
  words: 0.62,
  fade: [
    { at: 0, share: 1 },
    { at: 0.25, share: 0.85 },
    { at: 0.6, share: 0.4 },
    { at: 1, share: 0 },
  ],
} as const;

/**
 * The caption's geometry and type, per size: `fade` is the px of padding
 * above the words the scrim clears across; `box` the padding at the sides
 * and under the words; then each line's size, line height and white. The
 * eyebrow keeps one line, the name takes two at most and the credit wraps,
 * each at the caption's whole width — so the market's name, the one word
 * the caption exists to say, has two full lines on a card (the longest the
 * table names, 42 characters, takes two), where it had the half beside the
 * credit and was cut at one; and the licence's words are never cut.
 */
export const MARKET_CAPTION = {
  card: {
    fade: 32,
    box: "px-3 pb-2.5",
    eyebrow: "text-[11px] leading-[14px] text-white/90",
    name: "text-[14px] leading-[18px] text-white",
    credit: "mt-0.5 text-[10px] leading-[13px] text-white/85",
  },
  hero: {
    fade: 40,
    box: "px-4 pb-3",
    eyebrow: "text-[11px] leading-[14px] text-white/90",
    name: "text-[16px] leading-[20px] text-white",
    credit: "mt-0.5 text-[11px] leading-[14px] text-white/85",
  },
} as const;

/** The scrim's gradient for a caption whose words start `fade` px under its
 *  top (`MARKET_CAPTION_SCRIM`'s stops): from the foot up to the words' top,
 *  then eased to nothing across the fade. */
export function marketCaptionScrim(fade: number): string {
  const { foot, words } = MARKET_CAPTION_SCRIM;
  const black = (alpha: number) => `rgba(0, 0, 0, ${Math.round(alpha * 1000) / 1000})`;
  const up = MARKET_CAPTION_SCRIM.fade.map(({ at, share }) =>
    at === 1 ? `${black(0)} 100%` : `${black(words * share)} calc(100% - ${Math.round(fade * (1 - at) * 100) / 100}px)`,
  );
  return `linear-gradient(to top, ${black(foot)} 0px, ${up.join(", ")})`;
}

/**
 * A market photograph's caption (#438, #439): "Market photo" over the
 * market's name, on a scrim at the foot of the picture, with the
 * photographer and licence under it. It is the place the deal is in, said
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
  const g = MARKET_CAPTION[size];
  return (
    <span
      data-picture="market"
      style={{ paddingTop: g.fade, backgroundImage: marketCaptionScrim(g.fade) }}
      className={`pointer-events-none absolute inset-x-0 bottom-0 block ${g.box}`}
    >
      <span className={`block whitespace-nowrap font-semibold uppercase tracking-[0.12em] ${g.eyebrow}`}>Market photo</span>{" "}
      <span className={`line-clamp-2 break-words font-semibold ${g.name}`}>{market}</span>{" "}
      <span className={`block break-words ${g.credit}`}>{credit}</span>
    </span>
  );
}
