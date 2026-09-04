import { describe, it, expect } from "vitest";
import { IMAGE_CREDIT, imagePlan, type ImageSource } from "./imagery-plan";

const ALL: ImageSource[] = ["streetview", "aerial"];

describe("imagePlan", () => {
  it("prefers a street-level photograph when a key and a street address exist", () => {
    expect(
      imagePlan({ hasStreetAddress: true, streetViewConfigured: true }),
    ).toEqual(["streetview", "aerial"]);
  });

  it("falls back to the aerial with no key — every deal still gets a picture", () => {
    expect(
      imagePlan({ hasStreetAddress: true, streetViewConfigured: false }),
    ).toEqual(["aerial"]);
  });

  it("never tries Street View at a neighborhood centroid, key or not", () => {
    // Street View at an area-level placement returns an arbitrary block —
    // a photo of the wrong building is worse than no photo.
    expect(
      imagePlan({ hasStreetAddress: false, streetViewConfigured: true }),
    ).toEqual(["aerial"]);
    expect(
      imagePlan({ hasStreetAddress: false, streetViewConfigured: false }),
    ).toEqual(["aerial"]);
  });

  it("always ends with the aerial, in every configuration", () => {
    for (const hasStreetAddress of [true, false]) {
      for (const streetViewConfigured of [true, false]) {
        const plan = imagePlan({ hasStreetAddress, streetViewConfigured });
        expect(plan.at(-1)).toBe("aerial");
        expect(plan.length).toBeGreaterThan(0);
      }
    }
  });

  it("never repeats a source, and only names known ones", () => {
    for (const hasStreetAddress of [true, false]) {
      for (const streetViewConfigured of [true, false]) {
        const plan = imagePlan({ hasStreetAddress, streetViewConfigured });
        expect(new Set(plan).size).toBe(plan.length);
        for (const s of plan) expect(ALL).toContain(s);
      }
    }
  });

  it("offers no third source — no stock, AI or scraped imagery path exists", () => {
    expect(ALL).toHaveLength(2);
    expect(Object.keys(IMAGE_CREDIT).sort()).toEqual([...ALL].sort());
  });
});

describe("IMAGE_CREDIT", () => {
  it("credits every source it can return", () => {
    for (const s of ALL) {
      expect(IMAGE_CREDIT[s]?.trim().length).toBeGreaterThan(0);
    }
  });

  it("names Google on Street View and USGS on the aerial", () => {
    expect(IMAGE_CREDIT.streetview).toContain("Google");
    expect(IMAGE_CREDIT.aerial).toContain("USGS");
  });
});
