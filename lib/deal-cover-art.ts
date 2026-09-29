// The drawings a deal's cover is made of (#442), and the cover as an SVG
// image (#443) for the surfaces that ask a URL for "the picture of this
// deal" and draw whatever comes back: the ⌘K list, the comps from the
// reader's own pipeline, the deal page's sticky bar and the pipeline map's
// hover card, all through /api/deals/[id]/image?fallback=cover. One set of
// drawings, so the pipeline's card, its list row and every one of those
// shows the same cover for the same deal.
//
// Pure and dependency-free, so a client component can draw from it without
// the asset-class table (lib/deal-cover reads the class; this only draws).

/** What the line art draws: the building types a pipeline holds. */
export type CoverKind = "housing" | "office" | "industrial" | "retail" | "hotel" | "storage" | "land" | "building";

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
 * One drawing per building type on a 64-unit square, each standing on the
 * same ground line so the covers read as one set: an apartment block under
 * its parapet, pane by pane, with its entrance; an office tower's curtain
 * wall beside a low wing; a warehouse with three dock doors; a storefront
 * under its striped awning; a hotel with its rooftop sign and entrance
 * canopy; a row of storage doors; a staked parcel with a flag; and a plain
 * pair of buildings.
 */
export const COVER_ART: Record<CoverKind, string> = {
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

/** A cover's ground: the gradient light to dark, lit from the top left. */
export function coverBackground(tone: readonly [string, string]): string {
  const [light, dark] = tone;
  return `radial-gradient(120% 90% at 12% 8%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%), linear-gradient(140deg, ${light}, ${dark})`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The cover at thumbnail size as an SVG document: the ground and the
 * drawing, no words (there is no room for them, and the surfaces that ask
 * for it name the deal beside it). The same ground `coverBackground` paints
 * — the 140-degree line across a square runs from (0.047, −0.040) to
 * (0.953, 1.040) of the box, and the highlight is the radial gradient's
 * ellipse — and the drawing as `DealCover` sets it at a row's size: 78% of
 * the frame, centred, its line heavier, at 80%. It fills whatever frame it
 * is drawn into (`slice`), as the photograph it stands in for would.
 * A tone that is not a six-digit hex is refused rather than written into
 * the document.
 */
export function coverSvg(kind: CoverKind, tone: readonly [string, string], width: number, height: number): string {
  const [light, dark] = tone;
  if (!HEX.test(light) || !HEX.test(dark)) throw new Error("coverSvg: a tone is two six-digit hex colours");
  const inset = (64 * (1 - 0.78)) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<linearGradient id="g" x1="0.047" y1="-0.040" x2="0.953" y2="1.040">` +
    `<stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>` +
    `</linearGradient>` +
    `<radialGradient id="l" cx="0.12" cy="0.08" r="1" gradientTransform="translate(0.12 0.08) scale(1.2 0.9) translate(-0.12 -0.08)">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="64" height="64" fill="url(#g)"/>` +
    `<rect width="64" height="64" fill="url(#l)"/>` +
    `<g transform="translate(${inset.toFixed(2)} ${inset.toFixed(2)}) scale(0.78)" opacity="0.8" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${COVER_ART[kind]}"/>` +
    `</g>` +
    `</svg>`
  );
}
