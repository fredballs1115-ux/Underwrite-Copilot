import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { examplesFor, listingIn } from "./example-listings";
import { ExampleListings } from "@/app/market/example-listings";
import { visibleText } from "./render-lint";

// The research pass of 2026-10-01: the example block printed MLS and portal
// listings with neither the file's date nor its source, and printed the DMV
// core's one listing — a duplex in Dumfries, Virginia — on the Maryland
// counties' pages.
describe("examplesFor — a market's example listings, each in the market, dated and sourced", () => {
  it("shows the Dumfries, Virginia listing on Northern Virginia's brief alone", () => {
    const dumfries = (id: string) => examplesFor(id).some((e) => e.address.includes("Dumfries, VA"));
    expect(dumfries("nova")).toBe(true);
    expect(dumfries("pg_county")).toBe(false);
    expect(dumfries("montgomery_county")).toBe(false);
    expect(dumfries("dc")).toBe(false);
  });

  it("places a listing by its own address, and never guesses between two markets of one state", () => {
    const dmv = ["dc", "pg_county", "montgomery_county", "nova"];
    expect(listingIn("922 Ellsworth St, Philadelphia, PA 19147", "philadelphia", ["philadelphia"])).toBe(true);
    // A Maryland town the matchers do not name could be either county's.
    expect(listingIn("1 Main St, Laurel, MD 20707", "pg_county", dmv)).toBe(false);
    expect(listingIn("1 Main St, Laurel, MD 20707", "montgomery_county", dmv)).toBe(false);
    // A named county places it.
    expect(listingIn("1 Main St, Silver Spring, MD 20910", "montgomery_county", dmv)).toBe(true);
    expect(listingIn("1 Main St, Silver Spring, MD 20910", "pg_county", dmv)).toBe(false);
  });

  it("carries each listing's date and source as the file states them", () => {
    const philly = examplesFor("philadelphia");
    expect(philly.length).toBeGreaterThan(0);
    for (const e of [...philly, ...examplesFor("nova")]) {
      expect(e.asOf, e.address).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source, e.address).not.toBe("");
    }
    const html = renderToStaticMarkup(React.createElement(ExampleListings, { examples: examplesFor("nova"), today: "2026-10-04" }));
    const text = visibleText(html);
    expect(text).toContain("Bright MLS #VAPW2118338");
    expect(text).toContain("listed as of Jul 15, 2026 · source: snippet-confirmed across independent queries (Bright MLS via portal snippets)");
    expect(renderToStaticMarkup(React.createElement(ExampleListings, { examples: [], today: "2026-10-04" }))).toBe("");
    expect(examplesFor("chicago")).toEqual([]);
  });

  it("says a listing's day with its age and the stale mark past the research rule's limit, never hiding it", () => {
    // Seen Jul 15, 2026: current through its 180th day, Jan 11, 2027.
    // The mark is a span of its own (the caution tone), so the text is read
    // with its line breaks folded.
    const on = (today: string) =>
      visibleText(renderToStaticMarkup(React.createElement(ExampleListings, { examples: examplesFor("nova"), today }))).replace(/\s+/g, " ");
    expect(on("2027-01-11")).toContain("listed as of Jul 15, 2026 · source:");
    expect(on("2027-01-11")).not.toContain("stale");
    expect(on("2027-01-12")).toContain("listed as of Jul 15, 2026 (181 days old, stale) · source:");
    expect(on("2027-01-12")).toContain("Bright MLS #VAPW2118338");
  });
});
