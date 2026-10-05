import type { ReactNode } from "react";
import { CityPhoto } from "./city-photo";
import { metroView } from "@/lib/metro-imagery";
import { hasSkyline } from "@/lib/skyline";

// A real place behind a page's opening words.
//
// The operator's rule (2026-09-14): real pictures of actual things, built
// for a human. Refined (2026-09-16): a market is known by its SKYLINE, not
// by its roofs — "the pictures all around the site are TERRIBLE overhead
// photos." So `CityPhoto` shows the market's photograph where one is
// verified and keeps the overhead frame as the floor, and the credit under
// the band always names whichever of the two actually rendered.
//
// THE SCRIM IS THE WHOLE DESIGN. Fifteen verified photographs are worth
// nothing if the treatment hides them, and the first version of this hid
// them: a 30%-opacity image under a gradient that was still 55% opaque at
// its lightest left about an eighth of the photograph visible. A washed
// photograph is worse than none — it reads as a texture, and it costs the
// same bytes.
//
// So the picture is now drawn at full strength and the SCRIM does all the
// work, shaped to where the words actually sit:
//
//   "band"   — a page's opening words, which the band sets at its BOTTOM.
//              So the scrim runs bottom to top: opaque under the type,
//              clearing upward until the photograph is most of what is on
//              screen across the whole top of the frame.
//   "center" — the sign-in card, which is centred in a narrow column. From
//              `lg` up the scrim is a plateau down the middle with both
//              margins clear, so the city shows on either side of the card.
//              Below that the column is the whole width, so an even veil.
//   "caption" — a market's own band on /market (`MarketBand`), whose words
//              are an eyebrow and a name and nothing else. The "band" shape
//              is proportional (85% opaque at 55% of the height) because a
//              page's opening words can reach 60% up a tall band; stretched
//              over a short card band it veiled the whole lower half of every
//              photograph, and at the card's old 256px a skyline was a
//              texture (see `PlaceBand` on why ~300px is a photograph). So
//              this one is anchored in PIXELS to the tallest words it holds
//              — an eyebrow over a name wrapped to two lines on a phone,
//              110px — and everything above `CAPTION_SCRIM`'s last stop is
//              photograph under the veil alone. Simulated through the real
//              crop at 1064×336 and 302×240 before it shipped: the same
//              Cleveland frame went from a veiled strip to the towers.
//
// WHY BOTTOM-TO-TOP AND NOT LEFT-TO-RIGHT, which is the more obvious shape
// for a headline: every file in lib/skyline is a PANORAMA — 8443×3361 for
// Seattle, 3127×795 for Chicago. A tall narrow window down the right-hand
// side crops a panorama to a sliver of two towers; a wide short window
// across the top is the crop the photograph was taken for. Measured on the
// same band, the horizontal shape showed the picture over about a quarter
// of the frame and the vertical one shows it over two thirds — and the
// vertical one holds better contrast under the type as well (7.4:1 against
// 4.9:1), because a line of text can run most of the way across a column
// but never reaches the top of the band.
//
// A light veil sits under both. It holds the type's contrast when the
// photograph's sky is blown out — white text on a white sky is the one
// failure a directional gradient alone cannot catch — and it gives the
// picture the band's own teal cast so it belongs to the page.
//
// EVERY STOP BELOW IS LOAD-BEARING, and lib/place-band.contrast.test.ts
// reads them back out of this file and recomputes the composite rather
// than trusting the numbers to stay true. That is also why a band's body
// copy is SOLID white rather than a white/75 tier: over a flat teal band
// the tier reads at 10:1, over the same band with a photograph behind it,
// 3.5:1. A caption nobody can read over a bright photograph is the exact
// failure this whole treatment exists to avoid.

/** How the scrim is shaped, which depends on where the band's words sit. */
export type Scrim = "band" | "center" | "caption" | "hero";

