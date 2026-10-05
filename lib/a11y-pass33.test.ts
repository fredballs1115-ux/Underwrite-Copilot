// Research pass 33's accessibility fixes, held at the markup a static render
// gives: what a keyboard reaches, what a screen reader is told, and what
// each control is called. The behaviour a render cannot run (a key, a
// timer, focus moving) is held where it can be — a handler's own effect on
// the markup it returns — and every render goes through the lint's
// accessibility floor (`a11yIssues`).
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompName, CompsMap, type MapComp } from "@/app/(app)/deals/[id]/comps-map";
import { a11yIssues } from "./render-lint";

const h = React.createElement;

const comp = (over: Partial<MapComp> & Pick<MapComp, "id" | "name">): MapComp => ({
  kind: "om",
  detail: "Sold 2024, 212 units",
  sourceLabel: "OM p. 14",
  sourceHref: null,
  queries: [],
  ...over,
});

describe("the comps table (research pass 33, item 17)", () => {
  it("names a placed comp's 'Show on the map' as a real button, for the comp, and leaves an unplaced one as text", () => {
    let shown = 0;
    const placed = renderToStaticMarkup(h(CompName, { name: "Riverbend & Co", placed: true, onShow: () => shown++ }));
    expect(placed).toMatch(/^<button type="button" title="Show on the map"[^>]*>Riverbend &amp; Co<\/button>$/);
    expect(a11yIssues(placed)).toEqual([]);
    // The cut is on the button, never the cell, so the cell cannot clip its ring.
    expect(placed).toContain("truncate");
    const unplaced = renderToStaticMarkup(h(CompName, { name: "Mill Lofts", placed: false, onShow: () => shown++ }));
    expect(unplaced).not.toContain("<button");
    expect(unplaced).toContain("Mill Lofts");
    expect(shown).toBe(0);
  });

  it("tells a screen reader which column the table is sorted by, and no other", () => {
    const html = renderToStaticMarkup(
      h(CompsMap, {
        subjectLabel: "1 Main St, Philadelphia, PA",
        market: "Philadelphia",
        comps: [comp({ id: "a", name: "Riverbend" }), comp({ id: "b", name: "Mill Lofts", kind: "web" })],
      }),
    );
    // The table opens sorted nearest first.
    const sorted = [...html.matchAll(/<th\b[^>]*aria-sort="([^"]+)"[^>]*>([\s\S]*?)<\/th>/g)];
    expect(sorted.map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").replace(/\s*↓\s*$/, "")])).toEqual([["ascending", "Distance"]]);
    expect(html.match(/aria-sort=/g)?.length).toBe(1);
    // The column header buttons are still the sort controls.
    expect(html).toMatch(/<th\b[^>]*><button type="button"[^>]*>Comp<\/button><\/th>/);
    expect(a11yIssues(html)).toEqual([]);
  });
});
