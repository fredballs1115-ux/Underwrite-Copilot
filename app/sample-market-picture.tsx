"use client";

import { useEffect, useRef, useState } from "react";
import type { CreditPart } from "@/lib/credit-parts";
import { DEAL_AERIAL_VIEW } from "@/lib/image-frames";
import { CreditPartsText } from "@/app/credit-parts";
import { MarketCaption } from "@/app/(app)/deals/market-caption";
import { skylineSrcSetOf } from "@/lib/skyline-srcset";

/**
 * The page band's own `sizes` (PlaceBackdrop with no boxes: the window's
 * width). Offered the band's srcset at the band's sizes, the header's
 * picture takes the very file the band behind it takes, so the homepage
 * downloads Philadelphia once (audit C7, L14). Never soft: the header's
 * picture is never wider than the window, and its frame (16:9, or 21:9) is
 * wider than the photograph it draws, so the photograph covers it by its
 * width — the band's file, at least the window's width in device pixels,
 * is at least the frame's (lib/home.render.test.ts holds the
 * sample's photograph to that shape).
 */
const BAND_SIZES = "100vw";

/** The deal header's picture frame (property-visual's `FRAME`): 16:9 on a
 *  phone, a wider band where the header stacks at a tablet's width, and
 *  16:9 again in the split. */
const FRAME = "aspect-[16/9] @2xl:aspect-[21/9] @3xl:aspect-[16/9]";

/**
 * The sample deal's picture in its header, drawn as the deal page's picture
 * draws a deal with no photograph of its own and no Street View: its
 * market's photograph (lib/market-picture), named on its face by the
 * product's own caption (`MarketCaption`, hero size) with the photographer
 * linked to the file's page and the licence to its text — property-visual's
 * Market view, markup for markup, without the views a public page cannot
 * draw (the aerial and the map are signed-in routes).
 *
 * Like the deal page's picture it leaves the header the moment it fails
 * (`data-hero-picture` unmounts with it, so the header never keeps half an
 * empty column), and it checks on mount for a failure that settled before
 * hydration, when its `error` fired with no listener.
 */
export function SampleMarketPicture({
  label,
  src,
  alt,
  market,
  credit,
}: {
  /** the deal's address line, the figure's caption for a screen reader */
  label: string;
  src: string;
  alt: string;
  /** the market's name as the site names it */
  market: string;
  /** the photographer and the licence, with their links (lib/credit-parts) */
  credit: readonly CreditPart[];
}) {
  const [gone, setGone] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setGone(true);
  }, []);
  if (gone) return null;
  return (
    <figure data-hero-picture className="min-w-0 overflow-hidden rounded-t-[15px] bg-surface @3xl:rounded-tr-none">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="relative">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the skyline
              route, proxied from Commons with its own immutable cache headers */}
          <img
            ref={img}
            src={src}
            srcSet={skylineSrcSetOf(src) ?? undefined}
            sizes={skylineSrcSetOf(src) ? BAND_SIZES : undefined}
            alt={alt}
            width={DEAL_AERIAL_VIEW.w}
            height={DEAL_AERIAL_VIEW.h}
            className={`${FRAME} w-full bg-faint object-cover`}
            onError={() => setGone(true)}
          />
          <MarketCaption
            market={market}
            credit={
              <CreditPartsText
                parts={credit}
                linkClassName="pointer-events-auto underline decoration-dotted underline-offset-2 hover:text-white"
              />
            }
            size="hero"
          />
        </div>
      </div>
    </figure>
  );
}
