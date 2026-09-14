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
 * parse, rank. Eight layers of patience so the News page is never empty and
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
 *      finds every source cached — the burst never happens. It reports its
 *      progress while it runs, so the health route can say so.
 *   7. A cap on the wait for a slot: a door with another behind it waits in
 *      the host's queue at most half the budget that is left, then moves on
 *      to the next door and says so. Without it, a search host that hangs
 *      on every request held the site-scoped fallbacks in its queue until
 *      their whole budget was gone, and the second search host was never
 *      tried — live-verify read that too.
 *   8. A host held at bay: one that timed out, dropped the connection or
 *      answered 429/5xx three times inside a minute is not asked again for
 *      45 seconds; its doors are skipped at once — a caller already in the
 *      host's queue when the hold trips gives its slot back unused — so the
 *      next door gets the whole budget. A 403, a 404 or an empty page never
 *      counts (that is the publisher's answer, and the host is fine), nor
 *      does a timeout on a request given under 300 ms; a 429 or a 5xx
 *      always does. The held hosts are named by the health route while
 *      the hold lasts.
 *
 * A source that has never answered is simply absent from the list and named
 * in the status, so the page can say "GlobeSt did not answer just now"
 * instead of inventing around it.
 */

const FRESH_MS = 30 * 60_000;
const TIMEOUT_MS = 8_000;
/** the wall-clock cap runs this much past the request's own timeout */
const DEADLINE_GRACE_MS = 700;
/** the slot-release clock inside fetchFeed runs this much behind the
 *  source's deadline, so the source's deadline always speaks first (its
 *  message names the source's whole window) and the slot still comes back */
const SLOT_GRACE_MS = 200;
const STALE_MAX_MS = 24 * 3_600_000;
/** a second try of a candidate that answered 429 or 5xx waits this long */
const RETRY_WAIT_MS = 500;
/** no attempt starts with less of the source's budget than this left */
const MIN_ATTEMPT_MS = 300;
/** requests in flight to one host at a time, from this process */
const HOST_WIDTH = 2;
/** the warm-up leaves this long between one source and the next */
const WARM_GAP_MS = 250;
/** faults from one host inside the window that hold it at bay… */
const HOST_HOLD_AFTER = 3;
const HOST_FAULT_WINDOW_MS = 60_000;
/** …and for how long */
const HOST_HOLD_MS = 45_000;
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

/** A host is struggling when it times out, drops the connection or answers
 *  429/5xx. It is not when it answers 403, 404 or an empty page: that is the
 *  publisher's decision, made by a host that is up. */
function isFault(e: unknown): boolean {
  if (retriable(e)) return true;
  if (e instanceof FeedError) return false;
  const name = typeof e === "object" && e && "name" in e ? String((e as { name: unknown }).name) : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /timeout|aborted|no answer within|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg);
}

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

// ── The process's one state ──────────────────────────────────────────────

interface LiveState {
  /** a source's fresh copy, good for FRESH_MS, with the way it came in */
  fresh: Map<string, { at: number; items: FeedItem[]; via: string | null }>;
  /** the last copy that answered, with the way it came in — a stale line
   *  credits the host that actually answered, not the first door */
  lastGood: Map<string, { at: number; items: FeedItem[]; via: string | null }>;
  /** the one request in flight per source, shared by whoever asks meanwhile */
  pending: Map<string, Promise<Fetched>>;
  /** the per-host gate: requests in flight, and the callers waiting */
  inFlight: Map<string, number>;
  waiting: Map<string, Array<() => void>>;
  /** the hosts' fault records and holds */
  hosts: Map<string, HostRecord>;
  /** the warm-up this process is running or last finished; null before the
   *  first one starts (or when NEWS_WARM=0) */
  lastWarm: WarmProgress | null;
}

/**
 * ONE state per process, however many copies of this module the server
 * holds. Next compiles `instrumentation.ts` — which runs the boot warm-up —
 * into its own module graph with its own runtime, apart from the routes'
 * (in the built output: `.next/server/chunks/[turbopack]_runtime.js` under
 * `instrumentation.js`, `.next/server/chunks/ssr/[turbopack]_runtime.js`
 * under every route; each runtime keeps its own module cache). A
 * module-level Map here was therefore two Maps in one process: the warm-up
 * filled one, and the News page and the health route read the other,
 * empty — every deploy's first read fetched everything fresh and reported
 * no warm-up. The state lives on globalThis under a registered symbol,
 * which every copy of the module finds.
 */
const STATE_KEY = Symbol.for("underwrite-copilot.news.live");

function liveState(): LiveState {
  const g = globalThis as unknown as Record<symbol, LiveState | undefined>;
  return (g[STATE_KEY] ??= {
    fresh: new Map(),
    lastGood: new Map(),
    pending: new Map(),
    inFlight: new Map(),
    waiting: new Map(),
    hosts: new Map(),
    lastWarm: null,
  });
}

const state = liveState();
const { fresh, lastGood, pending, inFlight, waiting, hosts } = state;

