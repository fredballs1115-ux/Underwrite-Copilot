import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataNotices } from "@/app/data-notices";
import { RatesStrip } from "@/app/rates-strip";
import { MetroLive } from "@/app/market/metro-live";
import { readMetroRates, readRates, type RateRow } from "@/lib/live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "@/lib/live-rates.fixture";
import { BLS_NOTICE, DTCC_SOFR_SENTENCE, FRED_NOTICE, NY_FED_SOFR_NOTICE } from "./data-notices";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// Where the providers' notices are drawn (lib/data-notices holds their
// words): FRED's prominently on the application — in the footer every page
// draws and under the rates strip — as its API terms ask.

const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (text: string, phrase: string) => text.split(phrase).length - 1;

describe("the footer's notices", () => {
  it("are one paragraph in the footer's own words: FRED's notice, then the BLS's sentence", () => {
    const html = render(React.createElement(DataNotices, { className: "text-xs" }));
    const text = visibleText(html);
    expect(text.trim()).toBe(`${FRED_NOTICE} ${BLS_NOTICE}`);
    expect(html).toMatch(/^<p class="text-xs" data-qa="data-notices">/);
    expect((html.match(/<p\b/g) ?? []).length).toBe(1);
    // Words only: FRED's terms ask for the notice, never a logo.
    expect(html).not.toMatch(/<img|<svg/);
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("are drawn in every footer that frames a page of FRED's figures", () => {
    // The public pages' chrome (/tools and /market for a visitor), the
    // signed-in shell, and /demo's own footer — each inside its <footer>.
    for (const file of ["app/public-shell.tsx", "app/(app)/app-shell.tsx", "app/demo/page.tsx"]) {
      const src = readFileSync(file, "utf8");
      const footer = src.slice(src.indexOf("<footer"), src.indexOf("</footer>"));
      expect(footer, file).toContain("<DataNotices");
      expect(src, file).toContain('import { DataNotices } from "@/app/data-notices";');
    }
  });
});

describe("the rates strip's notice", () => {
  const html = render(React.createElement(RatesStrip, { rates: readRates(REAL_ROWS, FIXTURE_NOW), seeds: ["SOFR"] }));
  const text = visibleText(html);

  it("stands under the strip's figures, once", () => {
    expect(count(text, FRED_NOTICE)).toBe(1);
    // After every figure: the strip's last words.
    expect(text.trim().endsWith(FRED_NOTICE)).toBe(true);
    expect(html).toContain('data-qa="fred-notice"');
  });

  it("says nothing that implies the St. Louis Fed stands behind the site", () => {
    // The terms forbid stating or implying an endorsement; the notice says
    // the opposite, and nothing else on the strip names the bank.
    expect(count(text, "Federal Reserve Bank of St. Louis")).toBe(1);
    // (The providers' own notices say "endorse" in the negative; nothing
    // else on the strip may.)
    expect(text.replace(FRED_NOTICE, "").replace(NY_FED_SOFR_NOTICE, "")).not.toMatch(
      /endorse|certified|recommended|favored/i,
    );
  });
});

describe("the New York Fed's notice beside SOFR on the strip", () => {
  const rates = readRates(REAL_ROWS, FIXTURE_NOW);

  it("stands once under the money-market tiles that draw SOFR and its 30-day average", () => {
    const html = render(React.createElement(RatesStrip, { rates }));
    const text = visibleText(html);
    expect(rates.some((r) => r.meta.id === "SOFR")).toBe(true);
    expect(rates.some((r) => r.meta.id === "SOFR30DAYAVG")).toBe(true);
    expect(count(text, NY_FED_SOFR_NOTICE)).toBe(1);
    expect(count(text, DTCC_SOFR_SENTENCE)).toBe(1);
    // In the money-market group, after its tiles and before the folded
    // groups: beside the figures it covers.
    const money = text.indexOf("Money market");
    const notice = text.indexOf(NY_FED_SOFR_NOTICE);
    expect(money).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(text.indexOf("SOFR as of"));
    expect(notice).toBeLessThan(text.indexOf(FRED_NOTICE));
    expect(gluedWords(text)).toEqual([]);
  });

  it("is not drawn where no SOFR figure is", () => {
    const noSofr = rates.filter((r) => r.meta.id !== "SOFR" && r.meta.id !== "SOFR30DAYAVG");
    const text = visibleText(render(React.createElement(RatesStrip, { rates: noSofr })));
    expect(text).toContain("Money market");
    expect(text).not.toContain(NY_FED_SOFR_NOTICE);
  });
});

describe("the strip credits the publisher, FRED as the channel", () => {
  const text = visibleText(render(React.createElement(RatesStrip, { rates: readRates(REAL_ROWS, FIXTURE_NOW) })));

  it("names the New York Fed over SOFR, the Treasury over the HQM curve and Freddie Mac over its survey", () => {
    expect(text).toContain("SOFR as of Sep 21, 2026 · New York Fed via FRED");
    expect(text).toContain("30-day avg SOFR as of Sep 21, 2026 · New York Fed via FRED");
    expect(text).toMatch(/HQM corporate 10-yr as of [A-Z][a-z]{2} \d{4} · U\.S\. Treasury via FRED/);
    expect(text).toContain("30-yr fixed as of Sep 17, 2026 · Freddie Mac via FRED");
    // A Treasury tenor FRED publishes from the Board's release carries no tag.
    expect(text).toContain("10-yr Treasury as of Sep 17, 2026");
    expect(text).not.toContain("10-yr Treasury as of Sep 17, 2026 ·");
  });

  it("says the figures came through FRED, never that FRED published them all", () => {
    expect(text).toContain("pulled through FRED every weekday");
    expect(text).not.toContain("FRED, pulled every weekday");
  });
});

describe("the BLS's sentence under a figure read from the BLS's own API", () => {
  // Washington's rent index comes from the BLS directly (source "bls" in
  // data/fred-series.json), as the level; the page derives the change.
  const rentIndex: RateRow[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
    rentIndex.push({ series_id: "CUURS35ASEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
  }
  const unemployment: RateRow[] = [
    { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
    { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.8 },
  ];
  const panel = (rows: RateRow[]) =>
    render(React.createElement(MetroLive, { rates: readMetroRates("dc", rows, FIXTURE_NOW), metroId: "dc", metroName: "Washington DC" }));

  it("stands in the panel's note where such a tile is drawn, once", () => {
    const text = visibleText(panel([...unemployment, ...rentIndex]));
    expect(text).toContain("Rent CPI y/y as of Aug 2026 · BLS");
    expect(count(text, BLS_NOTICE)).toBe(1);
    // live-verify's #367 still finds its phrase.
    expect(text).toContain("comes from the BLS directly");
    expect(gluedWords(text)).toEqual([]);
  });

  it("is not said under a panel with no figure from the BLS's own API", () => {
    const text = visibleText(panel(unemployment));
    expect(text).toContain("Unemployment as of Jul 2026");
    expect(text).not.toContain(BLS_NOTICE);
  });
});
