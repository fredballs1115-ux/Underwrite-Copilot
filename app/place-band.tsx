import type { ReactNode } from "react";
import { CityPhoto } from "./city-photo";
import { METRO_VIEWS } from "@/lib/metro-imagery";
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
export type Scrim = "band" | "center";

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

/** The picture and its scrim, for a band that positions itself. */
export function PlaceBackdrop({
  metro,
  height = 600,
  scrim = "band",
}: {
  metro: string;
  height?: number;
  /** "band" for words set at the bottom, "center" for a centred card */
  scrim?: Scrim;
}) {
  // Either picture is enough to open on. Gating on the overhead alone was
  // safe only by accident — every market with a skyline happens to have an
  // aerial too — and would have blanked the band for the first market that
  // got a photograph without one. CityPhoto decides between them; this only
  // decides whether there is anything to decide between.
  if (!METRO_VIEWS[metro] && !hasSkyline(metro)) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 1400px: the probe measures these at 1600 and the range is wide —
          260 KB for Jersey City, a megabyte for Atlanta — and a band is the
          one place that weight is paid on every page load. Above centre,
          because a skyline's subject is its tower line and the bottom of
          the frame is usually road or water. */}
      <CityPhoto
        metro={metro}
        width={1400}
        height={height}
        className="h-full w-full object-cover object-[50%_42%]"
      />
      <PhotoScrim scrim={scrim} />
    </div>
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
  children,
}: {
  metro: string;
  /** the page's content width, so the words line up with what follows */
  width?: string;
  children: ReactNode;
}) {
  return (
    <section className="band-dark relative flex min-h-[19rem] items-end overflow-hidden text-white sm:min-h-[23rem]">
      <PlaceBackdrop metro={metro} />
      <div className={`relative mx-auto w-full ${width} px-6 pb-12 pt-16 sm:pb-16 sm:pt-24`}>
        <div className="on-photo band-words">{children}</div>
      </div>
    </section>
  );
}
