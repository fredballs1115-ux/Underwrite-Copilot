import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveHeadlines, forgetLiveHeadlines, lastWarmUp, warmLiveHeadlines } from "./live";
import type { NewsSource } from "./feeds";

// The network half of the live headlines, driven with a fake fetch. The
// property that matters: whatever a publisher does — answers, refuses, or
// accepts the connection and never replies — every source resolves inside
// its deadline, so the streamed section on /news always paints.

const rss = (title: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${title}</title>` +
  `<link>https://example.com/${encodeURIComponent(title)}</link>` +
  `<pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;

const src = (id: string): NewsSource => ({
  id,
  name: id,
  home: `https://${id}.test/`,
  feed: `https://${id}.test/feed`,
  kind: "publisher",
  cap: 5,
});

describe("fetchLiveHeadlines — every source answers inside its deadline", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    forgetLiveHeadlines();
  });

  it("a publisher that accepts the connection and never answers does not hold the section", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls++;
      if (String(input).startsWith("https://hangs.test")) {
        // Never resolves and ignores the abort signal — the worst a feed can do.
        return new Promise<Response>(() => {});
      }
      return new Response(rss("Cap rates widen in the suburbs"), { status: 200 });
    }) as typeof fetch;

    const t0 = Date.now();
    const live = await fetchLiveHeadlines([src("quick"), src("hangs")], 10, { timeoutMs: 50 });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(live.headlines.map((h) => h.title)).toEqual(["Cap rates widen in the suburbs"]);
    const hangs = live.sources.find((s) => s.id === "hangs");
    expect(hangs).toMatchObject({ ok: false, stale: false, cached: false, count: 0 });
    expect(hangs?.error).toMatch(/no answer within 750 ms/);
    expect(calls).toBe(2);
  });

  it("serves the fresh copy for half an hour without a second fetch, and the last good copy when the feed fails", async () => {
    let mode: "ok" | "fail" = "ok";
    const fetchMock = vi.fn(async () =>
      mode === "ok"
        ? new Response(rss("Fed holds rates"), { status: 200 })
        : new Response("nope", { status: 503 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const a = await fetchLiveHeadlines([src("feed")], 10, { timeoutMs: 50 });
    expect(a.sources[0]).toMatchObject({ ok: true, cached: false, stale: false, count: 1 });
    const b = await fetchLiveHeadlines([src("feed")], 10, { timeoutMs: 50 });
    expect(b.sources[0]).toMatchObject({ ok: true, cached: true, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    forgetLiveHeadlines();
    mode = "fail";
    const c = await fetchLiveHeadlines([src("feed")], 10, { timeoutMs: 50 });
    expect(c.sources[0]).toMatchObject({ ok: false, stale: true, count: 1, error: "HTTP 503" });
    expect(c.headlines.map((h) => h.title)).toEqual(["Fed holds rates"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a feed that parses to nothing is an error, never an empty success", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>blocked</html>", { status: 200 })) as unknown as typeof fetch;
    const live = await fetchLiveHeadlines([src("wall")], 10, { timeoutMs: 50 });
    expect(live.sources[0]).toMatchObject({ ok: false, count: 0, error: "feed parsed to zero items" });
    expect(live.headlines).toEqual([]);
  });
});

/** A Google News item: the outlet rides in <source>. */
const gnRss = (title: string, outlet: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${title} - ${outlet}</title>` +
  `<link>https://news.google.com/rss/articles/x</link><pubDate>${new Date().toUTCString()}</pubDate>` +
  `<source url="https://${outlet.toLowerCase().replace(/\s+/g, "")}.com">${outlet}</source></item></channel></rss>`;

describe("fetchLiveHeadlines — a publisher that refuses the fetcher is read another way", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    forgetLiveHeadlines();
  });

  // One id per test: the last-good copy is per source id for the life of
  // the process, so a source that answered in one test would stand in for
  // a failure in the next.
  const withFallback = (id: string): NewsSource => ({
    ...src(id),
    fallbacks: [{ feed: `https://news.test/rss?q=site:${id}.test`, kind: "topic", label: `Google News · site:${id}.test` }],
  });

  it("asks as a browser-shaped reader that still says who it is", async () => {
    let ua = "";
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      ua = String((init?.headers as Record<string, string>)["user-agent"]);
      return new Response(rss("Rates hold"), { status: 200 });
    }) as typeof fetch;
    await fetchLiveHeadlines([src("feed")], 10, { timeoutMs: 500 });
    expect(ua).toMatch(/^Mozilla\/5\.0 \(compatible; UnderwriteCopilot\/1\.0; \+https:\/\/underwrite-copilot\.onrender\.com\/news\)$/);
  });

  it("HTTP 403 on the publisher's feed: the site-scoped Google News read answers, named as the way in, with the outlet kept", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://paper.test")
        ? new Response("forbidden", { status: 403 })
        : new Response(gnRss("Lender takes back the tower", "The Paper"), { status: 200 }),
    ) as typeof fetch;
    const live = await fetchLiveHeadlines([withFallback("paper")], 10, { timeoutMs: 2_000 });
    expect(live.sources[0]).toMatchObject({ ok: true, count: 1, stale: false, via: "Google News · site:paper.test" });
    expect(live.sources[0].error).toBeUndefined();
    expect(live.headlines.map((h) => [h.title, h.publisher])).toEqual([["Lender takes back the tower", "The Paper"]]);
  });

  it("a feed that parses to nothing falls through the same way; when every door closes the error names each", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://blank.test")
        ? new Response("<html>a landing page</html>", { status: 200 })
        : new Response("gone", { status: 404 }),
    ) as typeof fetch;
    const live = await fetchLiveHeadlines([withFallback("blank")], 10, { timeoutMs: 2_000 });
    expect(live.sources[0]).toMatchObject({ ok: false, count: 0 });
    expect(live.sources[0].error).toBe("feed parsed to zero items · Google News · site:blank.test: HTTP 404");
    expect(live.sources[0].via).toBeUndefined();
  });

  it("a 503 that came back quickly is tried once more after a short wait; a 403 is not", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return calls === 1 ? new Response("busy", { status: 503 }) : new Response(rss("Fed holds"), { status: 200 });
    }) as unknown as typeof fetch;
    const t0 = Date.now();
    const live = await fetchLiveHeadlines([src("gn")], 10, { timeoutMs: 3_000 });
    expect(live.sources[0]).toMatchObject({ ok: true, count: 1 });
    expect(live.sources[0].via).toBeUndefined();
    expect(calls).toBe(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(450);

    forgetLiveHeadlines();
    calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response("no", { status: 403 });
    }) as unknown as typeof fetch;
    const refused = await fetchLiveHeadlines([src("wall")], 10, { timeoutMs: 3_000 });
    expect(refused.sources[0]).toMatchObject({ ok: false, error: "HTTP 403" });
    expect(calls).toBe(1);
  });

  it("the fallbacks share the source's budget: a publisher that hangs leaves no time for them, and the deadline still holds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;
    const t0 = Date.now();
    const live = await fetchLiveHeadlines([withFallback("slow")], 10, { timeoutMs: 100 });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(live.sources[0]).toMatchObject({ ok: false, count: 0 });
    expect(live.sources[0].error).toMatch(/no answer within 800 ms/);
    expect(calls).toBe(1);
  });
});

