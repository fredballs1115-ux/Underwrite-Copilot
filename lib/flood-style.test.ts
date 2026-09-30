import { describe, expect, it } from "vitest";
import {
  FLOOD_AERIAL_FILTER,
  floodClassFor,
  floodDynamicLayers,
  floodSwatchBackground,
  floodSwatchBorder,
  type FloodLegendEntry,
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

  it("classifies exactly by FEMA's own values — one unique-value renderer, labels off, transparency zeroed, casings beneath", () => {
    const layers = floodDynamicLayers(28, LEGEND) as Array<{ id: number; source: object; drawingInfo: { renderer: { type: string; field1: string; field2: string; fieldDelimiter: string; uniqueValueInfos: Array<{ value: string; symbol: { style: string; color?: number[]; outline: { color: number[]; width: number } } }> }; transparency: number; showLabels: boolean } }>;
    expect(layers.map((l) => l.id)).toEqual([901, 902]);
    for (const l of layers) {
      expect(l.source).toEqual({ type: "mapLayer", mapLayerId: 28 });
      expect(l.drawingInfo).toMatchObject({ transparency: 0, showLabels: false });
      expect(l.drawingInfo.renderer).toMatchObject({ type: "uniqueValue", field1: "FLD_ZONE", field2: "ZONE_SUBTY", fieldDelimiter: "," });
    }
    const [tints, casings] = layers.map((l) => l.drawingInfo.renderer.uniqueValueInfos);
    // Every legend value FEMA lists is a class, "<Null>" and the empty
    // subtype included — the key the first cut missed.
    const values = LEGEND.flatMap((e) => e.values);
    expect(tints.map((i) => i.value)).toEqual(values);
    expect(casings.map((i) => i.value)).toEqual(values);
    const ae = tints.find((i) => i.value === "AE,<Null>")!;
    expect(ae.symbol).toMatchObject({ style: "esriSFSSolid", color: [30, 136, 229, 105] });
    expect(tints.find((i) => i.value === "AE,FLOODWAY")!.symbol.style).toBe("esriSFSBackwardDiagonal");
    const casing = casings.find((i) => i.value === "AE,<Null>")!;
    expect(casing.symbol.style).toBe("esriSFSNull");
    expect(casing.symbol.outline.color).toEqual([255, 255, 255, 210]);
    expect(casing.symbol.outline.width).toBeGreaterThan(ae.symbol.outline.width);
    // No class at all is no restyle: the caller keeps FEMA's own drawing.
    expect(floodDynamicLayers(28, [{ label: "Something new", values: ["Q,<Null>"] }])).toBeNull();
    expect(floodDynamicLayers(28, [])).toBeNull();
  });

  it("keys each swatch in the palette the map was drawn in", () => {
    const sfha = floodClassFor("1% Annual Chance Flood Hazard")!;
    expect(floodSwatchBackground(sfha)).toBe("rgba(30,136,229,0.412)");
    expect(floodSwatchBorder(sfha)).toBe("rgba(13,71,161,1)");
    expect(floodSwatchBackground(floodClassFor("Regulatory Floodway")!)).toMatch(/^repeating-linear-gradient\(45deg, rgba\(229,57,53,1\) 0 2px, transparent 2px 6px\)$/);
    expect(FLOOD_AERIAL_FILTER).toBe("saturate(0.55) brightness(0.96)");
  });

  it("is the drawing the runner's flood sheet renders (scripts/probe-flood.mjs restates it for plain Node)", async () => {
    const probe = (await import("../scripts/probe-flood.mjs")) as { restyledLayers: (id: number, legend: FloodLegendEntry[]) => object[] };
    expect(probe.restyledLayers(28, LEGEND)).toEqual(floodDynamicLayers(28, LEGEND));
  });
});
