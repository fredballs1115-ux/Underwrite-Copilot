import { describe, expect, it } from "vitest";
import sharp from "sharp";
import vendored from "../data/nfhl-legend.json";
import {
  FEMA_LAYER_OPACITY,
  FLOOD_CLASS_ORDER,
  centredRegion,
  classesIn,
  floodClassFor,
  floodClassOfZone,
  floodDynamicLayers,
  floodStyleOf,
  floodSwatchBackground,
  floodSwatchBorder,
  floodSwatchSvg,
  overlayAlphaScale,
  unscaleAlpha,
  type FloodLegendEntry,
  type Rgba,
} from "./flood-style";

// FEMA's legend as the runner printed it (flood-sheet run 36744340226),
// cut to a few values an entry.
const LEGEND: FloodLegendEntry[] = [
  { label: "1% Annual Chance Flood Hazard", values: ["AE,<Null>", "AE,", "VE,COASTAL FLOODPLAIN", "A,<Null>"] },
  { label: "Regulatory Floodway ", values: ["AE,FLOODWAY", "AE,FLOODWAY CONTAINED IN CHANNEL"] },
  { label: "Special Floodway", values: ["AE,AREA OF SPECIAL CONSIDERATION"] },
  { label: "Area of Undetermined Flood Hazard", values: ["D,<Null>"] },
  { label: "0.2% Annual Chance Flood Hazard", values: ["X,0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "X,1 PCT DEPTH LESS THAN 1 FOOT"] },
  { label: "Future Conditions 1% Annual Chance Flood Hazard", values: ["X,1 PCT FUTURE CONDITIONS, FLOODWAY"] },
  { label: "Area with Reduced Risk Due to Levee", values: ["X,AREA WITH REDUCED FLOOD RISK DUE TO LEVEE"] },
  { label: "Area with Risk Due to Levee", values: ["D,AREA WITH FLOOD RISK DUE TO LEVEE"] },
];

type Layer = {
  id: number;
  source: object;
  drawingInfo: {
    renderer: {
      type: string;
      field1: string;
      field2: string;
      fieldDelimiter: string;
      uniqueValueInfos: Array<{ value: string; symbol: { style: string; color?: number[]; outline: { color: number[]; width: number } | null } }>;
    };
    transparency: number;
    showLabels: boolean;
  };
};

/** A frame painted with `paint(x, y)` → a pixel or null for clear. */
function frame(width: number, height: number, paint: (x: number, y: number) => Rgba | null): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint(x, y);
      if (c) px.set(c, (y * width + x) * 4);
    }
  }
  return px;
}

