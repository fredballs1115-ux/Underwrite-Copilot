#!/usr/bin/env node
// Daily market intel (Render cron, weekdays 12:00 UTC) — feeds the /news
// stories page, the digest, and the red-banner alerts.
//
//   1. Google News RSS per watch query (jurisdictions + sectors from Phase 1,
//      broadened with national-markets / deal-flow / construction watches)
//   2. dedupe on url vs market_intel_items
//   3. Claude (claude-sonnet-4-6) scores relevance 0-10 for THIS buyer and
//      flags likely LAW/REGULATION CHANGES against the regulatory_rules ids
//   4. digest markdown + action items → market_intel_digests
//   5. flagged rule changes → regulatory_alerts (red banner until dismissed)
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     node scripts/daily-intel.mjs
//
// No new npm deps: RSS is parsed with a minimal regex pass (titles/links/
// dates only), and the Anthropic call goes through fetch.

import { createClient } from "@supabase/supabase-js";

// One watch query per jurisdiction rule-set + per sector the buyer tracks.
// Keep queries SPECIFIC — Google News RSS returns ~100 items per query and
// relevance scoring costs tokens. The last three watches broaden the net to
// national markets / deal flow / construction so the /news stories feed
// covers more than regulation.
const WATCHES = [
  { sector: "regulation-dc", q: '"rent control" OR "rent stabilization" OR TOPA Washington DC council' },
  { sector: "regulation-md", q: '"rent stabilization" Maryland "Prince George" OR Montgomery OR "Takoma Park"' },
  { sector: "regulation-va", q: 'Virginia "rent control" OR "rent stabilization" General Assembly landlord' },
  { sector: "regulation-east", q: '"rent control" ordinance New Jersey OR Connecticut OR "New York" landlord small' },
  { sector: "multifamily", q: '"small multifamily" OR "duplex" OR "fourplex" investor market 2026' },
  { sector: "capital-markets", q: 'mortgage rates multifamily "cap rates" commercial real estate lending' },
  { sector: "tax", q: '"bonus depreciation" OR "opportunity zone" OR "1031 exchange" real estate investor' },
  { sector: "housing-policy", q: 'HUD "fair market rent" OR "FHA loan limit" OR "Section 8" payment standard' },
  { sector: "national-markets", q: 'commercial real estate office OR industrial OR retail vacancy "cap rate" OR CMBS' },
  { sector: "deal-flow", q: 'multifamily OR industrial OR "shopping center" portfolio acquisition OR sale price' },
  { sector: "construction-supply", q: 'multifamily construction starts OR completions OR permits apartments' },
];

const MAX_NEW_ITEMS = 40; // per run, across all watches
const DIGEST_THRESHOLD = 6; // relevance >= this makes the digest

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!url || !key || !anthropicKey) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

async function fetchRss(q) {
  const rss = new URL("https://news.google.com/rss/search");
  rss.searchParams.set("q", q);
  rss.searchParams.set("hl", "en-US");
  rss.searchParams.set("gl", "US");
  rss.searchParams.set("ceid", "US:en");
  const res = await fetch(rss, { headers: { "user-agent": "underwrite-copilot-intel/1.0" } });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? decode(t[1]) : "";
    };
    const link = pick("link");
    const title = pick("title");
    if (link && title) {
      items.push({
        url: link,
        title,
        source: pick("source") || null,
        published_at: pick("pubDate") ? new Date(pick("pubDate")).toISOString() : null,
      });
    }
  }
  return items;
}

// ── 1+2: gather + dedupe ────────────────────────────────────────────────────
const gathered = [];
for (const w of WATCHES) {
  try {
    const items = await fetchRss(w.q);
    for (const it of items.slice(0, 25)) gathered.push({ ...it, sector: w.sector });
  } catch (err) {
    console.error(`watch "${w.sector}": ${String(err)}`);
  }
}
const byUrl = new Map();
for (const it of gathered) if (!byUrl.has(it.url)) byUrl.set(it.url, it);
const candidates = [...byUrl.values()];

const seen = new Set();
for (let i = 0; i < candidates.length; i += 100) {
  const chunk = candidates.slice(i, i + 100).map((c) => c.url);
  const { data } = await supabase.from("market_intel_items").select("url").in("url", chunk);
  for (const row of data ?? []) seen.add(row.url);
}
const fresh = candidates.filter((c) => !seen.has(c.url)).slice(0, MAX_NEW_ITEMS);
const today = new Date().toISOString().slice(0, 10);
console.log(`gathered ${gathered.length}, unique ${candidates.length}, new ${fresh.length}`);
if (fresh.length === 0) {
  console.log("nothing new — no digest today");
  process.exit(0);
}

