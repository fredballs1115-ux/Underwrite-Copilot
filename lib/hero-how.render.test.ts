// The deal header's "how this is read" (lib/hero-how, app/(app)/deals/[id]/
// figure-how.tsx): each figure's label opens a popover saying where the
// figure comes from — the memorandum's row and its validated page, the
// first read, or what it is derived from — with the deal's own inputs, each
// quoted from the reader the tile itself was drawn through. Held here on a
// stabilized deal, a plan deal (its yield on cost) and a note (its cap
// withheld), and on the sample's fit chip.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { SampleDealHero } from "@/app/sample-hero";
import { NOTE_CAP_TITLE } from "./cap-slot";
import type { HeroFigure } from "./hero-figure";
import { PLAN_YOC_TITLE } from "./plan-facts";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { headerFacts, sampleHeader } from "./sample-header";
import { buildManualExtraction, typedByHand } from "./manual-deal";
import { buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { fitHow } from "./hero-how";

const AS_OF = new Date("2025-09-30T12:00:00Z");
const m = (label: string, value: string, page = "") => ({ label, value, flagged: false, page });
const ex = (metrics: ExtractionResult["metrics"], more: Partial<ExtractionResult> = {}) =>
  ({ dealName: "x", assetClass: "multifamily", totalPages: 40, metrics, ...more }) as ExtractionResult;
const figuresOf = (extraction: ExtractionResult) =>
  headerFacts({ name: "Deal", storedAssetClass: "multifamily", extraction, firstSignal: null, address: null, verdict: null, box: null, asOf: AS_OF }).figures;

const hero = (figures: HeroFigure[]) => renderToStaticMarkup(React.createElement(DealHero, { title: "The Maddox", subtitle: "Philadelphia, PA · Multifamily", figures }));

/** Each tile's popover, by the tile's label: the button's name and the
 *  panel's words, as a reader opening it sees them. */
function popovers(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of html.matchAll(/<button type="button" data-qa="figure-how" aria-expanded="false" aria-controls="([^"]+)" aria-label="How this is read: ([^"]+)"/g)) {
    const [, id, label] = b;
    const at = html.indexOf(`<div id="${id}" data-qa="figure-how-panel" hidden=""`);
    expect(at, `the panel ${label}'s button controls`).toBeGreaterThan(-1);
    // The panel ends where its tile closes.
    const words = visibleText(html.slice(at, html.indexOf("</div></dd></div>", at)));
    out.set(label.replace(/&#x27;/g, "'"), words.replace(/\s+/g, " ").trim());
  }
  return out;
}

function clean(html: string) {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
}

describe("the deal header's figures say how each is read", () => {
  it("a stabilized deal: each figure's memorandum row, its page only where the page is the memorandum's", () => {
    const stab = ex(
      [m("Asking price", "$20,000,000", "p. 2"), m("Units", "120", "p. 3"), m("Going-in cap rate", "5.45%", "p. 99")],
      { strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" } },
    );
    const html = hero(figuresOf(stab));
    clean(html);
    const p = popovers(html);
    expect([...p.keys()]).toEqual(["Price", "Size", "Going-in cap", "Deal type"]);
    expect(p.get("Price")).toBe("From the memorandum's “Asking price” row, page 2. As stated $20,000,000");
    expect(p.get("Size")).toContain("From the memorandum's “Units” row, page 3. As stated 120");
    // Page 99 of a 40-page memorandum is no page (lib/facts, the absolute rule).
    expect(p.get("Going-in cap")).toBe("From the memorandum's “Going-in cap rate” row (page not located). As stated 5.45%");
    expect(p.get("Deal type")).toContain("From the memorandum's own words");
    expect(p.get("Deal type")).toContain("NOI ÷ price is the going-in cap");
    // Each popover's figure is the tile's own.
    expect(visibleText(html)).toMatch(/Price\s*\$20,000,000/);
    expect(visibleText(html)).toMatch(/Going-in cap\s*5\.45%/);
  });

  it("a plan deal: its yield on cost derived from the plan's own facts, each row cited", () => {
    const plan = ex(
      [m("Asking price", "$18,500,000", "p. 4"), m("Total project cost", "$21,350,000", "p. 9"), m("Stabilized NOI", "$1,337,800", "p. 11"), m("Units", "120")],
      { strategy: { kind: "value_add", summary: "Renovate 120 units", capitalBudget: "", timeline: "" } },
    );
    const figures = figuresOf(plan);
    const html = hero(figures);
    clean(html);
    const p = popovers(html);
    expect(figures[2]).toMatchObject({ label: "Yield on cost", value: "6.27%" });
    const yoc = p.get("Yield on cost")!;
    expect(yoc).toContain("Derived: the stabilized NOI the memorandum states, over the plan's total cost.");
    // The plan strip's own facts, word for word (lib/plan-facts `planFacts`).
    expect(yoc).toContain("Stabilized NOI $1.3M Price $18.5M Budget (total cost less price) $2.9M Total cost $21.4M Yield on cost 6.27%");
    expect(yoc).toContain("The NOI is the memorandum's “Stabilized NOI” row, page 11.");
    expect(yoc).toContain("The budget is the memorandum's “Total project cost” line, page 9, less the price.");
    expect(yoc).toContain(PLAN_YOC_TITLE);
    // A count with no page says so, never a page made up.
    expect(p.get("Size")).toContain("“Units” row (page not located)");
    expect(p.get("Deal type")).toContain("As the extraction summarises it Renovate 120 units");
  });

  it("a note: its yield to maturity in the cap's place, and where none stands the cap withheld, saying why", () => {
    const terms = [
      m("Asking price", "$20,000,000", "p. 2"),
      m("Unpaid principal balance", "$24,400,000"),
      m("Note rate", "5.25%"),
      m("Maturity date", "March 31, 2028"),
      m("Amortization", "Interest-only"),
      m("Cap rate", "9.5%"),
    ];
    const interest = { kind: "note" as const, summary: "", share: "", groundLease: "", loan: "", page: "" };
    const paying = figuresOf(ex([...terms, m("Payment status", "Performing")], { interest }));
    const html = hero(paying);
    clean(html);
    const p = popovers(html);
    expect(paying[0].label).toBe("Price · Note");
    expect(p.get("Price · Note")).toContain("What the price buys Note");
    expect(paying[2]).toMatchObject({ label: "Yield to maturity" });
    const ytm = p.get("Yield to maturity")!;
    expect(ytm).toContain("The note's yield to maturity at its price");
    expect(ytm).toContain(`At its price $20,000,000 Yield to maturity ${paying[2].value}`);
    expect(ytm).toContain(NOTE_CAP_TITLE);
    // The collateral's 9.5% cap is never quoted as the note's.
    expect(ytm).not.toContain("9.5%");
    // The deal type's "NOI ÷ price is the going-in cap" is not said beside it.
    expect(p.get("Deal type")).not.toContain("going-in cap");

    const stopped = figuresOf(ex([...terms, m("Payment status", "Non-performing; in foreclosure")], { interest }));
    const withheld = hero(stopped);
    clean(withheld);
    expect(stopped[2]).toMatchObject({ label: "Going-in cap", value: "n/a — note" });
    const w = popovers(withheld).get("Going-in cap")!;
    expect(w).toContain("Withheld: no yield to maturity stands for this note.");
    expect(w).toContain(NOTE_CAP_TITLE);
  });

  it("a deal typed by hand: each figure is the field it was entered in, never a memorandum's row or page", () => {
    const typed = buildManualExtraction({
      name: "4-unit on Maple St",
      assetClass: "multifamily",
      market: "Woodbridge, VA",
      address: "123 Maple St, Woodbridge, VA 22191",
      price: 1_250_000,
      capPct: 6.2,
      noiAnnual: null,
      units: 4,
      sf: null,
      occupancyPct: 100,
      yearBuilt: 1968,
      avgRentMo: 1_450,
      notes: "",
    });
    expect(typedByHand(typed)).toBe(true);
    const html = hero(figuresOf(typed));
    clean(html);
    const p = popovers(html);
    expect(p.get("Price")).toBe("From the figures entered by hand: the “Asking price” field. As stated $1,250,000");
    expect(p.get("Size")).toContain("From the figures entered by hand: the “Units” field.");
    expect(p.get("Size")).toContain("No area was entered by hand");
    expect(p.get("Going-in cap")).toContain("From the figures entered by hand: the “Going-in cap rate” field.");
    expect(p.get("Deal type")).toContain("Inferred: no plan was entered by hand");
    for (const words of p.values()) {
      expect(words).not.toMatch(/memorandum/);
      expect(words).not.toMatch(/page/);
    }
  });

  it("a plan whose yield is not struck says what it needs, and why its price is withheld", () => {
    const plan = ex([m("Asking price", "$18,500,000", "p. 4"), m("Units", "120")], {
      strategy: { kind: "value_add", summary: "Renovate 120 units", capitalBudget: "", timeline: "" },
    });
    const p = popovers(hero(figuresOf(plan)));
    expect(p.get("Yield on cost")).toContain(
      "Not struck: the yield needs a stabilized NOI and a total cost (the price plus the budget), each the memorandum states.",
    );
  });

  it("the fit's popover lists every criterion its count holds, the cash-on-cash floor included", () => {
    const deal = ex([m("Asking price", "$20,000,000", "p. 2"), m("Units", "120", "p. 3")], {
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
    });
    const read = buyBoxRead("multifamily", dealCheckSource(deal, null, null), { assetClasses: ["multifamily"], minCapPct: 5, minCoCPct: 8 });
    const how = fitHow(read);
    const count = read.chip.label.match(/(\d+) of (\d+) checked/);
    expect(count, read.chip.label).not.toBeNull();
    expect(how.inputs!.length).toBe(Number(count![2]));
    expect(how.inputs).toContainEqual({ label: "Cash-on-cash", value: "Could not be checked." });
  });

  it("a figure with no `how` keeps its plain label", () => {
    const html = hero([{ label: "Price", value: "$1,000,000", figure: true }]);
    expect(html).toContain('<dt class="line-clamp-2 text-[11px] uppercase tracking-wide text-muted">Price</dt>');
    expect(html).not.toContain("figure-how");
  });

  it("the sample's fit chip opens its criteria, each check's own line", () => {
    const h = sampleHeader(new Date("2026-10-16T12:00:00Z"));
    const html = renderToStaticMarkup(React.createElement(SampleDealHero, { header: h, titleAs: "h2" }));
    clean(html);
    const b = html.match(/<button type="button" data-qa="fit-how" aria-expanded="false" aria-controls="([^"]+)" aria-label="How this is read: ([^"]+)"/);
    expect(b?.[2]).toBe(h.fit!.label);
    // The chip itself, unchanged, inside the button.
    expect(html).toContain(`<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold ${h.fit!.cls}"`);
    const at = html.indexOf(`<div id="${b![1]}"`);
    const panel = visibleText(html.slice(at, html.indexOf("</span>", html.indexOf("</div>", at)))).replace(/\s+/g, " ");
    expect(panel).toContain("Fit 63 is the mandate-fit score out of 100");
    for (const c of h.fit!.how!.inputs!) expect(panel).toContain(c.value);
    expect(panel).toContain("“Outside box”");
    expect(panel).toContain(h.fit!.note!);
    // The four tiles open theirs too.
    expect(popovers(html).size).toBe(4);
  });

  it("opens on a press, closes on Escape with the focus back on its button, and wears the site's own ring", () => {
    const src = readFileSync("app/(app)/deals/[id]/figure-how.tsx", "utf8");
    expect(src).toMatch(/e\.key === "Escape" && open[\s\S]{0,80}setOpen\(false\);\s*button\.current\?\.focus\(\)/);
    expect(src).toMatch(/document\.addEventListener\("pointerdown", away\)/);
    expect(src).not.toMatch(/focus-visible:/);
    // The client module loads no reader: it takes plain strings.
    expect(src).not.toMatch(/^import (?!type )[^;]*from "@\/lib\//m);
  });
});
