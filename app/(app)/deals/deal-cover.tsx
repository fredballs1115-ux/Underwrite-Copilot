import type { DealCoverFacts } from "@/lib/deal-cover";
import { coverImage } from "@/lib/deal-cover-art";

/** The frames a cover is drawn for (lib/deal-cover-art lays the scene out
 *  for each): a card's 16:10, with its foot kept for the words, and a list
 *  row's square, where the building is drawn larger and simpler. */
export const COVER_FRAME = { card: [640, 400], thumb: [96, 96] } as const;

/**
 * The cover a deal wears in the pipeline where there is no photograph of it
 * (#442; the rules in lib/deal-cover): an illustration of its kind of
 * building under a sky of its own, and the place named at the foot. Plainly
 * an illustration, never a photograph, so it never passes for the building
 * or for another one, and never an overhead: the operator's rule for the
 * pipeline is pictures, not maps.
 *
 * The picture is the very SVG the image route and the emails serve
 * (`coverImage`, lib/deal-cover-art), painted as the frame's background from
 * the page itself — no request, and one drawing wherever the deal is shown.
 * Pure, so the card, the list row and the tests draw one markup.
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
  const [w, h] = COVER_FRAME[size];
  // Anchored at the foot, so a frame of another shape loses sky, never the
  // ground a card's words sit on.
  const style = { backgroundImage: coverImage(cover, w, h), backgroundSize: "cover", backgroundPosition: "50% 100%" };
  // Positioned by the caller where it is laid over a frame (the frame held
  // while a photograph loads), else relative for its own words. Never both:
  // `relative` and `absolute` on one element is decided by the stylesheet's
  // order, and `relative` won — a cover laid under a loading photograph took
  // the frame's place in the flow, a row's photograph was pushed out of its
  // slot and the card's frame showed no cover (#448).
  const place = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className) ? className : `relative ${className}`;
  if (size === "thumb" || !words) {
    return <span aria-hidden data-deal-cover={cover.kind} style={style} className={`block overflow-hidden ${place}`} />;
  }
  return (
    <div
      role="img"
      aria-label={`No photograph of ${label} yet${cover.place ? `, in ${cover.place}` : ""}`}
      data-deal-cover={cover.kind}
      style={style}
      className={`overflow-hidden ${place}`}
    >
      {/* On the ground at the picture's foot, below its horizon on the
          smallest card the pipeline draws (held by the test). */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2 pt-9">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/90">No photo yet</span>{" "}
        {cover.place ? (
          <span className="block truncate text-[13px] font-semibold leading-tight text-white">{cover.place}</span>
        ) : null}
      </span>
    </div>
  );
}