/**
 * The homepage hero's photograph below `lg` (2026-09-30): a strip across the
 * top of the stacked hero, fading into the band at its foot, with the words
 * starting where it ends. The hero's words sit at its TOP, where the "band"
 * scrim is clear by design, and measured in Chromium over a white frame
 * they read 1.9:1 on a phone and 3.0:1 on a laptop — the photograph was
 * drawn behind the one part of the hero that could not have it. Cut to a
 * strip, a phone shows three quarters of the skyline's width, where
 * covering the whole 1,200px stack had shown a sliver of sky.
 * `HERO_WORDS_TOP` is the padding that starts the words at the strip's
 * foot; lib/place-band.contrast.test.ts holds the two to each other.
 */
export const HERO_STRIP = "absolute inset-x-0 top-0 h-[18rem] sm:h-[22rem] lg:inset-0 lg:h-auto";
export const HERO_WORDS_TOP = "pt-[18rem] sm:pt-[22rem] lg:pt-24";

/**
 * The hero's scrim from `lg` up, left to right across the band (0–1 of its
 * width), with the scrim's alpha at each: dark behind the words' column
 * (the 72rem container's left half, which ends just short of the band's
 * middle — past 49% of its width only on screens wider than about 2,160px,
 * still under the 0.92 plateau), clearing across the sample card's column
 * to the photograph at the right. The "band" gradient stays under it for
 * the stats row.
 */
export const HERO_SIDE_SCRIM: ReadonlyArray<{ at: number; alpha: number }> = [
  { at: 0, alpha: 0.94 },
  { at: 0.5, alpha: 0.92 },
  { at: 0.76, alpha: 0 },
];

const heroSideGradient = `linear-gradient(to right, ${HERO_SIDE_SCRIM.map(
  (s) => `color-mix(in srgb, var(--color-sidebar) ${Math.round(s.alpha * 100)}%, transparent) ${Math.round(s.at * 100)}%`,
).join(", ")})`;

/**
 * The caption scrim's stops, in px up from the bottom, with the scrim's
 * alpha at each: opaque under the words, 80% at the top of the tallest
 * caption, clear by 208px. lib/place-band.contrast.test.ts holds white and
 * the accent eyebrow to the floor at the words' reach against a pure white
 * frame, and holds the photograph to showing above it.
 */
export const CAPTION_SCRIM: ReadonlyArray<{ px: number; alpha: number }> = [
  { px: 0, alpha: 1 },
  { px: 120, alpha: 0.8 },
  { px: 208, alpha: 0 },
];

const captionGradient = `linear-gradient(to top, ${CAPTION_SCRIM.map(
  (s) => `color-mix(in srgb, var(--color-sidebar) ${Math.round(s.alpha * 100)}%, transparent) ${s.px}px`,
).join(", ")})`;

/**
 * The scrim on its own, for a band drawing its own picture (the hero, when
 * the operator's own photograph is on disk). Exported so the treatment
 * cannot drift between the photograph we fetch and the one they supply.
 */
