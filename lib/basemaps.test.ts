import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  BASEMAPS,
  BASEMAP_IMG_HOSTS,
  BASEMAP_ORDER,
  DEFAULT_BASEMAP,
  MAX_MERCATOR_LAT,
  basemapById,
  groundResolution,
  mercatorBbox,
  resolution,
  toMercator,
  usgsAerialUrl,
} from "./basemaps";

// Reference values from the standard spherical-Mercator definition every
// slippy map shares (256px tiles, EPSG:3857).
const WHITE_HOUSE = { lat: 38.8977, lng: -77.0365 };
const NULL_ISLAND = { lat: 0, lng: 0 };

describe("web mercator", () => {
  it("projects the origin to the origin", () => {
    const o = toMercator(NULL_ISLAND);
    expect(o.x).toBe(0);
    // log(tan(pi/4)) is 0 only up to floating point — sub-nanometre is zero.
    expect(o.y).toBeCloseTo(0, 6);
  });

  it("puts the antimeridian at ±20,037,508 m", () => {
    expect(toMercator({ lat: 0, lng: 180 }).x).toBeCloseTo(20_037_508.34, 1);
    expect(toMercator({ lat: 0, lng: -180 }).x).toBeCloseTo(-20_037_508.34, 1);
  });

  it("is square: the clamp latitude projects to the same extent as ±180°", () => {
    expect(toMercator({ lat: MAX_MERCATOR_LAT, lng: 0 }).y).toBeCloseTo(20_037_508.34, 0);
  });

  it("clamps beyond the Mercator limit instead of returning Infinity", () => {
    const pole = toMercator({ lat: 90, lng: 0 });
    expect(Number.isFinite(pole.y)).toBe(true);
    expect(pole.y).toBeCloseTo(toMercator({ lat: MAX_MERCATOR_LAT, lng: 0 }).y, 6);
  });

  it("is sign-symmetric about the equator", () => {
    expect(toMercator({ lat: -38.8977, lng: -77.0365 }).y).toBeCloseTo(
      -toMercator(WHITE_HOUSE).y,
      6,
    );
  });
});

describe("resolution", () => {
  it("z0 is ~156,543 m/px", () => {
    expect(resolution(0)).toBeCloseTo(156_543.03, 1);
  });

  it("halves with every zoom level", () => {
    for (const z of [1, 5, 12, 18]) {
      expect(resolution(z)).toBeCloseTo(resolution(z - 1) / 2, 9);
    }
  });

  it("ground resolution at z18 near DC frames a building (<0.5 m/px)", () => {
    const m = groundResolution(WHITE_HOUSE.lat, 18);
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThan(0.5);
  });

  it("ground resolution equals projected resolution at the equator", () => {
    expect(groundResolution(0, 15)).toBeCloseTo(resolution(15), 9);
  });
});

