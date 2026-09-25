import { describe, it, expect } from "vitest";
import {
  IMAGE_CREDIT,
  FRAME_METRES,
  MAX_SOURCE_ZOOM,
  aerialPlan,
  bearingDeg,
  frameZoom,
  imagePlan,
  type ImageSource,
} from "./imagery-plan";

const ALL: ImageSource[] = ["photo", "streetview", "satellite", "aerial"];
const CONFIGS = [true, false];

describe("imagePlan", () => {
  it("leads with the building's own photograph wherever the deal has one", () => {
    // The cover of its memorandum, or the reader's own upload: ahead of
    // every fetched source, whatever keys exist.
    expect(imagePlan({ hasStreetAddress: true, googleConfigured: true, hasPicture: true })).toEqual([
      "photo",
      "streetview",
      "satellite",
      "aerial",
    ]);
    expect(imagePlan({ hasStreetAddress: false, googleConfigured: false, hasPicture: true })).toEqual([
      "photo",
      "aerial",
    ]);
  });

  it("prefers the Street View photograph when a key and street address exist and no picture is stored", () => {
    expect(imagePlan({ hasStreetAddress: true, googleConfigured: true })).toEqual([
      "streetview",
      "satellite",
      "aerial",
    ]);
  });

  it("with a key but no street address, skips Street View and takes the sharp overhead", () => {
    // Street View at a neighborhood centroid returns an arbitrary block — a
    // photo of the wrong building is worse than no photo.
    expect(imagePlan({ hasStreetAddress: false, googleConfigured: true })).toEqual([
      "satellite",
      "aerial",
    ]);
  });

  it("with no key, every deal still gets the keyless USGS aerial", () => {
    for (const hasStreetAddress of CONFIGS) {
      expect(imagePlan({ hasStreetAddress, googleConfigured: false })).toEqual([
        "aerial",
      ]);
    }
  });

  it("always ends with the keyless aerial, in every configuration", () => {
    for (const hasStreetAddress of CONFIGS) {
      for (const googleConfigured of CONFIGS) {
        const plan = imagePlan({ hasStreetAddress, googleConfigured });
        expect(plan.at(-1)).toBe("aerial");
        expect(plan.length).toBeGreaterThan(0);
      }
    }
  });

  it("never repeats a source, and only names known ones", () => {
    for (const hasStreetAddress of CONFIGS) {
      for (const googleConfigured of CONFIGS) {
        const plan = imagePlan({ hasStreetAddress, googleConfigured });
        expect(new Set(plan).size).toBe(plan.length);
        for (const s of plan) expect(ALL).toContain(s);
      }
    }
  });

  it("offers nothing beyond the deal's own file and the three map sources — no stock, AI or scraped imagery path exists", () => {
    expect(ALL).toHaveLength(4);
    expect(Object.keys(IMAGE_CREDIT).sort()).toEqual([...ALL].sort());
  });
});

describe("aerialPlan", () => {
  it("never returns Street View — the Aerial tab means the view from above", () => {
    for (const googleConfigured of CONFIGS) {
      expect(aerialPlan({ googleConfigured })).not.toContain("streetview");
    }
  });

  it("takes the sharp overhead first when there is a key", () => {
    expect(aerialPlan({ googleConfigured: true })).toEqual(["satellite", "aerial"]);
  });

  it("falls back to USGS alone with no key", () => {
    expect(aerialPlan({ googleConfigured: false })).toEqual(["aerial"]);
  });
});