/** A fake fetch that answers after `delayMs`, honouring the abort signal the
 *  way a real socket does — the fetcher's own timeout can interrupt it. */
const answer =
  (body: string, delayMs: number, status = 200) =>
  (init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(body, { status })), delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(init.signal?.reason ?? new Error("aborted"));
      });
    });

describe("fetchLiveHeadlines — a cold start does not burst", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    forgetLiveHeadlines();
  });

  it("at most two requests are in flight to one host at a time; the rest wait their turn and still answer", async () => {
    let inflight = 0;
    let peak = 0;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      inflight++;
      peak = Math.max(peak, inflight);
      try {
        return await answer(rss("Cap rates hold"), 15)(init);
      } finally {
        inflight--;
      }
    }) as typeof fetch;
    const sources = Array.from({ length: 8 }, (_, i) => ({ ...src(`gate${i}`), feed: `https://gate.test/rss?q=${i}` }));
    const live = await fetchLiveHeadlines(sources, 30, { timeoutMs: 2_000 });
    expect(live.sources.map((s) => s.ok)).toEqual(Array(8).fill(true));
    expect(peak).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(8);
  });

  it("a door with others behind it holds at most half the budget: a search host that hangs leaves time for the next", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://held.test")
        ? answer("", 10_000)(init) // holds the connection open; honours the abort
        : answer(gnRss("Lender takes back the tower", "The Paper"), 5)(init),
    ) as typeof fetch;
    const s: NewsSource = {
      ...src("held"),
      fallbacks: [{ feed: "https://second.test/rss", kind: "topic", label: "Bing News · site:held.test" }],
    };
    const t0 = Date.now();
    const live = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_000 });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(live.sources[0]).toMatchObject({ ok: true, count: 1, via: "Bing News · site:held.test" });
    expect(live.sources[0].error).toBeUndefined();
    expect(live.headlines.map((h) => [h.title, h.publisher])).toEqual([["Lender takes back the tower", "The Paper"]]);
  });

  it("two callers who arrive together share one request", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => answer(rss("Fed holds"), 20)(init));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const [a, b] = await Promise.all([
      fetchLiveHeadlines([src("shared")], 10, { timeoutMs: 1_000 }),
      fetchLiveHeadlines([src("shared")], 10, { timeoutMs: 1_000 }),
    ]);
    expect(a.sources[0]).toMatchObject({ ok: true, cached: false, count: 1 });
    expect(b.sources[0]).toMatchObject({ ok: true, cached: false, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a cached copy still says the way it came in", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://door.test")
        ? new Response("forbidden", { status: 403 })
        : new Response(gnRss("Tower trades", "The Paper"), { status: 200 }),
    ) as typeof fetch;
    const s: NewsSource = {
      ...src("door"),
      fallbacks: [{ feed: "https://news.test/rss?q=site:door.test", kind: "topic", label: "Google News · site:door.test" }],
    };
    const first = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_000 });
    expect(first.sources[0]).toMatchObject({ ok: true, cached: false, via: "Google News · site:door.test" });
    const again = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_000 });
    expect(again.sources[0]).toMatchObject({ ok: true, cached: true, ms: 0, via: "Google News · site:door.test" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("the warm-up reads the sources one at a time, never throws, says what it found, and the next read finds them cached", async () => {
    let inflight = 0;
    let peak = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      inflight++;
      peak = Math.max(peak, inflight);
      try {
        return String(input).startsWith("https://warm2.test")
          ? new Response("no", { status: 403 })
          : await answer(rss("Rates hold"), 10)(init);
      } finally {
        inflight--;
      }
    }) as typeof fetch;
    const sources = [src("warm0"), src("warm1"), src("warm2")];
    const lines: string[] = [];
    expect(lastWarmUp()).toBeNull();
    const r = await warmLiveHeadlines(sources, { timeoutMs: 1_000, gapMs: 0, log: (l) => lines.push(l) });
    expect(r).toMatchObject({ answered: 2, total: 3 });
    expect(peak).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^\[news\] warm-up: 2 of 3 sources answered in \d+\.\ds$/)]);
    // …and the health route can say it happened.
    expect(lastWarmUp()).toMatchObject({ answered: 2, total: 3 });
    expect(Date.parse(lastWarmUp()!.at)).toBeGreaterThan(Date.now() - 60_000);

    const live = await fetchLiveHeadlines(sources, 10, { timeoutMs: 1_000 });
    expect(live.sources.map((s) => s.cached)).toEqual([true, true, false]);
    expect(live.sources[2]).toMatchObject({ ok: false, error: "HTTP 403" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // three in the warm-up, the refused one once more
  });
});