// ── 3: score with Claude ────────────────────────────────────────────────────
const { data: ruleRows } = await supabase
  .from("regulatory_rules")
  .select("id, jurisdiction_state, jurisdiction_local, rule_type");
const ruleIds = (ruleRows ?? []).map(
  (r) => `${r.id} (${r.jurisdiction_state}${r.jurisdiction_local ? "/" + r.jurisdiction_local : ""}, ${r.rule_type})`
);

const scoringPrompt = `You screen daily news for a specific real estate buyer:
a small hands-on investor, $1-2M total cash, buying 2-4 unit multifamily as a
NATURAL PERSON on the East Coast (DC/MD/VA core, expanding Maine-Florida),
whose strategy leans on small-landlord exemptions from rent regulation.

Score each numbered item 0-10 for decision-usefulness to THIS buyer (10 = act
this week; 0 = noise). Be stingy: generic market commentary scores <=3.

Known regulatory rules on file (id list): ${ruleIds.join("; ") || "none"}

A "rule_change" is a report that a LAW or REGULATION materially changed or is
about to (passed, signed, effective, struck down, new cap, new exemption) in a
jurisdiction relevant to the buyer — match it to a rule id from the list when
one fits, else rule_id null.

Items:
${fresh.map((c, i) => `${i}. [${c.sector}] ${c.title} (${c.source ?? "?"})`).join("\n")}

Reply with ONLY a JSON array, one object per item, same order:
[{"i":0,"relevance":7,"summary":"one sentence","action":"imperative next step or null","rule_change":false,"rule_id":null}, ...]`;

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.content?.map((b) => b.text ?? "").join("") ?? "";
}

let scores = [];
try {
  const raw = await callClaude(scoringPrompt);
  const jsonText = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
  scores = JSON.parse(jsonText);
} catch (err) {
  console.error(`scoring failed — storing items unscored: ${String(err)}`);
}
const scoreByIndex = new Map(scores.map((s) => [s.i, s]));

// ── 4: persist items + digest ───────────────────────────────────────────────
const rows = fresh.map((c, i) => {
  const s = scoreByIndex.get(i);
  return {
    url: c.url,
    title: c.title,
    source: c.source,
    sector: c.sector,
    published_at: c.published_at,
    relevance: typeof s?.relevance === "number" ? Math.max(0, Math.min(10, s.relevance)) : null,
    summary: s?.summary ?? null,
    action: s?.action ?? null,
  };
});
{
  const { error } = await supabase
    .from("market_intel_items")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
  if (error) throw new Error(`items upsert: ${error.message}`);
}

const notable = rows
  .map((r, i) => ({ ...r, rule: scoreByIndex.get(i) }))
  .filter((r) => (r.relevance ?? 0) >= DIGEST_THRESHOLD)
  .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));

const md = [
  `# Market intel — ${today}`,
  "",
  notable.length
    ? `${notable.length} item(s) worth your attention out of ${rows.length} new.`
    : `Nothing above the bar today (${rows.length} new items scanned).`,
  "",
  ...notable.flatMap((r) => [
    `## [${r.relevance}/10] ${r.title}`,
    `${r.summary ?? ""} ([${r.source ?? "link"}](${r.url}))`,
    ...(r.action ? [`**Action:** ${r.action}`] : []),
    "",
  ]),
].join("\n");
{
  const { error } = await supabase
    .from("market_intel_digests")
    .upsert(
      [{ digest_date: today, markdown: md, item_count: notable.length }],
      { onConflict: "digest_date" }
    );
  if (error) throw new Error(`digest upsert: ${error.message}`);
  console.log(`digest ${today}: ${notable.length} notable / ${rows.length} new`);
}

// ── 5: rule-change alerts ───────────────────────────────────────────────────
const knownIds = new Set((ruleRows ?? []).map((r) => r.id));
const changes = fresh
  .map((c, i) => ({ c, s: scoreByIndex.get(i) }))
  .filter(({ s }) => s?.rule_change === true);
for (const { c, s } of changes) {
  const rule_id = s.rule_id && knownIds.has(s.rule_id) ? s.rule_id : null;
  const { error } = await supabase.from("regulatory_alerts").insert([
    {
      rule_id,
      headline: c.title,
      url: c.url,
      detail: s.summary ?? null,
    },
  ]);
  if (error) console.error(`alert insert: ${error.message}`);
  else console.log(`ALERT${rule_id ? ` [${rule_id}]` : ""}: ${c.title}`);
}

console.log("intel run complete");
