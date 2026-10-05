import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddressSearchCredit } from "@/app/(app)/address-search-credit";
import { BASEMAPS, OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "./basemaps";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// OpenStreetMap's attribution guideline, as zori probe run 37263390061
// printed it: a geocoder on OpenStreetMap's data, and an application that
// incorporates one, "must credit OpenStreetMap"; "© OpenStreetMap
// contributors" is an acceptable form; and making the text "OpenStreetMap" a
// link to openstreetmap.org/copyright makes it clear the data is under the
// Open Database License. The site's address search and the comps map's pins
// are Photon's, a geocoder on OpenStreetMap's data.

describe("OpenStreetMap's credit, in the guideline's own form", () => {
  it("links the word OpenStreetMap to its copyright page", () => {
    expect(OSM_COPYRIGHT_URL).toBe("https://www.openstreetmap.org/copyright");
    expect(OSM_ATTRIBUTION).toBe(
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    );
    // The street tiles carry the same string, so a map drawing them and
    // OpenStreetMap-placed pins prints it once.
    expect(BASEMAPS.streets.attribution).toBe(OSM_ATTRIBUTION);
  });

  it("stands under the address search's suggestions: words a reader sees, the link to the licence", () => {
    const html = renderToStaticMarkup(React.createElement(AddressSearchCredit, { className: "text-[10px]" }));
    expect(visibleText(html).replace(/\s+/g, " ").trim()).toBe("Address search © OpenStreetMap contributors");
    expect(html).toMatch(/<a href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>OpenStreetMap<\/a>/);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("is drawn in the suggestions' dropdown, after the listbox and outside it", () => {
    const src = readFileSync("app/(app)/address-autocomplete.tsx", "utf8");
    const open = src.slice(src.indexOf("{open && ("));
    const list = open.indexOf('role="listbox"');
    const listEnd = open.indexOf("</ul>");
    const credit = open.indexOf("<AddressSearchCredit");
    expect(list).toBeGreaterThan(-1);
    expect(credit).toBeGreaterThan(listEnd);
    // Still inside the dropdown that opens with the suggestions.
    const dropdownEnd = open.indexOf("</div>\n      )}");
    expect(dropdownEnd).toBeGreaterThan(-1);
    expect(credit).toBeLessThan(dropdownEnd);
  });

  it("is on the comps map's attribution over every basemap, its pins being Photon's", () => {
    const src = readFileSync("app/(app)/deals/[id]/comps-map.tsx", "utf8");
    expect(src).toContain("photon.komoot.io");
    expect(src).toContain("map.attributionControl?.addAttribution(OSM_ATTRIBUTION)");
  });
});
