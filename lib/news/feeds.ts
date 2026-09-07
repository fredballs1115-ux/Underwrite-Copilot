/**
 * Live real-estate headlines, straight from the publishers — the part of the
 * News page that is never empty.
 *
 * The scored feed on /news depends on the weekday intel sweep (a cron with
 * three secrets) and stays empty until that runs. This layer needs no key
 * and no cron: the publishers' own RSS/Atom feeds plus a few Google News
 * topic queries, fetched at request time with a half-hour cache, parsed
 * here, and ranked by recency and how much the headline touches the things
 * that move a deal (rates, cap rates, distress, regulation, supply). Every
 * headline links to the article; every item names its publisher.
 *
 * This module is PURE — parsing and ranking on strings, tested on fixtures
 * of the feeds' real shapes. The network lives in ./live.ts.
 */

export interface NewsSource {
  id: string;
  /** publisher name as shown */
  name: string;
  /** where the name links */
  home: string;
  /** the feed to fetch */
  feed: string;
  /** "publisher" = the outlet's own feed; "topic" = a Google News search
   *  whose items name their publisher in <source> */
  kind: "publisher" | "topic";
  /** how many of this source's items may make the ranked list */
  cap: number;
}

const googleNews = (q: string): string => {
  const u = new URL("https://news.google.com/rss/search");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("ceid", "US:en");
  return u.toString();
};

/**
 * The sources. Publisher feeds first — those are the links a reader trusts —
 * then Google News topic searches as the backstop that keeps the page full
 * even when a publisher blocks a server fetch. Any source that fails is
 * skipped and named in the footer, never invented around.
 */
export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: "commercial-observer",
    name: "Commercial Observer",
    home: "https://commercialobserver.com/",
    feed: "https://commercialobserver.com/feed/",
    kind: "publisher",
    cap: 4,
  },
  {
    id: "the-real-deal",
    name: "The Real Deal",
    home: "https://therealdeal.com/",
    feed: "https://therealdeal.com/feed/",
    kind: "publisher",
    cap: 4,
  },
  {
    id: "globest",
    name: "GlobeSt",
    home: "https://www.globest.com/",
    feed: "https://feeds.feedblitz.com/globest/national",
    kind: "publisher",
    cap: 4,
  },
  {
    id: "multi-housing-news",
    name: "Multi-Housing News",
    home: "https://www.multihousingnews.com/",
    feed: "https://www.multihousingnews.com/feed/",
    kind: "publisher",
    cap: 3,
  },
  {
    id: "cpe",
    name: "Commercial Property Executive",
    home: "https://www.commercialsearch.com/news/",
    feed: "https://www.commercialsearch.com/news/feed/",
    kind: "publisher",
    cap: 3,
  },
  {
    id: "connect-cre",
    name: "Connect CRE",
    home: "https://www.connectcre.com/",
    feed: "https://www.connectcre.com/feed/",
    kind: "publisher",
    cap: 3,
  },
  {
    id: "rebusiness",
    name: "REBusinessOnline",
    home: "https://rebusinessonline.com/",
    feed: "https://rebusinessonline.com/feed/",
    kind: "publisher",
    cap: 3,
  },
  {
    id: "federal-reserve",
    name: "Federal Reserve",
    home: "https://www.federalreserve.gov/newsevents/pressreleases.htm",
    feed: "https://www.federalreserve.gov/feeds/press_all.xml",
    kind: "publisher",
    cap: 2,
  },
  {
    id: "gn-cre",
    name: "Google News · commercial real estate",
    home: "https://news.google.com/search?q=commercial%20real%20estate",
    feed: googleNews('"commercial real estate"'),
    kind: "topic",
    cap: 6,
  },
  {
    id: "gn-multifamily",
    name: "Google News · multifamily",
    home: "https://news.google.com/search?q=multifamily%20apartments%20sale",
    feed: googleNews('multifamily OR apartment "cap rate" OR portfolio sale OR acquisition'),
    kind: "topic",
    cap: 5,
  },
  {
    id: "gn-debt",
    name: "Google News · CRE debt & distress",
    home: "https://news.google.com/search?q=CMBS%20delinquency%20office%20distress",
    feed: googleNews('CMBS OR "commercial mortgage" delinquency OR distress OR foreclosure office OR multifamily'),
    kind: "topic",
    cap: 5,
  },
  {
    id: "gn-regulation",
    name: "Google News · rent regulation",
    home: "https://news.google.com/search?q=rent%20control%20ordinance",
    feed: googleNews('"rent control" OR "rent stabilization" OR "good cause eviction" landlord council'),
    kind: "topic",
    cap: 4,
  },
];

