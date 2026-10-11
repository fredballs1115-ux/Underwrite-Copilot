// The comps readout (the /comps page and the deal page's panel), rendered on
// fixtures: the price track draws a dot a sale, the middle only past the
// floor, the subject only inside the readout's band; the table numbers each
// row as its pin and folds the sales past the nearest twelve; the text and
// markup pass the render lint.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompsResultView } from "../app/(app)/comps/result-view";
import type { RecordComp, RecordCompsResult } from "./public-comps/core";
import { compStats } from "./public-comps/core";
import type { SubjectForCall } from "./public-comps/vs-median";
import { DB_MARKETS, marketNames } from "./public-comps/db-markets";
import { CoverageChips } from "../app/(app)/comps/coverage-chips";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

const sale = (i: number, over: Partial<RecordComp> = {}): RecordComp => ({
  address: `${100 + i} Walnut St`,
  lat: 39.95 + i * 0.001,
  lng: -75.16,
  saleDate: `2026-0${(i % 6) + 1}-15`,
  price: 400_000 + i * 25_000,
  sqft: i % 2 ? 1_800 : null,
  propertyType: "RESIDENTIAL",
  distanceKm: 0.2 + i * 0.05,
  sourceUrl: `https://property.phila.gov/?p=${i}`,
  ...over,
});

const result = (comps: RecordComp[]): RecordCompsResult => ({
  status: "ok",
  providerId: "philadelphia_opa",
  providerName: "Philadelphia OPA",
  datasetUrl: "https://opendataphilly.org/",
  subject: { lat: 39.95, lng: -75.16, label: "1500 Walnut St, Philadelphia, PA" },
  params: { radiusKm: 1.6, monthsBack: 24, classFilter: "multifamily" },
  comps,
  stats: compStats(comps),
  retrievedAt: "2026-10-08T12:00:00Z",
  note: "Public records.",
});

/** An apartment building priced at `price`, one building at a building's
 *  price — the deal the call may be made for. */
const apartments = (price: number | null, over: Partial<SubjectForCall> = {}): SubjectForCall => ({
  price,
  perSf: null,
  classKey: "multifamily",
  classLabel: "Multifamily",
  portfolio: false,
  planOrLand: false,
  ...over,
});

const draw = (r: RecordCompsResult, subject: number | SubjectForCall | null = null) =>
  renderToStaticMarkup(
    React.createElement(CompsResultView, {
      result: r,
      subject: typeof subject === "number" ? apartments(subject) : subject,
    }),
  );

const count = (html: string, bar: string) => html.split(`data-bar="${bar}"`).length - 1;

