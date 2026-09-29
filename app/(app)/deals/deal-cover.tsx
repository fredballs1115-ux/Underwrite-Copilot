import type { CoverKind, DealCoverFacts } from "@/lib/deal-cover";

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
  const [light, dark] = cover.tone;
  const background = `radial-gradient(120% 90% at 12% 8%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%), linear-gradient(140deg, ${light}, ${dark})`;
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
      <path d={ART[kind]} />
    </svg>
  );
}

/** A grid of window panes: `cols` × `rows` of `w` × `h` from (x, y), a
 *  pitch apart, leaving out the panes an entrance takes ("col,row"). */
function panes(x: number, y: number, w: number, h: number, cols: number, rows: number, dx: number, dy: number, skip: string[] = []): string {
  let d = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!skip.includes(`${c},${r}`)) d += `M${x + c * dx} ${y + r * dy}h${w}v${h}h-${w}z`;
    }
  }
  return d;
}

/**
 * One drawing per building type, each standing on the same ground line so
 * the covers read as one set: an apartment block under its parapet, pane by
 * pane, with its entrance; an office tower's curtain wall beside a low
 * wing; a warehouse with three dock doors; a storefront under its striped
 * awning; a hotel with its rooftop sign and entrance canopy; a row of
 * storage doors; a staked parcel with a flag; and a plain pair of buildings.
 */
const ART: Record<CoverKind, string> = {
  housing: `M4 58h56M12 58V14h40v44M10 14h44${panes(17, 19, 6, 5, 3, 4, 12, 10, ["1,3"])}M28 58V48h8v10`,
  office:
    "M4 58h56M18 58V6h24v52M26 6v52M34 6v52M18 16h24M18 26h24M18 36h24M18 46h24M42 58V30h14v28M42 38h14M42 46h14M49 30v28",
  industrial:
    "M2 58h60M6 58V30l26-12 26 12v28M13 58V42h10v16M27 58V42h10v16M41 58V42h10v16M13 47h10M27 47h10M41 47h10M13 52h10M27 52h10M41 52h10M24 31h16",
  retail:
    "M4 58h56M9 58V27h46v31M6 27l4-11h44l4 11M6 27h52M17 16l-2 11M25 16l-1 11M32 16v11M39 16l1 11M47 16l2 11M14 34h13v13H14zM37 34h13v13H37zM29 58V36h6v22",
  hotel: `M4 58h56M16 58V12h32v46M25 12V6h14v6${panes(21, 16, 5, 4, 3, 4, 8.5, 7)}M22 49h20l-2-4H24zM25 58v-9M39 58v-9`,
  storage:
    "M2 58h60M5 58V28h54v30M3 28h58M9 58V35h12v23M26 58V35h12v23M43 58V35h12v23M9 41h12M26 41h12M43 41h12M9 47h12M26 47h12M43 47h12M9 53h12M26 53h12M43 53h12",
  land: "M2 58h60M4 50c9-6 19-6 28 0s19 6 28 0M12 58v-7M52 58v-7M12 54h40M32 47V20l15 5-15 5",
  building: `M4 58h56M10 58V26h20v32M30 58V12h24v46${panes(15, 31, 4, 4, 2, 3, 6, 8)}${panes(35, 17, 5, 4, 2, 4, 9, 8)}M40 58v-8h4v8`,
};