// ── The per-host gate ────────────────────────────────────────────────────

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const unref = (t: ReturnType<typeof setTimeout>): void => {
  // Never keep the process alive for a timer whose race is already over.
  if (typeof t === "object" && t && "unref" in t) t.unref();
};

/** Resolves to the release once a slot on the host is free: at most
 *  HOST_WIDTH requests in flight per host, the rest queued in order. A slot
 *  a request gives up passes straight to the next in line. A caller who
 *  has waited `maxWaitMs` leaves the queue and gets null instead. */
function acquireHost(host: string, maxWaitMs: number): Promise<(() => void) | null> {
  const n = inFlight.get(host) ?? 0;
  if (n < HOST_WIDTH) {
    inFlight.set(host, n + 1);
    return Promise.resolve(() => releaseHost(host));
  }
  if (maxWaitMs <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const q = waiting.get(host) ?? [];
    const waiter = () => {
      clearTimeout(t);
      resolve(() => releaseHost(host));
    };
    const t = setTimeout(() => {
      const line = waiting.get(host);
      const i = line?.indexOf(waiter) ?? -1;
      if (line && i >= 0) line.splice(i, 1);
      if (line && line.length === 0) waiting.delete(host);
      resolve(null);
    }, maxWaitMs);
    unref(t);
    q.push(waiter);
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

// ── The hosts held at bay ────────────────────────────────────────────────

interface HostRecord {
  /** when each recent fault happened (inside the window) */
  faults: number[];
  /** when the current hold ends; 0 when the host is not held */
  heldUntil: number;
  /** the faults that set the current hold */
  failures: number;
}

function noteFault(host: string, now: number): void {
  const rec = hosts.get(host) ?? { faults: [], heldUntil: 0, failures: 0 };
  rec.faults = rec.faults.filter((t) => now - t < HOST_FAULT_WINDOW_MS);
  rec.faults.push(now);
  if (rec.faults.length >= HOST_HOLD_AFTER) {
    rec.heldUntil = now + HOST_HOLD_MS;
    rec.failures = rec.faults.length;
    rec.faults = [];
  }
  hosts.set(host, rec);
}

/** An answer clears the host's record: a host that answers between two
 *  faults is intermittent, not down. */
function noteAnswer(host: string): void {
  hosts.delete(host);
}

/** How much longer the host is held, in ms; 0 when it is not. */
function heldFor(host: string, now: number): number {
  const rec = hosts.get(host);
  return rec && rec.heldUntil > now ? rec.heldUntil - now : 0;
}

export interface HeldHost {
  host: string;
  /** ISO time the hold ends */
  until: string;
  /** the faults inside one minute that set it */
  failures: number;
}

/** The hosts this process is not asking right now — the health route
 *  names them, so a run that finds every search-backed source `via Bing`
 *  can see why. */
export function heldHosts(now = Date.now()): HeldHost[] {
  const out: HeldHost[] = [];
  for (const [host, rec] of hosts) {
    if (rec.heldUntil > now) {
      out.push({ host, until: new Date(rec.heldUntil).toISOString(), failures: rec.failures });
    }
  }
  return out;
}

/** Rejects after `ms` — the wall clock, not the request's own signal. */
function deadline(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    unref(t);
  });
}

async function fetchFeed(
  url: string,
  kind: NewsSource["kind"],
  source: NewsSource,
  timeoutMs: number,
  /** how far behind the source's own deadline the slot clock runs — set
   *  for a source's last door only, whose window is the source's window */
  slotSlackMs = 0,
): Promise<FeedItem[]> {
  const read = async (): Promise<FeedItem[]> => {
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
  };
  // The wall clock beside the signal: a fetch that outlives its abort (Node's
  // honours it; a patched one might not) would otherwise keep its slot on
  // the host for the life of the process, and two of those close the host.
  // A door with others behind it gives up a grace past its own timeout so
  // the next door still gets its share; a source's last door runs
  // SLOT_GRACE_MS behind the source's own deadline (fetchSource), which
  // therefore resolves the caller first and names the source's window.
  return Promise.race([read(), deadline(timeoutMs + DEADLINE_GRACE_MS + slotSlackMs)]);
}

