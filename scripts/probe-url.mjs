#!/usr/bin/env node
// Fetch a candidate data file from where the network is open and print
// what it actually is — the status, the content type, the size, the header
// line, the row count, and the rows that name a place — written nowhere.
//
//   PROBE_URL="https://… https://…" [PROBE_MATCH="Washington, DC|Dallas"] \
//     node scripts/probe-url.mjs
//
// WHY. The sandbox the feeds are written in cannot reach Zillow, Apartment
// List, Realtor.com or anyone else, so a file's URL, its column shape and
// the name each metro goes by in it are claims until a runner prints them.
// The rates and Zillow pulls each carry a dry run for the files they already
// read; this is the step BEFORE that — the one that says whether a remembered
// URL exists at all, and what its first line looks like — so a feed is
// designed against the file rather than against memory of it. A URL that
// 404s prints as a 404, which is an answer; a file whose header is not what
// was expected prints its header, which is a better one.

const urls = (process.env.PROBE_URL ?? "").split(/\s+/).filter(Boolean);
const match = (process.env.PROBE_MATCH ?? "").split("|").map((s) => s.trim()).filter(Boolean);
if (urls.length === 0) {
  console.error("PROBE_URL is required: one or more URLs, space-separated.");
  process.exit(1);
}

// A wide CSV's header is the thing being asked for, so it is clipped long;
// a row is clipped shorter, since its shape is what matters. Both are
// overridable when a file is wider still.
const HEADER_CLIP = Number(process.env.PROBE_CLIP ?? "2000");
const ROW_CLIP = Math.min(HEADER_CLIP, 600);
const clip = (s, n = ROW_CLIP) => (s.length > n ? `${s.slice(0, n)}…` : s);
// How many of a sheet's leading rows to print: a Census table carries a
// title block and a two-row header before its first place, so a dozen
// shows the shape; overridable for a deeper look.
const SHEET_ROWS = Number(process.env.PROBE_SHEET_ROWS ?? "12");

/** A cell as the row line prints it: a date as ISO, a formula by its
 *  result, a rich-text run by its text, a blank as nothing. */
function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
    return JSON.stringify(v);
  }
  return String(v);
}

/** Every sheet of a workbook, described: its name, its dimensions, its
 *  first rows (cells joined by " | "), and the rows that name a place. */
async function describeWorkbook(buf, match) {
  let ExcelJS;
  try {
    ExcelJS = (await import("exceljs")).default;
  } catch {
    console.log("  exceljs is not installed here — cannot open the workbook");
    return;
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch (err) {
    console.log(`  not a workbook exceljs can open — ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cellText(cell.value).trim()));
      rows.push({ n, line: cells.join(" | ").replace(/(?: \| )+$/, "") });
    });
    console.log(`  sheet "${ws.name}": ${rows.length} non-empty rows · ${ws.columnCount} columns`);
    for (const r of rows.slice(0, SHEET_ROWS)) console.log(`    ${r.n}: ${clip(r.line)}`);
    if (rows.length > SHEET_ROWS) console.log(`    … last: ${rows[rows.length - 1].n}: ${clip(rows[rows.length - 1].line)}`);
    for (const m of match) {
      const hits = rows.filter((r) => r.line.includes(m));
      console.log(`    rows containing "${m}": ${hits.length}`);
      for (const h of hits.slice(0, 3)) console.log(`      ${h.n}: ${clip(h.line)}`);
    }
  }
}

for (const url of urls) {
  console.log(`\nPROBE ${url}`);
  let res;
  try {
    res = await fetch(url, {
      headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
      signal: AbortSignal.timeout(90_000),
      redirect: "follow",
    });
  } catch (err) {
    console.log(`  FAILED — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const type = res.headers.get("content-type") ?? "no content type";
  const length = res.headers.get("content-length");
  console.log(`  HTTP ${res.status}${res.redirected ? ` (redirected to ${res.url})` : ""} · ${type}${length ? ` · ${Math.round(Number(length) / 1024)} KB declared` : ""}`);
  if (!res.ok) continue;
  // A workbook is a zip, and reading it as text prints noise: open it with
  // exceljs instead and print each sheet's name, its row count, its first
  // rows and the rows that name a place — the Census Bureau publishes its
  // Housing Vacancy Survey tables as .xlsx and nothing else.
  if (/spreadsheetml|officedocument|\.xlsx(?:\?|$)/i.test(`${type} ${url}`)) {
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`  ${Math.round(buf.length / 1024)} KB · a workbook`);
    await describeWorkbook(buf, match);
    continue;
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  console.log(`  ${Math.round(text.length / 1024)} KB · ${lines.length} non-empty lines`);
  if (lines.length === 0) continue;
  // A page rather than a file: the links to data files on it are the
  // thing to know, since a publisher's download URL is what memory gets
  // wrong most often.
  if (/text\/html/i.test(type)) {
    const links = Array.from(text.matchAll(/href=["']([^"']+\.(?:csv|xlsx?|json)(?:\?[^"']*)?)["']/gi)).map((m) => m[1]);
    const unique = Array.from(new Set(links));
    console.log(`  an HTML page; ${unique.length} link(s) to a data file${unique.length ? ":" : ""}`);
    for (const l of unique.slice(0, 25)) console.log(`    ${clip(l, 200)}`);
    continue;
  }
  console.log(`  header: ${clip(lines[0], HEADER_CLIP)}`);
  if (lines.length > 1) console.log(`  first row: ${clip(lines[1])}`);
  if (lines.length > 2) console.log(`  last row: ${clip(lines[lines.length - 1])}`);
  for (const m of match) {
    const hits = lines.filter((l) => l.includes(m));
    console.log(`  rows containing "${m}": ${hits.length}`);
    for (const h of hits.slice(0, 3)) console.log(`    ${clip(h)}`);
  }
}