describe("frameZoom", () => {
  const DC = 38.9;
  // Ground metres one image actually covers at a given zoom and pixel width.
  const covers = (widthPx: number, z: number, lat: number) =>
    widthPx * ((2 * Math.PI * 6378137) / 256 / 2 ** z) * Math.cos((lat * Math.PI) / 180);

  it("holds ground coverage roughly constant as the image size changes", () => {
    // The bug this replaces: a fixed zoom made a 96px thumbnail cover ~7m of
    // roof while a 1280px hero covered 150m.
    for (const widthPx of [96, 320, 640, 1280]) {
      const z = frameZoom({ widthPx, lat: DC, precision: "street", source: "satellite" });
      const m = covers(widthPx, z, DC);
      expect(m).toBeGreaterThan(FRAME_METRES.street / 2);
      expect(m).toBeLessThan(FRAME_METRES.street * 2);
    }
  });

  it("frames a building, not a rooftop, at thumbnail size", () => {
    const z = frameZoom({ widthPx: 96, lat: DC, precision: "street", source: "satellite" });
    expect(covers(96, z, DC)).toBeGreaterThan(50);
  });

  it("never asks a source for more detail than it has", () => {
    for (const source of ALL) {
      for (const widthPx of [96, 640, 1280, 4000]) {
        const z = frameZoom({ widthPx, lat: DC, precision: "street", source });
        expect(z).toBeLessThanOrEqual(MAX_SOURCE_ZOOM[source]);
      }
    }
  });

  it("caps USGS below Google, because NAIP genuinely has less to give", () => {
    expect(MAX_SOURCE_ZOOM.aerial).toBeLessThan(MAX_SOURCE_ZOOM.satellite);
    const wide = { widthPx: 1280, lat: DC, precision: "street" as const };
    expect(frameZoom({ ...wide, source: "aerial" })).toBeLessThanOrEqual(
      frameZoom({ ...wide, source: "satellite" }),
    );
  });

  it("pulls back for an area-level placement", () => {
    const base = { widthPx: 1280, lat: DC, source: "satellite" as const };
    expect(frameZoom({ ...base, precision: "area" })).toBeLessThan(
      frameZoom({ ...base, precision: "street" }),
    );
  });

  it("frames a block-level placement between the building and the district", () => {
    // The right road, house number unknown: a few parcels either way, never
    // a single-building frame that would claim more than the geocode knows.
    expect(FRAME_METRES.block).toBeGreaterThan(FRAME_METRES.street);
    expect(FRAME_METRES.block).toBeLessThan(FRAME_METRES.area);
    const base = { widthPx: 1280, lat: DC, source: "satellite" as const };
    const z = (p: "street" | "block" | "area") => frameZoom({ ...base, precision: p });
    expect(z("block")).toBeLessThan(z("street"));
    expect(z("block")).toBeGreaterThan(z("area"));
  });

  it("holds USGS to the photograph's own grain — z17, about 0.9 m a pixel — because finer is the export stretching it", () => {
    // The aerial sheet (#429) drew eight places at z19, z18 and z17: z19 was
    // mush everywhere, downtowns included, z17 crisp. A cap finer than the
    // imagery is what put a blurry picture beside every property.
    expect(MAX_SOURCE_ZOOM.aerial).toBe(17);
    expect(covers(1, 17, DC)).toBeGreaterThan(0.8);
    expect(covers(1, 17, DC)).toBeLessThan(1.0);
    // A card or a hero asks for more pixels, never for finer ground.
    for (const widthPx of [96, 168, 720, 1280]) {
      expect(frameZoom({ widthPx, lat: DC, precision: "street", source: "aerial" })).toBeLessThanOrEqual(17);
    }
  });

  it("compensates for Mercator stretch with latitude", () => {
    // A tile covers LESS ground the further from the equator you go, so
    // holding the frame at a fixed number of metres means zooming OUT.
    const at = (lat: number) =>
      frameZoom({ widthPx: 1280, lat, precision: "area", source: "satellite" });
    expect(at(61)).toBeLessThan(at(0));
    // And the frame it actually produces still lands near the target.
    const z = at(61);
    expect(covers(1280, z, 61)).toBeGreaterThan(FRAME_METRES.area / 2);
    expect(covers(1280, z, 61)).toBeLessThan(FRAME_METRES.area * 2);
  });

  it("stays inside the zoom range the routes accept (12-20)", () => {
    for (const source of ALL) {
      for (const precision of ["street", "block", "area"] as const) {
        for (const widthPx of [1, 96, 1280, 100000]) {
          const z = frameZoom({ widthPx, lat: DC, precision, source });
          expect(z).toBeGreaterThanOrEqual(12);
          expect(z).toBeLessThanOrEqual(20);
        }
      }
    }
  });
});

describe("bearingDeg", () => {
  const origin = { lat: 38.9, lng: -77.0 };
  it("points north, east, south and west", () => {
    expect(bearingDeg(origin, { lat: 38.91, lng: -77.0 })).toBeCloseTo(0, 0);
    expect(bearingDeg(origin, { lat: 38.9, lng: -76.99 })).toBeCloseTo(90, 0);
    expect(bearingDeg(origin, { lat: 38.89, lng: -77.0 })).toBeCloseTo(180, 0);
    expect(bearingDeg(origin, { lat: 38.9, lng: -77.01 })).toBeCloseTo(270, 0);
  });

  it("always lands in [0, 360)", () => {
    for (const to of [
      { lat: 38.95, lng: -77.05 },
      { lat: 38.85, lng: -76.95 },
      { lat: 38.85, lng: -77.05 },
    ]) {
      const b = bearingDeg(origin, to);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it("is the reverse bearing going back, give or take the antimeridian", () => {
    const pano = { lat: 38.9012, lng: -77.0341 };
    const bldg = { lat: 38.9019, lng: -77.0329 };
    const there = bearingDeg(pano, bldg);
    const back = bearingDeg(bldg, pano);
    // |back − there| should be 180°, modulo the wrap.
    const diff = (((back - there) % 360) + 360) % 360;
    expect(Math.abs(diff - 180)).toBeLessThan(0.05);
  });
});

describe("IMAGE_CREDIT", () => {
  it("credits every source it can return", () => {
    for (const s of ALL) expect(IMAGE_CREDIT[s]?.trim().length).toBeGreaterThan(0);
  });

  it("names Google on both Google sources and USGS on the aerial, and the memorandum on its own picture", () => {
    expect(IMAGE_CREDIT.streetview).toContain("Google");
    expect(IMAGE_CREDIT.satellite).toContain("Google");
    expect(IMAGE_CREDIT.aerial).toContain("USGS");
    expect(IMAGE_CREDIT.photo).toContain("memorandum");
  });
});
