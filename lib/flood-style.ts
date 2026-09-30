// FEMA's flood zones in the site's own palette (#472).
//
// The Flood view drew FEMA's National Flood Hazard Layer as FEMA prints it:
// a flat cyan wash over the whole photograph at 30%, FEMA's small labels,
// and hatch patterns tuned for paper. The service reports
// `supportsDynamicLayers: true`, so the same features can be drawn in a
// style of the site's choosing — and the runner's flood sheet (scripts/
// probe-flood.mjs, runs 36743403582 … 36744340226) showed what that takes:
//
//   - CLASSIFY EXACTLY AS FEMA'S LEGEND DOES. The classes are FEMA's legend
//     entries, each with its FLD_ZONE,ZONE_SUBTY values ("AE,<Null>", "AE,
//     FLOODWAY", …), turned into one unique-value renderer. A first cut
//     keyed the 1% zone on SFHA_TF and drew nothing over Hoboken's and New
//     Orleans' Zone AE, whose polygons do not carry it: FEMA's own classes
//     are the only safe key, and only the drawing changes.
//   - OVERRIDE THE LAYER'S TRANSPARENCY. FEMA's zone layer carries a 70%
//     transparency a dynamic layer inherits: the restyle's 41% tint came
//     back at 12% (read off the overlay's pixels). Zero hands each symbol
//     its own alpha.
//   - A CASING UNDER EVERY EDGE. Each class's outline sits over a wide white
//     line, so a boundary reads over a busy roofscape.
//   - POST, NOT GET. FEMA's full class list makes the dynamic layers some
//     50 KB, past what a URL carries.
//   - FEMA'S LABELS OFF. The page says the zone at the building in words and
//     keys every colour in its own legend.
//
// Pure — no I/O. The overlay fetch is lib/flood-map's; the page's legend and
// the report's key read `floodClassFor` for their swatches, so the key is
// always the palette the map was drawn in.

export type Rgba = readonly [number, number, number, number];

export interface FloodClassStyle {
  key: "floodway" | "sfha" | "moderate" | "future" | "levee-reduced" | "levee-risk" | "undetermined";
  /** the tint, RGBA with alpha 0–255 as ArcGIS reads it */
  fill: Rgba;
  outline: Rgba;
  /** the outline's width in points */
  width: number;
  /** a hatch instead of a solid tint */
  hatch: "backward" | "forward" | null;
}

/** FEMA's legend labels to the palette, first match wins: the floodway
 *  before the 1% zone it sits in, a levee's reduced risk before its risk. */
export const FLOOD_CLASSES: ReadonlyArray<{ match: RegExp; style: FloodClassStyle }> = [
  { match: /floodway/i, style: { key: "floodway", fill: [229, 57, 53, 190], outline: [183, 28, 28, 255], width: 2.25, hatch: "backward" } },
  { match: /^1% annual chance/i, style: { key: "sfha", fill: [30, 136, 229, 105], outline: [13, 71, 161, 255], width: 2.25, hatch: null } },
  { match: /^0\.2% annual chance/i, style: { key: "moderate", fill: [255, 179, 0, 85], outline: [230, 126, 0, 255], width: 2, hatch: null } },
  { match: /future conditions/i, style: { key: "future", fill: [142, 36, 170, 70], outline: [106, 27, 154, 255], width: 1.75, hatch: null } },
  { match: /reduced risk due to levee/i, style: { key: "levee-reduced", fill: [0, 137, 123, 60], outline: [0, 105, 92, 255], width: 1.75, hatch: null } },
  { match: /risk due to levee/i, style: { key: "levee-risk", fill: [141, 110, 99, 120], outline: [93, 64, 55, 240], width: 1.75, hatch: "forward" } },
  { match: /undetermined/i, style: { key: "undetermined", fill: [117, 117, 117, 130], outline: [66, 66, 66, 240], width: 1.75, hatch: "forward" } },
];

