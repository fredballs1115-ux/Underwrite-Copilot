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
  params: { radiusKm: 1.6, monthsBack: 24, classFilter: "all sales" },
  comps,
  stats: compStats(comps),
  retrievedAt: "2026-10-08T12:00:00Z",
  note: "Public records.",
});

const draw = (r: RecordCompsResult, subjectPrice: number | null = null) =>
  renderToStaticMarkup(React.createElement(CompsResultView, { result: r, subjectPrice }));

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

  it("numbers the rows as their pins and folds the sales past twelve", () => {
    const comps = Array.from({ length: 15 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps)));
    expect(text).toContain("The 12 nearest");
    expect(text).toContain("Show all 15");
    expect(text).toContain("Copy as table");
  });
});