// ── Parsing ──────────────────────────────────────────────────────────────

export interface FeedItem {
  title: string;
  url: string;
  /** publisher name — the feed's, or the <source> a Google News item names */
  publisher: string;
  /** publisher home, when the item names one (Google News) */
  publisherUrl: string | null;
  /** ISO timestamp, null when the feed gave none or an unparseable one */
  publishedAt: string | null;
  /** one plain-text line, ≤ 220 chars, "" when none */
  snippet: string;
  sourceId: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** Unwrap CDATA, decode entities (named, decimal, hex), collapse whitespace. */
export function decodeText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Tags out, entities decoded, one line, capped. CDATA is unwrapped before
 *  the tag strip (or the strip eats the CDATA opener and leaves "]]>"), and
 *  tags are stripped again after decoding, because Atom summaries arrive as
 *  ESCAPED html — "&lt;p&gt;" only becomes a tag once decoded. */
export function toSnippet(html: string, max = 220): string {
  const unwrapped = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const decoded = decodeText(unwrapped.replace(/<[^>]+>/g, " "));
  const text = decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 120 ? at : max).trimEnd()}…`;
}

const tag = (block: string, name: string): string | null => {
  // <name ...>inner</name>, first occurrence, namespace-tolerant
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
};

const attr = (openTag: string, name: string): string | null => {
  const m = openTag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? decodeText(m[1]) : null;
};

function isoOrNull(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(decodeText(s));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Atom's link is an attribute, and there may be several — take rel=alternate,
 *  else the first with an href. */
function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /rel\s*=\s*"alternate"/i.test(l)) ?? links.find((l) => !/rel\s*=/i.test(l)) ?? links[0];
  return alt ? attr(alt, "href") : null;
}

/**
 * Parse an RSS 2.0 or Atom document into items. Tolerant by design: a feed
 * with odd namespaces, CDATA everywhere, or missing dates still yields its
 * headlines. Items without a title or a link are dropped.
 */
export function parseFeed(xml: string, source: NewsSource): FeedItem[] {
  const out: FeedItem[] = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1])
    : [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);

  for (const block of blocks) {
    let title = decodeText(tag(block, "title") ?? "");
    const url = isAtom
      ? (atomLink(block) ?? "")
      : decodeText(tag(block, "link") ?? "") || (attr(block.match(/<link\b[^>]*\/?>/i)?.[0] ?? "", "href") ?? "");
    if (!title || !/^https?:\/\//i.test(url)) continue;

    // Google News names the outlet in <source url="…">Name</source> and
    // suffixes the title with " - Name"; keep the outlet, drop the suffix.
    let publisher = source.kind === "topic" ? "" : source.name;
    let publisherUrl: string | null = source.kind === "topic" ? null : source.home;
    const srcOpen = block.match(/<source\b[^>]*>/i)?.[0] ?? "";
    const srcName = decodeText(tag(block, "source") ?? "");
    if (srcName) {
      publisher = srcName;
      publisherUrl = attr(srcOpen, "url");
      const suffix = ` - ${srcName}`;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
    }
    if (!publisher) publisher = source.name;

    const dateRaw =
      tag(block, "pubDate") ??
      tag(block, "published") ??
      tag(block, "updated") ??
      tag(block, "dc:date") ??
      null;
    const bodyRaw =
      tag(block, "content:encoded") ??
      tag(block, "description") ??
      tag(block, "summary") ??
      tag(block, "content") ??
      "";

    out.push({
      title,
      url,
      publisher,
      publisherUrl,
      publishedAt: isoOrNull(dateRaw),
      snippet: toSnippet(bodyRaw),
      sourceId: source.id,
    });
  }
  return out;
}

// ── Ranking ──────────────────────────────────────────────────────────────

/** What moves a deal — a headline touching these ranks above one that does
 *  not, whatever its age. Weights are small and capped so recency still
 *  decides between two live stories. */
const SIGNALS: [RegExp, number][] = [
  [/\bcap rates?\b/i, 2],
  [/\b(fed|federal reserve|fomc|rate (cut|hike)|interest rates?|treasury|10-year|sofr)\b/i, 2],
  [/\b(cmbs|delinquen\w*|distress\w*|default\w*|foreclos\w*|receiver\w*|special servic\w*|maturit\w*)\b/i, 2],
  [/\b(rent control|rent stabili[sz]ation|good cause|eviction|topa|ordinance|zoning|entitle\w*)\b/i, 2],
  [/\b(tariffs?|insurance premiums?|property tax\w*|assessment\w*|opportunity zone|1031|bonus depreciation)\b/i, 1],
  [/\b(multifamily|apartments?|office|industrial|warehouse|retail|shopping center|data center|hotel|self-storage)\b/i, 1],
  [/\b(vacancy|absorption|supply|deliveries|construction starts|permits|pipeline|conversion)\b/i, 1],
  [/\b(refinanc\w*|loan|lender|lending|fannie mae|freddie mac|hud|fha|agency debt|debt fund)\b/i, 1],
  [/\b(acqui\w*|sale|sold|portfolio|trade[sd]?|deal|price per|\$\d)/i, 1],
];
const SIGNAL_CAP = 5;

/** The headline's relevance score: recency plus capped signal weight. */
export function scoreHeadline(item: FeedItem, now = Date.now()): number {
  let recency = 1; // unknown date: middling, never zero
  if (item.publishedAt) {
    const hours = (now - Date.parse(item.publishedAt)) / 3_600_000;
    recency = hours <= 6 ? 3 : hours <= 24 ? 2.4 : hours <= 72 ? 1.6 : hours <= 240 ? 0.8 : 0;
  }
  const text = `${item.title} ${item.snippet}`;
  let signal = 0;
  for (const [rx, w] of SIGNALS) if (rx.test(text)) signal += w;
  return recency + Math.min(SIGNAL_CAP, signal);
}

const normTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

export interface RankedHeadline extends FeedItem {
  score: number;
}

/**
 * Rank, dedupe and cap. Drops anything older than ten days (a "live" section
 * must not show last month), the same story from two feeds, and more than a
 * source's share, so one chatty publisher cannot fill the page.
 */
export function rankHeadlines(
  items: FeedItem[],
  sources: readonly NewsSource[] = NEWS_SOURCES,
  now = Date.now(),
  limit = 30,
): RankedHeadline[] {
  const caps = new Map(sources.map((s) => [s.id, s.cap]));
  const cutoff = now - 10 * 86_400_000;
  const scored = items
    .filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff)
    .map((i) => ({ ...i, score: scoreHeadline(i, now) }))
    .sort((a, b) => b.score - a.score || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const used = new Map<string, number>();
  const out: RankedHeadline[] = [];
  for (const it of scored) {
    const u = it.url.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    const t = normTitle(it.title);
    if (seenUrl.has(u) || (t && seenTitle.has(t))) continue;
    const n = used.get(it.sourceId) ?? 0;
    if (n >= (caps.get(it.sourceId) ?? 3)) continue;
    seenUrl.add(u);
    if (t) seenTitle.add(t);
    used.set(it.sourceId, n + 1);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/** "2h ago", "yesterday", "Sep 5" — for the row's timestamp. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const h = ms / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
