import { type ReactNode } from "react";
import { metroView } from "@/lib/metro-imagery";
import { skylineCreditParts, skylineFor, skylineSrcSet, skylineTag } from "@/lib/skyline";
import { CityPhotoView } from "./city-photo-view";

/**
 * The picture of a covered market, and the honest sentence under it.
 *
 * Two sources, in order of what the reader is actually asking. A skyline
 * answers "what is this place" — it is the photograph a market is known
 * by, and it is what every professional real-estate site puts at the top
 * of a market page. The overhead frame answers "where is this place",
 * which is the right question on a deal (that roof IS the asset) and the
 * wrong one on a market brief. So this component prefers the skyline and
 * keeps the overhead as the floor.
 *
 * THE CREDIT FOLLOWS THE PICTURE. This is the whole reason the fallback
 * lives in a client component rather than inside the route. Every licence
 * on these photographs except public domain obliges us to name the
 * photographer, and naming the wrong one is worse than naming none. The
 * source that actually rendered is the one in state, so the caption can
 * never drift from the pixels — if the skyline 404s and the overhead takes
 * its place, the caption becomes the USGS line in the same tick.
 *
 * A market with neither picture renders nothing at all: no broken-image
 * glyph, no grey placeholder box, no caption for an absent photograph.
 * The band's own background carries on, which is what `AerialImg` has
 * always done and what the operator's "never a placeholder" rule asks for.
 *
 * Where the surface says how wide its slot draws (`sizes`, #446), the
 * skyline is offered at several widths and the overhead at twice its size
 * too, so the browser draws a dense screen's picture from enough pixels.
 * A panorama cropped into a squarer tile is covered by its HEIGHT, so a
 * tile's `sizes` says the width the picture must be drawn at to fill the
 * tile's height, not the tile's own width.
 *
 * The page's opening picture (`eager`) is asked for at once and ahead of
 * everything else on the page; every other one waits until it is near.
 * Asked for that early, it can fail before the page hydrates, when its
 * `error` fires with no listener to hear it, so the component also checks
 * on mount — a finished load with no pixels is a failure too (DealBanner's
 * rule) — and the fallback to the overhead holds either way.
 *
 * Behind a band's words (`layer`), the credit comes AFTER the words in the
 * markup. It is drawn at the band's foot, but it sat first in the markup,
 * so on the homepage Tab reached the photographer and the licence before
 * "Get started free", and a screen reader read the credit before the page's
 * heading. So the band hands its words in as `children`: the picture (and
 * its scrim) fill the layer's box, the words follow, and the credit comes
 * last in a box of the same shape, which keeps it where it was on screen.
 * The state that decides which credit that is stays with the picture.
 *
 * A SERVER component: it looks the market up in lib/skyline's table and in
 * lib/metro-imagery's, and hands `CityPhotoView` (the client half, which
 * holds the fallback) only the two pictures it may show, as data. The
 * component had been a client one, which sent both tables to the browser on
 * every page with a photo band (research pass 25: 58 KB of photograph table
 * on ten public pages and the pipeline).
 */
export function CityPhoto({
  metro,
  width,
  height,
  className,
  // pointer-events-auto: the credit's links sit inside a backdrop that
  // lets clicks through to the band's own words
  creditClassName = "pointer-events-auto absolute bottom-3 right-4 z-10 text-[10px] text-white/75",
  alt,
  describe = false,
  eager = false,
  showCredit = true,
  sizes,
  layer,
  creditLayer,
  overlay,
  children,
}: {
  /** a metro id from data/research/metros.json */
  metro: string;
  width: number;
  height: number;
  className?: string;
  /** where the obligatory credit sits; the default suits a dark band */
  creditClassName?: string;
  /** empty for a decorative backdrop, descriptive when the picture is content */
  alt?: string;
  /** the alt text says what the picture on screen shows — the photograph's
   *  own description, or the overhead's place "from above" — and follows the
   *  fallback as the credit does: a fixed "skyline" is false of an overhead */
  describe?: boolean;
  /** the page's opening picture paints with the page; every other one waits */
  eager?: boolean;
  showCredit?: boolean;
  /** how wide the slot draws, for the browser to pick a file by; unset,
   *  the one file at `width`, as before */
  sizes?: string;
  /** a band's picture layer: the box the picture fills behind the band's
   *  words ("absolute inset-0", or the hero's strip), and the shape of the
   *  box its credit is drawn in after them. Unset, the picture and its
   *  credit are drawn bare, as before. */
  layer?: string;
  /** the box the credit is drawn in after the words, where it is not the
   *  picture layer's shape: a market's band draws it in a row of its own
   *  under the picture, so it never lands on the band's words (measured in
   *  Chromium on 2026-10-01, the credit wrapped over the name on 40 of 45
   *  market bands at 390px). Unset, `layer`. */
  creditLayer?: string;
  /** drawn over the picture inside its layer: the band's scrim */
  overlay?: ReactNode;
  /** the band's words, drawn between the picture and its credit */
  children?: ReactNode;
}) {
  const shot = skylineFor(metro);
  const view = metroView(metro);
  // `v` is a cache buster, not a parameter the route reads: the bytes are
  // served immutable for a year, and without a token that moves when the
  // table names a different file, a returning visitor would hold last
  // year's photograph forever.
  const skyline = shot
    ? {
        src: `/api/imagery/skyline/${metro}?w=${width}&v=${skylineTag(metro)}`,
        srcSet: sizes ? skylineSrcSet(metro) : undefined,
        alt: shot.place,
        // The photographer linked to the file's page and the licence to its
        // text, and "cropped to fit": what a Creative Commons credit carries.
        credit: skylineCreditParts(shot),
      }
    : null;
  // The overhead is drawn at the size asked for, so twice the size is the
  // same frame at twice the grain, inside the route's 1600px ceiling.
  const aerialSrc = `/api/imagery/metro/${metro}?w=${width}&h=${height}`;
  const double = width * 2 <= 1600 && height * 2 <= 1600;
  const aerial = view
    ? {
        src: aerialSrc,
        srcSet: sizes && double ? `${aerialSrc} 1x, /api/imagery/metro/${metro}?w=${width * 2}&h=${height * 2} 2x` : undefined,
        alt: `${view.place} from above`,
        credit: `${view.place} from above · USGS`,
      }
    : null;
  return (
    <CityPhotoView
      skyline={skyline}
      aerial={aerial}
      width={width}
      height={height}
      className={className}
      creditClassName={creditClassName}
      alt={alt}
      describe={describe}
      eager={eager}
      showCredit={showCredit}
      sizes={sizes}
      layer={layer}
      creditLayer={creditLayer}
      overlay={overlay}
    >
      {children}
    </CityPhotoView>
  );
}
