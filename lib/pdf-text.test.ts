import { describe, expect, it } from "vitest";
import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import {
  DENSE_PAGE_CHARS,
  isDenseLayer,
  lineOf,
  linesOf,
  pageTaggedText,
  pdfTextLayer,
  summarize,
} from "./pdf-text";

const h = React.createElement;

/** A rent-roll style row: three cells on one baseline. */
const row = (unit: string, type: string, rent: string) =>
  h(
    View,
    { style: { flexDirection: "row" } },
    h(Text, { style: { width: 120 } }, unit),
    h(Text, { style: { width: 80 } }, type),
    h(Text, null, rent),
  );

/** A deck: a summary page, a photo page with a caption, an empty page and a
 *  rent roll — the shapes an OM's pages come in. */
function deck(rollPages = 1) {
  const rolls = Array.from({ length: rollPages }, (_, k) =>
    h(
      Page,
      { key: `roll-${k}`, size: "LETTER", style: { padding: 40, fontSize: 10 } },
      h(Text, null, `Rent roll, page ${k + 1}`),
      ...Array.from({ length: 24 }, (_, i) => row(`Unit ${101 + i + k * 24}`, "2BR", `$${2400 + i * 25}/mo`)),
    ),
  );
  return h(
    Document,
    null,
    h(
      Page,
      { key: "summary", size: "LETTER", style: { padding: 40, fontSize: 11 } },
      h(Text, { style: { fontSize: 18 } }, "The Maddox at Brewerytown"),
      h(Text, null, "Asking price: $68,000,000"),
      row("Units", "", "240"),
      row("Going-in cap rate", "", "5.60%"),
      h(Text, null, "Total project cost of $21.0M reflects the plan."),
    ),
    h(Page, { key: "photo", size: "LETTER", style: { padding: 40 } }, h(Text, null, "The building from Girard Avenue")),
    h(Page, { key: "blank", size: "LETTER" }),
    ...rolls,
  );
}

describe("pdfTextLayer — the deck's own text, page by page", () => {
  it("reads every page in order, rebuilds a table row as one line, and marks the page with no text", async () => {
    const pdf = await renderToBuffer(deck(1));
    const layer = await pdfTextLayer(pdf);
    expect(layer.pages.map((p) => p.page)).toEqual([1, 2, 3, 4]);
    expect(layer.pages[0].text).toContain("The Maddox at Brewerytown");
    expect(layer.pages[0].text).toContain("Asking price: $68,000,000");
    expect(layer.pages[0].text).toMatch(/^Units 240$/m);
    expect(layer.pages[0].text).toMatch(/^Going-in cap rate 5\.60%$/m);
    // A run react-pdf splits at a script boundary reads back as one word.
    expect(layer.pages[0].text).toContain("$21.0M reflects");
    expect(layer.pages[1].text).toBe("The building from Girard Avenue");
    expect(layer.pages[2]).toEqual({ page: 3, text: "", chars: 0 });
    expect(layer.pages[3].text).toMatch(/^Unit 101 2BR \$2400\/mo$/m);
    expect(layer.pages[3].text).toMatch(/^Unit 124 2BR \$2975\/mo$/m);
    expect(layer.pages[3].chars).toBeGreaterThan(DENSE_PAGE_CHARS);
    expect(layer.densePages).toBe(1);
    expect(layer.totalChars).toBe(layer.pages.reduce((a, p) => a + p.chars, 0));
  });

  it("a file pdfjs cannot open reads as no pages, never a throw", async () => {
    const layer = await pdfTextLayer(Buffer.from("%PDF-1.4 not really a pdf"));
    expect(layer).toEqual({ pages: [], totalChars: 0, densePages: 0 });
  });
});

describe("the line rebuild", () => {
  const item = (str: string, x: number, width: number, y = 700, size = 10) => ({ str, x, y, width, size });

  it("joins runs that touch, spaces runs that do not, and orders by x", () => {
    expect(lineOf([item("M", 60, 10), item("$21.0", 40, 20)])).toBe("$21.0M");
    expect(lineOf([item("Units", 40, 30), item("240", 200, 20)])).toBe("Units 240");
    // the gap past which two runs are two words: 0.18 of the type size
    expect(lineOf([item("a", 40, 5), item("b", 47.5, 5)])).toBe("a b");
    expect(lineOf([item("a", 40, 5), item("b", 46.5, 5)])).toBe("ab");
  });

  it("groups items by baseline within the type size, top of the page first", () => {
    const items = [item("second", 40, 30, 680), item("first", 40, 30, 700), item("line", 80, 20, 700.5), item("", 40, 0, 690)];
    expect(linesOf(items)).toEqual(["first line", "second"]);
  });
});

describe("the density read and the page-tagged document", () => {
  const page = (n: number, chars: number) => ({ page: n, text: "x".repeat(chars), chars });

  it("dense means half the pages carry text and a few thousand characters in all", () => {
    expect(isDenseLayer(summarize([]))).toBe(false);
    expect(isDenseLayer(summarize([page(1, 2999)]))).toBe(false);
    expect(isDenseLayer(summarize([page(1, 3000)]))).toBe(true);
    // a glossy deck: half photos, half text
    expect(isDenseLayer(summarize([page(1, 1600), page(2, 1600), page(3, 40), page(4, 0)]))).toBe(true);
    // a scan with one text page
    expect(isDenseLayer(summarize([page(1, 3200), page(2, 0), page(3, 0)]))).toBe(false);
  });

  it("the document says what it is, how to cite a page, and marks a page with no text", () => {
    const layer = summarize([
      { page: 1, text: "Asking price: $68,000,000", chars: 24 },
      { page: 2, text: "", chars: 0 },
    ]);
    const doc = pageTaggedText(layer);
    expect(doc).toMatch(/^Offering memorandum — text layer, 2 pages\.\n/);
    expect(doc).toContain('Each page begins with a line "[[page k]]"; cite a page by that number.');
    expect(doc).toContain("[[page 1]]\nAsking price: $68,000,000");
    expect(doc).toContain("[[page 2]] (no text on this page)");
    expect(pageTaggedText(summarize([page(1, 5)]), "Buyer model")).toMatch(/^Buyer model — text layer, 1 page\./);
  });
});
