import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withoutGoogleContent, type DealVisualCache } from "./deal-location";
import { GOOGLE_NO_STORE, isGoogleImage } from "./imagery";

// Google's Street View policies, as the runner printed them (zori probe run
// 37258453291): "Content pre-fetching, indexing, storing, or caching is
// generally prohibited, except for place IDs and panorama IDs." The routes
// had told browsers to keep Google's image a day, and the deal's cache kept
// the metadata's verdict and the panorama's coordinates for thirty days.

const root = join(__dirname, "..");
const IMAGE_FETCHERS = /\b(fetchStreetViewImage|fetchBestBuildingImage|fetchBestAerialImage|fetchOneImage|fetchGoogleSatelliteImage)\b/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

describe("Google's imagery is never kept", () => {
  it("drops the Street View answer an earlier cut stored, and keeps the rest of the cache", () => {
    const cache: DealVisualCache = {
      status: "ok",
      checkedAt: "2026-09-01T00:00:00Z",
      checkedFor: "39.0,-77.0",
      panoLat: 39.00011,
      panoLng: -77.00012,
      lat: 39,
      lng: -77,
      geoAt: "2026-09-01T00:00:00Z",
      geoPrecision: "street",
    };
    expect(withoutGoogleContent(cache)).toEqual({ lat: 39, lng: -77, geoAt: "2026-09-01T00:00:00Z", geoPrecision: "street" });
    // The caller's object is left as it was.
    expect(cache.panoLat).toBe(39.00011);
  });

  it("calls Street View's photograph and the satellite frame Google's, and nothing else", () => {
    expect(isGoogleImage("streetview")).toBe(true);
    expect(isGoogleImage("satellite")).toBe(true);
    expect(isGoogleImage("aerial")).toBe(false);
    expect(isGoogleImage("photo")).toBe(false);
    expect(GOOGLE_NO_STORE).toMatch(/no-store/);
  });

  it("sends no-store from every route that can answer with a Google image", () => {
    const routes = routeFiles(join(root, "app", "api")).filter((p) => {
      const src = readFileSync(p, "utf8");
      return /from "@\/lib\/imagery"/.test(src) && IMAGE_FETCHERS.test(src);
    });
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const p of routes) {
      const src = readFileSync(p, "utf8");
      // A route that can only ever ask for USGS's frame sends none of Google's.
      if (/fetchOneImage\(\s*"aerial"/.test(src) && !/fetch(StreetView|BestBuilding|BestAerial|GoogleSatellite)/.test(src)) continue;
      expect(src, p).toContain("GOOGLE_NO_STORE");
    }
  });

  it("fetches Street View without writing Google's answer to the deal", () => {
    const src = readFileSync(join(root, "lib", "imagery.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function fetchStreetViewImage"), src.indexOf("export async function fetchGoogleSatelliteImage"));
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toMatch(/writeCache|\.update\(|panoLat|checkedAt/);
  });
});
