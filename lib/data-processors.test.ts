import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_DIRECT_NOTE, DATA_PROCESSORS } from "./data-processors";
import { censusUrl, photonUrl } from "./geocode";
import { BASEMAP_IMG_HOSTS, BASEMAPS, NFHL_ROOT, usgsAerialUrl } from "./basemaps";
import { COVERAGE_LIVE } from "./public-comps/core";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import SecurityPage from "@/app/security/page";
import PrivacyPage from "@/app/privacy/page";

// The security page and the privacy policy list every outside service that
// receives something of a user's. They listed five, and said Photon received
// "only the address text you type" — while the code sent deal addresses to
// the Census geocoder and Photon, map points to FEMA, USGS and Google, the
// OM's comp addresses to Photon from the browser, and emails through Resend.
// This holds the one list to the hosts the code actually reaches.

const root = join(__dirname, "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");
const hostOf = (url: string) => new URL(url.replace("{z}", "1").replace("{x}", "1").replace("{y}", "1")).hostname;

/** Whether a processor's listed hosts cover a host (a listed "a.b" covers "x.a.b"). */
const covered = (host: string) =>
  DATA_PROCESSORS.some((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));

describe("the outside services a user's data reaches, one list held to the code", () => {
  it("covers every host the server sends a deal's address, point or a user's email to", () => {
    const hosts = [
      hostOf(photonUrl("1 Main St")), // lib/geocode's fallback
      hostOf(censusUrl("1 Main St")), // lib/geocode's first choice
      hostOf(NFHL_ROOT), // FEMA: the flood zone and the flood map
      hostOf(usgsAerialUrl({ center: { lat: 39.95, lng: -75.16 }, zoom: 17, width: 640, height: 400 })),
    ];
    // Hosts written inline where the request is made.
    for (const [file, re] of [
      ["lib/public-comps/run.ts", /https:\/\/(photon\.komoot\.io)/],
      ["lib/site-flags/run.ts", /https:\/\/(geocoding\.geo\.census\.gov)/],
      ["lib/imagery.ts", /https:\/\/(maps\.googleapis\.com)/],
      ["lib/email-send.ts", /https:\/\/(api\.resend\.com)/],
      ["app/(app)/address-autocomplete.tsx", /https:\/\/(photon\.komoot\.io)/],
      ["app/(app)/deals/[id]/comps-map.tsx", /https:\/\/(photon\.komoot\.io)/],
    ] as const) {
      const m = src(file).match(re);
      expect(m, file).not.toBeNull();
      hosts.push(m![1]);
    }
    for (const h of hosts) expect(covered(h), h).toBe(true);
  });

  it("covers every host the browser is allowed to fetch from or load map tiles from", () => {
    const csp = src("next.config.ts");
    const connect = csp.match(/"connect-src ([^"]+)"/)![1].split(/\s+/).filter((t) => t.startsWith("https://"));
    expect(connect.length).toBeGreaterThan(0);
    for (const t of connect) expect(covered(t.replace("https://", "").replace(/^\*\./, "")), t).toBe(true);
    for (const t of BASEMAP_IMG_HOSTS) expect(covered(t.replace("https://", "").replace(/^\*\./, "")), t).toBe(true);
    for (const b of Object.values(BASEMAPS)) expect(covered(hostOf(b.url)), b.id).toBe(true);
  });

  it("names every public-records service a comp pull queries, by the host it queries", () => {
    const probe = { lat: 39.95, lng: -75.16, radiusKm: 1, monthsBack: 12, assetClass: "multifamily", nowIso: "2026-01-01T00:00:00Z" };
    const queried = [...new Set(COVERAGE_LIVE.map((p) => hostOf(p.buildUrl(probe))))].sort();
    const listed = DATA_PROCESSORS.find((p) => p.name.startsWith("Public-records"))!;
    expect([...listed.hosts].sort()).toEqual(queried);
    for (const p of COVERAGE_LIVE) expect(listed.name).toContain(p.regionLabel);
  });

  it("the two pages print the one list, and neither says Photon gets only what you type", () => {
    for (const [name, Page] of [
      ["security", SecurityPage],
      ["privacy", PrivacyPage],
    ] as const) {
      const html = renderToStaticMarkup(React.createElement(Page));
      const text = visibleText(html);
      for (const p of DATA_PROCESSORS) {
        expect(text, `${name}: ${p.name}`).toContain(p.name);
        expect(text, `${name}: ${p.name}`).toContain(p.receives);
      }
      expect(text).toContain(BROWSER_DIRECT_NOTE);
      expect(text).not.toMatch(/receives only the address text you type/i);
      // Each page dated by its own last change: the privacy page's cookie
      // section was written out in full on October 1 (pass 14), and named
      // the time-zone cookie on October 4.
      expect(text).toContain(name === "privacy" ? "Last updated: October 4, 2026" : "Last updated: September 30, 2026");
      expect(a11yIssues(html), name).toEqual([]);
      expect(gluedWords(text), name).toEqual([]);
    }
  });
});
