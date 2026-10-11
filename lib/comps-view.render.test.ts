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
    expect(text).toContain("No recorded sales within 3 mi of the address in the last 36 months, in the property database's New York City records.");
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

  it("compares price a square foot with its own count where both state one", () => {
    // sales 1, 3, 5 state 1,800 SF: three sales behind the $/SF median
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps), apartments(500_000, { perSf: 250 })));
    expect(text).toMatch(/This deal's \$250\/SF is \d+% (above|below) the median of the 3 sales that state an area\./);
  });

  it("numbers the rows as their pins and folds the sales past twelve", () => {
    const comps = Array.from({ length: 15 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps)));
    expect(text).toContain("The 12 nearest");
    expect(text).toContain("Show all 15");
    expect(text).toContain("Copy as table");
  });
});
