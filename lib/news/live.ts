import "server-only";
import {
  NEWS_SOURCES,
  parseFeed,
  rankHeadlines,
  type FeedItem,
  type NewsSource,
  type RankedHeadline,
} from "./feeds";

/**
 * The network half of the live headlines: fetch every source in parallel,
 * parse, rank. Three layers of patience so the News page is never empty and
 * never slow:
 *
 *   1. A fresh copy per source in this process, good for half an hour —
 *      each feed is fetched at most twice an hour per server, whatever the
 *      traffic. (This replaced Next's data cache: a fetch that rides the
 *      framework's cache does not reliably honour its abort signal, and one
 *      publisher that accepts the connection and never answers then holds
 *      the whole streamed section open — the page shows its skeleton for
 *      as long as the browser waits.)
 *   2. A wall-clock deadline on every source, independent of the abort
 *      signal: whatever a publisher does, its slot resolves — with its
 *      items, its last good copy, or nothing — inside the timeout plus a
 *      hair. The section therefore always paints.
 *   3. A last-good copy per source. When a publisher times out or blocks
 *      the fetch, its previous headlines (up to a day old) stand in, marked
 *      stale, rather than the section thinning out.
 *
 * A source that has never answered is simply absent from the list and named
 * in the status, so the page can say "GlobeSt did not answer just now"
 * instead of inventing around it.
 */

const FRESH_MS = 30 * 60_000;
const TIMEOUT_MS = 8_000;
/** the wall-clock cap runs this much past the request's own timeout */
const DEADLINE_GRACE_MS = 700;
const STALE_MAX_MS = 24 * 3_600_000;
/** a second try of a candidate that answered 429 or 5xx waits this long */
const RETRY_WAIT_MS = 500;
/** no attempt starts with less of the source's budget than this left */
const MIN_ATTEMPT_MS = 300;
// Browser-shaped, and honest about who is asking: a publisher's edge rules
// refuse a bare product token outright (HTTP 403 from three of the feeds
// on Render's network), and the "compatible" form is what feed readers
// send. The contact URL stays, so a publisher can still find us.
const UA = "Mozilla/5.0 (compatible; UnderwriteCopilot/1.0; +https://underwrite-copilot.onrender.com/news)";

export interface SourceStatus {
  id: string;
  name: string;
  home: string;
  kind: NewsSource["kind"];
  ok: boolean;
  /** items parsed from this fetch (or from the stale copy) */
  count: number;
  ms: number;
  /** served from the last good copy because this fetch failed */
  stale: boolean;
  /** served from this process's fresh copy — no fetch was made */
  cached: boolean;
  /** the fallback that answered when the publisher's own feed did not */
  via?: string;
  error?: string;
}

class FeedError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** A 429 or a 5xx is the kind of refusal a second try can clear. */
const retriable = (e: unknown): boolean =>
  e instanceof FeedError && e.status != null && (e.status === 429 || e.status >= 500);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface LiveHeadlines {
  headlines: RankedHeadline[];
  sources: SourceStatus[];
  fetchedAt: string;
}

export interface LiveOptions {
  /** per-source request timeout (ms); the wall-clock deadline is this plus a grace */
  timeoutMs?: number;
}

const fresh = new Map<string, { at: number; items: FeedItem[] }>();
const lastGood = new Map<string, { at: number; items: FeedItem[] }>();

/** Rejects after `ms` — the wall clock, not the request's own signal. */
function deadline(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    // Never keep the process alive for a timer whose race is already over.
    if (typeof t === "object" && t && "unref" in t) t.unref();
  });
}

async function fetchFeed(
  url: string,
  kind: NewsSource["kind"],
  source: NewsSource,
  timeoutMs: number,
): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new FeedError(`HTTP ${res.status}`, res.status);
  const xml = await res.text();
  // A fallback read through Google News parses as a topic feed: its items
  // name the outlet in <source>, which the parser keeps as the publisher.
  const items = parseFeed(xml, kind === source.kind ? source : { ...source, kind });
  if (items.length === 0) throw new FeedError("feed parsed to zero items");
  return items;
}

