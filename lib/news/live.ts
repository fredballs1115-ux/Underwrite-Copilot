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
 * parse, rank. Two layers of patience so the News page is never empty and
 * never slow:
 *
 *   1. Next's data cache — each feed is fetched at most once per half hour
 *      per server, whatever the traffic.
 *   2. A last-good copy per source in this process. When a publisher times
 *      out or blocks the fetch, its previous headlines (up to a day old)
 *      stand in, marked stale, rather than the section thinning out.
 *
 * A source that has never answered is simply absent from the list and named
 * in the status, so the page can say "GlobeSt did not answer just now"
 * instead of inventing around it.
 */

const REVALIDATE_S = 1800;
const TIMEOUT_MS = 8_000;
const STALE_MAX_MS = 24 * 3_600_000;
const UA = "underwrite-copilot/1.0 (+https://underwrite-copilot.onrender.com; news reader)";

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
  error?: string;
}

export interface LiveHeadlines {
  headlines: RankedHeadline[];
  sources: SourceStatus[];
  fetchedAt: string;
}

const lastGood = new Map<string, { at: number; items: FeedItem[] }>();

async function fetchSource(source: NewsSource): Promise<{ items: FeedItem[]; status: SourceStatus }> {
  const t0 = Date.now();
  const base = { id: source.id, name: source.name, home: source.home, kind: source.kind };
  try {
    const res = await fetch(source.feed, {
      headers: {
        "user-agent": UA,
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      },
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml, source);
    if (items.length === 0) throw new Error("feed parsed to zero items");
    lastGood.set(source.id, { at: Date.now(), items });
    return {
      items,
      status: { ...base, ok: true, count: items.length, ms: Date.now() - t0, stale: false },
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const prev = lastGood.get(source.id);
    if (prev && Date.now() - prev.at < STALE_MAX_MS) {
      return {
        items: prev.items,
        status: { ...base, ok: false, count: prev.items.length, ms: Date.now() - t0, stale: true, error: err },
      };
    }
    return { items: [], status: { ...base, ok: false, count: 0, ms: Date.now() - t0, stale: false, error: err } };
  }
}

/** Every source at once; the slowest decides the wait, capped by the timeout. */
export async function fetchLiveHeadlines(
  sources: readonly NewsSource[] = NEWS_SOURCES,
  limit = 30,
): Promise<LiveHeadlines> {
  const results = await Promise.all(sources.map((s) => fetchSource(s)));
  const items = results.flatMap((r) => r.items);
  return {
    headlines: rankHeadlines(items, sources, Date.now(), limit),
    sources: results.map((r) => r.status),
    fetchedAt: new Date().toISOString(),
  };
}
