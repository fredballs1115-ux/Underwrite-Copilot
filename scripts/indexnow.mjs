#!/usr/bin/env node
// Tells the search engines that take IndexNow (Bing — which DuckDuckGo and
// Yahoo read — Yandex, Seznam, Naver) about every page in the live sitemap
// (#430). No account: the site proves it is the site by serving the key at
// its root (public/<key>.txt). The key is public by design — it proves
// ownership of the host, it grants nothing.
//
//   node scripts/indexnow.mjs            (SITE_URL overrides the host)
//
// Run by indexnow.yml weekly and on dispatch, never beside a deploy: the key
// file has to be live before the engines will read the list. Every failure
// is printed, never thrown — a search engine's answer is information, not a
// broken build.

export const INDEXNOW_KEY = "a399847bdac5364f2ed07a0d161f42ab";
const SITE = (process.env.SITE_URL ?? "https://underwrite-copilot.onrender.com").replace(/\/+$/, "");
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The sitemap's own URLs, unescaped, on this host only. */
export function sitemapUrls(xml, site) {
  const host = new URL(site).host;
  const out = [];
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const url = m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    try {
      if (new URL(url).host === host) out.push(url);
    } catch {
      // not a URL: skipped
    }
  }
  return [...new Set(out)];
}

async function main() {
  const keyLocation = `${SITE}/${INDEXNOW_KEY}.txt`;
  const served = await fetch(keyLocation, { signal: AbortSignal.timeout(20_000) })
    .then(async (r) => (r.ok ? (await r.text()).trim() : `HTTP ${r.status}`))
    .catch((e) => String(e));
  if (served !== INDEXNOW_KEY) {
    console.log(`KEY FILE: ${keyLocation} does not serve the key (${served.slice(0, 80)}) — not submitting; deploy first.`);
    return;
  }
  console.log(`KEY FILE: ${keyLocation} serves the key`);
  const xml = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.text());
  const urls = sitemapUrls(xml, SITE);
  console.log(`SITEMAP: ${urls.length} URLs on ${new URL(SITE).host}`);
  if (urls.length === 0) return;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation, urlList: urls }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => ({ status: 0, text: async () => String(e) }));
  // 200: accepted; 202: accepted, key validation pending; 400/403/422/429:
  // the engine's reason, printed as it gave it.
  console.log(`INDEXNOW: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
