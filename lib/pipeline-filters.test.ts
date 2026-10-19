import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return { createDeal: noop, createDealFromBatch: noop, createManualDeal: noop, createSampleDeal: noop, setStage: noop };
});

import {
  FILTER_PARAMS,
  NO_FILTERS,
  filterQueryFrom,
  filterQueryOf,
  readFilterQuery,
  sessionFilterQuery,
  withFilterQuery,
  type FilterOptions,
} from "./pipeline-filters";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "./deal-allowance";
import { a11yIssues } from "./render-lint";

const OPTIONS: FilterOptions = {
  assets: ["multifamily", "office"],
  markets: ["Dallas, TX", "Washington, DC (DC Proper / Fort Totten)"],
  fits: ["PURSUE", "outside", "checked:2/4"],
  onTeam: false,
};

describe("the filter part of an address", () => {
  it("keeps the filter keys alone, in one order, a repeated key's first value, nothing empty", () => {
    expect(filterQueryOf("?broker=cbre&stage=tracking&verdict=pass&new=1")).toBe("verdict=pass&stage=tracking");
    expect(filterQueryOf(new URLSearchParams("stage=a&stage=b"))).toBe("stage=a");
    expect(filterQueryOf({ stage: ["tracking", "dead"], market: "", error: "x" })).toBe("stage=tracking");
    expect(filterQueryOf({ asset: "x".repeat(201) })).toBe("");
    expect(filterQueryOf("")).toBe("");
    // The view is never a filter: a link cannot set the cards, list or map.
    expect(filterQueryOf("view=map")).toBe("");
    expect(FILTER_PARAMS).not.toContain("view");
  });

  it("is the same query on the server's searchParams and the browser's address", () => {
    const market = "Washington, DC (DC Proper / Fort Totten)";
    const search = `?${new URLSearchParams({ market, fit: "checked:2/4", broker: "jll" })}`;
    expect(filterQueryOf({ market, fit: "checked:2/4", broker: "jll" })).toBe(filterQueryOf(search));
  });
});

describe("reading a link's filters, each held to what the list can show", () => {
  it("reads every filter the list offers", () => {
    const q = "verdict=caution&stage=active_pursuit&asset=office&market=Dallas%2C+TX&fit=checked%3A2%2F4&dead=1";
    expect(readFilterQuery(q, OPTIONS)).toEqual({
      verdict: "caution",
      stage: "active_pursuit",
      asset: "office",
      market: "Dallas, TX",
      fit: "checked:2/4",
      sharing: "all",
      dead: true,
    });
  });

  it("drops a value no option names", () => {
    const q = "verdict=maybe&stage=underwriting&asset=castle&market=Atlantis&fit=WATCH&dead=yes&sharing=shared";
    expect(readFilterQuery(q, OPTIONS)).toEqual(NO_FILTERS);
    expect(readFilterQuery("", OPTIONS)).toEqual(NO_FILTERS);
    expect(readFilterQuery("not a query at all", OPTIONS)).toEqual(NO_FILTERS);
  });

  it("reads the sharing filter only on a team, and the low band's old word as its new one", () => {
    expect(readFilterQuery("sharing=personal", { ...OPTIONS, onTeam: true }).sharing).toBe("personal");
    expect(readFilterQuery("sharing=personal", OPTIONS).sharing).toBe("all");
    expect(readFilterQuery("sharing=everyone", { ...OPTIONS, onTeam: true }).sharing).toBe("all");
    expect(readFilterQuery("fit=PASS", { ...OPTIONS, fits: ["LOW"] }).fit).toBe("LOW");
  });

  it("writes a default as nothing, so an unfiltered list is a bare link, and reads back what it wrote", () => {
    expect(filterQueryFrom(NO_FILTERS)).toBe("");
    const f = { ...NO_FILTERS, stage: "tracking", market: "Dallas, TX", dead: true };
    expect(filterQueryFrom(f)).toBe("stage=tracking&market=Dallas%2C+TX&dead=1");
    expect(readFilterQuery(filterQueryFrom(f), OPTIONS)).toEqual(f);
    expect(filterQueryOf(filterQueryFrom(f))).toBe(filterQueryFrom(f));
  });

  it("replaces the filter keys in an address and keeps every other one", () => {
    expect(withFilterQuery("?broker=cbre&stage=dead&verdict=pass", "stage=tracking")).toBe("broker=cbre&stage=tracking");
    expect(withFilterQuery("broker=cbre&stage=dead", "")).toBe("broker=cbre");
    expect(withFilterQuery("", "")).toBe("");
  });

  it("reads the filters the tab's session kept under their old names", () => {
    expect(sessionFilterQuery({ verdict: "pass", stage: "all", mfit: "PURSUE", showDead: true, collapsed: { dead: true } })).toBe(
      "verdict=pass&fit=PURSUE&dead=1",
    );
    expect(sessionFilterQuery(null)).toBe("");
    expect(sessionFilterQuery("verdict=pass")).toBe("");
    expect(sessionFilterQuery({ verdict: 3, showDead: "yes" })).toBe("");
  });
});

