#!/usr/bin/env node
// Every county in a metropolitan statistical area, and the metro area it
// belongs to (#447) → data/cbsa-counties.json.
//
//   node scripts/fetch-cbsa-counties.mjs            — write the table
//   node scripts/fetch-cbsa-counties.mjs --print    — print it, write nothing
//
// WHY. A deal is matched to its market by words in its address (the city,
// county or submarket against each market's keywords), and the keyword
// lists name the principal cities: a deal in Irving, Frisco, Bellevue,
// Pasadena or Cranberry Township read its STATE's figures, where its metro
// area publishes its own. The Census Bureau's delineation file lists every
// county of every metro area, so a deal's county — from its census tract,
// which the site flags already look up, or the county its address names —
// places it in its metro area whatever its city is called.
//
// WHAT THE RUNNER PRINTED (zori.yml probe_url, run 36655654711,
// 2026-09-30): list1_2023.xlsx, HTTP 200, 140 KB, one sheet "List 1",
// 1920 non-empty rows, 12 columns. Row 3 is the header: "CBSA Code |
// Metropolitan Division Code | CSA Code | CBSA Title | Metropolitan/
// Micropolitan Statistical Area | Metropolitan Division Title | CSA Title |
// County/County Equivalent | State Name | FIPS State Code | FIPS County Code
// | Central/Outlying County"; the rows read "38300 | | 430 | Pittsburgh, PA
// | Metropolitan Statistical Area | | … | Butler County | Pennsylvania | 42
// | 019 | Central", with a source line after the last. Columns are found by
// the header's own names, never by position, and only metropolitan (not
// micropolitan) areas are kept: the site reads no micropolitan area.
//
// CBSA_URL is a test hook: the parser is checked against a workbook of the
// same shape written locally, since the sandbox cannot reach census.gov.

import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

export const DELINEATION_URL =
  "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx";

const HEADERS = {
  cbsa: "CBSA Code",
  division: "Metropolitan Division Code",
  title: "CBSA Title",
  kind: "Metropolitan/Micropolitan Statistical Area",
  county: "County/County Equivalent",
  state: "State Name",
  stateFips: "FIPS State Code",
  countyFips: "FIPS County Code",
};

/** A cell's text, trimmed; a number as its digits. */
function text(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("").trim();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  return String(v).trim();
}

/**
 * The delineation workbook's metropolitan counties: county FIPS (state and
 * county, five digits) → the CBSA code, its division where it has one, the
 * CBSA's title, the county's name and its state's. Throws where the header
 * is not found, so a reshaped file is a loud failure, never an empty table.
 */
export async function readDelineation(bytes) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("the workbook has no sheet");
  let cols = null;
  const counties = {};
  const titles = {};
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, n) => (cells[n] = text(cell)));
    if (!cols) {
      const at = (name) => cells.findIndex((c) => c === name);
      const found = Object.fromEntries(Object.entries(HEADERS).map(([k, name]) => [k, at(name)]));
      if (Object.values(found).every((i) => i > 0)) cols = found;
      return;
    }
    const cbsa = cells[cols.cbsa] ?? "";
    const stateFips = (cells[cols.stateFips] ?? "").padStart(2, "0");
    const countyFips = (cells[cols.countyFips] ?? "").padStart(3, "0");
    if (!/^\d{5}$/.test(cbsa) || !/^\d{2}$/.test(stateFips) || !/^\d{3}$/.test(countyFips)) return;
    if (!/^Metropolitan/i.test(cells[cols.kind] ?? "")) return;
    const division = cells[cols.division] ?? "";
    counties[`${stateFips}${countyFips}`] = {
      cbsa,
      ...(/^\d{5}$/.test(division) ? { division } : {}),
      county: cells[cols.county] ?? "",
      state: cells[cols.state] ?? "",
    };
    titles[cbsa] = cells[cols.title] ?? "";
  });
  if (!cols) throw new Error(`no header row naming ${Object.values(HEADERS).join(", ")}`);
  if (Object.keys(counties).length === 0) throw new Error("the header was found and no metropolitan county after it");
  return { counties, titles };
}

async function main() {
  const print = process.argv.includes("--print");
  const url = process.env.CBSA_URL ?? DELINEATION_URL;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const { counties, titles } = await readDelineation(bytes);
  const table = {
    source:
      "U.S. Census Bureau, Population Division: List 1, core based statistical areas, metropolitan divisions and combined statistical areas, July 2023 (OMB Bulletin 23-01)",
    url: DELINEATION_URL,
    retrieved: new Date().toISOString().slice(0, 10),
    titles,
    counties,
  };
  const n = Object.keys(counties).length;
  console.log(`${n} metropolitan counties in ${Object.keys(titles).length} metro areas`);
  for (const cbsa of ["47900", "35620", "19100", "38300", "42660", "31080"]) {
    const here = Object.entries(counties).filter(([, c]) => c.cbsa === cbsa);
    console.log(`  ${cbsa} ${titles[cbsa] ?? "(none)"}: ${here.length} counties — ${here.map(([f, c]) => `${f} ${c.county}, ${c.state}${c.division ? ` [${c.division}]` : ""}`).join("; ")}`);
  }
  if (print) return;
  writeFileSync("data/cbsa-counties.json", JSON.stringify(table, null, 1) + "\n");
  console.log("wrote data/cbsa-counties.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
