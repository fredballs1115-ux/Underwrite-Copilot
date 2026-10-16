/**
 * The compare page with fewer than two deals named (signed-in gaps, M5): the
 * reader's deals as a tray of tiles to pick from, each the building's
 * picture, its name, its call and its place, up to COMPARE_MAX — where the
 * page had been one sentence. Rendered on fixtures and linted.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComparePicker, compareHref, type PickableDeal } from "@/app/(app)/deals/compare/compare-picker";
import { COMPARE_MAX } from "./link-limits";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const DEALS: PickableDeal[] = [
  { id: "a1", name: "The Maddox", place: "Brewerytown, Philadelphia, PA", call: "caution" },
  { id: "b2", name: "Harbor Point", place: null, call: "pass" },
  { id: "c3", name: "Elm Street Lofts", place: "Baltimore, MD", call: null },
  { id: "d4", name: "Ridge Commons", place: "Arlington, VA", call: "pass_on" },
  { id: "e5", name: "Mill Yard", place: "Richmond, VA", call: null },
];

const render = (initial?: string[]) =>
  renderToStaticMarkup(React.createElement(ComparePicker, { deals: DEALS, initial }));

describe("the empty compare page's picker", () => {
  it("draws a tile a deal — its picture, name, call and place — with a box to tick", () => {
    const html = render();
    const text = visibleText(html);
    expect(html.match(/type="checkbox"/g)).toHaveLength(DEALS.length);
    expect(html.match(/data-deal-avatar="picture"/g)).toHaveLength(DEALS.length);
    expect(html).toContain("/api/deals/a1/image?");
    expect(text).toContain("The Maddox");
    expect(text).toContain("Caution · Brewerytown, Philadelphia, PA");
    expect(text).toContain("Go");
    expect(text).toContain("No-go · Arlington, VA");
    expect(text).toContain(`Pick 2–${COMPARE_MAX} deals.`);
    // Nothing to compare yet: no link, the button said as unavailable.
    expect(html).not.toContain('data-qa="compare-go"');
    expect(html).toMatch(/aria-disabled="true"[^>]*>Compare</);
    expect(html).not.toMatch(/checked=""/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("keeps a deal the link named ticked, and offers the comparison from two", () => {
    const one = render(["c3", "zz"]);
    expect(one.match(/checked=""/g)).toHaveLength(1);
    expect(visibleText(one)).toContain("1 picked");
    const two = render(["c3", "a1"]);
    expect(two).toMatch(/<a data-qa="compare-go"[^>]*href="\/deals\/compare\?ids=c3,a1"[^>]*>Compare 2 deals<\/a>/);
  });

  it("disables the unticked boxes once COMPARE_MAX are picked", () => {
    const html = render(DEALS.map((d) => d.id));
    expect(html.match(/checked=""/g)).toHaveLength(COMPARE_MAX);
    expect(html.match(/disabled=""/g)).toHaveLength(DEALS.length - COMPARE_MAX);
    expect(visibleText(html)).toContain(`${COMPARE_MAX} of ${COMPARE_MAX} picked`);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("writes the compare link in the order the deals were picked", () => {
    expect(compareHref(["b2", "a1"])).toBe("/deals/compare?ids=b2,a1");
  });
});
