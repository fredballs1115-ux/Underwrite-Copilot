#!/usr/bin/env node
// Quarterly Census pull → the `rates` table: each covered metro area's own
// rental vacancy rate from the Housing Vacancy Survey's 75-largest-MSA
// tables, with the survey's margin of error beside it.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fetch-hvs.mjs
//   DRY_RUN=1 node scripts/fetch-hvs.mjs   — fetch, match and print; write nothing
//
// THE SURVEY PUBLISHES THESE AS WORKBOOKS AND NOTHING ELSE. FRED carries the
// four Census regions' rates (rates run 35790692228) and no metro's; the
// metro tables are .xlsx on census.gov, so this reads them with exceljs.
//
// WHAT THE RUNNER PRINTED (zori.yml probe_url, run 35794270430,
// 2026-09-22): tab4_msa_26_rvr.xlsx (20 KB, one sheet, 111 rows) is
// "Table 4. Rental Vacancy Rates for the 75 Largest Metropolitan
// Statistical Areas: 2026" — a header block in rows 4–7 reading
// "Metropolitan Statistical Area | First Quarter 2026 | Margin of Error* |
// Second Quarter 2026 | Margin of Error* | Third … | Fourth …", then one
// row per area with the name in column B and a rate / margin pair per
// quarter (Washington 5.9 ±2.2 then 6.2 ±2.2, Dallas 11.7 ±2.5 twice,
// Richmond 7.0 ±4.7 then 6.2 ±5.1), the quarters not yet published blank,
// and footnotes at the bottom ("27 | Formerly titled Virginia
// Beach-Norfolk-Newport News, VA-NC."). tab4b_msa_15_25_rvr.xlsx (82 KB,
// 924 rows) is the same shape repeated in year blocks, 2025 first, each
// with its own header rows naming the year, the area names padded with
// dots ("Akron, OH ......") and carrying footnote digits ("GA1",
// "PA-NJ-DE-MD21", "VA-NC30"), a "*" or "**" in column A, and a few areas
// spelt differently from the 2026 table ("Dallas-Ft. Worth-Arlington").
//
// THREE RULES. The year and the quarter columns are READ FROM EACH HEADER
// ROW rather than assumed, so a block's rows are dated by the header above
// them and a table that adds a column does not shift every figure. An area
// is matched by a NAME PREFIX from data/fred-series.json (`census`), short
// of where the two tables' spellings diverge, and the dry run prints the
// row each metro matched — a wrong prefix is visible as another city's
// name, never a silent figure. And THE MARGIN OF ERROR IS STORED, as a
// companion series (`moe`), because a sample's quarterly figure for one
// metro is wide — Richmond's ±5 points on a 7% rate — and a figure shown
// without it would be read as more than it is.

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const { metroSeries = [] } = require("../data/fred-series.json");
const SERIES = metroSeries.filter((s) => s.source === "census");

// HVS_BASE is a test hook: the parser is checked against workbooks of the
// same shape served locally, since the sandbox cannot reach census.gov.
const BASE = process.env.HVS_BASE ?? "https://www.census.gov/housing/hvs/data/rates/";
/** The current year's table and the eleven-year history, newest first —
 *  both linked from https://www.census.gov/housing/hvs/data/rates.html,
 *  the page every tile links to. */
const FILES = ["tab4_msa_26_rvr.xlsx", "tab4b_msa_15_25_rvr.xlsx"];

const dryRun = process.env.DRY_RUN === "1";
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required (or DRY_RUN=1).");
  process.exit(1);
}
const supabase = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });

if (SERIES.length === 0) {
  console.error("HVS: no census series in data/fred-series.json");
  process.exit(1);
}
for (const s of SERIES) {
  if (!s.moe || !s.census) {
    console.error(`HVS: ${s.id} needs a moe id and a census name prefix`);
    process.exit(1);
  }
}

const QUARTER = /\b(First|Second|Third|Fourth)\s+Quarter\s+(\d{4})\b/i;
const QUARTER_MONTH = { first: "01", second: "04", third: "07", fourth: "10" };

