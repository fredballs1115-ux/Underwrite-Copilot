// Research pass 36's page-level layout fixes — the signed-in pages and the
// shared screen at a phone's width — held at the markup a static render
// gives, and at the source where a render cannot reach (an observer, the
// order of a page's own panels).
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { a11yIssues } from "./render-lint";

const h = React.createElement;
const src = (p: string) => readFileSync(p, "utf8");

/** The element whose opening tag carries `marker`, whole: its own tag
 *  counted open and closed from there. */
function elementWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))?.[1] ?? "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

const FIGURES = [
  { label: "Price", value: "$48,500,000", figure: true },
  { label: "Size", value: "248 units", figure: true },
  { label: "Going-in cap", value: "5.45%", figure: true },
  { label: "Deal type", value: "Stabilized" },
];

describe("the bar that keeps the deal in view (research pass 36, F1)", () => {
  it("watches the header's name, call and figures, never the whole header with its panels", () => {
    // The panels sit inside the header: watching the header kept the bar
    // hidden for screens of them after the figures had gone.
    const bar = src("app/(app)/deals/[id]/deal-sticky-bar.tsx");
    expect(bar).toMatch(/document\.querySelector\("\[data-deal-hero-facts\]"\)/);
    expect(bar).not.toMatch(/querySelector\("\[data-deal-hero\]"\)/);
    // Shown once the block is above what the reader sees (a phone's own top
    // bar counted as covering), never while it is still below the fold.
    expect(bar).toMatch(/!entry\.isIntersecting && entry\.boundingClientRect\.top < /);
    expect(bar).toMatch(/\[data-app-topbar\]/);
    const html = renderToStaticMarkup(
      h(
        DealHero,
        {
          title: "The Maddox",
          chips: h("span", { className: "rounded-full bg-pass/10 px-2.5 py-0.5 text-xs font-semibold text-pass" }, "Go"),
          subtitle: "1200 N 31st St, Philadelphia, PA · Multifamily",
          figures: FIGURES,
          actions: h("a", { href: "/api/deals/d1/memo" }, "IC memo"),
        },
        h("section", { "aria-label": "How it is sold" }, "The property is sold at auction."),
      ),
    );
    expect(a11yIssues(html)).toEqual([]);
    const header = elementWith(html, 'data-deal-hero="true"');
    const facts = elementWith(html, 'data-deal-hero-facts="true"');
    expect(header).toContain(facts);
    expect(facts).toMatch(/<h1 id="deal-title"[^>]*>The Maddox<\/h1>/);
    expect(facts).toContain(">Go<");
    for (const f of FIGURES) expect(facts).toContain(f.value);
    // The toolbar and the panels are the header's, not the block's.
    expect(header).toContain("The property is sold at auction.");
    expect(facts).not.toContain("The property is sold at auction.");
    expect(facts).not.toContain("IC memo");
  });
});

describe("the panels' well inside the header (research pass 36, F7)", () => {
  it("insets the panels 12px on a phone and 24px from sm", () => {
    // 24px of well, the card's border and each panel's own edge and padding
    // left a 263px column of text on a 390px phone.
    const html = renderToStaticMarkup(
      h(DealHero, { title: "The Maddox", subtitle: "Philadelphia, PA · Multifamily", figures: FIGURES }, h("section", { "aria-label": "The plan" }, "The plan")),
    );
    const well = (/<div class="([^"]*\[grid-area:panels\][^"]*)">/.exec(html)?.[1] ?? "").split(" ");
    expect(well).toContain("px-3");
    expect(well).toContain("sm:px-6");
    expect(well).not.toContain("px-6");
    expect(well).toContain("empty:hidden");
  });
});

describe("what does not tie, right after the plan (research pass 36, F4)", () => {
  it("draws the plausibility panel after the plan and what is being sold, before every deal-kind panel", () => {
    // The page's comment and DealHero's doc put "what does not tie" right
    // after the plan; the deal-kind panels had been inserted between them.
    const page = src("app/(app)/deals/[id]/page.tsx");
    const hero = page.slice(page.indexOf("<DealHero"), page.indexOf("</DealHero>"));
    const tags = [...hero.matchAll(/<([A-Z]\w*)\b/g)].map((m) => m[1]);
    const panels = tags.slice(tags.indexOf("PlanStrip"));
    expect(panels.slice(0, 4)).toEqual(["PlanStrip", "InterestPanel", "PlausibilityPanel", "SandwichPanel"]);
    expect(panels.filter((t) => t === "PlausibilityPanel")).toHaveLength(1);
  });
});

