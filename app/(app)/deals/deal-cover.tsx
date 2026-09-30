import type { DealCoverFacts } from "@/lib/deal-cover";
import { COVER_ART, coverBackground, type CoverKind } from "@/lib/deal-cover-art";

/**
 * The cover a deal wears in the pipeline where there is no photograph of it
 * (#442; the rules in lib/deal-cover): its own deep gradient, the building
 * type in white line art, and the place named at the foot. A cover, plainly
 * not a photograph, so it never passes for the building or for another one,
 * and never an overhead: the operator's rule for the pipeline is pictures,
 * not maps. Pure, so the card, the list row and the tests draw one markup.
 */
export function DealCover({
  cover,
  label,
  size = "card",
  words = true,
  className = "",
}: {
  cover: DealCoverFacts;
  /** the deal's name, for the picture's accessible name */
  label: string;
  /** a card's cover, or a list row's thumbnail (no words at that size) */
  size?: "card" | "thumb";
  /** false where the cover only holds the frame while a photograph loads
   *  (#446): no "No photo yet" over a photo on its way, and no name for a
   *  reader, since the photograph carries its own */
  words?: boolean;
  className?: string;
}) {
  const background = coverBackground(cover.tone);
  // Positioned by the caller where it is laid over a frame (the frame held
  // while a photograph loads), else relative for its own art and words.
  // Never both: `relative` and `absolute` on one element is decided by the
  // stylesheet's order, and `relative` won — a cover laid under a loading
  // photograph took the frame's place in the flow, a row's photograph was
  // pushed out of its slot and the card's frame showed no cover (#448).
  const place = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className) ? className : `relative ${className}`;
  if (size === "thumb") {
    // A row's 48px: the drawing larger in its frame and its line heavier,
    // or the panes run together into a grey smudge.
    return (
      <span
        aria-hidden
        data-deal-cover={cover.kind}
        style={{ background }}
        className={`flex items-center justify-center overflow-hidden ${place}`}
      >
        <CoverArt kind={cover.kind} stroke={2.6} className="h-[78%] w-[78%] opacity-80" />
      </span>
    );
  }
  if (!words) {
    return (
      <div aria-hidden data-deal-cover={cover.kind} style={{ background }} className={`overflow-hidden ${place}`}>
        <CoverArt kind={cover.kind} className="absolute right-[5%] top-[8%] h-[64%] w-auto opacity-40" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`No photograph of ${label} yet${cover.place ? `, in ${cover.place}` : ""}`}
      data-deal-cover={cover.kind}
      style={{ background }}
      className={`overflow-hidden ${place}`}
    >
      {/* Above the caption, never behind it: a long place name runs to the
          card's far side, and words over line art read as a smudge. */}
      <CoverArt kind={cover.kind} className="absolute right-[5%] top-[8%] h-[64%] w-auto opacity-40" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2 pt-9">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/90">No photo yet</span>{" "}
        {cover.place ? (
          <span className="block truncate text-[13px] font-semibold leading-tight text-white">{cover.place}</span>
        ) : null}
      </span>
    </div>
  );
}

/** The building type, in white line art on a 64-unit square. */
function CoverArt({ kind, stroke = 1.6, className = "" }: { kind: CoverKind; stroke?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      fill="none"
      stroke="white"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={COVER_ART[kind]} />
    </svg>
  );
}