describe("FEMA's flood zones in the site's palette (#472)", () => {
  it("names a class for every legend entry FEMA draws, the floodway before the 1% zone it sits in", () => {
    expect(floodClassFor("1% Annual Chance Flood Hazard")?.key).toBe("sfha");
    expect(floodClassFor("Regulatory Floodway ")?.key).toBe("floodway");
    expect(floodClassFor("Special Floodway")?.key).toBe("floodway");
    expect(floodClassFor("0.2% Annual Chance Flood Hazard")?.key).toBe("moderate");
    expect(floodClassFor("Future Conditions 1% Annual Chance Flood Hazard")?.key).toBe("future");
    expect(floodClassFor("Area with Reduced Risk Due to Levee")?.key).toBe("levee-reduced");
    expect(floodClassFor("Area with Risk Due to Levee")?.key).toBe("levee-risk");
    expect(floodClassFor("Area of Undetermined Flood Hazard")?.key).toBe("undetermined");
    expect(floodClassFor("Area of Minimal Flood Hazard")).toBeNull();
  });

  it("classes every entry of FEMA's vendored legend, and every value only once", () => {
    const legend = vendored.legend as FloodLegendEntry[];
    expect(legend.length).toBeGreaterThanOrEqual(8);
    for (const e of legend) expect(floodClassFor(e.label), e.label).not.toBeNull();
    const values = legend.flatMap((e) => e.values);
    expect(new Set(values).size).toBe(values.length);
    expect(vendored.layerId).toBe(28);
  });

  it("finds the class a zone at the building is drawn in, by FEMA's own values", () => {
    const legend = vendored.legend as FloodLegendEntry[];
    expect(floodClassOfZone(legend, "AE", null)).toBe("sfha");
    expect(floodClassOfZone(legend, "ae", "")).toBe("sfha");
    expect(floodClassOfZone(legend, "VE", null)).toBe("sfha");
    expect(floodClassOfZone(legend, "AE", "FLOODWAY")).toBe("floodway");
    expect(floodClassOfZone(legend, "X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD")).toBe("moderate");
    expect(floodClassOfZone(legend, "X", "AREA WITH REDUCED FLOOD RISK DUE TO LEVEE")).toBe("levee-reduced");
    expect(floodClassOfZone(legend, "D", null)).toBe("undetermined");
    // FEMA draws none of these, so no class answers them.
    expect(floodClassOfZone(legend, "X", "AREA OF MINIMAL FLOOD HAZARD")).toBeNull();
    expect(floodClassOfZone(legend, "OPEN WATER", null)).toBeNull();
  });

  it("draws three layers top first — hatches, tints, casings — over FEMA's own values, labels off, transparency zeroed", () => {
    const layers = floodDynamicLayers(28, LEGEND) as Layer[];
    expect(layers.map((l) => l.id)).toEqual([901, 902, 903]);
    for (const l of layers) {
      expect(l.source).toEqual({ type: "mapLayer", mapLayerId: 28 });
      expect(l.drawingInfo).toMatchObject({ transparency: 0, showLabels: false });
      expect(l.drawingInfo.renderer).toMatchObject({ type: "uniqueValue", field1: "FLD_ZONE", field2: "ZONE_SUBTY", fieldDelimiter: "," });
    }
    const [hatches, tints, casings] = layers.map((l) => l.drawingInfo.renderer.uniqueValueInfos);
    // Every legend value FEMA lists is a class, "<Null>" and the empty
    // subtype included — the key the first cut missed.
    const values = LEGEND.flatMap((e) => e.values);
    expect(tints.map((i) => i.value)).toEqual(values);
    expect(casings.map((i) => i.value)).toEqual(values);
    // Only the hatched classes: the floodways, the levee risk and the
    // undetermined area.
    expect(hatches.map((i) => i.value).sort()).toEqual(
      ["AE,FLOODWAY", "AE,FLOODWAY CONTAINED IN CHANNEL", "AE,AREA OF SPECIAL CONSIDERATION", "D,<Null>", "D,AREA WITH FLOOD RISK DUE TO LEVEE"].sort(),
    );
    const ae = tints.find((i) => i.value === "AE,<Null>")!;
    expect(ae.symbol).toMatchObject({ style: "esriSFSSolid", color: [30, 136, 229, 105] });
    // The floodway is part of the 1% zone: the 1% tint under its red hatch,
    // and its red outline drawn with the hatch.
    const fwTint = tints.find((i) => i.value === "AE,FLOODWAY")!;
    expect(fwTint.symbol).toMatchObject({ style: "esriSFSSolid", color: [30, 136, 229, 105], outline: null });
    const fwHatch = hatches.find((i) => i.value === "AE,FLOODWAY")!;
    expect(fwHatch.symbol.style).toBe("esriSFSBackwardDiagonal");
    expect(fwHatch.symbol.outline!.color).toEqual([183, 28, 28, 255]);
    const casing = casings.find((i) => i.value === "AE,<Null>")!;
    expect(casing.symbol.style).toBe("esriSFSNull");
    expect(casing.symbol.outline!.color).toEqual([255, 255, 255, 210]);
    expect(casing.symbol.outline!.width).toBeGreaterThan(ae.symbol.outline!.width);
    // No class at all is no restyle.
    expect(floodDynamicLayers(28, [{ label: "Something new", values: ["Q,<Null>"] }])).toBeNull();
    expect(floodDynamicLayers(28, [])).toBeNull();
  });

  it("is the drawing the runner's flood sheet renders (scripts/probe-flood.mjs restates it for plain Node)", async () => {
    const probe = (await import("../scripts/probe-flood.mjs")) as {
      restyledLayers: (id: number, legend: FloodLegendEntry[]) => object[] | null;
    };
    expect(probe.restyledLayers(28, LEGEND)).toEqual(floodDynamicLayers(28, LEGEND));
    expect(probe.restyledLayers(28, vendored.legend as FloodLegendEntry[])).toEqual(
      floodDynamicLayers(28, vendored.legend as FloodLegendEntry[]),
    );
  });
});

