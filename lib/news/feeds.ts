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
  /** where to read this publisher when its own feed refuses the fetcher
   *  or parses to nothing — tried in order, inside the same deadline */
  fallbacks?: readonly NewsFallback[];
}

export interface NewsFallback {
  feed: string;
  kind: "publisher" | "topic";
  /** named in the source's status when this candidate answered */
  label: string;
}

const googleNews = (q: string): string => {
  const u = new URL("https://news.google.com/rss/search");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("ceid", "US:en");
  return u.toString();
};

/** Bing News search as RSS — a second search host, so one throttled host
 *  never blanks every search-backed source at once. Its items name the
 *  outlet in <News:Source> and link through a redirect the parser unwraps. */
const bingNews = (q: string): string => {
  const u = new URL("https://www.bing.com/news/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "rss");
  return u.toString();
};

/** A publisher read through the search hosts, scoped to its own site: the
 *  items name the outlet, so they rank and show as the publisher's. Google
 *  first, Bing when Google refuses or hangs — inside the same deadline. */
const siteReads = (domain: string): NewsFallback[] => [
  { feed: googleNews(`site:${domain}`), kind: "topic", label: `Google News · site:${domain}` },
  { feed: bingNews(`site:${domain}`), kind: "topic", label: `Bing News · site:${domain}` },
];

/** The same topic on Bing, behind a Google News topic search. */
const bingTopic = (q: string, topic: string): NewsFallback => ({
  feed: bingNews(q),
  kind: "topic",
  label: `Bing News · ${topic}`,
});

/** The search host a status came in through, read off the way-in label
 *  (`via`) the fetcher wrote — Google unless the label says Bing. */
export const SEARCH_HOSTS = {
  google: { name: "Google News", home: "https://news.google.com/" },
  bing: { name: "Bing News", home: "https://www.bing.com/news" },
} as const;

/** Which search hosts stand behind the topic sources that answered, in the
 *  order they first appear — the footer names each one it leaned on. */
export function searchHostsAnswering(
  sources: readonly { kind: NewsSource["kind"]; ok: boolean; stale: boolean; via?: string }[],
): { name: string; home: string }[] {
  const out: { name: string; home: string }[] = [];
  for (const s of sources) {
    if (s.kind !== "topic" || !(s.ok || s.stale)) continue;
    const host = s.via?.startsWith("Bing News") ? SEARCH_HOSTS.bing : SEARCH_HOSTS.google;
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

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
  // The four below answer a server fetch with HTTP 403 or an empty page
  // (read from Render's own network by live-verify's NEWS HEALTH lines);
  // each falls back to a site-scoped search read of the same outlet.
  {
    id: "the-real-deal",
    name: "The Real Deal",
    home: "https://therealdeal.com/",
    feed: "https://therealdeal.com/feed/",
    kind: "publisher",
    cap: 4,
    fallbacks: siteReads("therealdeal.com"),
  },
  {
    id: "globest",
    name: "GlobeSt",
    home: "https://www.globest.com/",
    feed: "https://feeds.feedblitz.com/globest/national",
    kind: "publisher",
    cap: 4,
    fallbacks: [
      { feed: "https://www.globest.com/feed/", kind: "publisher", label: "globest.com/feed" },
      ...siteReads("globest.com"),
    ],
  },
  {
    id: "multi-housing-news",
    name: "Multi-Housing News",
    home: "https://www.multihousingnews.com/",
    feed: "https://www.multihousingnews.com/feed/",
    kind: "publisher",
    cap: 3,
    fallbacks: siteReads("multihousingnews.com"),
  },
  {
    id: "cpe",
    name: "Commercial Property Executive",
    home: "https://www.commercialsearch.com/news/",
    feed: "https://www.commercialsearch.com/news/feed/",
    kind: "publisher",
    cap: 3,
    // The feed answers 403 and the site-scoped reads parse to zero on Bing
    // and time out on Google (every fresh process on 2026-09-14 missed this
    // one source). From the runner, the bare domain on Bing answered two
    // items and the outlet's name as a phrase on Google a hundred — enough
    // for a cap of three either way — so both stand behind the site reads.
    fallbacks: [
      ...siteReads("commercialsearch.com"),
      { feed: bingNews("commercialsearch.com"), kind: "topic", label: "Bing News · commercialsearch.com" },
      {
        feed: googleNews('"Commercial Property Executive"'),
        kind: "topic",
        label: "Google News · Commercial Property Executive",
      },
    ],
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
  // The topic searches: Google News first, the same topic on Bing when
  // Google answers 503 or holds the connection (it does both under a burst
  // from one address — read on a fresh process by live-verify). A Bing
  // query is plain keywords or one quoted phrase: Google's OR syntax
  // passed through parsed to zero items there, and live-verify's search-
  // door probes say what each phrasing returns from the runner.
  {
    id: "gn-cre",
    name: "Google News · commercial real estate",
    home: "https://news.google.com/search?q=commercial%20real%20estate",
    feed: googleNews('"commercial real estate"'),
    kind: "topic",
    cap: 6,
    fallbacks: [bingTopic('"commercial real estate"', "commercial real estate")],
  },
  {
    id: "gn-multifamily",
    name: "Google News · multifamily",
    home: "https://news.google.com/search?q=multifamily%20apartments%20sale",
    feed: googleNews('multifamily OR apartment "cap rate" OR portfolio sale OR acquisition'),
    kind: "topic",
    cap: 5,
    fallbacks: [bingTopic("multifamily", "multifamily")],
  },
  {
    id: "gn-debt",
    name: "Google News · CRE debt & distress",
    home: "https://news.google.com/search?q=CMBS%20delinquency%20office%20distress",
    feed: googleNews('CMBS OR "commercial mortgage" delinquency OR distress OR foreclosure office OR multifamily'),
    kind: "topic",
    cap: 5,
    fallbacks: [bingTopic("CMBS delinquency distress", "CRE debt & distress")],
  },
  {
    id: "gn-regulation",
    name: "Google News · rent regulation",
    home: "https://news.google.com/search?q=rent%20control%20ordinance",
    feed: googleNews('"rent control" OR "rent stabilization" OR "good cause eviction" landlord council'),
    kind: "topic",
    cap: 4,
    fallbacks: [bingTopic('"rent control"', "rent regulation")],
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
  /** the story's picture from the feed, https only; null when it carries none */
  image?: string | null;
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

/** A numeric entity's character, or null when the code point is outside
 *  Unicode ("&#1114112;", "&#x110000;", a runaway digit string):
 *  String.fromCodePoint throws on those, and a parser that throws loses
 *  the whole source. The entity is left as it came instead. */
function codePoint(n: number): string | null {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
    ? String.fromCodePoint(n)
    : null;
}

/** Unwrap CDATA, decode entities (named, decimal, hex), collapse whitespace. */
export function decodeText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (m: string, h: string) => codePoint(parseInt(h, 16)) ?? m)
    .replace(/&#(\d+);/g, (m: string, d: string) => codePoint(parseInt(d, 10)) ?? m)
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Tags out, entities decoded, one line, capped. CDATA is unwrapped before
 *  the tag strip (or the strip eats the CDATA opener and leaves "]]>").
 *  Two levels, because an Atom or Google body arrives as ESCAPED html:
 *  the first decode reveals its tags ("&lt;p&gt;" becomes a tag) and
 *  leaves its own entities one level down ("&amp;nbsp;" becomes
 *  "&nbsp;"), so the tags are stripped and the entities decoded once
 *  more — or the page shows the literal "&nbsp;" on every such row. */
export function toSnippet(html: string, max = 220): string {
  const unwrapped = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const xmlLevel = decodeText(unwrapped.replace(/<[^>]+>/g, " "));
  const text = decodeText(xmlLevel.replace(/<[^>]+>/g, " "));
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

const IMAGE_TYPE = /^image\//i;

/** The story's picture, when the feed carries one: media:content or
 *  media:thumbnail (WordPress and most publishers), an image enclosure,
 *  Bing's News:Image, or the first <img> in the body — https only, since
 *  it reaches an <img src> on an https page. */
export function itemImage(block: string, body: string): string | null {
  const candidates: (string | null)[] = [];
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)) {
    const medium = attr(m[0], "medium");
    const type = attr(m[0], "type");
    if ((medium && medium !== "image") || (type && !IMAGE_TYPE.test(type))) continue;
    candidates.push(attr(m[0], "url"));
  }
  for (const m of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    if (IMAGE_TYPE.test(attr(m[0], "type") ?? "")) candidates.push(attr(m[0], "url"));
  }
  candidates.push(decodeText(tag(block, "News:Image") ?? ""));
  const inBody = decodeText(body).match(/<img\b[^>]*\ssrc\s*=\s*"([^"]+)"/i);
  if (inBody) candidates.push(inBody[1]);
  for (const c of candidates) {
    const u = c?.trim();
    if (u && /^https:\/\//i.test(u)) return u;
  }
  return null;
}

/** Bing News links through a click-tracking redirect whose `url` parameter
 *  is the article; the reader should land on the article, and the ranker
 *  should see the same address it sees from the publisher's own feed. */
export function directUrl(url: string): string {
  if (!/^https?:\/\/(?:www\.)?bing\.com\/news\/apiclick\.aspx/i.test(url)) return url;
  try {
    const real = new URL(url).searchParams.get("url");
    return real && /^https?:\/\//i.test(real) ? real : url;
  } catch {
    return url;
  }
}

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
    const rawUrl = isAtom
      ? (atomLink(block) ?? "")
      : decodeText(tag(block, "link") ?? "") || (attr(block.match(/<link\b[^>]*\/?>/i)?.[0] ?? "", "href") ?? "");
    const url = directUrl(rawUrl);
    if (!title || !/^https?:\/\//i.test(url)) continue;

    // Google News names the outlet in <source url="…">Name</source> and
    // suffixes the title with " - Name"; keep the outlet, drop the suffix.
    // Bing News names it in <News:Source>, no url, no suffix.
    let publisher = source.kind === "topic" ? "" : source.name;
    let publisherUrl: string | null = source.kind === "topic" ? null : source.home;
    const srcOpen = block.match(/<(?:news:)?source\b[^>]*>/i)?.[0] ?? "";
    const srcName = decodeText(tag(block, "source") ?? tag(block, "News:Source") ?? "");
    if (srcName) {
      publisher = srcName;
      // The outlet's home reaches an href: only http(s) does.
      const home = attr(srcOpen, "url");
      publisherUrl = home && /^https?:\/\//i.test(home) ? home : null;
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
      image: itemImage(block, bodyRaw),
      publishedAt: isoOrNull(dateRaw),
      snippet: toSnippet(bodyRaw),
      sourceId: source.id,
    });
  }
  return out;
}

// ── Ranking ──────────────────────────────────────────────────────────────

/** One thing a headline can touch: the pattern, its weight in the score,
 *  and the word the page tags the headline with — the same match drives
 *  both, so a tag never says what the score did not count. */
interface Signal {
  /** the tag; an asset-class signal tags the class it matched */
  label: string | ((m: RegExpExecArray) => string);
  rx: RegExp;
  w: number;
  /** false: counts in the score but is never a tag */
  tag?: false;
}

/** The asset word a headline uses, as the class the site names. */
const ASSET_CLASS_TAG: Record<string, string> = {
  apartment: "multifamily",
  apartments: "multifamily",
  warehouse: "industrial",
  "shopping center": "retail",
};

/** What moves a deal — a headline touching these ranks above one that does
 *  not, whatever its age. Weights are small and capped so recency still
 *  decides between two live stories. */
const SIGNALS: Signal[] = [
  { label: "cap rates", rx: /\bcap rates?\b/i, w: 2 },
  // "rate cuts" as often as "rate cut"; "fed up" is a tenant, not the Fed.
  { label: "rates", rx: /\b(fed(?!\s+up)|federal reserve|fomc|rate (?:cuts?|hikes?)|interest rates?|treasury|10-year|sofr)\b/i, w: 2 },
  { label: "distress", rx: /\b(cmbs|delinquen\w*|distress\w*|default\w*|foreclos\w*|receiver\w*|special servic\w*|maturit\w*)\b/i, w: 2 },
  { label: "regulation", rx: /\b(rent control|rent stabili[sz]ation|good cause|eviction|topa|ordinance|zoning|entitle\w*)\b/i, w: 2 },
  { label: "costs & tax", rx: /\b(tariffs?|insurance premiums?|property tax\w*|assessment\w*|opportunity zone|1031|bonus depreciation)\b/i, w: 1 },
  {
    label: (m) => {
      const word = m[1].toLowerCase();
      return ASSET_CLASS_TAG[word] ?? word;
    },
    rx: /\b(multifamily|apartments?|office|industrial|warehouse|retail|shopping center|data center|hotel|self-storage)\b/i,
    w: 1,
  },
  { label: "supply", rx: /\b(vacancy|absorption|supply|deliveries|construction starts|permits|pipeline|conversion)\b/i, w: 1 },
  { label: "debt", rx: /\b(refinanc\w*|loan|lender|lending|fannie mae|freddie mac|hud|fha|agency debt|debt fund)\b/i, w: 1 },
  // Every other headline is a deal; it counts, but it is not worth a tag.
  { label: "deal", rx: /\b(acqui\w*|sale|sold|portfolio|trade[sd]?|deal|price per|\$\d)/i, w: 1, tag: false },
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
  for (const s of SIGNALS) if (s.rx.test(text)) signal += s.w;
  return recency + Math.min(SIGNAL_CAP, signal);
}

export interface HeadlineSignal {
  label: string;
  /** a deal-moving signal (weight 2) — the page tints it; the rest are context */
  strong: boolean;
}

/**
 * Why the headline ranks, as the words the page tags it with: the
 * deal-moving signals it touches (cap rates, rates, distress, regulation),
 * then the context (costs & tax, the asset class it names, supply, debt),
 * in that order, at most `max`. The score counts "deal" too, but every
 * other headline is one, so it is never a tag; a headline touching nothing
 * gets none.
 */
export function headlineSignals(item: Pick<FeedItem, "title" | "snippet">, max = 3): HeadlineSignal[] {
  const text = `${item.title} ${item.snippet}`;
  const out: HeadlineSignal[] = [];
  // Stable sort: strongest first, the table's order within a weight.
  for (const s of [...SIGNALS].sort((a, b) => b.w - a.w)) {
    if (s.tag === false) continue;
    const m = s.rx.exec(text);
    if (!m) continue;
    const label = typeof s.label === "function" ? s.label(m) : s.label;
    if (out.some((o) => o.label === label)) continue;
    out.push({ label, strong: s.w >= 2 });
    if (out.length >= max) break;
  }
  return out;
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
