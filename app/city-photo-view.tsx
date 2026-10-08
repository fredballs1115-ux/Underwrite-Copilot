"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CreditPart } from "@/lib/credit-parts";
import { CreditPartsText } from "./credit-parts";

/** One picture a market band may show, resolved on the server by
 *  `CityPhoto` (app/city-photo): its address, its widths, what it shows and
 *  its credit. */
export interface CityPicture<Credit> {
  src: string;
  /** the widths it is offered at, where the surface says how wide it draws */
  srcSet?: string;
  /** what the picture on screen shows, for an alt text that describes it */
  alt: string;
  credit: Credit;
  /** where this picture is cropped (a CSS object-position), where its
   *  surface asks for the photograph's own: a band's `bandFocusY`
   *  (lib/skyline). Unset, the surface's class decides. */
  position?: string;
}

/**
 * The client half of `CityPhoto`: the market's photograph, falling back to
 * its overhead and then to nothing, with the credit of whichever picture
 * rendered (the doc on `CityPhoto` says why the fallback lives here). It is
 * handed the two pictures as data and never loads the tables they come from.
 */
export function CityPhotoView({
  skyline,
  aerial,
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
  /** the market's photograph, or null where it has none */
  skyline: CityPicture<CreditPart[]> | null;
  /** the market's overhead frame, or null where it has none */
  aerial: CityPicture<string> | null;
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
  const hasAerial = aerial !== null;
  const [mode, setMode] = useState<"skyline" | "aerial" | "none">(
    skyline ? "skyline" : aerial ? "aerial" : "none",
  );
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A picture that settled before hydration fired its event unheard.
    const img = ref.current;
    if (!img?.complete || img.naturalWidth > 0) return;
    setMode((m) => (m === "skyline" && hasAerial ? "aerial" : "none"));
  }, [mode, hasAerial]);

  // Neither picture (`shown` null): the band's own colour carries on under
  // its scrim, and its words with it. The tree keeps the same slots either
  // way — the picture's slot empty, the scrim where it was — so a picture
  // that fails swaps nothing but itself (research pass 25 measured the
  // homepage's hero shifting 0.37 at 1280px when both of its pictures
  // failed and the scrim was drawn again in a different slot).
  const shown = mode === "skyline" ? skyline : mode === "aerial" ? aerial : null;
  const credit = !shown ? null : mode === "skyline" && skyline ? (
    <CreditPartsText parts={skyline.credit} linkClassName="underline decoration-dotted underline-offset-2 hover:text-white" />
  ) : aerial ? (
    aerial.credit
  ) : null;
  const srcSet = shown && sizes ? shown.srcSet : undefined;

  const picture = !shown ? null : (
    /* eslint-disable-next-line @next/next/no-img-element -- a proxied route
       that sets its own immutable cache headers; next/image would add a
       second cache layer over it and cannot express the fallback chain */
    <img
      ref={ref}
      src={shown.src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={describe ? shown.alt : (alt ?? "")}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      onError={() => setMode(mode === "skyline" && hasAerial ? "aerial" : "none")}
      className={className}
      // The photograph's own crop, over the class's: the picture on screen
      // carries it, so the overhead that replaces a failed photograph is
      // cropped as its surface crops it, never at the photograph's focus.
      style={shown.position ? { objectPosition: shown.position } : undefined}
    />
  );
  const caption = showCredit && credit ? <p className={creditClassName}>{credit}</p> : null;

  if (!layer) {
    return (
      <>
        {picture}
        {children}
        {caption}
      </>
    );
  }
  return (
    <>
      <div className={`pointer-events-none ${layer}`}>
        {picture}
        {overlay}
      </div>
      {children}
      {/* After the words, in a box of the picture's own shape, so it is
          drawn where it always was: at the foot of the picture — or in the
          box the band names for it (`creditLayer`). */}
      {caption ? <div className={`pointer-events-none ${creditLayer ?? layer}`}>{caption}</div> : null}
    </>
  );
}