describe("the comps readout as pictures", () => {
  it("draws a dot a sale, the middle and the subject, and passes the lint", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps), 500_000);
    dumpView("comps-readout", `<section class="rounded-xl border border-line bg-surface p-4">${html}</section>`);
    expect(count(html, "comps-sale")).toBe(6);
    expect(count(html, "comps-median")).toBe(1);
    expect(count(html, "comps-subject")).toBe(1);
    expect(count(html, "comps-quarter")).toBeGreaterThan(0);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("draws no middle on two sales and no subject outside the band", () => {
    const html = draw(result([sale(0), sale(1)]), 68_000_000);
    expect(count(html, "comps-median")).toBe(0);
    expect(count(html, "comps-subject")).toBe(0);
  });

  it("says an empty answer from the property database as none found there, never no source", () => {
    const html = draw({
      status: "no_sales",
      providerId: "ingested_db",
      providerName: "Ingested public deed records (property database)",
      datasetUrl: "",
      subject: { lat: 40.69, lng: -73.99, label: "100 Court St, Brooklyn, NY" },
      params: { radiusKm: 4.8, monthsBack: 36, classFilter: "all sales" },
      comps: [],
      found: 0,
      dbMarket: "New York City",
      retrievedAt: "2026-10-08T12:00:00Z",
      note: "Public records.",
    });
    const text = visibleText(html);
    expect(text).toContain("No recorded sales within 3 mi of the address in the 36 months to Oct 8, 2026, in the property database's New York City records.");
    expect(text).not.toContain("wired");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says a search measured from an area's centre as that", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const r = result(comps);
    const html = draw({ ...r, subject: { ...r.subject!, precision: "area" } });
    expect(visibleText(html)).toContain("placed only at the centre of the area it names, not at the building");
    expect(visibleText(draw(r))).not.toContain("not at the building");
  });

  it("makes the call in a neutral tone only for the deal's own kind, one building at a building's price", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const ok = draw(result(comps), 500_000);
    expect(visibleText(ok)).toMatch(/This deal's price of \$500,000 is \d+% (above|below) the median of the 6 recorded sales\./);
    expect(ok).not.toMatch(/text-kill|text-pass/);
    const office = visibleText(draw(result(comps), apartments(500_000, { classKey: "office", classLabel: "Office" })));
    expect(office).not.toContain("This deal's");
    expect(office).toContain("filed as multifamily, not office");
    const all = visibleText(draw({ ...result(comps), params: { radiusKm: 1.6, monthsBack: 24, classFilter: "all sales" } }, 500_000));
    expect(all).toContain("These are all recorded sales here");
    expect(visibleText(draw(result(comps), apartments(500_000, { portfolio: true })))).toContain("portfolio");
    expect(visibleText(draw(result(comps), apartments(500_000, { planOrLand: true })))).toContain("a plan's or land's");
    expect(count(draw(result(comps), apartments(500_000, { portfolio: true })), "comps-subject")).toBe(0);
  });

  it("says the $/SF median with the count of sales that state an area, under the floors", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps))).replace(/\s+/g, " ");
    expect(text).toMatch(/median \$\d{3}\/SF on 3 of 6 sales, thin/);
    // two sales stating an area make no $/SF middle at all
    const two = Array.from({ length: 4 }, (_, i) => sale(i));
    expect(visibleText(draw(result(two)))).not.toContain("/SF on");
    // every sale states one
    const all = Array.from({ length: 5 }, (_, i) => sale(i, { sqft: 2_000 }));
    expect(visibleText(draw(result(all))).replace(/\s+/g, " ")).toMatch(/median \$\d{3}\/SF on all 5 sales/);
  });

  it("compares price a square foot with its own count where both state one", () => {
    // sales 1, 3, 5 state 1,800 SF: three sales behind the $/SF median
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps), apartments(500_000, { perSf: 250 })));
    expect(text).toMatch(/This deal's \$250\/SF is \d+% (above|below) the median of the 3 sales that state an area\./);
  });

  it("dates the window and the bars by the search's day, and the database's by its ingest", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps))).replace(/\s+/g, " ");
    expect(text).toContain("the 24 months to Oct 8, 2026");
    expect(text).toContain("Sales by quarter, to Oct 8, 2026");
    const db = visibleText(
      draw({ ...result(comps), providerId: "ingested_db", ingestedThrough: "2026-08-31" }),
    ).replace(/\s+/g, " ");
    expect(db).toContain("Sales by quarter, to Aug 31, 2026");
    expect(db).toContain("its records last ingested Aug 31, 2026");
  });

  it("names only the property database's markets that hold sales, on the chips and in the no-source line", () => {
    const none = renderToStaticMarkup(React.createElement(CoverageChips, { dbMarkets: [] }));
    expect(visibleText(none)).not.toContain("property database");
    const held = DB_MARKETS.filter((m) => m.metroId === "nyc" || m.metroId === "boston");
    const two = renderToStaticMarkup(React.createElement(CoverageChips, { dbMarkets: held }));
    expect(two.split('data-qa="coverage-db"').length - 1).toBe(2);
    expect(visibleText(two)).toContain("New York City · property database");
    expect(a11yIssues(two)).toEqual([]);
    const line = marketNames(held);
    expect(line).toBe("New York City and Boston");
    const html = renderToStaticMarkup(
      React.createElement(CompsResultView, {
        result: { status: "no_provider", comps: [], retrievedAt: "2026-10-08T12:00:00Z", note: "Public records." },
        dbMarketsLine: line,
      }),
    );
    expect(visibleText(html)).toContain("; in the property database: New York City and Boston");
  });

  it("says a failed pull in its own words, never the source's or the operator's route", () => {
    const html = draw({
      status: "provider_error",
      error: "philly_opa: HTTP 502 — <html>trace</html>",
      comps: [],
      retrievedAt: "2026-10-08T12:00:00Z",
      note: "Public records.",
    });
    const text = visibleText(html);
    expect(text).toContain("did not answer this pull");
    expect(text).not.toMatch(/trace|HTTP 502|\/api\/comps\/health/);
    const none = visibleText(draw({ ...result([]), status: "no_sales", stats: undefined }));
    expect(none).not.toMatch(/widen|retrying later/);
  });

  it("shows the units, a price a unit and the parties where the record states them, and flags one day's buyer and price", () => {
    const comps = [
      sale(0, { units: 12, price: 2_400_000, buyer: "Acme LLC", seller: "Old Owner", deedType: "WD" }),
      sale(1, { units: 12, price: 2_400_000, buyer: "Acme LLC", saleDate: "2026-01-15" }),
      sale(2, { saleDate: "2026-01-15", buyer: "Acme LLC", price: 2_400_000 }),
      sale(3),
    ];
    comps[0].saleDate = "2026-01-15";
    const html = draw(result(comps));
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("$/unit");
    expect(text).toContain("$200,000");
    expect(text).toContain("Buyer Acme LLC · seller Old Owner · deed type WD, as recorded");
    expect(html.split('data-qa="comps-shared-deed"').length - 1).toBe(3);
    expect(text).toContain("possibly one deed across 3 parcels");
    expect(text).not.toMatch(/arm's-length transfer|non-arm/i);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    // no units stated: no units column
    expect(visibleText(draw(result([sale(0), sale(1), sale(2)])))).not.toContain("$/unit");
  });

  it("numbers the rows as their pins and folds the sales past twelve", () => {
    const comps = Array.from({ length: 15 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps)));
    expect(text).toContain("The 12 nearest");
    expect(text).toContain("Show all 15");
    expect(text).toContain("Copy as table");
  });
});
