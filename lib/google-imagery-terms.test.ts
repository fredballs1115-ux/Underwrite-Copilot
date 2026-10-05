import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TermsPage from "@/app/terms/page";
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

// Google Maps Platform's terms, as the runner printed them (zori probe run
// 37262665824): the site's terms must "notify users that the Customer
// Application includes Google Maps features and content" and "state that use
// of Google Maps features and content is subject to the then-current versions
// of the: (1) Google Maps End User Additional Terms of Service at
// https://maps.google.com/help/terms_maps/ ; and (2) Google Privacy Policy at
// https://policies.google.com/privacy".
describe("the terms page names Google's terms only where the site uses Google", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("says nothing of Google without the key, since the site then shows no Google content", () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    expect(renderToStaticMarkup(TermsPage())).not.toContain("Google Maps");
  });

  it("states the two documents, linked, the day the key is set", () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toContain("This service includes Google Maps features and content.");
    expect(html).toContain('href="https://maps.google.com/help/terms_maps/"');
    expect(html).toContain('href="https://policies.google.com/privacy"');
  });
});