describe("the overlay as FEMA sends it back", () => {
  const W = 200;
  const H = 100;
  const sfha = floodStyleOf("sfha").fill;
  const scaled = (c: Rgba): Rgba => [c[0], c[1], c[2], Math.round(c[3] * FEMA_LAYER_OPACITY)];

  it("reads a restyle drawn as asked as unscaled, and one FEMA's 70% transparency reached as scaled", () => {
    const asAsked = frame(W, H, (x) => (x < 120 ? sfha : null));
    expect(overlayAlphaScale(asAsked, W, H)).toBe(1);
    const faint = frame(W, H, (x) => (x < 120 ? scaled(sfha) : null));
    expect(overlayAlphaScale(faint, W, H)).toBeCloseTo(1 / FEMA_LAYER_OPACITY);
    // Undone, the tint is the one asked for, within a step of rounding.
    unscaleAlpha(faint, 1 / FEMA_LAYER_OPACITY);
    expect(Math.abs(faint[3] - sfha[3])).toBeLessThanOrEqual(2);
    // Nothing drawn: nothing to correct.
    expect(overlayAlphaScale(frame(W, H, () => null), W, H)).toBe(1);
    // A tint at an alpha neither behaviour draws is not a frame to keep.
    expect(overlayAlphaScale(frame(W, H, () => [sfha[0], sfha[1], sfha[2], 60]), W, H)).toBeNull();
    // A different class judged when the 1% zone is absent.
    const moderate = floodStyleOf("moderate").fill;
    expect(overlayAlphaScale(frame(W, H, () => scaled(moderate)), W, H)).toBeCloseTo(1 / FEMA_LAYER_OPACITY);
  });

  it("lists only the classes the frame shows, inside the crop the key sits under", () => {
    const hatch = floodStyleOf("floodway").hatch!.color;
    const px = frame(W, H, (x, y) => {
      if (x < 60) return sfha; // the 1% zone down the left
      if (x < 70 && y % 4 === 0) return hatch; // a floodway's hatch
      if (x > 185) return floodStyleOf("moderate").fill; // the 0.2% zone at the right edge
      return null;
    });
    expect(classesIn(px, W, H, { w: 1, h: 1 }, 20)).toEqual(["floodway", "sfha", "moderate"]);
    // A 16:9 page crop of a 2:1 frame keeps the full height and cuts the
    // sides, taking the right-edge sliver out of the key.
    const region = centredRegion(W / H, 1.5);
    expect(region.h).toBe(1);
    expect(region.w).toBeCloseTo(0.75);
    expect(classesIn(px, W, H, region, 20)).toEqual(["floodway", "sfha"]);
    // A few antialiased pixels are not a class.
    const speck = frame(W, H, (x, y) => (x === 100 && y === 50 ? sfha : null));
    expect(classesIn(speck, W, H)).toEqual([]);
    expect(FLOOD_CLASS_ORDER[0]).toBe("floodway");
  });
});

describe("the key's swatches", () => {
  it("keys each swatch in the palette the map was drawn in", () => {
    const sfha = floodClassFor("1% Annual Chance Flood Hazard")!;
    expect(floodSwatchBackground(sfha)).toBe("rgba(30,136,229,0.412)");
    expect(floodSwatchBorder(sfha)).toBe("rgba(13,71,161,1)");
    expect(floodSwatchBackground(floodClassFor("Regulatory Floodway")!)).toBe(
      "repeating-linear-gradient(45deg, rgba(229,57,53,1) 0 2px, transparent 2px 6px), rgba(30,136,229,0.412)",
    );
  });

  it("draws the report's swatch as a plain SVG librsvg reads", async () => {
    for (const key of FLOOD_CLASS_ORDER) {
      const svg = floodSwatchSvg(floodStyleOf(key));
      expect(svg).not.toMatch(/<(script|style|text|image|foreignObject)\b/i);
      expect(svg).not.toMatch(/href=/i);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(40);
      expect(meta.height).toBe(40);
    }
  });
});
