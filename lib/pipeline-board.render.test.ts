// The pipeline's board (app/(app)/deals/pipeline-board.tsx): a column a
// stage in ladder order, each headed by its stage and its count, the deals
// the other views show as compact cards under their own stage, each with
// the stage select that moves it — drawn by the Pipeline itself on a
// fixture, the way the page hands it over, and its markup linted.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));

// The server actions the pipeline binds to forms — never called in a render.
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return { createDeal: noop, createDealFromBatch: noop, createManualDeal: noop, createSampleDeal: noop, setStage: noop };
});

import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { PipelineBoard } from "@/app/(app)/deals/pipeline-board";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "@/lib/deal-allowance";
import { boardColumns, landingView, remembersView } from "@/lib/pipeline-view";
import { STAGES, STAGE_LABEL } from "@/lib/stages";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const TODAY = "2026-09-28";

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
  card({ id: "a", name: "Alder Court", verdict: "pass", slots: { cap: "5.6%", price: "$68,000,000", yoc: null }, offersDue: "2026-09-30" }),
  card({ id: "b", name: "Birch Tower", assetClass: "office", stage: "tracking", verdict: "caution", slots: { cap: null, price: "$20,000,000", yoc: "11.67%", plan: true } }),
  card({ id: "c", name: "Cedar Yards", stage: "screening", jobStatus: "running" }),
  card({ id: "d", name: "Dogwood Lofts", stage: "loi_submitted", verdict: "pass", slots: { cap: "6.0%", price: "$14,000,000", yoc: null } }),
  card({ id: "e", name: "Elm Self Storage", assetClass: "self_storage", stage: "closed", verdict: "pass", slots: { cap: "6.4%", price: "$9,800,000", yoc: null } }),
  card({ id: "f", name: "Fir Street Office", assetClass: "office", stage: "dead", verdict: "pass_on" }),
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
        todayIso: TODAY,
        initialView: "board",
        ...over,
      }),
    ),
  );

/** The board's columns as drawn: each column's stage, its heading's words,
 *  its count, and the deals under it in order. */
function columnsOf(html: string) {
  return html
    .split(/(?=<section [^>]*data-board-column=")/)
    .slice(1)
    .map((part) => ({
      stage: part.match(/data-board-column="([^"]+)"/)?.[1],
      heading: visibleText(part.match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? "").replace(/\s+/g, " ").trim(),
      count: Number(part.match(/data-board-count="[^"]*">(\d+)/)?.[1]),
      deals: [...part.matchAll(/data-board-card="([^"]+)"/g)].map((m) => m[1]),
      part,
    }));
}

describe("the pipeline as a board", () => {
  it("draws a column a stage in ladder order, each with its count and its deals, each deal with its stage select", () => {
    const html = render();
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(html).toContain('data-view="board"');
    expect(html).not.toContain('data-view="cards"');
    expect(html).not.toContain('data-view="list"');
    expect(html).not.toContain('data-view="map"');

    const cols = columnsOf(html);
    // Every live stage and Closed, in the ladder's order, empty ones too —
    // and no Dead column while the dead deals are hidden.
    expect(cols.map((c) => c.stage)).toEqual(["screening", "tracking", "active_pursuit", "loi_submitted", "under_contract", "closed"]);
    expect(cols.map((c) => c.count)).toEqual([2, 1, 0, 1, 0, 1]);
    expect(cols.map((c) => c.deals)).toEqual([["a", "c"], ["b"], [], ["d"], [], ["e"]]);
    for (const c of cols) {
      expect(c.heading, c.stage).toBe(`${STAGE_LABEL[c.stage as keyof typeof STAGE_LABEL]} ${c.count} ${c.count === 1 ? "deal" : "deals"}`);
      if (c.count === 0) expect(visibleText(c.part)).toContain("No deals here");
    }
    expect(html).not.toContain('data-board-card="f"');

    // Each card: its link, its call, and the stage select set at its stage.
    for (const c of cols) {
      for (const id of c.deals) {
        const one = c.part.split(/(?=<li [^>]*data-board-card=")/).find((p) => p.includes(`data-board-card="${id}"`)) ?? "";
        const link = one.match(/<a [^>]*>/)?.[0] ?? "";
        expect(link, id).toContain(`href="/deals/${id}"`);
        expect(link, id).toContain("data-deal-nav");
        const select = one.match(/<select[^>]*aria-label="Deal stage"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
        expect(select, id).not.toBe("");
        expect(select.match(/<option value="([^"]*)" selected="">/)?.[1], id).toBe(c.stage);
      }
    }
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("$68.0M");
    expect(text).toContain("5.6% cap");
    expect(text).toContain("11.67%");
    expect(text).toContain("Reading the OM…");

    // The board scrolls inside its own named region, a Tab stop, never the
    // page.
    const region = html.match(/<div [^>]*data-view="board"[^>]*>/)?.[0] ?? "";
    for (const attr of ['role="region"', 'aria-label="The pipeline as a board, a column a stage"', 'tabindex="0"', 'class="relative overflow-x-auto']) {
      expect(region, attr).toContain(attr);
    }
  });

  it("adds Dead last only where the dead filter shows it, and draws a filtered stage alone", () => {
    const dead = columnsOf(render({ filterQuery: "dead=1" }));
    expect(dead.map((c) => c.stage)).toEqual([...STAGES]);
    expect(dead.at(-1)!.deals).toEqual(["f"]);
    const tracking = columnsOf(render({ filterQuery: "stage=tracking" }));
    expect(tracking.map((c) => [c.stage, c.deals])).toEqual([["tracking", ["b"]]]);
    const onlyDead = columnsOf(render({ filterQuery: "stage=dead" }));
    expect(onlyDead.map((c) => [c.stage, c.deals])).toEqual([["dead", ["f"]]]);
  });

  it("presses Board in the view toggle", () => {
    expect(render()).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Board<\/button>/);
  });

  it("in compare mode a card is a toggle and no stage select is drawn", () => {
    // Compare mode is the reader's to turn on, so the board is drawn alone.
    const html = renderToStaticMarkup(
      React.createElement(PipelineBoard, {
        columns: [{ stage: "screening", deals: [DEALS[0], DEALS[2]] }],
        compareMode: true,
        selected: new Set(["a"]),
        onToggle: () => {},
        todayIso: TODAY,
        stageControl: () => React.createElement("select", { "aria-label": "Deal stage" }),
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<a ");
    expect([...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*data-deal-nav/g)].map((m) => m[1])).toEqual(["true", "false"]);
  });

  it("is remembered like the cards and the list, never like the map", () => {
    expect(landingView("board")).toBe("board");
    expect(remembersView("board")).toBe(true);
    expect(landingView("map")).toBe("cards");
    expect(boardColumns({ stageFilter: "all", showDead: false })).toEqual(STAGES.filter((s) => s !== "dead"));
    expect(boardColumns({ stageFilter: "all", showDead: true })).toEqual([...STAGES]);
    expect(boardColumns({ stageFilter: "closed", showDead: false })).toEqual(["closed"]);
    // A value no stage is stays the whole board, as the list's filter does.
    expect(boardColumns({ stageFilter: "nonsense", showDead: false })).toEqual(STAGES.filter((s) => s !== "dead"));
  });
});
