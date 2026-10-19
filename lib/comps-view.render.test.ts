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
import { saleKey } from "./public-comps/kept";
import type { SubjectForCall } from "./public-comps/vs-median";
import { DB_MARKETS, marketNames } from "./public-comps/db-markets";
import { CoverageChips } from "../app/(app)/comps/coverage-chips";
import { SalesList } from "../app/(app)/comps/sales-list";
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

  it("says the price track in one sentence to a screen reader", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps), 500_000);
    const words = (/data-qa="comps-price-words">([^<]+)</.exec(html)?.[1] ?? "").replace(/&#x27;/g, "'");
    expect(words).toMatch(/^6 sales from \$400,000 to \$525,000; median \$\d{3},\d{3}; this deal's price \$500,000\.$/);
    // two sales: no middle and no subject named
    const two = /data-qa="comps-price-words">([^<]+)</.exec(draw(result([sale(0), sale(1)]), 68_000_000))?.[1];
    expect(two).toBe("2 sales from $400,000 to $425,000.");
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

  it("draws no $/SF bar for a row possibly of one deed across parcels, and keeps it off the scale", () => {
    const comps = Array.from({ length: 5 }, (_, i) =>
      sale(i, { sqft: 1_800, ...(i < 2 ? { buyer: "Acme LLC", saleDate: "2026-01-15", price: 9_000_000 } : {}) }),
    );
    const html = draw(result(comps));
    const text = visibleText(html).replace(/\s+/g, " ");
    // Three bars, drawn in the phone list and the table alike.
    expect(html.split('data-bar="comps-psf"').length - 1).toBe(6);
    // The scale is the widest unflagged sale's ($500,000 / 1,800 SF), never the deed's $9M over one parcel.
    expect(text).toContain("from zero to the highest, $278/SF");
    expect(text).toContain("2 rows possibly of one deed across parcels draw no bar, and the median leaves them out.");
    // Their figures stay, flagged.
    expect(text).toContain("$5,000/SF");
    // The deed is one sale in the readout, and the $/SF median is the bars'
    // own three — the tick on the drawn set, never pulled by the deed.
    expect(text).toContain("4 recorded sales, 2 rows of one deed counted once");
    expect(text).toContain("median $264/SF on 3 of 4 sales, thin");
    expect(text).toContain("the tick is the median, $264/SF");
    expect(html.split('data-qa="comps-shared-deed"').length - 1).toBe(2);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("hands the sales that state an area to the comp grid from /comps, not from a deal", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps));
    expect(visibleText(html)).toContain("Open the 3 nearest sales that state an area in the comp grid");
    expect(html).toMatch(/href="\/tools\?cgr=[^"]+#comp-grid"/);
    const onDeal = renderToStaticMarkup(React.createElement(CompsResultView, { result: result(comps), onDeal: true }));
    expect(onDeal).not.toContain("comp-grid");
  });

  it("numbers the rows as their pins and folds the sales past twelve", () => {
    const comps = Array.from({ length: 15 }, (_, i) => sale(i));
    const text = visibleText(draw(result(comps)));
    expect(text).toContain("The 12 nearest");
    expect(text).toContain("Show all 15");
    expect(text).toContain("Copy as table");
  });

  it("offers a Download CSV beside the copy only where there are sales, off paper", () => {
    const comps = Array.from({ length: 15 }, (_, i) => sale(i));
    const html = draw(result(comps));
    expect(html.split('data-qa="comps-download-csv"').length - 1).toBe(1);
    expect(visibleText(html)).toContain("Download CSV");
    const button = /<button[^>]*data-qa="comps-download-csv"[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).toContain("print:hidden");
    expect(button).toContain("recorded-sales-1500-walnut-st-philadelphia-pa-2026-10-08.csv");
    expect(a11yIssues(html)).toEqual([]);
    // No sales, no button: the readout says none were found and draws no list.
    const none = draw({ ...result([]), status: "no_sales", stats: undefined });
    expect(none).not.toContain("comps-download-csv");
    expect(visibleText(none)).not.toContain("Download CSV");
    // And the list itself draws none over an empty set.
    const r = result([]);
    const empty = renderToStaticMarkup(
      React.createElement(SalesList, {
        comps: [],
        shared: [],
        showUnits: false,
        medianPerSqft: null,
        copyText: "",
        provenance: { providerName: r.providerName, datasetUrl: r.datasetUrl, retrievedAt: r.retrievedAt, subject: r.subject },
      }),
    );
    expect(empty).not.toContain("comps-download-csv");
  });

  it("gives a phone a card a sale and the table from sm, each sale keeping its number", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps));
    // the cards are phone-only, the table wide-only, in a named, focusable region
    expect(html).toMatch(/<ul class="[^"]*sm:hidden[^"]*" aria-label="Recorded sales as cards">/);
    expect(html).toMatch(/role="region" aria-label="Recorded sales" tabindex="0" class="relative overflow-x-auto mt-1\.5 hidden sm:block"/);
    // every sale once in each: its address and its price
    expect(visibleText(html).split("102 Walnut St").length - 1).toBe(2);
    // the number is read out (it had been hidden from a screen reader); no map on a deal's panel
    expect(html).toContain('title="Number 1 by distance"');
    expect(html).not.toContain("Pin 1 on the map");
    const mapped = renderToStaticMarkup(React.createElement(CompsResultView, { result: result(comps), showMap: true }));
    expect(mapped).toContain('title="Pin 1 on the map"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("offers the orders as pressed buttons and says the sorted column", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps));
    expect(html).toContain('role="group" aria-label="Sort the sales"');
    expect([...html.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])).toEqual([
      ["true", "Nearest"],
      ["false", "Newest"],
      ["false", "Price"],
      ["false", "$/SF"],
    ]);
    // opens nearest first: only the distance column is said to be sorted
    expect([...html.matchAll(/<th\b[^>]*aria-sort="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]])).toEqual([["ascending", "Dist."]]);
    // $/SF is no order where under two sales state an area
    const flat = draw(result(comps.map((c) => ({ ...c, sqft: null }))));
    expect(flat).not.toMatch(/aria-pressed="false"[^>]*>\$\/SF</);
    // one sale: nothing to order
    expect(draw(result([sale(0)]))).not.toContain("Sort the sales");
  });

  it("opens /comps on the order its link keeps (?sort=), the server's HTML included", () => {
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const onComps = (sortParam: string | null, cs = comps, onDeal = false) =>
      renderToStaticMarkup(React.createElement(CompsResultView, { result: result(cs), showMap: true, sortParam, onDeal }));
    // the sort group's pressed button (the map has buttons of its own)
    const pressed = (html: string) =>
      [...html.slice(html.indexOf('aria-label="Sort the sales"')).matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map((m) => m[1]);
    const price = onComps("price");
    expect(pressed(price)).toEqual(["Price"]);
    expect(visibleText(price)).toContain("The sales, highest price first");
    expect([...price.matchAll(/<th\b[^>]*aria-sort="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]])).toEqual([["descending", "Price"]]);
    // the dearest (sale 5, pin 6) leads the table
    expect(price.indexOf("105 Walnut St")).toBeLessThan(price.indexOf("100 Walnut St"));
    expect(pressed(onComps("newest"))).toEqual(["Newest"]);
    expect(pressed(onComps("perSf"))).toEqual(["$/SF"]);
    // no order, an unknown one, or $/SF where under two sales state an area: nearest
    expect(pressed(onComps(null))).toEqual(["Nearest"]);
    expect(pressed(onComps("cheapest"))).toEqual(["Nearest"]);
    expect(pressed(onComps("perSf", comps.map((c) => ({ ...c, sqft: null }))))).toEqual(["Nearest"]);
    // a deal's panel keeps no order in its page's address
    expect(pressed(onComps("price", comps, true))).toEqual(["Nearest"]);
    expect(a11yIssues(price)).toEqual([]);
    expect(gluedWords(visibleText(price))).toEqual([]);
  });

  it("draws each sale's $/SF on one scale, the median's tick only where the readout names one", () => {
    // sales 1, 3, 5 state 1,800 SF: three bars, the thin median named above
    const comps = Array.from({ length: 6 }, (_, i) => sale(i));
    const html = draw(result(comps));
    // each bar twice: its phone card and its table row
    expect(count(html, "comps-psf")).toBe(6);
    expect(count(html, "comps-psf-median")).toBe(6);
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toMatch(/Bars: the price a square foot that 3 of the 6 sales state, from zero to the highest, \$\d{3}\/SF; the tick is the median, \$\d{3}\/SF\./);
    // two sales stating an area: bars, no median tick, no median in the caption
    const two = draw(result(Array.from({ length: 4 }, (_, i) => sale(i))));
    expect(count(two, "comps-psf")).toBe(4);
    expect(count(two, "comps-psf-median")).toBe(0);
    expect(visibleText(two)).not.toContain("the tick is the median");
  });
});

describe("a sale left out of the readout", () => {
  const comps = Array.from({ length: 6 }, (_, i) => sale(i));
  const onComps = (outParam: string | null, onDeal = false, cs = comps) =>
    renderToStaticMarkup(React.createElement(CompsResultView, { result: result(cs), showMap: false, sortParam: null, outParam, onDeal }));
  /** A link naming sales by their pins here ("6nc,2"), written as the page
   *  writes it: each sale by its identity (lib/public-comps/kept `saleKey`). */
  const byPin = (pinsText: string, cs = comps) =>
    pinsText
      .split(",")
      .map((t) => /^(\d+)([a-z]{2})?$/.exec(t)!)
      .map((m) => `${saleKey(cs[Number(m[1]) - 1])}${m[2] ? `-${m[2]}` : ""}`)
      .join(",");

  it("stays listed, dimmed and struck through with its reason, and the readout says how many were kept", () => {
    // pin 6, the dearest ($525,000), left out as not comparable
    const html = onComps(byPin("6nc"));
    dumpView("comps-left-out", `<section class="rounded-xl border border-line bg-surface p-4">${html}</section>`);
    const text = visibleText(html).replace(/\s+/g, " ");
    // its card and its table row, both marked, both still listed
    expect(html.split('data-left-out="true"').length - 1).toBe(2);
    expect(text.split("105 Walnut St").length - 1).toBe(2);
    expect(html.split('data-qa="comps-left-out"').length - 1).toBe(2);
    expect(text).toContain("Left out of the readout: not comparable");
    expect(html).toMatch(/line-through[^"]*">\$525,000</);
    // the readout reads the five kept: their count, their range
    expect(text).toContain("5 recorded sales");
    expect(text).toContain("range $400,000–$500,000");
    expect(text).toMatch(/5 of 6 sales kept ?; the figures above are the kept sales' — left out: not comparable \(1\)\./);
    expect(text).toContain("Keep all");
    // the price track draws the five kept, each on its own pin
    expect(count(html, "comps-sale")).toBe(5);
    expect(html).not.toMatch(/title="6\. \$525,000"/);
    // the control on each sale says which: one "Out", the rest "Kept"
    expect(html.split('data-qa="comps-keep"').length - 1).toBe(12);
    expect(html.match(/<option value="not_comparable" selected="">/g)?.length).toBe(2);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("holds the floors to the kept count, and draws no $/SF bar for a sale left out", () => {
    // four of six left out: two kept, no median, the midpoint said as one
    const html = onComps(byPin("1nc,2wc,3sd,4ot"));
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("2 recorded sales");
    expect(text).toContain("midpoint of the two");
    expect(text).toContain("Two sales cannot establish a middle.");
    expect(count(html, "comps-median")).toBe(0);
    expect(text).toContain("2 of 6 sales kept");
    expect(text).toContain("not comparable (1), wrong class (1), possible shared deed (1), other (1)");
    // sales 1, 3, 5 state an area; with pins 2 and 4 left out only pin 6 is
    // kept among them, so no bars at all (one bar is scaled to nothing)
    expect(count(html, "comps-psf")).toBe(0);
    // one left out of the six: its bar goes, the rest stay
    const one = onComps(byPin("4wc")); // pin 4 is sale 3, which states an area
    expect(count(one, "comps-psf")).toBe(4);
    expect(visibleText(one).replace(/\s+/g, " ")).toMatch(/Bars: the price a square foot that 2 of the 5 kept sales state/);
  });

  it("keeps a deed's row a deed's when its other row is left out: its $/SF never comes back", () => {
    const deed = { buyer: "Acme LLC", saleDate: "2026-01-15", price: 9_000_000, sqft: 2_000 };
    const set = [sale(0, deed), sale(1, deed), sale(2, { sqft: 2_000 }), sale(3, { sqft: 2_000 }), sale(4, { sqft: 2_000 })];
    // pin 2, the deed's second row, left out as a possible shared deed
    const html = onComps(byPin("2sd", set), false, set);
    const text = visibleText(html).replace(/\s+/g, " ");
    // pin 1 is still the deed's: no area in the $/SF median ($225, $238, $250)
    expect(text).toContain("$238/SF on 3 of 4 sales");
    // the kept line counts the list's rows, and says so
    expect(text).toContain("4 of 5 rows kept");
    // and no bar: three drawn (a card and a table row each), the deed's row
    // named as drawing none
    expect(count(html, "comps-psf")).toBe(6);
    expect(text).toContain("One row possibly of one deed across parcels draws no bar");
  });

  it("reads no figures where every sale is left out, and keeps the list to bring one back", () => {
    const html = onComps(byPin("1,2,3,4,5,6"));
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("every one left out of the readout, so it reads no figures");
    expect(text).toContain("0 of 6 sales kept — left out: other (6).");
    expect(count(html, "comps-sale")).toBe(0);
    expect(html.split('data-left-out="true"').length - 1).toBe(12);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("drops what the link cannot mean, and says nothing where every sale is kept", () => {
    // an old link's pin numbers, a key no sale bears, junk
    const html = onComps("6nc,9nc,0wc,x,zzzzzzz-nc");
    expect(html).not.toContain('data-left-out="true"');
    expect(visibleText(html)).not.toContain("sales kept");
    expect(visibleText(html)).toContain("6 recorded sales");
  });

  it("keeps the set for the visit on a deal's panel, never from the page's address", () => {
    const html = onComps(byPin("6nc"), true);
    expect(html).not.toContain('data-left-out="true"');
    expect(html.split('data-qa="comps-keep"').length - 1).toBe(12);
    expect(a11yIssues(html)).toEqual([]);
  });
});
