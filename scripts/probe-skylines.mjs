#!/usr/bin/env node
// Resolve every candidate skyline photograph against Wikimedia Commons and
// print what it really is: does the file exist, how big is it, who shot it,
// and under what licence.
//
// WHY THIS EXISTS. The sandbox these candidates are researched in cannot
// reach commons.wikimedia.org — its egress proxy answers 403 to the CONNECT
// — so a filename written there is a claim, not a fact, and an author or a
// licence written there would be a guess. Attribution that is a guess is
// worse than no photograph: it is a licence breach with a name attached.
// This script runs where the network is open (the GitHub Actions runner,
// via live-verify) and turns each claim into a verified row that can be
// pasted into lib/skyline.ts.
//
//   node scripts/probe-skylines.mjs                      # all candidates
//   node scripts/probe-skylines.mjs dallas boston        # only these markets
//
// Reads data/skyline-candidates.json. Never writes; the promotion into
// lib/skyline.ts is deliberate and human-read, because that is where the
// licence obligation is taken on.

import { readFileSync } from "node:fs";

const UA =
  "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com; commercial real estate deal screening)";
const API = "https://commons.wikimedia.org/w/api.php";
const WIDTH = 1600;

/** extmetadata values arrive as HTML — the credit line needs plain text. */
function plain(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function metadata(file) {
  const url =
    `${API}?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(`File:${file}`)}` +
    `&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { ok: false, error: `api HTTP ${res.status}` };
  const body = await res.json();
  const page = body?.query?.pages?.[0];
  if (!page || page.missing) return { ok: false, error: "no such file on Commons" };
  const info = page.imageinfo?.[0];
  if (!info) return { ok: false, error: "no imageinfo" };
  const ex = info.extmetadata ?? {};
  return {
    ok: true,
    width: info.width,
    height: info.height,
    mime: info.mime,
    artist: plain(ex.Artist?.value) || "unknown",
    license: plain(ex.LicenseShortName?.value) || "unknown",
    licenseUrl: plain(ex.LicenseUrl?.value) || "",
    description: plain(ex.ImageDescription?.value).slice(0, 140),
    restrictions: plain(ex.Restrictions?.value),
  };
}

async function thumbnail(file) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${WIDTH}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return { ok: false, error: `HTTP ${res.status} · ${type || "no type"}` };
    }
    const bytes = (await res.arrayBuffer()).byteLength;
    return { ok: true, type, bytes };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 80) };
  }
}

/** Landscape and large enough to sit behind a headline at 1600px wide. */
function shapeVerdict(meta) {
  if (!meta.ok) return "";
  const ratio = meta.width / meta.height;
  const flags = [];
  if (meta.width < 1600) flags.push("NARROW");
  if (ratio < 1.5) flags.push(`TALL ${ratio.toFixed(2)}:1`);
  if (ratio > 5) flags.push(`PANORAMA ${ratio.toFixed(1)}:1 (too wide for a band)`);
  if (meta.restrictions) flags.push(`RESTRICTED: ${meta.restrictions}`);
  return flags.length ? ` · ${flags.join(" · ")}` : " · shape ok";
}

/**
 * Ask Commons itself what it has. This is the part that makes the runner a
 * research channel rather than only a checker: the sandbox cannot reach
 * Commons to search, so without this the filenames could only ever be
 * guesses to confirm or deny. Searching here returns real files with real
 * metadata, which is what belongs in the table.
 */
async function search(query, limit = 12) {
  const url =
    `${API}?action=query&format=json&formatversion=2` +
    `&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srnamespace=6&srlimit=${limit}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const body = await res.json();
  return (body?.query?.search ?? []).map((r) => String(r.title).replace(/^File:/, ""));
}

/** A file worth putting behind a headline: big, landscape, a photograph. */
function usable(meta) {
  if (!meta.ok) return false;
  if (!/^image\/(jpeg|png|webp)$/.test(meta.mime ?? "")) return false;
  if (meta.width < 1600) return false;
  const ratio = meta.width / meta.height;
  return ratio >= 1.5 && ratio <= 4;
}

/**
 * SEARCH MODE — `node scripts/probe-skylines.mjs --search`
 * For every market in the candidate file, ask Commons for skyline
 * photographs and print the usable ones with their real author and licence.
 * Nothing is chosen automatically: a human reads this and picks the one
 * that looks like a photograph a brokerage would publish.
 */
async function searchMode(markets) {
  console.log(`SKYLINE SEARCH: asking Commons for ${markets.length} markets`);
  for (const market of markets) {
    const queries = market.queries ?? [`${market.city} skyline`];
    console.log(`\n== ${market.metroId} (${market.city ?? ""})`);
    const seen = new Set();
    let shown = 0;
    for (const q of queries) {
      let files = [];
      try {
        files = await search(q);
      } catch (err) {
        console.log(`   (search "${q}" failed: ${String(err?.message ?? err).slice(0, 60)})`);
        continue;
      }
      for (const file of files) {
        if (seen.has(file) || shown >= 6) continue;
        seen.add(file);
        const meta = await metadata(file).catch(() => ({ ok: false }));
        if (!usable(meta)) continue;
        shown++;
        console.log(
          `   ${meta.width}x${meta.height} (${(meta.width / meta.height).toFixed(2)}:1)  ${file}\n` +
            `        author: ${meta.artist}\n` +
            `        licence: ${meta.license}${meta.licenseUrl ? ` (${meta.licenseUrl})` : ""}` +
            `${meta.restrictions ? `\n        RESTRICTED: ${meta.restrictions}` : ""}`,
        );
      }
      if (shown >= 6) break;
    }
    if (shown === 0) console.log("   (nothing usable found — widen the query)");
  }
  console.log("\nSKYLINE SEARCH: done");
}

const args = process.argv.slice(2);
const doSearch = args.includes("--search");
const wanted = new Set(args.filter((a) => !a.startsWith("--")));
let candidates;
try {
  candidates = JSON.parse(readFileSync("data/skyline-candidates.json", "utf8"));
} catch (err) {
  console.log(`SKYLINE: no candidate file to probe (${String(err?.message ?? err)})`);
  process.exit(0);
}

const markets = (candidates.markets ?? []).filter(
  (m) => wanted.size === 0 || wanted.has(m.metroId),
);
if (doSearch) {
  await searchMode(markets);
  process.exit(0);
}

console.log(`SKYLINE PROBE: ${markets.length} markets, Commons resolved from this runner`);

let verified = 0;
let dead = 0;

for (const market of markets) {
  console.log(`\n== ${market.metroId} (${market.city ?? ""})`);
  for (const cand of market.candidates ?? []) {
    const [meta, thumb] = await Promise.all([
      metadata(cand.file).catch((e) => ({ ok: false, error: String(e?.message ?? e) })),
      thumbnail(cand.file),
    ]);
    if (!meta.ok || !thumb.ok) {
      dead++;
      console.log(`   DEAD  ${cand.file} — ${meta.ok ? thumb.error : meta.error}`);
      continue;
    }
    verified++;
    const kb = Math.round(thumb.bytes / 1024);
    console.log(
      `   LIVE  ${cand.file}\n` +
        `         ${meta.width}x${meta.height} ${meta.mime} · ${kb} KB at ${WIDTH}px${shapeVerdict(meta)}\n` +
        `         author: ${meta.artist}\n` +
        `         licence: ${meta.license}${meta.licenseUrl ? ` (${meta.licenseUrl})` : ""}`,
    );
  }
}

console.log(`\nSKYLINE PROBE: ${verified} live, ${dead} dead`);