/**
 * The publisher's own feed first, then its fallbacks in order, all inside
 * one budget — a candidate that answered 429 or 5xx gets one more try after
 * a short wait, while the budget allows. A door with others behind it holds
 * at most half the budget that is left, whether it spends that in the
 * host's queue or on the request itself, so one that hangs leaves time for
 * the next. A door on a host held at bay is skipped at once. The error a
 * source reports names every candidate that failed and how, so the health
 * line says which door closed.
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
    const host = hostOf(c.feed);
    const hasNext = i < candidates.length - 1;
    const name = c.label ?? host;
    for (let attempt = 0; attempt < 2; attempt++) {
      const held = heldFor(host, Date.now());
      if (held > 0) {
        errors.push(`${name}: ${host} held at bay for ${Math.ceil(held / 1000)}s`);
        continue outer;
      }
      const release = await acquireHost(host, hasNext ? Math.floor(left() / 2) : left());
      if (!release) {
        errors.push(`${name}: queued past ${hasNext ? "half " : ""}the budget`);
        continue outer;
      }
      // The hold may have tripped while this caller waited in the queue —
      // the two ahead of it timing out are what tripped it — so the slot
      // is given back unused rather than spent on the held host.
      const heldNow = heldFor(host, Date.now());
      if (heldNow > 0) {
        release();
        errors.push(`${name}: ${host} held at bay for ${Math.ceil(heldNow / 1000)}s`);
        continue outer;
      }
      let retry = false;
      let given = 0;
      try {
        const budget = left();
        // The publisher's own feed always gets its try, however short the
        // budget; a fallback or a retry starts only with real time left.
        if (budget <= 0 || (attempted > 0 && budget < MIN_ATTEMPT_MS)) {
          if (attempted === 0) errors.push("no time left after the queue");
          break outer;
        }
        attempted++;
          // Half of what is LEFT, not half of the whole: the second of three
        // doors then leaves the third its share (4000 → 2000 → 2000 ms at
        // the default budget), where half the whole let two doors that hang
        // spend it all and the third was never asked.
        const cap = hasNext ? Math.max(MIN_ATTEMPT_MS, Math.floor(budget / 2)) : budget;
        given = Math.min(budget, cap);
        const items = await fetchFeed(c.feed, c.kind, source, given, hasNext ? 0 : SLOT_GRACE_MS);
        noteAnswer(host);
        return { items, via: c.label };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(c.label ? `${c.label}: ${msg}` : msg);
        // A 429 or a 5xx is the host's answer and always counts. A timeout
        // or a dropped connection counts only when the request had real
        // time: one cut short by its own budget says nothing about the host.
        if (retriable(e) || (given >= MIN_ATTEMPT_MS && isFault(e))) noteFault(host, Date.now());
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
  const request = fetchShared(source, timeoutMs);
  try {
    const { items, via } = await Promise.race([request, deadline(timeoutMs + DEADLINE_GRACE_MS)]);
    const at = Date.now();
    fresh.set(source.id, { at, items, via });
    lastGood.set(source.id, { at, items, via });
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
    // starts afresh rather than joining a request past its budget — but
    // only this caller's request is dropped, never a newer one another
    // caller has since started.
    if (pending.get(source.id) === request) pending.delete(source.id);
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
          ...(prev.via ? { via: prev.via } : {}),
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

/** The warm-up's progress, then its result: the health route reports it,
 *  so a run after a deploy can say the boot read is under way or happened
 *  before any visitor's, not just infer it from the cached lines. */
export interface WarmProgress extends WarmResult {
  /** ISO time the warm-up started */
  started: string;
  /** false while the sources are still being read; `answered` and `ms`
   *  are the count and the elapsed time so far */
  done: boolean;
  /** ISO time the warm-up finished; null while it runs */
  at: string | null;
}

/** The warm-up this process is running or last finished — null before the
 *  first one starts (or when NEWS_WARM=0). Read off the process's one
 *  state, so the copy of this module a route holds sees the run the
 *  instrumentation's copy made. */
export function lastWarmUp(): WarmProgress | null {
  return state.lastWarm;
}

/**
 * Read the sources one at a time, with a breath between, so a fresh process
 * fills its copies without the burst a first visitor's parallel read would
 * send. Meant for boot (instrumentation.ts); a source already fresh is not
 * fetched again; never throws — every outcome is one log line, and the
 * progress is readable while it runs.
 */
export async function warmLiveHeadlines(
  sources: readonly NewsSource[] = NEWS_SOURCES,
  opts: LiveOptions & { gapMs?: number; log?: (line: string) => void } = {},
): Promise<WarmResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const gapMs = opts.gapMs ?? WARM_GAP_MS;
  const log = opts.log ?? ((line: string) => console.log(line));
  const progress: WarmProgress = {
    started: new Date(t0).toISOString(),
    done: false,
    answered: 0,
    total: sources.length,
    ms: 0,
    at: null,
  };
  state.lastWarm = progress;
  for (let i = 0; i < sources.length; i++) {
    try {
      const r = await fetchSource(sources[i], Date.now(), timeoutMs);
      if (r.status.ok) progress.answered++;
    } catch {
      // fetchSource resolves for every outcome; a throw here would be a bug
      // in the parser, and the warm-up is not the place to surface it.
    }
    progress.ms = Date.now() - t0;
    if (gapMs > 0 && i < sources.length - 1) await sleep(gapMs);
  }
  progress.ms = Date.now() - t0;
  progress.done = true;
  progress.at = new Date().toISOString();
  log(
    `[news] warm-up: ${progress.answered} of ${sources.length} sources answered in ${(progress.ms / 1000).toFixed(1)}s`,
  );
  return { answered: progress.answered, total: sources.length, ms: progress.ms };
}

/** Forget this process's fresh copies and lift every hold — the next call
 *  fetches every feed through every door. */
export function forgetLiveHeadlines(): void {
  fresh.clear();
  hosts.clear();
}
