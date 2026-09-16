import type { ReactNode } from "react";
import { CityPhoto } from "./city-photo";
import { METRO_VIEWS } from "@/lib/metro-imagery";

// A real place behind a page's opening words.
//
// The operator's rule (2026-09-14): real pictures of actual things, built
// for a human. Refined (2026-09-16): a market is known by its SKYLINE, not
// by its roofs — "the pictures all around the site are TERRIBLE overhead
// photos." So `CityPhoto` shows the market's photograph where one is
// verified and keeps the overhead frame as the floor, and the credit under
// the band always names whichever of the two actually rendered.
//
// The picture sits under a scrim in the band's own colour so the type keeps
// its contrast whatever the photograph's brightness. The scrims are painted
// after the image and before the credit, which is why the credit carries a
// z-index — an attribution the scrim washes out is not an attribution.

/** The picture and its scrim, for a band that positions itself. */
export function PlaceBackdrop({
  metro,
  height = 600,
  opacity = "opacity-30",
}: {
  metro: string;
  height?: number;
  /** how far the photograph reads through the band's colour */
  opacity?: string;
}) {
  if (!METRO_VIEWS[metro]) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      <CityPhoto
        metro={metro}
        width={1600}
        height={height}
        className={`h-full w-full object-cover ${opacity}`}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-sidebar via-sidebar/85 to-sidebar/55" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-sidebar to-transparent" />
    </div>
  );
}

/** A dark band opening a page: the place behind, the words in front. */
export function PlaceBand({
  metro,
  width = "max-w-3xl",
  children,
}: {
  metro: string;
  /** the page's content width, so the words line up with what follows */
  width?: string;
  children: ReactNode;
}) {
  return (
    <section className="band-dark relative overflow-hidden text-white">
      <PlaceBackdrop metro={metro} />
      <div className={`relative mx-auto w-full ${width} px-6 py-12 sm:py-16`}>{children}</div>
    </section>
  );
}
