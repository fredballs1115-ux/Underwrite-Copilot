"use client";

import { useEffect, useRef, useState } from "react";
import { metroView } from "@/lib/metro-imagery";
import { skylineFor, skylineSrcSet, skylineTag } from "@/lib/skyline";
import { SkylineCreditText } from "./photo-credit";

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
  eager = false,
  showCredit = true,
  sizes,
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
  /** the page's opening picture paints with the page; every other one waits */
  eager?: boolean;
  showCredit?: boolean;
  /** how wide the slot draws, for the browser to pick a file by; unset,
   *  the one file at `width`, as before */
  sizes?: string;
}) {
  const shot = skylineFor(metro);
  const view = metroView(metro);
  const [mode, setMode] = useState<"skyline" | "aerial" | "none">(
    shot ? "skyline" : view ? "aerial" : "none",
  );
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A picture that settled before hydration fired its event unheard.
    const img = ref.current;
    if (!img?.complete || img.naturalWidth > 0) return;
    setMode((m) => (m === "skyline" && view ? "aerial" : "none"));
  }, [mode, view]);

  if (mode === "none") return null;

  const skyline = mode === "skyline" && shot;
  // `v` is a cache buster, not a parameter the route reads: the bytes are
  // served immutable for a year, and without a token that moves when the
  // table names a different file, a returning visitor would hold last
  // year's photograph forever.
  const src = skyline
    ? `/api/imagery/skyline/${metro}?w=${width}&v=${skylineTag(metro)}`
    : `/api/imagery/metro/${metro}?w=${width}&h=${height}`;
  // The photographer linked to the file's page and the licence to its
  // text, and "cropped to fit": what a Creative Commons credit carries.
  const credit = skyline ? (
    <SkylineCreditText shot={shot} linkClassName="underline decoration-dotted underline-offset-2 hover:text-white" />
  ) : view ? (
    `${view.place} from above · USGS`
  ) : null;
  // The overhead is drawn at the size asked for, so twice the size is the
  // same frame at twice the grain, inside the route's 1600px ceiling.
  const double = width * 2 <= 1600 && height * 2 <= 1600;
  const srcSet = !sizes
    ? undefined
    : skyline
      ? skylineSrcSet(metro)
      : double
        ? `${src} 1x, /api/imagery/metro/${metro}?w=${width * 2}&h=${height * 2} 2x`
        : undefined;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied route
          that sets its own immutable cache headers; next/image would add a
          second cache layer over it and cannot express the fallback chain */}
      <img
        ref={ref}
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt ?? ""}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        onError={() => setMode(skyline && view ? "aerial" : "none")}
        className={className}
      />
      {showCredit && credit ? <p className={creditClassName}>{credit}</p> : null}
    </>
  );
}
