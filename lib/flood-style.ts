// FEMA's flood zones in the site's own palette (#472).
//
// The Flood view drew FEMA's National Flood Hazard Layer as FEMA prints it:
// a flat cyan wash over the whole photograph at 30%, FEMA's small labels,
// and hatch patterns tuned for paper. The service reports
// `supportsDynamicLayers: true`, so the same features can be drawn in a
// style of the site's choosing — and the runner's flood sheets (scripts/
// probe-flood.mjs, runs 36743403582 … 36745937081) showed what that takes:
//
//   - CLASSIFY EXACTLY AS FEMA'S LEGEND DOES. The classes are FEMA's legend
//     entries, each with its FLD_ZONE,ZONE_SUBTY values ("AE,<Null>", "AE,
//     FLOODWAY", …), turned into unique-value renderers. A first cut keyed
//     the 1% zone on SFHA_TF and drew nothing over Hoboken's and New
//     Orleans' Zone AE, whose polygons do not carry it: FEMA's own classes
//     are the only safe key, and only the drawing changes. FEMA's renderer
//     has no default symbol, so a value no entry lists is undrawn in both.
//   - THREE LAYERS, TOP FIRST: the hatches, the tints and outlines, then a
//     wide white casing under every edge so a boundary reads over a busy
//     roofscape. The floodway is part of the 1% zone, so it carries the 1%
//     tint under its red hatch — drawn as a hatch alone it read as the
//     river rather than as the most dangerous part of the flood zone.
//   - FEMA'S LAYER TRANSPARENCY IS NOT TO BE TRUSTED EITHER WAY. The zone
//     layer carries a 70% transparency of its own. Asked with `transparency:
//     0`, one run read the 1% tint back at alpha 32 (105 × 0.3) and a run
//     thirteen minutes later, with the identical request, at 105. So every
//     overlay is measured (`overlayAlphaScale`) and a scaled one corrected
//     (`unscaleAlpha`) before it is drawn — never either behaviour assumed.
//   - POST, NOT GET. FEMA's full class list makes the dynamic layers some
//     80 KB, past what a URL carries.
//   - FEMA'S LABELS OFF. The page says the zone at the building in words and
//     keys every colour in its own legend: only the classes the frame
//     actually shows (`classesIn`), read off the drawn pixels.
//
// Pure — no I/O. The overlay fetch is lib/flood-frame's.

export type Rgba = readonly [number, number, number, number];

export type FloodClassKey =
  | "floodway"
  | "sfha"
  | "moderate"
  | "future"
  | "levee-reduced"
  | "levee-risk"
  | "undetermined";

export interface FloodClassStyle {
  key: FloodClassKey;
  /** the tint, RGBA with alpha 0–255 as ArcGIS reads it */
  fill: Rgba;
  outline: Rgba;
  /** the outline's width in points */
  width: number;
  /** a hatch drawn over the tint, in its own colour; null for none */
  hatch: { dir: "backward" | "forward"; color: Rgba } | null;
}

const SFHA_FILL: Rgba = [30, 136, 229, 105];

/** FEMA's legend labels to the palette, first match wins: the floodway
 *  before the 1% zone it sits in, a levee's reduced risk before its risk. */
export const FLOOD_CLASSES: ReadonlyArray<{ match: RegExp; style: FloodClassStyle }> = [
  {
    match: /floodway/i,
    style: { key: "floodway", fill: SFHA_FILL, outline: [183, 28, 28, 255], width: 2.25, hatch: { dir: "backward", color: [229, 57, 53, 200] } },
  },
  { match: /^1% annual chance/i, style: { key: "sfha", fill: SFHA_FILL, outline: [13, 71, 161, 255], width: 2.25, hatch: null } },
  { match: /^0\.2% annual chance/i, style: { key: "moderate", fill: [255, 179, 0, 85], outline: [230, 126, 0, 255], width: 2, hatch: null } },
  { match: /future conditions/i, style: { key: "future", fill: [142, 36, 170, 70], outline: [106, 27, 154, 255], width: 1.75, hatch: null } },
  { match: /reduced risk due to levee/i, style: { key: "levee-reduced", fill: [0, 137, 123, 60], outline: [0, 105, 92, 255], width: 1.75, hatch: null } },
  {
    match: /risk due to levee/i,
    style: { key: "levee-risk", fill: [141, 110, 99, 60], outline: [93, 64, 55, 240], width: 1.75, hatch: { dir: "forward", color: [141, 110, 99, 200] } },
  },
  {
    match: /undetermined/i,
    style: { key: "undetermined", fill: [117, 117, 117, 60], outline: [66, 66, 66, 240], width: 1.75, hatch: { dir: "forward", color: [117, 117, 117, 200] } },
  },
];

