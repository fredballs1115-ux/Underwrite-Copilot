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
 * parse, rank. Six layers of patience so the News page is never empty and
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
 *   4. A gate per host: at most two requests in flight to one host from
 *      this process, the rest queued in order. Eight of the sources read
 *      through one search host, and a fresh process that fires them all at
 *      once (with their retries) from one address gets 503s and held
 *      connections back — live-verify read exactly that on a cold start.
 *      Two at a time, the same host answers.
 *   5. One fetch per source, shared: two callers who arrive together (a
 *      visitor and the health probe, or a visitor and the warm-up) wait on
 *      the same request instead of doubling it.
 *   6. A warm-up at boot (instrumentation.ts → warmLiveHeadlines) that
 *      reads the sources one at a time, so the first visitor after a deploy
 *      finds every source cached — the burst never happens.
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
/** requests in flight to one host at a time, from this process */
const HOST_WIDTH = 2;
/** the warm-up leaves this long between one source and the next */
const WARM_GAP_MS = 250;
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
  /** the fallback that answered when the publisher's own feed did not
   *  (kept on the fresh copy, so a cached line still says the way in) */
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

interface Fetched {
  items: FeedItem[];
  via: string | null;
}

const fresh = new Map<string, { at: number; items: FeedItem[]; via: string | null }>();
const lastGood = new Map<string, { at: number; items: FeedItem[] }>();
/** the one request in flight per source, shared by whoever asks meanwhile */
const pending = new Map<string, Promise<Fetched>>();

// ── The per-host gate ────────────────────────────────────────────────────

const inFlight = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Resolves to the release once a slot on the host is free: at most
 *  HOST_WIDTH requests in flight per host, the rest queued in order. A slot
 *  a request gives up passes straight to the next in line. */
function acquireHost(host: string): Promise<() => void> {
  const n = inFlight.get(host) ?? 0;
  if (n < HOST_WIDTH) {
    inFlight.set(host, n + 1);
    return Promise.resolve(() => releaseHost(host));
  }
  return new Promise((resolve) => {
    const q = waiting.get(host) ?? [];
    q.push(() => resolve(() => releaseHost(host)));
    waiting.set(host, q);
  });
}

function releaseHost(host: string): void {
  const next = waiting.get(host)?.shift();
  if (next) {
    next();
    return;
  }
  const n = (inFlight.get(host) ?? 1) - 1;
  if (n <= 0) inFlight.delete(host);
  else inFlight.set(host, n);
}

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
  // A fallback read through a search host parses as a topic feed: its items
  // name the outlet, which the parser keeps as the publisher.
  const items = parseFeed(xml, kind === source.kind ? source : { ...source, kind });
  if (items.length === 0) throw new FeedError("feed parsed to zero items");
  return items;
}

/**
 * The publisher's own feed first, then its fallbacks in order, all inside
 * one budget — a candidate that answered 429 or 5xx gets one more try after
 * a short wait, while the budget allows. A door with others behind it holds
 * at most half the budget, so one that hangs leaves time for the next. Each
 * attempt waits for a slot on its host (the wait counts against the
 * budget). The error a source reports names every candidate that failed,
 * so the health line says which door closed.
 */
async function fetchWithFallbacks(source: NewsSource, timeoutMs: number): Promise<Fetched> {
  const started = Date.now();
  const left = () => timeoutMs - (Date.now() - started);
  const candidates = [
    { feed: source.feed, kind: source.kind, label: null as string | null },
    ...(source.fallbacks ?? []).map((f) => ({ feed: f.feed, kind: f.kind, label: f.label as string | null })),
  ];
  const errors: string[] = [];
  let attempted = 0;
  outer: for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const hasNext = i < candidates.length - 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      const release = await acquireHost(hostOf(c.feed));
      let retry = false;
      try {
        const budget = left();
        // The publisher's own feed always gets its try, however short the
        // budget; a fallback or a retry starts only with real time left.
        if (budget <= 0 || (attempted > 0 && budget < MIN_ATTEMPT_MS)) {
          if (attempted === 0) errors.push("no time left after the queue");
          break outer;
        }
        attempted++;
        const cap = hasNext ? Math.max(MIN_ATTEMPT_MS, Math.floor(timeoutMs / 2)) : budget;
        const items = await fetchFeed(c.feed, c.kind, source, Math.min(budget, cap));
        return { items, via: c.label };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(c.label ? `${c.label}: ${msg}` : msg);
        retry = attempt === 0 && retriable(e) && left() > RETRY_WAIT_MS + MIN_ATTEMPT_MS;
      } finally {
        release();
      }
      if (!retry) break;
      await sleep(RETRY_WAIT_MS);
    }
  }
  throw new Error(errors.length ? [...new Set(errors)].join(" · ") : "no candidate answered");
}

