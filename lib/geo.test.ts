import { describe, it, expect } from "vitest";
import { haversineKm, kmToMiles, fmtMiles } from "./geo";

// Known city pairs (great-circle, city-center coordinates).
const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };
const DALLAS = { lat: 32.7767, lng: -96.797 };
const FORT_WORTH = { lat: 32.7555, lng: -97.3308 };

describe("haversineKm", () => {
  it("NYC → LA ≈ 3,936 km", () => {
    expect(haversineKm(NYC, LA)).toBeCloseTo(3936, -1); // within ~5km
  });
  it("Dallas → Fort Worth ≈ 50 km", () => {
    const d = haversineKm(DALLAS, FORT_WORTH);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });
  it("zero distance to itself", () => {
    expect(haversineKm(DALLAS, DALLAS)).toBe(0);
  });
  it("is symmetric", () => {
    expect(haversineKm(NYC, LA)).toBeCloseTo(haversineKm(LA, NYC), 9);
  });
});

describe("distance display", () => {
  it("converts to miles", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 3);
  });
  it("one decimal under 10 miles, whole numbers above", () => {
    expect(fmtMiles(1)).toBe("0.6 mi");
    expect(fmtMiles(50)).toBe("31 mi");
  });
});
