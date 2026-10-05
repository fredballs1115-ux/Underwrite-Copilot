import { describe, expect, it } from "vitest";
import {
  MAX_TO_PLACE,
  PIN_UNSCREENED,
  partitionForMap,
  pinColor,
  pinHtml,
  pinTapAction,
  placementLine,
  previewHtml,
  tooltipHtml,
  type MapDeal,
} from "./pipeline-map";

const deal = (over: Partial<MapDeal> & Pick<MapDeal, "id">): MapDeal => ({
  name: "The Maddox",
  verdict: null,
  price: null,
  figure: null,
  place: null,
  hasAddress: true,
  ...over,
});

describe("the pipeline map's rules (#431)", () => {
  it("draws a deal only where its location is resolved, places the rest, and never guesses", () => {
    const p = partitionForMap([
      deal({ id: "a", place: { lat: 39.95, lng: -75.16, precision: "street" } }),
      deal({ id: "b" }),
      deal({ id: "c", placeMiss: true }),
      deal({ id: "d", hasAddress: false }),
    ]);
    expect(p.placed.map((d) => d.id)).toEqual(["a"]);
    expect(p.toPlace.map((d) => d.id)).toEqual(["b"]);
    expect(p.unplaceable.map((d) => d.id)).toEqual(["c", "d"]);
    expect(MAX_TO_PLACE).toBeGreaterThan(0);
  });

  it("colours a pin by its call — the split bar's four — and hollows a placement vaguer than a street", () => {
    expect(pinColor("pass")).toBe("#1b7a5e");
    expect(pinColor("caution")).toBe("#a05a1c");
    expect(pinColor("pass_on")).toBe("#b23a30");
    expect(pinColor(null)).toBe(PIN_UNSCREENED);
    expect(pinColor("unheard-of")).toBe(PIN_UNSCREENED);
    expect(pinHtml("pass", "street")).toContain('fill="#1b7a5e"');
    expect(pinHtml("pass", "area")).toContain('fill="#ffffff" stroke="#1b7a5e"');
    // A deal picked for comparison wears a brand ring and a larger pin.
    expect(pinHtml("pass", "street", true)).toContain('stroke="#114e54"');
    expect(pinHtml("pass", "street", true)).toContain('width="30"');
  });

  it("escapes whatever the owner typed into the hover card", () => {
    const html = tooltipHtml(deal({ id: "x/1", name: `<img src=x onerror="alert(1)"> & Co's`, verdict: "caution", price: "$68.0M", figure: "5.6% cap" }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Co&#39;s");
    expect(html).toContain("/api/deals/x%2F1/image?w=96&amp;h=96&amp;fallback=cover");
    expect(html).toContain("Caution");
    expect(html).toContain("$68.0M · 5.6% cap");
    expect(tooltipHtml(deal({ id: "y" }))).toContain("Not screened");
  });

  it("on a touch screen, the same card is a link into the deal — escaped the same way, the id encoded", () => {
    const d = deal({ id: "x/1", name: `<img src=x onerror="alert(1)"> & Co's`, verdict: "pass", price: "$68.0M", figure: "5.6% cap" });
    const html = previewHtml(d);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Co&#39;s");
    expect(html).toMatch(/^<a class="uc-maptip" href="\/deals\/x%2F1" data-maptip-link>/);
    expect(html).toContain("/api/deals/x%2F1/image?w=96&amp;h=96&amp;fallback=cover");
    expect(html).toContain("$68.0M · 5.6% cap");
    // The chevron says the card opens something; the hover card has none
    // and is no link, since a mouse never reaches it before it closes.
    expect(html).toContain('class="uc-maptip-go"');
    expect(tooltipHtml(d)).not.toContain("<a ");
    expect(tooltipHtml(d)).not.toContain("uc-maptip-go");
  });

  it("a finger's first tap on a pin shows its card; a second tap on it opens the deal; a mouse and compare mode act at once", () => {
    const touch = { coarse: true, compare: false, pointer: "touch" };
    expect(pinTapAction({ ...touch, previewOpen: false })).toBe("preview");
    expect(pinTapAction({ ...touch, previewOpen: true })).toBe("open");
    // A mouse keeps its one click, on a desktop and on a tablet alike.
    expect(pinTapAction({ coarse: false, compare: false, pointer: "mouse", previewOpen: false })).toBe("open");
    expect(pinTapAction({ coarse: true, compare: false, pointer: "mouse", previewOpen: false })).toBe("open");
    // A touchscreen laptop's main pointer is fine: its hover card and its
    // click stay as they were.
    expect(pinTapAction({ coarse: false, compare: false, pointer: "touch", previewOpen: false })).toBe("open");
    // A click with no pointer behind it — a keyboard, a screen reader —
    // opens at once, and compare mode picks at once.
    expect(pinTapAction({ coarse: true, compare: false, pointer: null, previewOpen: false })).toBe("open");
    expect(pinTapAction({ ...touch, compare: true, previewOpen: false })).toBe("open");
  });

  it("says where every deal is, each in exactly one count", () => {
    expect(placementLine({ placed: 3, placing: 0, later: 0, unplaceable: 0 })).toBe("3 of 3 deals on the map");
    expect(placementLine({ placed: 1, placing: 2, later: 4, unplaceable: 1 })).toBe(
      "1 of 8 deals on the map · 2 being placed · 4 placed when first opened · 1 with no address a geocoder could place",
    );
    expect(placementLine({ placed: 0, placing: 1, later: 0, unplaceable: 0 })).toBe("0 of 1 deal on the map · 1 being placed");
  });
});
