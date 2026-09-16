#!/usr/bin/env node
// Find, and then verify, the photograph each covered market is known by.
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
//   node scripts/probe-skylines.mjs                  # verify chosen files
//   node scripts/probe-skylines.mjs --search         # find candidates
//   node scripts/probe-skylines.mjs dallas boston    # only these markets
//
// WHERE THE CANDIDATES COME FROM, best first. Full-text search was the only
// source in the first version and it found nothing usable for all eighteen
// markets, because Commons full-text over the File namespace surfaces maps,
// diagrams and phone snapshots long before it surfaces the photograph an
// editor would put at the top of an article. The two better doors:
//
//   1. The Wikipedia article's own images. A city's article has been argued
//      over by people who care which photograph represents the place. Its
//      lead image, and any image whose name says skyline / panorama /
//      downtown, is a curated shortlist of exactly what we want.
//   2. Commons categories. "Category:Skyline of Baltimore" is a hand-filed
//      set. The naming is inconsistent across cities, so the script tries
//      several shapes per city and reports which ones exist — that report
//      is the point, since nothing here can be looked up from the sandbox.
//
// Search stays as the third door, for a market the first two miss.
//
// EVERY REJECTION IS PRINTED. The first version printed one line — "nothing
// usable found" — for a market whose files were all the wrong shape AND for
// a market whose search request was refused outright. Those need opposite
// fixes, so a run that cannot tell them apart is not a diagnostic. Now each
// candidate prints its real size and the reason it lost.
//
// Reads data/skyline-candidates.json. Never writes; the promotion into
// lib/skyline.ts is deliberate and human-read, because that is where the
// licence obligation is taken on.

import { readFileSync } from "node:fs";

const UA =
  "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com; commercial real estate deal screening)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const WIDTH = 1600;

/** How many candidates a market's metadata is actually fetched for. */
const PER_MARKET = 9;
/** The whole search pass gives up here, so live-verify stays quick. */
const DEADLINE_MS = 240_000;
const startedAt = Date.now();
const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Never two requests inside PACE_MS of each other, across the whole run.
 *
 * The second run still collected 429s from Commons partway through (San
 * Francisco's categories, every one). Backing off after the refusal is the
 * cure; pacing is the prevention, and Wikimedia's guidance asks for serial,
 * unhurried reads rather than a burst an IP has to be throttled out of.
 * ~200 requests at this pace is about thirty seconds, which live-verify can
 * comfortably carry.
 */
const PACE_MS = 150;
let nextSlot = 0;
async function paced() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + PACE_MS;
  if (at > now) await sleep(at - now);
}

/**
 * One request, with the courtesy a free service is owed.
 *
 * Wikimedia asks automated readers to identify themselves and to back off
 * rather than retry hard. The first version did neither past the User-Agent,
 * and the evidence is in the run it produced: the first four markets took
 * seconds each, every market after them came back in 0.18s — the shape of a
 * host that had started refusing, reported as "nothing found".
 */
async function api(url, { tries = 3 } = {}) {
  let wait = 1500;
  for (let attempt = 1; attempt <= tries; attempt++) {
    await paced();
    let res;
    try {
      res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (attempt === tries) return { ok: false, status: 0, error: String(err?.message ?? err) };
      await sleep(wait);
      wait *= 2;
      continue;
    }
    if (res.ok) return { ok: true, status: res.status, body: await res.json() };
    // 429 and 5xx are "ask again later"; a 400 or a 404 is an answer.
    if (res.status !== 429 && res.status < 500) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    if (attempt === tries) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    await sleep(wait);
    wait *= 2;
  }
  return { ok: false, status: 0, error: "unreachable" };
}

/**
 * One spelling per file.
 *
 * Commons treats an underscore and a space as the same character in a title,
 * and the two APIs disagree about which to hand back: `pageimages` returns
 * "Boston_Financial_District_skyline.jpg" while `images` returns the same
 * file with spaces. Left alone that is two candidates, two metadata calls
 * and two identical rejection lines, which is exactly what the last run
 * printed for Boston, Los Angeles and Dallas.
 */
function canonical(file) {
  return String(file).replace(/_/g, " ").trim();
}

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
  // `mime` is its OWN iiprop value — `size` gives width/height/bytes and
  // `url` gives the paths, neither carries the media type. Leaving it out
  // is what made the first two runs reject all eighteen markets with "not a
  // photograph (undefined)": the type test was reading a field that had
  // never been requested, so every file failed it, including the ones we
  // were looking for.
  const url =
    `${COMMONS}?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(`File:${file}`)}` +
    `&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata`;
  const res = await api(url);
  if (!res.ok) return { ok: false, error: `api ${res.error}` };
  const page = res.body?.query?.pages?.[0];
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
    description: plain(ex.ImageDescription?.value).slice(0, 120),
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

