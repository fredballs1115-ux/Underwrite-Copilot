import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataNotices } from "@/app/data-notices";
import { RatesStrip } from "@/app/rates-strip";
import { readRates } from "@/lib/live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "@/lib/live-rates.fixture";
import { FRED_NOTICE } from "./data-notices";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// Where the providers' notices are drawn (lib/data-notices holds their
// words): FRED's prominently on the application — in the footer every page
// draws and under the rates strip — as its API terms ask.

const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (text: string, phrase: string) => text.split(phrase).length - 1;

describe("the footer's notices", () => {
  it("are one paragraph in the footer's own words, FRED's notice among them", () => {
    const html = render(React.createElement(DataNotices, { className: "text-xs" }));
    const text = visibleText(html);
    expect(text).toContain(FRED_NOTICE);
    expect(html).toMatch(/^<p class="text-xs" data-qa="data-notices">/);
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
    expect(text.replace(FRED_NOTICE, "")).not.toMatch(/endorse|certified|recommended|favored/i);
  });
});