/** The palette entry for one of FEMA's legend labels; null for a label no
 *  class answers (it is then left undrawn, as FEMA leaves Zone X). */
export function floodClassFor(label: string): FloodClassStyle | null {
  const l = label.trim();
  return FLOOD_CLASSES.find((c) => c.match.test(l))?.style ?? null;
}

export interface FloodLegendEntry {
  label: string;
  /** FEMA's FLD_ZONE,ZONE_SUBTY values for the entry, "<Null>" and all */
  values: readonly string[];
}

/** The white line under every class's outline. */
const CASING: Rgba = [255, 255, 255, 210];
const CASING_EXTRA = 2.25;

const esriStyle = (hatch: FloodClassStyle["hatch"]) =>
  hatch === "backward" ? "esriSFSBackwardDiagonal" : hatch === "forward" ? "esriSFSForwardDiagonal" : "esriSFSSolid";

/**
 * The export's `dynamicLayers`: FEMA's zone layer twice, drawn top first —
 * the tints and outlines, then their casings beneath — each one
 * unique-value renderer over FEMA's own legend values, labels off and the
 * layer's inherited transparency set to zero. Null where no legend entry
 * matches a class (nothing would be drawn; the caller keeps FEMA's own
 * styling rather than an empty overlay).
 */
export function floodDynamicLayers(layerId: number, legend: readonly FloodLegendEntry[]): object[] | null {
  const source = { type: "mapLayer", mapLayerId: layerId };
  const classed = legend
    .map((entry) => ({ entry, style: floodClassFor(entry.label) }))
    .filter((c): c is { entry: FloodLegendEntry; style: FloodClassStyle } => c.style != null && c.entry.values.length > 0);
  if (!classed.length) return null;
  const infos = (casing: boolean) =>
    classed.flatMap(({ entry, style }) => {
      const symbol = casing
        ? { type: "esriSFS", style: "esriSFSNull", outline: { type: "esriSLS", style: "esriSLSSolid", color: CASING, width: style.width + CASING_EXTRA } }
        : { type: "esriSFS", style: esriStyle(style.hatch), color: style.fill, outline: { type: "esriSLS", style: "esriSLSSolid", color: style.outline, width: style.width } };
      return entry.values.map((value) => ({ value, label: entry.label, symbol }));
    });
  const renderer = (casing: boolean) => ({ type: "uniqueValue", field1: "FLD_ZONE", field2: "ZONE_SUBTY", fieldDelimiter: ",", uniqueValueInfos: infos(casing) });
  return [
    { id: 901, source, drawingInfo: { renderer: renderer(false), transparency: 0, showLabels: false } },
    { id: 902, source, drawingInfo: { renderer: renderer(true), transparency: 0, showLabels: false } },
  ];
}

const rgba = ([r, g, b, a]: Rgba) => `rgba(${r},${g},${b},${Math.round((a / 255) * 1000) / 1000})`;

/** A legend swatch's CSS background for a class: its tint, or its hatch
 *  drawn as FEMA's diagonal. The outline is the chip's border. */
export function floodSwatchBackground(style: FloodClassStyle): string {
  if (!style.hatch) return rgba(style.fill);
  const angle = style.hatch === "backward" ? 45 : -45;
  return `repeating-linear-gradient(${angle}deg, ${rgba([style.fill[0], style.fill[1], style.fill[2], 255])} 0 2px, transparent 2px 6px)`;
}

/** The swatch's border colour: the class's outline. */
export const floodSwatchBorder = (style: FloodClassStyle) => rgba(style.outline);

/** The aerial under the zones, calmer than the Aerial view's, so the zones
 *  carry the colour and the photograph the place: the page's CSS filter,
 *  and the same modulation the report's composite applies with sharp. */
export const FLOOD_AERIAL_MUTE = { saturation: 0.55, brightness: 0.96 } as const;
export const FLOOD_AERIAL_FILTER = `saturate(${FLOOD_AERIAL_MUTE.saturation}) brightness(${FLOOD_AERIAL_MUTE.brightness})`;