/** The classes in the order a key lists them: the most hazardous first. */
export const FLOOD_CLASS_ORDER: readonly FloodClassKey[] = [
  "floodway",
  "sfha",
  "moderate",
  "future",
  "levee-reduced",
  "levee-risk",
  "undetermined",
];

/** Each class in FEMA's own words. The floodway stands for both of FEMA's
 *  floodway entries (regulatory and special), which the palette draws alike. */
export const FLOOD_CLASS_LABEL: Readonly<Record<FloodClassKey, string>> = {
  floodway: "Floodway",
  sfha: "1% annual chance flood hazard",
  moderate: "0.2% annual chance flood hazard",
  future: "Future conditions 1% annual chance flood hazard",
  "levee-reduced": "Area with reduced risk due to levee",
  "levee-risk": "Area with risk due to levee",
  undetermined: "Area of undetermined flood hazard",
};

/** The palette entry for one of FEMA's legend labels; null for a label no
 *  class answers (it is then left undrawn, as FEMA leaves Zone X). */
export function floodClassFor(label: string): FloodClassStyle | null {
  const l = label.trim();
  return FLOOD_CLASSES.find((c) => c.match.test(l))?.style ?? null;
}

export const floodStyleOf = (key: FloodClassKey): FloodClassStyle =>
  FLOOD_CLASSES.find((c) => c.style.key === key)!.style;

export interface FloodLegendEntry {
  label: string;
  /** FEMA's FLD_ZONE,ZONE_SUBTY values for the entry, "<Null>" and all */
  values: readonly string[];
}

/** The class a zone and subtype are drawn in, by FEMA's own legend values —
 *  "<Null>" and the empty string both standing for no subtype, as FEMA
 *  writes them. Null for a zone FEMA does not draw (Zone X of minimal
 *  hazard, open water, an area not included). */
export function floodClassOfZone(
  legend: readonly FloodLegendEntry[],
  zone: string,
  subtype: string | null,
): FloodClassKey | null {
  const z = zone.trim().toUpperCase();
  const s = (subtype ?? "").trim().toUpperCase();
  const keys = s ? [`${z},${s}`] : [`${z},<NULL>`, `${z},`];
  for (const entry of legend) {
    if (entry.values.some((v) => keys.includes(v.trim().toUpperCase()))) return floodClassFor(entry.label)?.key ?? null;
  }
  return null;
}

/** The white line under every class's outline. */
const CASING: Rgba = [255, 255, 255, 210];
const CASING_EXTRA = 2.25;

const hatchStyle = (dir: "backward" | "forward") => (dir === "backward" ? "esriSFSBackwardDiagonal" : "esriSFSForwardDiagonal");
const line = (color: Rgba, width: number) => ({ type: "esriSLS", style: "esriSLSSolid", color, width });
const NULL_FILL = (outline: object | null) => ({ type: "esriSFS", style: "esriSFSNull", outline });

/**
 * The export's `dynamicLayers`: FEMA's zone layer three times, drawn top
 * first — the hatches (with the hatched classes' outlines), the tints and
 * the other classes' outlines, then the casings beneath — each a
 * unique-value renderer over FEMA's own legend values, labels off and the
 * layer's inherited transparency set to zero (for the servers that honour
 * it; `overlayAlphaScale` catches the ones that do not). Null where no
 * legend entry matches a class: nothing would be drawn.
 */