export function PhotoScrim({ scrim = "band" }: { scrim?: Scrim }) {
  return (
    <>
      <div className="absolute inset-0 bg-sidebar/20" />
      {scrim === "band" ? (
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar from-0% via-sidebar/85 via-55% to-sidebar/0 to-100%" />
      ) : scrim === "hero" ? (
        <>
          {/* Below lg: the strip fades into the band at its foot, where the
              words begin. From lg: the band's own gradient for the stats
              row, and the words' column dark from the left. */}
          <div className="absolute inset-0 bg-gradient-to-b from-sidebar/0 from-40% to-sidebar to-100% lg:hidden" />
          <div className="absolute inset-0 hidden bg-gradient-to-t from-sidebar from-0% via-sidebar/85 via-55% to-sidebar/0 to-100% lg:block" />
          <div className="absolute inset-0 hidden lg:block" style={{ backgroundImage: heroSideGradient }} />
        </>
      ) : scrim === "caption" ? (
        <div className="absolute inset-0" style={{ backgroundImage: captionGradient }} />
      ) : (
        <>
          <div className="absolute inset-0 bg-sidebar/85 lg:hidden" />
          <div className="absolute inset-0 hidden lg:block lg:bg-[linear-gradient(to_right,transparent_0%,var(--color-sidebar)_26%,var(--color-sidebar)_74%,transparent_100%)]" />
        </>
      )}
      {/* The credit sits in this band, so it is sized to clear the contrast
          floor over it — an attribution nobody can read is not one. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-sidebar/90 to-transparent" />
    </>
  );
}

/** How wide a band inside a public page's content column draws: the
 *  column's 72rem less its gutters, or the screen below that (#451). */
export const PAGE_COLUMN_SIZES = "(min-width: 1200px) 1104px, 100vw";

/**
 * The picture and its scrim, for a band that positions itself, with the
 * band's words passed in as `children`: they are drawn between the picture
 * and its credit, so the credit, drawn at the foot of the picture, comes
 * after the words in the markup, and Tab and a screen reader meet the words
 * first (CityPhoto's `layer`). A band with no picture draws its words alone.
 */
export function PlaceBackdrop({
  metro,
  height = 600,
  scrim = "band",
  sizes = "100vw",
  eager = false,
  layer,
  creditLayer,
  creditClassName,
  children,
}: {
  metro: string;
  height?: number;
  /** "band" for words set at the bottom, "center" for a centred card */
  scrim?: Scrim;
  /** how wide the band draws, for the browser to pick a file by (#451) */
  sizes?: string;
  /** the first thing on the page: fetched at once and ahead of the rest,
   *  never lazily — every other picture waits its turn */
  eager?: boolean;
  /** the box the picture and its scrim fill, where it is not the band's
   *  whole box (`MarketBand`: the picture's row of its grid) */
  layer?: string;
  /** the box the credit is drawn in, where it is not the picture's
   *  (`MarketBand`: a row of its own under the picture) */
  creditLayer?: string;
  /** the credit's own classes, where the default's place at the picture's
   *  foot is not where it goes */
  creditClassName?: string;
  /** the band's words, before the picture's credit in the markup */
  children?: ReactNode;
}) {
  // Either picture is enough to open on. Gating on the overhead alone was
  // safe only by accident — every market with a skyline happens to have an
  // aerial too — and would have blanked the band for the first market that
  // got a photograph without one. CityPhoto decides between them; this only
  // decides whether there is anything to decide between.
  if (!metroView(metro) && !hasSkyline(metro)) return <>{children}</>;
  // Offered at the skyline's widths (#451), each encoded again at a fraction
  // of Commons' weight, so a phone takes 1600 and a dense laptop 2400 where
  // one 1400px file was stretched twice over; 1400 stays the file a browser
  // without srcset gets. Above centre, because a skyline's subject is its
  // tower line and the bottom of the frame is usually road or water.
  return (
    <CityPhoto
      metro={metro}
      width={1400}
      height={height}
      sizes={sizes}
      eager={eager}
      className="h-full w-full object-cover object-[50%_42%]"
      layer={layer ?? (scrim === "hero" ? HERO_STRIP : "absolute inset-0")}
      creditLayer={creditLayer}
      {...(creditClassName ? { creditClassName } : {})}
      overlay={<PhotoScrim scrim={scrim} />}
    >
      {children}
    </CityPhoto>
  );
}

/**
 * A dark band opening a page: the place behind, the words in front.
 *
 * It has a real height rather than whatever its text happens to need. A
 * 200px strip of a skyline is a texture; ~300–370px is a photograph, and
 * the words sit at the bottom of it the way a magazine sets a caption
 * under a picture rather than across it.
 *
 * `on-photo` (app/globals.css) puts a soft dark halo under every word in
 * here. The scrim already carries the measured contrast; the halo is the
 * belt to its braces, because the brightest pixel of a photograph nobody
 * has seen yet is not knowable at build time.
 *
 * The words are held to `band-words` — a narrow measure, which is both the
 * right line length to read and what leaves the scrim somewhere to clear.
 */
export function PlaceBand({
  metro,
  width = "max-w-3xl",
  eager = false,
  children,
}: {
  metro: string;
  /** the page's content width, so the words line up with what follows */
  width?: string;
  /** the band opens its page: its picture is fetched first (PlaceBackdrop) */
  eager?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="band-dark relative flex min-h-[19rem] items-end overflow-hidden text-white sm:min-h-[23rem]">
      <PlaceBackdrop metro={metro} eager={eager}>
        <div className={`relative mx-auto w-full ${width} px-6 pb-12 pt-16 sm:pb-16 sm:pt-24`}>
          <div className="on-photo band-words">{children}</div>
        </div>
      </PlaceBackdrop>
    </section>
  );
}

/**
 * The market band's two rows (`MarketBand`): the picture, its scrim and the
 * words share the first; the photograph's credit has the second to itself,
 * on the band's own dark colour under the picture. The credit had been drawn
 * at the picture's foot, under the words: measured in Chromium on
 * 2026-10-01, at 390px it wrapped to two or three lines and climbed over the
 * name on 40 of the 45 bands /market draws, and at 820px St. Louis's
 * two-line credit did the same. In a row of its own a longer credit makes
 * the band taller instead. The picture's row is a grid area with an explicit
 * end line, since an absolutely placed box whose end line is `auto` reaches
 * the grid's padding edge — over the credit's row too.
 */
export const MARKET_BAND_PICTURE = "absolute inset-0 col-start-1 row-start-1 row-end-2";
export const MARKET_BAND_CREDIT_ROW = "col-start-1 row-start-2";
/** The credit's own type: solid band colour behind it, so the tier is
 *  measured against the band's colour (lib/place-band.contrast.test.ts). */
export const MARKET_BAND_CREDIT = "pointer-events-auto px-5 pb-3 pt-2 text-right text-[10px] leading-snug text-white/75 sm:px-6";

/**
 * A market's own band: its photograph, an eyebrow and a name.
 *
 * One component for the briefed markets and the ones read without a brief
 * on /market, and for a submarket's own page, which opens on its metro's
 * photograph with the submarket's name as the page's heading — so none of
 * them can drift. 15rem on a phone and 21rem from `sm` — the card band was
 * 13rem / 16rem, which `PlaceBand`'s own measure calls a texture — under the
 * "caption" scrim, which is anchored to these words in pixels and leaves the
 * rest of the band to the photograph. The photograph's credit is drawn in a
 * row of its own under the picture (`MARKET_BAND_CREDIT_ROW`), never over
 * the words.
 */
export function MarketBand({
  metro,
  eyebrow,
  name,
  as: Heading = "h3",
  eager = false,
}: {
  metro: string;
  eyebrow: string;
  name: string;
  /** the name's heading level: a section of /market, or a page's own title */
  as?: "h1" | "h3";
  /** the page's opening picture: fetched first (PlaceBackdrop) */
  eager?: boolean;
}) {
  return (
    <div className="band-dark relative grid overflow-hidden rounded-2xl text-white" data-qa="market-band">
      {/* Inside a page's column, never wider than its 72rem. */}
      <PlaceBackdrop
        metro={metro}
        height={480}
        scrim="caption"
        sizes={PAGE_COLUMN_SIZES}
        eager={eager}
        layer={MARKET_BAND_PICTURE}
        creditLayer={MARKET_BAND_CREDIT_ROW}
        creditClassName={MARKET_BAND_CREDIT}
      >
        <div className="on-photo band-words relative col-start-1 row-start-1 flex min-h-[15rem] w-full flex-col justify-end px-5 pb-6 pt-10 sm:min-h-[21rem] sm:px-6 sm:pb-7 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
          {/* Two lines at most: the scrim is measured to the top of a name
              wrapped to two lines on a phone, and a submarket's name is
              whatever its owner typed. The whole name stays in the text. */}
          <Heading className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight sm:text-3xl">{name}</Heading>
        </div>
      </PlaceBackdrop>
    </div>
  );
}