/**
 * The publisher's own feed first, then its fallbacks in order, all inside
 * one budget — a candidate that answered 429 or 5xx gets one more try after
 * a short wait, while the budget allows. The error a source reports names
 * every candidate that failed, so the health line says which door closed.
 */
async function fetchWithFallbacks(
  source: NewsSource,
  timeoutMs: number,
): Promise<{ items: FeedItem[]; via: string | null }> {
  const started = Date.now();
  const left = () => timeoutMs - (Date.now() - started);
  const candidates = [
    { feed: source.feed, kind: source.kind, label: null as string | null },
    ...(source.fallbacks ?? []).map((f) => ({ feed: f.feed, kind: f.kind, label: f.label as string | null })),
  ];
  const errors: string[] = [];
  let attempted = 0;
  outer: for (const c of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const budget = left();
      // The publisher's own feed always gets its try, however short the
      // budget; a fallback or a retry starts only with real time left.
      if (attempted > 0 && budget < MIN_ATTEMPT_MS) break outer;
      attempted++;
      try {
        const items = await fetchFeed(c.feed, c.kind, source, budget);
        return { items, via: c.label };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(c.label ? `${c.label}: ${msg}` : msg);
        if (attempt === 0 && retriable(e) && left() > RETRY_WAIT_MS + MIN_ATTEMPT_MS) {
          await sleep(RETRY_WAIT_MS);
          continue;
        }
        break;
      }
    }
  }
  throw new Error(errors.length ? [...new Set(errors)].join(" · ") : "no candidate answered");
}

async function fetchSource(
  source: NewsSource,
  now: number,
  timeoutMs: number,
): Promise<{ items: FeedItem[]; status: SourceStatus }> {
  const base = { id: source.id, name: source.name, home: source.home, kind: source.kind };
  const have = fresh.get(source.id);
  if (have && now - have.at < FRESH_MS) {
    return {
      items: have.items,
      status: { ...base, ok: true, count: have.items.length, ms: 0, stale: false, cached: true },
    };
  }
  const t0 = Date.now();
  try {
    const { items, via } = await Promise.race([
      fetchWithFallbacks(source, timeoutMs),
      deadline(timeoutMs + DEADLINE_GRACE_MS),
    ]);
    fresh.set(source.id, { at: Date.now(), items });
    lastGood.set(source.id, { at: Date.now(), items });
    return {
      items,
      status: {
        ...base,
        ok: true,
        count: items.length,
        ms: Date.now() - t0,
        stale: false,
        cached: false,
        ...(via ? { via } : {}),
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const prev = lastGood.get(source.id);
    if (prev && Date.now() - prev.at < STALE_MAX_MS) {
      return {
        items: prev.items,
        status: {
          ...base,
          ok: false,
          count: prev.items.length,
          ms: Date.now() - t0,
          stale: true,
          cached: false,
          error: err,
        },
      };
    }
    return {
      items: [],
      status: { ...base, ok: false, count: 0, ms: Date.now() - t0, stale: false, cached: false, error: err },
    };
  }
}

/** Every source at once; the slowest decides the wait, capped by the deadline. */
export async function fetchLiveHeadlines(
  sources: readonly NewsSource[] = NEWS_SOURCES,
  limit = 30,
  opts: LiveOptions = {},
): Promise<LiveHeadlines> {
  const now = Date.now();
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const results = await Promise.all(sources.map((s) => fetchSource(s, now, timeoutMs)));
  const items = results.flatMap((r) => r.items);
  return {
    headlines: rankHeadlines(items, sources, Date.now(), limit),
    sources: results.map((r) => r.status),
    fetchedAt: new Date().toISOString(),
  };
}

/** Forget this process's fresh copies — the next call fetches every feed. */
export function forgetLiveHeadlines(): void {
  fresh.clear();
}