// ---------------------------------------------------------------------------
// The three doors
// ---------------------------------------------------------------------------

/** Every image on a Wikipedia article, lead image first. */
async function articleImages(title) {
  const url =
    `${WIKIPEDIA}?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(title)}` +
    `&prop=pageimages%7Cimages&piprop=name&imlimit=60`;
  const res = await api(url);
  if (!res.ok) return { ok: false, error: res.error, files: [] };
  const page = res.body?.query?.pages?.[0];
  if (!page || page.missing) return { ok: false, error: "no such article", files: [] };
  const lead = page.pageimage ? [canonical(page.pageimage)] : [];
  const rest = (page.images ?? [])
    .map((i) => canonical(String(i.title).replace(/^File:/, "")))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  return { ok: true, lead, files: [...lead, ...rest] };
}

/** The files filed under a Commons category, if that category exists. */
async function categoryFiles(category, limit = 40) {
  const url =
    `${COMMONS}?action=query&format=json&formatversion=2` +
    `&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${category}`)}` +
    `&cmtype=file&cmlimit=${limit}`;
  const res = await api(url);
  if (!res.ok) return { ok: false, error: res.error, files: [] };
  const members = res.body?.query?.categorymembers ?? [];
  return {
    ok: true,
    files: members
      .map((m) => canonical(String(m.title).replace(/^File:/, "")))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
  };
}

/** Commons full-text search over the File namespace. */
async function search(query, limit = 12) {
  const url =
    `${COMMONS}?action=query&format=json&formatversion=2` +
    `&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srnamespace=6&srlimit=${limit}`;
  const res = await api(url);
  if (!res.ok) return { ok: false, error: res.error, files: [] };
  return {
    ok: true,
    files: (res.body?.query?.search ?? [])
      .map((r) => canonical(String(r.title).replace(/^File:/, "")))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
  };
}

// ---------------------------------------------------------------------------
// Judging a file
// ---------------------------------------------------------------------------

/**
 * A photograph worth putting behind a headline.
 *
 * Wide enough not to soften at 1600px, landscape enough to crop into a band,
 * and not a strip panorama — those read as a smear at any height a page can
 * give them. Deliberately looser than the first version (which demanded
 * 1600px and 1.5:1) because it rejected everything.
 */
function judge(meta) {
  if (!meta.ok) return { usable: false, why: meta.error };
  if (!/^image\/(jpeg|png|webp)$/.test(meta.mime ?? "")) {
    return { usable: false, why: `not a photograph (${meta.mime})` };
  }
  if (meta.width < 1400) return { usable: false, why: `too small (${meta.width}px wide)` };
  const ratio = meta.width / meta.height;
  if (ratio < 1.3) return { usable: false, why: `too tall (${ratio.toFixed(2)}:1)` };
  if (ratio > 5) return { usable: false, why: `strip panorama (${ratio.toFixed(1)}:1)` };
  if (meta.restrictions) return { usable: false, why: `restricted: ${meta.restrictions}` };
  return { usable: true, why: "" };
}

/** A file whose NAME says it is the shot we want, before any metadata call. */
const PROMISING = /skyline|panorama|downtown|cityscape|aerial|harbor|harbour|from[ _]/i;
/** A file whose name says it is not: flags, seals, maps, logos, montages. */
const REJECT_NAME =
  /flag|seal|coat[ _]of[ _]arms|logo|map|locator|diagram|chart|montage|collage|\.svg$|icon|banner|portrait|statue|plaque|sign/i;

function nameScore(file) {
  if (REJECT_NAME.test(file)) return -1;
  return PROMISING.test(file) ? 2 : 0;
}

/**
 * The shapes a city's Commons category goes by. There is no single
 * convention, so we try them all and let the run say which exist.
 */
function categoryGuesses(city) {
  const bare = city.replace(/,.*$/, "").trim();
  return [
    `Skyline of ${bare}`,
    `Views of ${bare}`,
    `${bare} skyline`,
    `Panoramics of ${bare}`,
    `Cityscape of ${bare}`,
  ];
}

// ---------------------------------------------------------------------------
// SEARCH MODE — `node scripts/probe-skylines.mjs --search`
// ---------------------------------------------------------------------------

async function searchMode(markets) {
  console.log(`SKYLINE SEARCH: ${markets.length} markets, Commons and Wikipedia from this runner`);

  for (const market of markets) {
    console.log(`\n== ${market.metroId} (${market.city ?? ""})`);
    if (outOfTime()) {
      console.log("   (out of time — run the remaining markets by name)");
      continue;
    }

    /** file -> why it is a candidate, so the report can say where it came from. */
    const found = new Map();
    const note = (file, from) => {
      if (!found.has(file)) found.set(file, from);
    };

    // Door 1: the article's own images.
    for (const title of market.wikipedia ?? []) {
      const art = await articleImages(title);
      if (!art.ok) {
        console.log(`   article "${title}": ${art.error}`);
        continue;
      }
      const useful = art.files.filter((f) => nameScore(f) >= 0);
      console.log(
        `   article "${title}": ${art.files.length} images` +
          `${art.lead.length ? `, lead ${art.lead[0]}` : ", no lead image"}`,
      );
      for (const f of art.lead) note(f, "article lead");
      for (const f of useful) if (nameScore(f) > 0) note(f, `article "${title}"`);
    }

    // Door 2: hand-filed Commons categories.
    const cats = market.categories ?? categoryGuesses(market.city ?? market.metroId);
    for (const cat of cats) {
      if (outOfTime()) break;
      const res = await categoryFiles(cat);
      if (!res.ok) {
        console.log(`   category "${cat}": ${res.error}`);
        continue;
      }
      if (res.files.length === 0) continue;
      console.log(`   category "${cat}": ${res.files.length} files`);
      const ranked = res.files.filter((f) => nameScore(f) >= 0).sort((a, b) => nameScore(b) - nameScore(a));
      for (const f of ranked.slice(0, 12)) note(f, `category "${cat}"`);
    }

    // Door 3: full-text search, for whatever the first two missed.
    if (found.size < PER_MARKET) {
      for (const q of market.queries ?? []) {
        if (outOfTime() || found.size >= PER_MARKET * 2) break;
        const res = await search(q);
        if (!res.ok) {
          console.log(`   search "${q}": ${res.error}`);
          continue;
        }
        for (const f of res.files) if (nameScore(f) > 0) note(f, "search");
      }
    }

    if (found.size === 0) {
      console.log("   NO CANDIDATES from any door — every request above failed or came back empty");
      continue;
    }

    // Now spend the metadata calls, best-named first.
    const ordered = [...found.entries()].sort((a, b) => nameScore(b[0]) - nameScore(a[0]));
    let usable = 0;
    let checked = 0;
    for (const [file, from] of ordered) {
      if (checked >= PER_MARKET || outOfTime()) break;
      checked++;
      const meta = await metadata(file);
      const verdict = judge(meta);
      if (!verdict.usable) {
        console.log(`   no   ${file} — ${verdict.why}`);
        continue;
      }
      usable++;
      console.log(
        `   YES  ${meta.width}x${meta.height} (${(meta.width / meta.height).toFixed(2)}:1)  ${file}\n` +
          `        from: ${from}\n` +
          `        author: ${meta.artist}\n` +
          `        licence: ${meta.license}${meta.licenseUrl ? ` (${meta.licenseUrl})` : ""}` +
          `${meta.description ? `\n        shows: ${meta.description}` : ""}`,
      );
    }
    console.log(
      `   -- ${usable} usable of ${checked} checked (${found.size} candidates gathered)`,
    );
  }
  console.log(`\nSKYLINE SEARCH: done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
}

