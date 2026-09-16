"use client";

import { useState } from "react";
import { METRO_VIEWS } from "@/lib/metro-imagery";
import { creditLine, skylineFor, skylineTag } from "@/lib/skyline";

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
 */
export function CityPhoto({
  metro,
  width,
  height,
  className,
  creditClassName = "absolute bottom-3 right-4 z-10 text-[10px] text-white/50",
  alt,
  eager = false,
  showCredit = true,
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
}) {
  const shot = skylineFor(metro);
  const view = METRO_VIEWS[metro];
  const [mode, setMode] = useState<"skyline" | "aerial" | "none">(
    shot ? "skyline" : view ? "aerial" : "none",
  );

  if (mode === "none") return null;

  const skyline = mode === "skyline" && shot;
  // `v` is a cache buster, not a parameter the route reads: the bytes are
  // served immutable for a year, and without a token that moves when the
  // table names a different file, a returning visitor would hold last
  // year's photograph forever.
  const src = skyline
    ? `/api/imagery/skyline/${metro}?w=${width}&v=${skylineTag(metro)}`
    : `/api/imagery/metro/${metro}?w=${width}&h=${height}`;
  const credit = skyline
    ? creditLine(shot)
    : view
      ? `${view.place} from above · USGS`
      : "";

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied route
          that sets its own immutable cache headers; next/image would add a
          second cache layer over it and cannot express the fallback chain */}
      <img
        src={src}
        alt={alt ?? ""}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setMode(skyline && view ? "aerial" : "none")}
        className={className}
      />
      {showCredit && credit ? <p className={creditClassName}>{credit}</p> : null}
    </>
  );
}
