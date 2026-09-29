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
  className = "",
}: {
  cover: DealCoverFacts;
  /** the deal's name, for the picture's accessible name */
  label: string;
  /** a card's cover, or a list row's thumbnail (no words at that size) */
  size?: "card" | "thumb";
  className?: string;
}) {
  const background = coverBackground(cover.tone);
  if (size === "thumb") {
    // A row's 48px: the drawing larger in its frame and its line heavier,
    // or the panes run together into a grey smudge.
    return (
      <span
        aria-hidden
        data-deal-cover={cover.kind}
        style={{ background }}
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
      >
        <CoverArt kind={cover.kind} stroke={2.6} className="h-[78%] w-[78%] opacity-80" />
      </span>
    );
  }
  return (
    <div
      role="img"
      aria-label={`No photograph of ${label} yet${cover.place ? `, in ${cover.place}` : ""}`}
      data-deal-cover={cover.kind}
      style={{ background }}
      className={`relative overflow-hidden ${className}`}
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
