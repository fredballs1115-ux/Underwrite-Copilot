// The deal-type panels' shared parts (app/panel-parts, research pass 36),
// held to the rules that made them: every panel draws its heading, its read,
// its keys, its ticks and its rows of bars through them, so a phone shows
// each thing one way. The panels' own render tests hold their content; this
// holds the parts, and holds every panel's source to drawing with them.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { BarRow, BarRows, Key, KeyItem, PanelFold, PanelHead, PanelNote, PanelRead, Tick, tileSpan } from "@/app/panel-parts";
import { a11yIssues, visibleText } from "./render-lint";

const h = React.createElement;
const PANELS = readdirSync(join(process.cwd(), "app"))
  .filter((f) => f.endsWith("-panel.tsx"))
  .map((f) => ({ f, src: readFileSync(join(process.cwd(), "app", f), "utf8") }));

describe("app/panel-parts — the parts every deal-type panel draws with", () => {
  it("covers the eighteen deal-type panels", () => {
    expect(PANELS.map((p) => p.f).sort()).toEqual(
      [
        "affordable",
        "condo",
        "forward",
        "going-concern",
        "hotel",
        "interest",
        "manufactured-housing",
        "mixed-use",
        "regulation",
        "roster",
        "sale",
        "sandwich",
        "self-storage",
        "single-tenant",
        "site-reports",
        "student-housing",
        "tax-abatement",
        "value-add",
      ].map((n) => `${n}-panel.tsx`),
    );
  });

  it("makes a panel's eyebrow its h2, in the eyebrow's own styles, and every panel has one", () => {
    const html = renderToStaticMarkup(h(PanelHead, { title: "Tax abatement", tone: "text-caution" }, h("span", null, "2.3 years left")));
    expect(html).toBe(
      '<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 class="text-[11px] font-semibold uppercase tracking-wider text-caution">Tax abatement</h2><span>2.3 years left</span></div>',
    );
    for (const { f, src } of PANELS) {
      expect(src, f).toContain("<PanelHead ");
      // The eyebrow had been a span in a paragraph: no heading to move to.
      expect(src, f).not.toContain('<p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">');
    }
  });

  it("leads with the read's first sentence and folds the rest whole, its control a thumb's height on a touch screen", () => {
    const sentences = ["One.", "Two.", "Three."];
    const html = renderToStaticMarkup(h(PanelRead, { sentences }));
    expect(html).toContain('<p class="mt-1 max-w-[68ch] text-sm leading-relaxed">One.</p>');
    expect(html).toMatch(/<summary class="[^"]*\bpointer-coarse:py-2\.5\b[^"]*">/);
    expect(visibleText(html)).toContain("Read the rest (2 more)");
    expect(html).toContain('<p class="mt-1">Two. Three.</p>');
    expect(renderToStaticMarkup(h(PanelRead, { sentences, lead: 2 }))).toContain("Read the rest (1 more)");
    // Nothing said, nothing drawn; nothing to fold, no fold.
    expect(renderToStaticMarkup(h(PanelRead, { sentences: [] }))).toBe("");
    expect(renderToStaticMarkup(h(PanelFold, { rest: [] }))).toBe("");
    expect(renderToStaticMarkup(h(PanelRead, { sentences: ["Only."] }))).not.toContain("<details");
    expect(renderToStaticMarkup(h(PanelNote, null, "The model's read."))).toContain("max-w-[68ch]");
    for (const { f, src } of PANELS) expect(src, f).not.toContain("Read the rest");
  });

  it("sets each key's mark to its label's first line, one swatch size and one tick shape", () => {
    const html = renderToStaticMarkup(
      h(Key, {
        children: [
          h(KeyItem, { key: "a", mark: "swatch", tone: "bg-brand/70", children: "Price $20.0M" }),
          h(KeyItem, { key: "b", mark: "tick", tone: "bg-ink", children: "The stated value" }),
          h(KeyItem, { key: "c", mark: "dashed", tone: "border-caution", children: "Outside date" }),
          h(KeyItem, { key: "d", children: "Today" }),
        ],
      }),
    );
    // A 16px line, each mark set down to its middle, and the label beside the
    // mark it begins with (items-start), never centred between its lines.
    expect(html).toMatch(/^<ul class="mt-1\.5 flex flex-wrap gap-x-3 gap-y-0\.5 text-\[11px\] leading-4 text-muted">/);
    expect(html.match(/<li class="flex items-start gap-1\.5">/g)).toHaveLength(4);
    expect(html).toContain('<span aria-hidden="true" class="inline-block shrink-0 mt-[3px] h-2.5 w-2.5 rounded-sm bg-brand/70"></span>Price $20.0M');
    expect(html).toContain('<span aria-hidden="true" class="inline-block shrink-0 mt-0.5 h-3 w-0.5 rounded-full bg-ink"></span>The stated value');
    expect(html).toContain('<span aria-hidden="true" class="inline-block shrink-0 mt-0.5 h-3 w-0 border-l-2 border-dashed border-caution"></span>Outside date');
    expect(a11yIssues(html)).toEqual([]);
    // No panel keeps a swatch of its own, or centres one between a wrapped
    // label's lines.
    for (const { f, src } of PANELS) {
      expect(src, f).not.toMatch(/<li className="flex items-center gap-1\.5">/);
      expect(src, f).not.toMatch(/<span aria-hidden className="(?:mr-1\.5 )?inline-block h-/);
    }
  });

  it("centres a tick on its value and keeps it inside its track", () => {
    const html = renderToStaticMarkup(h(Tick, { at: "100%", bar: "pos-value" }));
    // Placed in a box a pixel in from each end and pulled back half its own
    // width: at 100% its right edge is the track's, where it had hung past.
    expect(html).toBe(
      '<div class="pointer-events-none absolute inset-y-0 left-px right-px"><div class="absolute -inset-y-1 -translate-x-1/2 w-0.5 rounded-full bg-ink" data-bar="pos-value" style="left:100%"></div></div>',
    );
    expect(renderToStaticMarkup(h(Tick, { at: "85%", tone: "border-ink/50", dashed: true, track: "secondary" }))).toContain(
      'class="absolute -inset-y-0.5 -translate-x-1/2 w-0 border-l-2 border-dashed border-ink/50" style="left:85%"',
    );
    // Every tick on a panel's track goes through it: none is placed by its
    // left edge (a band with a width, a range's, is no tick).
    for (const { f, src } of PANELS) expect(src, f).not.toMatch(/className="absolute [^"]*\b(?:w-0\.5|border-l-2)\b[^"]*"[^>]*style=\{\{ left:/);
  });

  it("draws rows of bars on tracks of one length: the label's and the figure's columns one width, stacked on a phone", () => {
    const html = renderToStaticMarkup(
      h(BarRows, {
        qa: "bill",
        children: [
          h(BarRow, { key: "now", label: "Paid today", figure: "$70k", children: h("div", { "data-bar": "now" }) }),
          h(BarRow, { key: "full", label: "Full bill", figure: "$520k", children: h("div", { "data-bar": "full" }) }),
        ],
      }),
    );
    expect(html).toMatch(/^<div class="@container\/bars" data-qa="bill">/);
    const rows = [...html.matchAll(/<div class="(grid [^"]*)">/g)].map((m) => m[1]);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      // No column sizes itself to its figure: an `auto` column had drawn two
      // bars on one scale on tracks 5% apart.
      expect(r).not.toContain("auto");
      expect(r).toContain("grid-cols-[minmax(0,1fr)_4rem]");
      expect(r).toContain("@sm/bars:grid-cols-[9rem_minmax(0,1fr)_4rem]");
    }
    expect(html.match(/<div class="relative h-2 rounded-full bg-faint" aria-hidden="true">/g)).toHaveLength(2);
    expect(visibleText(html)).toMatch(/Paid today\s+\$70k\s+Full bill\s+\$520k/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("gives a tile of words both columns on a phone, and leaves a figure two-up", () => {
    expect(tileSpan("Ridgeline Logistics Partners")).toBe("col-span-2 sm:col-span-1");
    expect(tileSpan("1.8 acres entitled for 25,000 SF")).toBe("col-span-2 sm:col-span-1");
    for (const figure of ["$62k", "38%", "1.65×", "$1,650 / month avg", "Pedestrian", "Not regulated"]) expect(tileSpan(figure), figure).toBe("");
  });

  it("keeps the panels to two track heights", () => {
    for (const { f, src } of PANELS) expect(src, f).not.toMatch(/\bh-(?:1\.5|2\.5)\b/);
    expect(readFileSync(join(process.cwd(), "app", "lease-term-bar.tsx"), "utf8")).not.toMatch(/\bh-(?:1\.5|2\.5)\b/);
    expect(readFileSync(join(process.cwd(), "app", "portfolio-card.tsx"), "utf8")).not.toMatch(/\bh-(?:1\.5|2\.5)\b/);
  });
});
