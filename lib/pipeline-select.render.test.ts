// The pipeline's select mode (app/(app)/deals/pipeline-select.tsx), drawn
// by the Pipeline itself on a fixture in each view that lists deals: a
// labelled checkbox a deal, named for the deal and outside its link, in the
// stage select's place; the bar with the count picked, "Move to stage…" and
// "Mark dead", carrying the picks the page shows; the markup linted.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));

// The server actions the pipeline binds to forms — never called in a render.
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return { createDeal: noop, createDealFromBatch: noop, createManualDeal: noop, createSampleDeal: noop, setStage: noop, bulkSetStage: noop };
});

import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { SelectBar } from "@/app/(app)/deals/pipeline-select";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "@/lib/deal-allowance";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const card = (over: Partial<DealCard> & Pick<DealCard, "id" | "name">): DealCard => ({
  assetClass: "multifamily",
  createdAt: "2026-09-01T12:00:00Z",
  verdict: null,
  stage: "screening",
  addedBy: null,
  fit: null,
  score: null,
  mandateVerdict: null,
  market: "Dallas, TX",
  coveredMarket: null,
  offersDue: null,
  slots: { cap: null, price: null, yoc: null },
  jobStatus: null,
  hasAddress: false,
  ...over,
});

const DEALS: DealCard[] = [
  card({ id: "a", name: "Alder Court", verdict: "pass", slots: { cap: "5.6%", price: "$68,000,000", yoc: null } }),
  card({ id: "b", name: "Birch Tower", assetClass: "office", stage: "tracking", verdict: "caution" }),
  card({ id: "c", name: "Cedar Yards", stage: "loi_submitted" }),
  // Dead, so hidden until asked for: a pick of it is no pick the bar carries.
  card({ id: "f", name: "Fir Street Office", assetClass: "office", stage: "dead" }),
];

const render = (over: object = {}) =>
  renderToStaticMarkup(
    React.createElement(
      ToastProvider,
      null,
      React.createElement(Pipeline, {
        deals: DEALS,
        errorMessage: null,
        billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) },
        todayIso: "2026-09-28",
        ...over,
      }),
    ),
  );

/** Each checkbox with the label round it: the deal it picks, whether it is
 *  ticked, and the label's words. */
function boxesOf(html: string) {
  return [...html.matchAll(/<label\b[^>]*>(<input\b[^>]*type="checkbox"[^>]*>)([\s\S]*?)<\/label>/g)].map((m) => ({
    deal: m[1].match(/data-select-deal="([^"]+)"/)?.[1] ?? null,
    checked: /\schecked=""/.test(m[1]),
    label: visibleText(m[2]).replace(/\s+/g, " ").trim(),
  }));
}

describe("select mode", () => {
  for (const initialView of ["cards", "list", "board"] as const) {
    it(`gives every deal shown a labelled checkbox in the ${initialView} view, the picked ones ticked`, () => {
      const html = render({ initialView, initialSelect: { picked: ["a", "c", "f"] } });
      const boxes = boxesOf(html);
      expect(boxes.map((b) => b.deal)).toEqual(["a", "b", "c"]);
      expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
      for (const b of boxes) {
        const name = DEALS.find((d) => d.id === b.deal)!.name;
        // The label names the deal; "Select" shows beside the box where
        // there is room, and is hidden from a screen reader there.
        expect(b.label).toMatch(new RegExp(`Select ${name}$`));
      }
      // The deal's link stays, outside the box: a control inside an anchor
      // is invalid, and "j" / "k" still step through the links.
      expect([...html.matchAll(/<a\b[^>]*data-deal-nav[^>]*>[\s\S]*?<\/a>/g)].every((m) => !m[0].includes("<input"))).toBe(true);
      // The stage select is the bar's while the mode is on.
      expect(html).not.toContain('aria-label="Deal stage"');
      expect(a11yIssues(html)).toEqual([]);
      expect(gluedWords(visibleText(html))).toEqual([]);
    });
  }

  it("draws the bar with the count picked among the deals shown, and the picks it would send", () => {
    const html = render({ initialView: "list", initialSelect: { picked: ["a", "c", "f"] } });
    expect(html).toMatch(/data-qa="select-mode"[^>]*>Done selecting<|aria-pressed="true"[^>]*data-qa="select-mode"/);
    const from = html.indexOf("data-select-bar");
    const bar = html.slice(from, html.indexOf("</p>", html.indexOf('data-qa="select-said"', from)));
    expect(visibleText(bar.slice(0, bar.indexOf("</p>") + 4))).toContain("2 selected");
    // Both forms carry the two shown picks — never the dead deal the list hides.
    const sent = [...bar.matchAll(/<input type="hidden" name="dealId" value="([^"]+)"/g)].map((m) => m[1]);
    expect(sent).toEqual(["a", "c", "a", "c"]);
    expect(bar).toContain('<input type="hidden" name="stage" value="dead"/>');
    expect(bar).toContain("Move to stage…");
    expect(bar).toMatch(/<button type="submit"[^>]*>Mark dead<\/button>/);
    // "Move to stage…" lists the live rungs; "Mark dead" is the way to Dead.
    const options = [...bar.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    expect(options).toEqual(["", "screening", "tracking", "active_pursuit", "loi_submitted", "under_contract", "closed"]);
  });

  it("asks for a pick before it acts", () => {
    const html = renderToStaticMarkup(React.createElement(SelectBar, { ids: [], apply: async () => ({ ok: false as const, error: "none" as const }), onClear: () => {}, onDone: () => {} }));
    expect(visibleText(html)).toContain("Select deals to move them together.");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Mark dead<\/button>/);
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Move<\/button>/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("is off until asked for, and the Select button sits beside Compare", () => {
    const html = render({ initialView: "cards" });
    expect(boxesOf(html)).toEqual([]);
    expect(html).not.toContain("data-select-bar");
    expect(html).toMatch(/data-qa="select-mode"[^>]*>Select<\/button><button[^>]*>Compare<\/button>/);
  });

  it("keeps its UI in its own module, the pipeline only wiring it", () => {
    const src = readFileSync("app/(app)/deals/pipeline-select.tsx", "utf8");
    // No server action is imported there: the card draws its box through
    // `selectBoxFor`, and the homepage's card loads no action.
    expect(src).not.toMatch(/from "\.\/actions"/);
    expect(readFileSync("app/(app)/deals/deal-tile.tsx", "utf8")).not.toMatch(/from "\.\/pipeline-select"/);
    expect(readFileSync("app/(app)/deals/pipeline.tsx", "utf8")).toMatch(/apply=\{bulkSetStage\}/);
  });
});
