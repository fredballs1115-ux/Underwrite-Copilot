// Research pass 36's page-level layout fixes — the signed-in pages and the
// shared screen at a phone's width — held at the markup a static render
// gives, and at the source where a render cannot reach (an observer, the
// order of a page's own panels).
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// The toolbar's controls read the router's hooks — never called in a render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals/d1",
  useSearchParams: () => new URLSearchParams(),
}));

import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { ShareControl } from "@/app/(app)/deals/[id]/share-control";
import { DealActions } from "@/app/(app)/deals/[id]/deal-actions";
import { StageSelect } from "@/app/(app)/deals/[id]/stage-select";
import { OffersDueControl } from "@/app/(app)/deals/offers-due";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

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

describe("the toolbar on a phone (research pass 36, F8)", () => {
  // The page's own tools and controls: the six tools wrapped to three rows
  // at 390 and each control took a row of its own, 251px before a panel.
  const tool = (href: string, label: string) => h("a", { href, className: "rounded-lg border border-line px-3 py-1.5 text-xs font-medium" }, label);
  const html = renderToStaticMarkup(
    h(DealHero, {
      title: "The Maddox",
      subtitle: "Philadelphia, PA · Multifamily",
      figures: FIGURES,
      actions: h(
        React.Fragment,
        null,
        h(ShareControl, { dealId: "d1", shares: [], appUrl: "https://example.com" }),
        tool("/api/deals/d1/memo", "IC memo"),
        tool("/api/deals/d1/report", "Full report"),
        tool("/api/deals/d1/underwrite.xlsx", "Underwrite model"),
        tool("/deals/d1/rent-roll", "Rent roll"),
        tool("/deals/d1/valuations", "Valuations"),
      ),
      controls: h(
        React.Fragment,
        null,
        h(OffersDueControl, { dealId: "d1", value: "2026-10-15", today: "2026-10-05", fromMemorandum: "p. 2", calendarHref: "/api/deals/d1/offers-due.ics" }),
        h(StageSelect, { dealId: "d1", stage: "screening" }),
        h(DealActions, { dealId: "d1", dealName: "The Maddox" }),
      ),
    }),
  );
  /** The classes of a fragment's first tag. */
  const classesOf = (fragment: string) => (/^<[a-z]+[^>]*? class="([^"]*)"/.exec(fragment)?.[1] ?? "").split(" ");
  /** The fragment from its n-th inner `<div` on. */
  const nthDiv = (fragment: string, n: number) => {
    let at = 0;
    for (let i = 0; i < n; i++) at = fragment.indexOf("<div", at + 1);
    return fragment.slice(at);
  };

  it("puts the tools in one row and the controls in another, each scrolling sideways under a faded edge", () => {
    expect(a11yIssues(html), "a11y toolbar").toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    const tools = elementWith(html, 'data-hero-row="tools"');
    const controls = elementWith(html, 'data-hero-row="controls"');
    for (const name of ["Share", "IC memo", "Full report", "Underwrite model", "Rent roll", "Valuations"]) expect(tools, name).toContain(name);
    expect(controls).toContain('aria-label="Call-for-offers date"');
    expect(controls).toContain('aria-label="Deal stage"');
    expect(controls).toContain('aria-label="Deal actions"');
    for (const row of [tools, controls]) {
      // The row's scroller: sideways below sm, clear of the fade when the
      // keyboard lands on a control, and no box at all from sm.
      expect(classesOf(nthDiv(row, 1))).toEqual(expect.arrayContaining(["max-sm:overflow-x-auto", "max-sm:scroll-pr-8", "sm:contents"]));
      expect(classesOf(nthDiv(row, 2))).toEqual(expect.arrayContaining(["flex", "max-sm:w-max", "max-sm:pr-8"]));
      // The tab strip's 1.75rem fade, drawn over the row and hidden from a
      // screen reader and from sm — never a mask, which would clip the share
      // panel and the deal's menu that open out of these rows.
      expect(row).toMatch(/<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 right-0 w-7 [^"]*sm:hidden"><\/span>/);
      expect(row).not.toContain("mask-image");
    }
    // From sm the tools are the toolbar's own items again and the controls
    // sit at its end, wrapping as before.
    expect(classesOf(tools)).toEqual(expect.arrayContaining(["relative", "sm:contents"]));
    expect(classesOf(nthDiv(tools, 2))).toContain("sm:contents");
    expect(classesOf(controls)).toEqual(expect.arrayContaining(["relative", "sm:ml-auto"]));
    expect(classesOf(nthDiv(controls, 2))).toEqual(expect.arrayContaining(["sm:flex-wrap", "sm:justify-end"]));
    const bar = elementWith(html, "[grid-area:actions]");
    expect(classesOf(bar)).toEqual(expect.arrayContaining(["flex", "flex-col", "sm:flex-row", "sm:flex-wrap", "sm:items-center"]));
  });

  it("opens the share panel and the deal's menu across their row on a phone, never inside the scroll", () => {
    // The row is their containing block below sm (positioned, outside the
    // scroller); from sm each control is its own again.
    expect(html).toMatch(/<div class="sm:relative"><button[^>]*aria-expanded="false"[^>]*title="Share a read-only view/);
    expect(html).toMatch(/<div class="sm:relative"><button[^>]*aria-label="Deal actions"/);
    // The share panel opens from the button's left edge — the toolbar's
    // first, which the right-anchored panel had run 206px off a phone's
    // left edge — and across the whole row on a phone.
    const share = src("app/(app)/deals/[id]/share-control.tsx");
    expect(share).toMatch(/className="absolute left-0 z-20 mt-2 w-80 [^"]*max-sm:right-0 max-sm:w-auto"/);
    expect(share).not.toMatch(/absolute right-0 z-20/);
    // A keyboard's focus is brought clear of the fade: Chrome's own left a
    // control the row showed in part where it was. A tap's is not moved.
    const row = src("app/(app)/deals/[id]/tool-row.tsx");
    expect(row).toMatch(/target\.matches\(":focus-visible"\)/);
    expect(row).toMatch(/scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
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