describe("the pipeline's server HTML opens on the filters its address asks for", () => {
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
  const deals = [
    card({ id: "a", name: "Alder Court", verdict: "pass", score: 82, mandateVerdict: "PURSUE", fit: "fits" }),
    card({ id: "b", name: "Birch Tower", assetClass: "office", stage: "tracking", verdict: "caution", market: "Baltimore, MD" }),
    card({ id: "c", name: "Cedar Yards", stage: "dead", verdict: "pass_on" }),
  ];
  const render = (filterQuery: string, over: object = {}) =>
    renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(Pipeline, {
          deals,
          errorMessage: null,
          billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) },
          todayIso: "2026-09-28",
          filterQuery,
          ...over,
        }),
      ),
    );
  const shown = (html: string) => [...html.matchAll(/<a\b[^>]*data-deal-nav="[^"]*"[^>]*>/g)].map((m) => m[0].match(/href="\/deals\/([^"]+)"/)?.[1]);
  const selected = (html: string, label: string) =>
    html.match(new RegExp(`<select[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option value="([^"]*)" selected="">/)?.[1];

  it("a bare link shows every live deal, the dead behind their toggle", () => {
    const html = render("");
    expect(shown(html)).toEqual(["a", "b"]);
    expect(selected(html, "Filter by stage")).toBe("all");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("a stage, a market, an asset class and a fit narrow the list, and the selects say so", () => {
    const stage = render("stage=tracking");
    expect(shown(stage)).toEqual(["b"]);
    expect(selected(stage, "Filter by stage")).toBe("tracking");
    expect(stage).toContain("1 of 3 shown");
    expect(a11yIssues(stage)).toEqual([]);

    const market = render(filterQueryFrom({ market: "Baltimore, MD" }));
    expect(shown(market)).toEqual(["b"]);
    expect(selected(market, "Filter by market")).toBe("Baltimore, MD");

    expect(shown(render("asset=office"))).toEqual(["b"]);
    expect(shown(render("fit=PURSUE"))).toEqual(["a"]);
    expect(selected(render("fit=PURSUE"), "Filter by mandate fit")).toBe("PURSUE");
  });

  it("a verdict presses its chip, and dead=1 shows the dead", () => {
    const html = render("verdict=pass");
    expect(shown(html)).toEqual(["a"]);
    const chips = [...html.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>(\d+) ([^<]+)<\/button>/g)].map((m) => [m[3], m[1]]);
    expect(chips).toContainEqual(["Go", "true"]);
    expect(chips.filter(([w]) => w !== "Go").length).toBeGreaterThan(0);
    expect(chips.filter(([w, on]) => w !== "Go" && on === "true")).toEqual([]);
    const dead = render("dead=1");
    expect(shown(dead)).toEqual(["a", "b", "c"]);
    expect(dead).toContain("Hide dead");
  });

  it("drops what the list cannot show, and never takes the view from a link", () => {
    expect(shown(render("stage=underwriting&market=Atlantis&asset=castle"))).toEqual(["a", "b"]);
    // The view is the reader's cookie, whatever the link says.
    const list = render("stage=tracking&view=cards", { initialView: "list" });
    expect(list).toContain('data-view="list"');
    expect(list).not.toContain('data-view="cards"');
    expect(shown(list)).toEqual(["b"]);
  });
});