export function floodDynamicLayers(layerId: number, legend: readonly FloodLegendEntry[]): object[] | null {
  const source = { type: "mapLayer", mapLayerId: layerId };
  const classed = legend
    .map((entry) => ({ entry, style: floodClassFor(entry.label) }))
    .filter((c): c is { entry: FloodLegendEntry; style: FloodClassStyle } => c.style != null && c.entry.values.length > 0);
  if (!classed.length) return null;
  const infos = (symbolOf: (s: FloodClassStyle) => object | null) =>
    classed.flatMap(({ entry, style }) => {
      const symbol = symbolOf(style);
      return symbol ? entry.values.map((value) => ({ value, label: entry.label, symbol })) : [];
    });
  const hatches = infos((s) =>
    s.hatch ? { type: "esriSFS", style: hatchStyle(s.hatch.dir), color: s.hatch.color, outline: line(s.outline, s.width) } : null,
  );
  const tints = infos((s) => ({ type: "esriSFS", style: "esriSFSSolid", color: s.fill, outline: s.hatch ? null : line(s.outline, s.width) }));
  const casings = infos((s) => NULL_FILL(line(CASING, s.width + CASING_EXTRA)));
  const layer = (id: number, uniqueValueInfos: object[]) => ({
    id,
    source,
    drawingInfo: {
      renderer: { type: "uniqueValue", field1: "FLD_ZONE", field2: "ZONE_SUBTY", fieldDelimiter: ",", uniqueValueInfos },
      transparency: 0,
      showLabels: false,
    },
  });
  return [...(hatches.length ? [layer(901, hatches)] : []), layer(902, tints), layer(903, casings)];
}

// ── The overlay as it comes back ────────────────────────────────────────────

/** FEMA's zone layer's own transparency, as the runner printed the layer
 *  (`drawingInfo.transparency 70`): a server that applies it draws every
 *  symbol at 30% of the alpha it was asked for. */
export const FEMA_LAYER_OPACITY = 0.3;

const near = (r: number, g: number, b: number, c: Rgba, tol: number) =>
  Math.abs(r - c[0]) <= tol && Math.abs(g - c[1]) <= tol && Math.abs(b - c[2]) <= tol;

/**
 * Whether FEMA applied its layer transparency to the restyle: the alpha the
 * tints' interiors came back at against the alpha they were asked for. 1
 * where they came back as asked, 1 / 0.3 where scaled, null where the frame
 * shows no tint to judge by (nothing drawn — nothing to correct) or where
 * the measure fits neither (the caller does not keep such a frame).
 */
export function overlayAlphaScale(rgba: Uint8Array, width: number, height: number): number | null {
  const tints = FLOOD_CLASSES.map((c) => c.style.fill).filter((f, i, all) => all.findIndex((g) => g.join() === f.join()) === i);
  for (const fill of tints) {
    const hist = new Map<number, number>();
    let n = 0;
    for (let i = 0; i < width * height * 4; i += 4) {
      const a = rgba[i + 3];
      if (a === 0 || a === 255) continue;
      if (!near(rgba[i], rgba[i + 1], rgba[i + 2], fill, 12)) continue;
      n++;
      hist.set(a, (hist.get(a) ?? 0) + 1);
    }
    // A tint worth judging covers a real part of the frame, not a few
    // antialiased pixels at an edge.
    if (n < (width * height) / 2000) continue;
    const mode = [...hist.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const ratio = mode / fill[3];
    if (ratio > 0.85 && ratio < 1.15) return 1;
    if (ratio > FEMA_LAYER_OPACITY * 0.8 && ratio < FEMA_LAYER_OPACITY * 1.2) return 1 / FEMA_LAYER_OPACITY;
    return null;
  }
  return 1;
}

/** Undo a uniform alpha scaling in place, clamped to opaque. */
export function unscaleAlpha(rgba: Uint8Array, factor: number): void {
  if (factor === 1) return;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) continue;
    rgba[i] = Math.min(255, Math.round(rgba[i] * factor));
  }
}

const TINTED: readonly FloodClassKey[] = ["sfha", "moderate", "future", "levee-reduced", "levee-risk", "undetermined"];

/**
 * A pixel's class, read off the drawing. A class counts only by its tint's
 * INTERIOR — its colour at its own alpha, within a step of rounding — never
 * by colour alone: where the 0.2% zone's amber meets the 1% zone's dark-blue
 * outline the antialiased blend is a brown within reach of the levee risk's,
 * and New Orleans' frame (flood-sheet run 36745937081) keyed a levee class
 * FEMA's own query says is not there. The floodway alone is read by its
 * hatch, since its tint is the 1% zone's: a red nothing else in the palette
 * draws, or blends to.
 */