describe("mercatorBbox", () => {
  it("centres the box on the point", () => {
    const b = mercatorBbox(WHITE_HOUSE, 18, 640, 360);
    const { x, y } = toMercator(WHITE_HOUSE);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(x, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(y, 6);
  });

  it("sizes the box as pixels × resolution — so the image is to scale", () => {
    const b = mercatorBbox(WHITE_HOUSE, 17, 800, 450);
    expect(b.maxX - b.minX).toBeCloseTo(800 * resolution(17), 6);
    expect(b.maxY - b.minY).toBeCloseTo(450 * resolution(17), 6);
  });

  it("keeps the aspect ratio of the requested image (no stretched aerials)", () => {
    const b = mercatorBbox(WHITE_HOUSE, 16, 1200, 400);
    expect((b.maxX - b.minX) / (b.maxY - b.minY)).toBeCloseTo(3, 9);
  });
});

describe("usgsAerialUrl", () => {
  const url = usgsAerialUrl({ center: WHITE_HOUSE, zoom: 18, width: 800, height: 450 });
  const parsed = new URL(url);

  it("targets the public-domain USGS imagery export endpoint", () => {
    expect(parsed.origin).toBe("https://basemap.nationalmap.gov");
    expect(parsed.pathname).toContain("USGSImageryOnly");
    expect(parsed.pathname.endsWith("/export")).toBe(true);
  });

  it("carries no API key or credential", () => {
    expect(url).not.toMatch(/key|token|apikey|secret/i);
  });

  it("declares the projection on both sides of the request", () => {
    expect(parsed.searchParams.get("bboxSR")).toBe("3857");
    expect(parsed.searchParams.get("imageSR")).toBe("3857");
    expect(parsed.searchParams.get("f")).toBe("image");
  });

  it("asks for exactly the pixels requested", () => {
    expect(parsed.searchParams.get("size")).toBe("800,450");
  });

  it("sends a four-number bbox in min,min,max,max order", () => {
    const nums = parsed.searchParams.get("bbox")!.split(",").map(Number);
    expect(nums).toHaveLength(4);
    expect(nums.every(Number.isFinite)).toBe(true);
    expect(nums[2]).toBeGreaterThan(nums[0]);
    expect(nums[3]).toBeGreaterThan(nums[1]);
  });

  it("moves the frame when the point moves", () => {
    const other = usgsAerialUrl({
      center: { lat: 39.9526, lng: -75.1652 },
      zoom: 18,
      width: 800,
      height: 450,
    });
    expect(other).not.toBe(url);
  });
});

describe("basemap registry", () => {
  it("defaults to photography — the point is to show the real place", () => {
    expect(BASEMAPS[DEFAULT_BASEMAP].photographic).toBe(true);
  });

  it("orders every registered basemap exactly once", () => {
    expect([...BASEMAP_ORDER].sort()).toEqual(Object.keys(BASEMAPS).sort());
  });

  it("every basemap carries attribution and https tiles", () => {
    for (const b of Object.values(BASEMAPS)) {
      expect(b.attribution.trim().length).toBeGreaterThan(0);
      expect(b.url.startsWith("https://")).toBe(true);
      expect(b.url).toContain("{z}");
      expect(b.url).toContain("{x}");
      expect(b.url).toContain("{y}");
    }
  });

  it("never over-zooms past what the source serves by more than a level", () => {
    for (const b of Object.values(BASEMAPS)) {
      expect(b.maxZoom).toBeGreaterThanOrEqual(b.maxNativeZoom);
      expect(b.maxZoom - b.maxNativeZoom).toBeLessThanOrEqual(1);
    }
  });

  it("falls back to the default for an unknown or absent id", () => {
    expect(basemapById("nope").id).toBe(DEFAULT_BASEMAP);
    expect(basemapById(null).id).toBe(DEFAULT_BASEMAP);
    expect(basemapById("streets").id).toBe("streets");
  });
});

// The CSP and the basemap registry have to agree or the maps render as blank
// gray canvas in production while passing every other test — a failure mode
// that only shows up on the deployed site. Bind them here.
describe("CSP img-src", () => {
  const csp = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

  it("allows every basemap host the app loads tiles from", () => {
    // The directive line itself, not the comment above it that names it.
    const imgSrc = csp
      .split("\n")
      .find((l) => l.trim().startsWith('"img-src'));
    expect(imgSrc).toBeDefined();
    for (const host of BASEMAP_IMG_HOSTS) {
      expect(imgSrc).toContain(host);
    }
  });

  it("covers the host every basemap URL actually points at", () => {
    for (const b of Object.values(BASEMAPS)) {
      const origin = new URL(b.url.replace(/\{[a-z]\}/g, "0")).origin;
      const allowed = BASEMAP_IMG_HOSTS.some(
        (h) => h === origin || origin.endsWith(h.replace("https://*.", ".")),
      );
      expect(allowed, `${b.id} → ${origin} is not in BASEMAP_IMG_HOSTS`).toBe(true);
    }
  });
});