// ---------------------------------------------------------------------------
// VERIFY MODE — the default
// ---------------------------------------------------------------------------

async function verifyMode(markets) {
  console.log(`SKYLINE PROBE: ${markets.length} markets, Commons resolved from this runner`);
  let verified = 0;
  let dead = 0;

  for (const market of markets) {
    const candidates = market.candidates ?? [];
    if (candidates.length === 0) continue;
    console.log(`\n== ${market.metroId} (${market.city ?? ""})`);
    for (const cand of candidates) {
      const meta = await metadata(cand.file);
      const thumb = await thumbnail(cand.file);
      if (!meta.ok || !thumb.ok) {
        dead++;
        console.log(`   DEAD  ${cand.file} — ${meta.ok ? thumb.error : meta.error}`);
        continue;
      }
      verified++;
      const kb = Math.round(thumb.bytes / 1024);
      const verdict = judge(meta);
      console.log(
        `   LIVE  ${cand.file}\n` +
          `         ${meta.width}x${meta.height} ${meta.mime} · ${kb} KB at ${WIDTH}px · ` +
          `${verdict.usable ? "shape ok" : verdict.why}\n` +
          `         author: ${meta.artist}\n` +
          `         licence: ${meta.license}${meta.licenseUrl ? ` (${meta.licenseUrl})` : ""}`,
      );
    }
  }
  console.log(`\nSKYLINE PROBE: ${verified} live, ${dead} dead`);
}

// ---------------------------------------------------------------------------

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

if (doSearch) await searchMode(markets);
else await verifyMode(markets);
process.exit(0);