/** A cell's text, or "" — a number stays a number. */
function cellValue(v) {
  if (v == null) return "";
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

/** The area's name as the table prints it, without its dot leaders and
 *  the footnote digits glued to the state code: "Chicago-Naperville-Elgin,
 *  IL-IN-WI6......" → "Chicago-Naperville-Elgin, IL-IN-WI". */
function cleanName(raw) {
  return String(raw)
    .replace(/\.{2,}.*$/, "")
    .trim()
    .replace(/(,\s*[A-Z]{2}(?:-[A-Z]{2})*)\d+$/, "$1")
    .trim();
}

/**
 * Every (area, quarter) figure in a workbook, read block by block: a row
 * whose cells name quarters is a header and sets the year and the columns
 * for the rows under it; a row with a name in column B and a number in a
 * quarter's column is a figure, with the margin in the column beside it.
 */
async function readWorkbook(buf, file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out = [];
  let header = null; // { year, quarters: [{ q, col, moeCol }] }
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col] = cellValue(cell.value);
      });
      // A header row: any cell naming a quarter and its year.
      const quarters = [];
      let year = null;
      for (let col = 1; col < cells.length; col++) {
        const m = typeof cells[col] === "string" ? cells[col].match(QUARTER) : null;
        if (!m) continue;
        const next = typeof cells[col + 1] === "string" ? cells[col + 1] : "";
        if (!/margin of error/i.test(next)) continue;
        year = year ?? Number(m[2]);
        if (Number(m[2]) !== year) continue;
        quarters.push({ q: m[1].toLowerCase(), col, moeCol: col + 1 });
      }
      if (quarters.length > 0 && year) {
        header = { year, quarters };
        return;
      }
      if (!header) return;
      const name = typeof cells[2] === "string" ? cleanName(cells[2]) : "";
      if (!name || /^(source|note|footnote|formerly|\*)/i.test(name)) return;
      for (const { q, col, moeCol } of header.quarters) {
        const rate = cells[col];
        if (typeof rate !== "number" || !Number.isFinite(rate)) continue;
        const moe = cells[moeCol];
        out.push({
          file,
          name,
          obs_date: `${header.year}-${QUARTER_MONTH[q]}-01`,
          rate,
          moe: typeof moe === "number" && Number.isFinite(moe) ? moe : null,
        });
      }
    });
  }
  return out;
}

const figures = [];
for (const file of FILES) {
  const res = await fetch(BASE + file, {
    headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.error(`HVS: HTTP ${res.status} from ${BASE + file}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    const got = await readWorkbook(buf, file);
    figures.push(...got);
    const dates = got.map((g) => g.obs_date).sort();
    console.log(
      `HVS: ${file} · ${Math.round(buf.length / 1024)} KB · ${got.length} figures · ` +
        `${new Set(got.map((g) => g.name)).size} areas · ${dates[0] ?? "—"} to ${dates[dates.length - 1] ?? "—"}` +
        (dryRun ? " · dry run, not written" : ""),
    );
  } catch (err) {
    console.error(`HVS: ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
if (figures.length === 0) {
  console.error("HVS: no figure read from either workbook");
  process.exit(1);
}

const out = [];
let matched = 0;
const missed = [];
for (const s of SERIES) {
  const mine = figures.filter((f) => f.name.startsWith(s.census));
  const names = [...new Set(mine.map((f) => f.name))];
  if (mine.length === 0) {
    missed.push(`${s.metro} ("${s.census}")`);
    continue;
  }
  // One figure per date: the newest file wins where two tables overlap.
  const byDate = new Map();
  for (const f of mine) if (!byDate.has(f.obs_date)) byDate.set(f.obs_date, f);
  const rows = [...byDate.values()].sort((a, b) => (a.obs_date < b.obs_date ? 1 : -1));
  for (const f of rows) {
    out.push({ series_id: s.id, obs_date: f.obs_date, value: f.rate, label: s.label });
    if (f.moe !== null) out.push({ series_id: s.moe, obs_date: f.obs_date, value: f.moe, label: `${s.label} — margin of error` });
  }
  matched++;
  const newest = rows[0];
  console.log(
    `${s.metro}: ${newest.rate}% ±${newest.moe ?? "?"} (${newest.obs_date}) · ${rows.length} quarters · ` +
      `matched "${names.join('" / "')}"${names.length > 1 ? " (two spellings, one area)" : ""}`,
  );
}
for (const miss of missed) console.error(`${miss}: no row in either workbook`);

if (supabase && out.length > 0) {
  const { error } = await supabase.from("rates").upsert(out, { onConflict: "series_id,obs_date" });
  if (error) {
    console.error(`rates upsert: ${error.message}`);
    process.exit(1);
  }
  console.log(`rates: upserted ${out.length} rows`);
}
console.log(`HVS ROLL-UP: ${matched} of ${SERIES.length} metros matched${missed.length ? `; missed: ${missed.join(", ")}` : ""}`);
process.exit(matched === 0 ? 1 : 0);