function pixelClass(r: number, g: number, b: number, a: number): FloodClassKey | null {
  if (a < 30) return null;
  if (a > 100 && r > 170 && g < 120 && b < 130 && r - g > 80) return "floodway";
  for (const key of TINTED) {
    const fill = floodStyleOf(key).fill;
    if (Math.abs(a - fill[3]) <= 5 && near(r, g, b, fill, 8)) return key;
  }
  return null;
}

/** A centred crop of a frame, by its share of the frame's width and height. */
export interface FrameRegion {
  /** the crop's width over the frame's, 0–1 */
  w: number;
  /** the crop's height over the frame's, 0–1 */
  h: number;
}

/** The region a crop of `aspect` (width / height) takes from the centre of
 *  a frame of `frameAspect`: the whole of one side, as much of the other as
 *  the shape allows. */
export function centredRegion(frameAspect: number, aspect: number): FrameRegion {
  return aspect >= frameAspect ? { w: 1, h: frameAspect / aspect } : { w: aspect / frameAspect, h: 1 };
}

/**
 * The classes a frame shows inside a centred region, in the key's order: a
 * class counts once it covers a patch the eye can see (`minPixels`), so a
 * key never lists a colour the picture does not have — nor, past a few
 * antialiased pixels, leaves one out.
 */
export function classesIn(
  rgba: Uint8Array,
  width: number,
  height: number,
  region: FrameRegion = { w: 1, h: 1 },
  minPixels = 150,
): FloodClassKey[] {
  const x0 = Math.round((width * (1 - region.w)) / 2);
  const y0 = Math.round((height * (1 - region.h)) / 2);
  const x1 = width - x0;
  const y1 = height - y0;
  const counts = new Map<FloodClassKey, number>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const k = pixelClass(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return FLOOD_CLASS_ORDER.filter((k) => (counts.get(k) ?? 0) >= minPixels);
}

// ── The key ─────────────────────────────────────────────────────────────────

const rgba = ([r, g, b, a]: Rgba) => `rgba(${r},${g},${b},${Math.round((a / 255) * 1000) / 1000})`;

/** A legend swatch's CSS background for a class: its tint, with its hatch
 *  drawn over it where it has one. The outline is the chip's border. */
export function floodSwatchBackground(style: FloodClassStyle): string {
  if (!style.hatch) return rgba(style.fill);
  const angle = style.hatch.dir === "backward" ? 45 : -45;
  const [r, g, b] = style.hatch.color;
  return `repeating-linear-gradient(${angle}deg, rgba(${r},${g},${b},1) 0 2px, transparent 2px 6px), ${rgba(style.fill)}`;
}

/** The swatch's border colour: the class's outline. */
export const floodSwatchBorder = (style: FloodClassStyle) => rgba(style.outline);

/** A swatch as a small SVG, for the report (react-pdf embeds pictures, not
 *  CSS): the tint, the hatch, the outline — the palette the map was drawn
 *  in. Literal colours only; no text, script or style. */
export function floodSwatchSvg(style: FloodClassStyle, size = 40): string {
  const [fr, fg, fb, fa] = style.fill;
  const [or, og, ob, oa] = style.outline;
  const hatch = style.hatch
    ? Array.from({ length: 8 }, (_, i) => {
        const o = i * 8 - 16;
        const [hr, hg, hb, ha] = style.hatch!.color;
        const d = style.hatch!.dir === "backward" ? `M${o} ${size}L${o + size} 0` : `M${o} 0L${o + size} ${size}`;
        return `<path d="${d}" stroke="rgb(${hr},${hg},${hb})" stroke-opacity="${(ha / 255).toFixed(3)}" stroke-width="3"/>`;
      }).join("")
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<rect width="${size}" height="${size}" fill="rgb(${fr},${fg},${fb})" fill-opacity="${(fa / 255).toFixed(3)}"/>` +
    hatch +
    `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" fill="none" stroke="rgb(${or},${og},${ob})" stroke-opacity="${(oa / 255).toFixed(3)}" stroke-width="4"/>` +
    `</svg>`
  );
}

/** The aerial under the zones, calmer than the Aerial view's, so the zones
 *  carry the colour and the photograph the place: the modulation the frame's
 *  composite applies with sharp. */
export const FLOOD_AERIAL_MUTE = { saturation: 0.55, brightness: 0.96 } as const;
