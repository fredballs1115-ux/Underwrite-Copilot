#!/usr/bin/env node
// Every designated Qualified Opportunity Zone tract (#473) → data/qoz-tracts.json.
//
//   node scripts/fetch-qoz-tracts.mjs            — write the list
//   node scripts/fetch-qoz-tracts.mjs --print    — print it, write nothing
//
// WHY. The site flags check a deal's census tract against the Opportunity
// Zone registry, and the registry the ingest loads holds Maryland's zones
// alone unless a national layer is set, so a deal anywhere else read "not
// checked". The CDFI Fund publishes every designated tract in one workbook,
// keyed by the 2010 tract numbers the zones were designated on — the same
// number the site flags now read for the check.
//
// WHAT THE RUNNER PRINTED (zori.yml probe_url, run 36752260808,
// 2026-09-30): designated-qozs.12.14.18.xlsx, HTTP 200 (redirected to
// /system/files/documents/…), 270 KB, one sheet "QOZs 14Jun", 8769
// non-empty rows, 5 columns. Rows 1–4 are a title and three notes: "This
// document was updated December 14, 2018, to reflect the final Qualified
// Opportunity Zone designations for all States." and "Please note that the
// below list of designated tracts is not the official list. The official
// list will be published in the Internal Revenue Bulletin at a later
// date." Row 5 is the header, "State | County | Census Tract Number |
// Tract Type | ACS Data Source", and the rows read "Alabama | Autauga |
// 01001020700 | Low-Income Community | 2011-2015" to "Wyoming | Washakie
// | 56043000301 | Low-Income Community | 2011-2015"; the tract type is
// "Low-Income Community" or "Non-LIC Contiguous". Columns are found by the
// header's own names, never by position.
//
// QOZ_URL is a test hook: the parser is checked against a workbook of the
// same shape written locally, since the sandbox cannot reach cdfifund.gov.

import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

export const QOZ_URL = "https://www.cdfifund.gov/sites/cdfi/files/documents/designated-qozs.12.14.18.xlsx";

const HEADERS = {
  state: "State",
  tract: "Census Tract Number",
  type: "Tract Type",
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
 * The workbook's designated tracts: each 2010 tract GEOID (eleven digits —
 * a number the workbook stores as one keeps its leading zero) in one of two
 * lists by its tract type, sorted. Throws where the header is not found, a
 * type is neither of the two, or a tract appears twice, so a reshaped file
 * is a loud failure, never a short list.
 */
export async function readQozList(bytes) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("the workbook has no sheet");
  let cols = null;
  const lic = [];
  const contiguous = [];
  const seen = new Set();
  const states = new Map();
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, n) => (cells[n] = text(cell)));
    if (!cols) {
      const at = (name) => cells.findIndex((c) => c === name);
      const found = Object.fromEntries(Object.entries(HEADERS).map(([k, name]) => [k, at(name)]));
      if (Object.values(found).every((i) => i > 0)) cols = found;
      return;
    }
    const raw = (cells[cols.tract] ?? "").replace(/\D/g, "");
    if (!raw) return;
    const geoid = raw.padStart(11, "0");
    if (!/^\d{11}$/.test(geoid)) throw new Error(`not a tract number: ${cells[cols.tract]}`);
    if (seen.has(geoid)) throw new Error(`tract ${geoid} is listed twice`);
    seen.add(geoid);
    const type = cells[cols.type] ?? "";
    if (/^low-income community$/i.test(type)) lic.push(geoid);
    else if (/^non-lic contiguous$/i.test(type)) contiguous.push(geoid);
    else throw new Error(`tract ${geoid} has a type the list does not use: "${type}"`);
    // Each state's FIPS prefix, to print: a state under two prefixes is a
    // misread column, said rather than stored.
    const state = cells[cols.state] ?? "";
    const prefixes = states.get(state) ?? new Set();
    prefixes.add(geoid.slice(0, 2));
    states.set(state, prefixes);
  });
  if (!cols) throw new Error(`no header row naming ${Object.values(HEADERS).join(", ")}`);
  if (seen.size === 0) throw new Error("the header was found and no tract after it");
  lic.sort();
  contiguous.sort();
  return { lic, contiguous, states };
}

async function main() {
  const print = process.argv.includes("--print");
  const url = process.env.QOZ_URL ?? QOZ_URL;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const { lic, contiguous, states } = await readQozList(bytes);
  const n = lic.length + contiguous.length;
  console.log(`${n} designated tracts: ${lic.length} low-income communities, ${contiguous.length} contiguous tracts, in ${states.size} states and territories`);
  const split = [...states].filter(([, p]) => p.size > 1);
  for (const [state, p] of split) console.log(`  ${state} under ${[...p].join(", ")} — check the state column`);
  for (const probe of ["24510040100", "48085032013", "48085030408", "01001020700", "56043000301"]) {
    const where = lic.includes(probe) ? "low-income community" : contiguous.includes(probe) ? "contiguous" : "not listed";
    console.log(`  ${probe}: ${where}`);
  }
  // The program designated 8,764 tracts; a count far from it is a misread
  // file, not a list to ship.
  if (n < 8000 || n > 9500) throw new Error(`${n} tracts is not the designated list`);
  if (split.length > 0) throw new Error(`${split.length} state(s) read under two FIPS prefixes`);
  if (print) return;
  const list = {
    source:
      "CDFI Fund, U.S. Department of the Treasury: Designated Qualified Opportunity Zones, updated December 14, 2018 to reflect the final designations for all States (the Fund's note: not the official list, which is published in the Internal Revenue Bulletin)",
    url: QOZ_URL,
    updated: "2018-12-14",
    retrieved: new Date().toISOString().slice(0, 10),
    tractVintage: "2010",
    count: n,
    lic,
    contiguous,
  };
  writeFileSync("data/qoz-tracts.json", JSON.stringify(list) + "\n");
  console.log("wrote data/qoz-tracts.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