/** One request per source at a time: a caller who arrives while it is in
 *  flight waits on the same promise. */
function fetchShared(source: NewsSource, timeoutMs: number): Promise<Fetched> {
  const have = pending.get(source.id);
  if (have) return have;
  const p: Promise<Fetched> = fetchWithFallbacks(source, timeoutMs).finally(() => {
    if (pending.get(source.id) === p) pending.delete(source.id);
  });
  pending.set(source.id, p);
  return p;
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
      status: {
        ...base,
        ok: true,
        count: have.items.length,
        ms: 0,
        stale: false,
        cached: true,
        ...(have.via ? { via: have.via } : {}),
      },
    };
  }
  const t0 = Date.now();
  try {
    const { items, via } = await Promise.race([
      fetchShared(source, timeoutMs),
      deadline(timeoutMs + DEADLINE_GRACE_MS),
    ]);
    const at = Date.now();
    fresh.set(source.id, { at, items, via });
    lastGood.set(source.id, { at, items });
    return {
      items,
      status: {
        ...base,
        ok: true,
        count: items.length,
        ms: at - t0,
        stale: false,
        cached: false,
        ...(via ? { via } : {}),
      },
    };
  } catch (e) {
    // Whether the request failed or the deadline won, the next caller
    // starts afresh rather than joining a request past its budget.
    pending.delete(source.id);
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

export interface WarmResult {
  answered: number;
  total: number;
  ms: number;
}

/** The last warm-up this process finished — the health route reports it,
 *  so a run after a deploy can say the boot read happened before any
 *  visitor's, not just infer it from the cached lines. */
let lastWarm: (WarmResult & { at: string }) | null = null;

export function lastWarmUp(): (WarmResult & { at: string }) | null {
  return lastWarm;
}

/**
 * Read the sources one at a time, with a breath between, so a fresh process
 * fills its copies without the burst a first visitor's parallel read would
 * send. Meant for boot (instrumentation.ts); a source already fresh is not
 * fetched again; never throws — every outcome is one log line.
 */
export async function warmLiveHeadlines(
  sources: readonly NewsSource[] = NEWS_SOURCES,
  opts: LiveOptions & { gapMs?: number; log?: (line: string) => void } = {},
): Promise<WarmResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const gapMs = opts.gapMs ?? WARM_GAP_MS;
  const log = opts.log ?? ((line: string) => console.log(line));
  let answered = 0;
  for (let i = 0; i < sources.length; i++) {
    try {
      const r = await fetchSource(sources[i], Date.now(), timeoutMs);
      if (r.status.ok) answered++;
    } catch {
      // fetchSource resolves for every outcome; a throw here would be a bug
      // in the parser, and the warm-up is not the place to surface it.
    }
    if (gapMs > 0 && i < sources.length - 1) await sleep(gapMs);
  }
  const ms = Date.now() - t0;
  log(`[news] warm-up: ${answered} of ${sources.length} sources answered in ${(ms / 1000).toFixed(1)}s`);
  lastWarm = { answered, total: sources.length, ms, at: new Date().toISOString() };
  return { answered, total: sources.length, ms };
}

/** Forget this process's fresh copies — the next call fetches every feed. */
export function forgetLiveHeadlines(): void {
  fresh.clear();
}
