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

const clip = (s, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

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
  console.log(`  header: ${clip(lines[0])}`);
  if (lines.length > 1) console.log(`  first row: ${clip(lines[1])}`);
  if (lines.length > 2) console.log(`  last row: ${clip(lines[lines.length - 1])}`);
  for (const m of match) {
    const hits = lines.filter((l) => l.includes(m));
    console.log(`  rows containing "${m}": ${hits.length}`);
    for (const h of hits.slice(0, 3)) console.log(`    ${clip(h)}`);
  }
}
