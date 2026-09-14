import type { ReactNode } from "react";
import { AerialBackdrop } from "./aerial-img";
import { METRO_VIEWS } from "@/lib/metro-imagery";

// A real place behind a page's opening words.
//
// The operator's rule (2026-09-14): real pictures of actual things, built
// for a human. The one photograph the site can always produce for itself
// is a USGS aerial of a covered market's downtown, served by the metro
// imagery route — so every public page can open on one. The picture sits
// under a scrim in the band's own colour so the type keeps its contrast
// whatever the frame's brightness, and the credit rides with the picture
// (AerialBackdrop drops both on a 404).

/** The picture and its scrim, for a band that positions itself. */
export function PlaceBackdrop({
  metro,
  height = 600,
  opacity = "opacity-30",
}: {
  metro: string;
  height?: number;
  opacity?: string;
}) {
  const view = METRO_VIEWS[metro];
  if (!view) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <AerialBackdrop
        src={`/api/imagery/metro/${metro}?w=1600&h=${height}`}
        width={1600}
        height={height}
        credit={`${view.place} from above · USGS`}
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
