// Which brokerages send the deals (research pass 24, B13).
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { brokerDealFit, brokerScorecard, brokerageKey, brokerageOptions, dealFirms, partialText, rateText } from "./brokerage";
import type { BuyBoxCheck } from "./criteria";
import { BrokerageFilter } from "@/app/(app)/deals/brokerage-filter";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const withTeam = (...firms: string[]): ExtractionResult =>
  ({
    dealName: "X",
    assetClass: "multifamily",
    market: "",
    metrics: [],
    listingTeam: firms.map((firm, i) => ({ name: `Broker ${i}`, title: "", firm, phone: "", email: "", page: "" })),
  }) as unknown as ExtractionResult;

describe("brokerageKey", () => {
  it("files a firm's variants under one key, conservatively", () => {
    expect(brokerageKey("CBRE")).toBe("cbre");
    expect(brokerageKey("CBRE, Inc.")).toBe("cbre");
    expect(brokerageKey("Marcus & Millichap")).toBe(brokerageKey("Marcus and Millichap"));
    expect(brokerageKey("Walker & Dunlop, LLC")).toBe("walker and dunlop");
    // No guessed alias: an abbreviation is its own firm.
    expect(brokerageKey("JLL")).not.toBe(brokerageKey("Jones Lang LaSalle"));
  });

  it("reads a deal's firms once each, as printed", () => {
    expect(dealFirms(withTeam("CBRE", "CBRE, Inc.", "Newmark"))).toEqual([
      { key: "cbre", name: "CBRE" },
      { key: "newmark", name: "Newmark" },
    ]);
    expect(dealFirms(withTeam())).toEqual([]);
  });
});

describe("brokerScorecard", () => {
  it("counts the deals each firm sent, the fit over the judged and Go over the decided, a co-listing for each", () => {
    const cbre = [{ key: "cbre", name: "CBRE" }];
    const { rows, unnamed } = brokerScorecard([
      { firms: cbre, fit: "fits", verdict: "pass" },
      { firms: [{ key: "cbre", name: "CBRE, Inc." }], fit: "outside", verdict: "pass_on" },
      { firms: [...cbre, { key: "jll", name: "JLL" }], fit: null, verdict: null },
      { firms: [], fit: "fits", verdict: "pass" },
    ]);
    expect(unnamed).toBe(1);
    expect(rows[0]).toMatchObject({ key: "cbre", name: "CBRE", names: ["CBRE", "CBRE, Inc."], received: 3, judged: 2, fits: 1, decided: 2, go: 1 });
    expect(rows[0].fitRate).toBe(0.5);
    expect(rows[1]).toMatchObject({ key: "jll", received: 1, judged: 0, fitRate: null, goRate: null });
    expect(rateText(1, 2)).toBe("1 of 2 (50%)");
    expect(rateText(0, 0)).toBe("—");
  });
});

// Audit C8, M2: a deal that passed one criterion with the rest unchecked
// was counted as fitting the box, where the pipeline card prints it "Fit N ·
// 2 of 4 checked" — no call.
describe("a fit on part of the box", () => {
  const check = (label: string, status: BuyBoxCheck["status"]): BuyBoxCheck => ({ label, status, detail: "" }) as BuyBoxCheck;

  it("is no fit: counted apart, never in the judged deals", () => {
    const partly = brokerDealFit([check("Asset class", "pass"), check("Going-in cap", "unknown"), check("Target return", "unknown")]);
    expect(partly).toEqual({ fit: "fits", partial: true });
    const whole = brokerDealFit([check("Asset class", "pass"), check("Going-in cap", "pass")]);
    expect(whole).toEqual({ fit: "fits", partial: false });
    // A miss outright is a call however much was checked.
    const miss = brokerDealFit([check("Asset class", "miss"), check("Going-in cap", "unknown")]);
    expect(miss).toEqual({ fit: "outside", partial: true });
    expect(brokerDealFit([check("Going-in cap", "unknown")])).toEqual({ fit: null, partial: false });

    const cbre = [{ key: "cbre", name: "CBRE" }];
    const { rows } = brokerScorecard([
      { firms: cbre, ...whole, verdict: null },
      { firms: cbre, ...partly, verdict: null },
      { firms: cbre, ...brokerDealFit([check("Asset class", "near"), check("Basis", "unknown")]), verdict: null },
      { firms: cbre, ...miss, verdict: null },
    ]);
    expect(rows[0]).toMatchObject({ received: 4, judged: 2, fits: 1, partial: 2 });
    expect(rateText(rows[0].fits, rows[0].judged)).toBe("1 of 2 (50%)");
    expect(partialText(rows[0].partial)).toBe("+2 checked on part of the box");
    expect(partialText(0)).toBe("");
  });
});

// Audit C8, L8: the scorecard named a firm by the name printed most often,
// the pipeline's filter by the first seen.
describe("a firm's name", () => {
  it("is the one printed most often, on the scorecard and the filter alike", () => {
    const first = [{ key: "cbre", name: "CBRE, Inc." }];
    const often = [{ key: "cbre", name: "CBRE" }];
    const options = brokerageOptions([first, often, often]);
    expect(options).toEqual([{ key: "cbre", name: "CBRE", count: 3 }]);
    const { rows } = brokerScorecard([first, often, often].map((firms) => ({ firms, fit: null, verdict: null })));
    expect(rows[0].name).toBe(options[0].name);
  });

  it("the filter wraps and its select shrinks to a phone's row", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrokerageFilter, {
        firms: [{ key: "cw", name: "Cushman & Wakefield of Northern California, Inc.", count: 3 }],
        active: null,
        shown: 3,
        total: 3,
      }),
    );
    expect(html).toMatch(/<form[^>]*class="[^"]*flex-wrap[^"]*"/);
    expect(html).toMatch(/<select[^>]*class="[^"]*min-w-0 max-w-full/);
  });
});

describe("BrokerageFilter", () => {
  it("lists the firms with their counts, says what a chosen one leaves, and draws nothing with no firm", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrokerageFilter, {
        firms: [
          { key: "cbre", name: "CBRE", count: 4 },
          { key: "jll", name: "JLL", count: 1 },
        ],
        active: "cbre",
        shown: 4,
        total: 9,
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(visibleText(html)).toContain("CBRE (4)");
    expect(visibleText(html)).toContain("4 of 9 deals offered by CBRE");
    expect(renderToStaticMarkup(React.createElement(BrokerageFilter, { firms: [], active: null, shown: 0, total: 0 }))).toBe("");
  });
});
