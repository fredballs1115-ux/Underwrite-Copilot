import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveHeadlines, forgetLiveHeadlines, heldHosts, lastWarmUp, warmLiveHeadlines } from "./live";
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
    expect(lastWarmUp()).toMatchObject({ answered: 2, total: 3, done: true });
    expect(Date.parse(String(lastWarmUp()!.at))).toBeGreaterThan(Date.now() - 60_000);

    const live = await fetchLiveHeadlines(sources, 10, { timeoutMs: 1_000 });
    expect(live.sources.map((s) => s.cached)).toEqual([true, true, false]);
    expect(live.sources[2]).toMatchObject({ ok: false, error: "HTTP 403" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // three in the warm-up, the refused one once more
  });

  it("the warm-up reports its progress while it runs: started, not done, the count so far", async () => {
    const seen: ReturnType<typeof lastWarmUp>[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // By the time the second source is asked, the first has answered.
      if (String(input).startsWith("https://prog1.test")) seen.push(structuredClone(lastWarmUp()));
      return answer(rss("Rates hold"), 5)(init);
    }) as typeof fetch;
    const sources = [src("prog0"), src("prog1"), src("prog2")];
    const p = warmLiveHeadlines(sources, { timeoutMs: 1_000, gapMs: 0, log: () => {} });
    expect(lastWarmUp()).toMatchObject({ done: false, answered: 0, total: 3, at: null });
    expect(Date.parse(String(lastWarmUp()!.started))).toBeGreaterThan(Date.now() - 60_000);
    await p;
    expect(seen).toEqual([expect.objectContaining({ done: false, answered: 1, total: 3, at: null })]);
    expect(lastWarmUp()).toMatchObject({ done: true, answered: 3, total: 3 });
    expect(typeof lastWarmUp()!.at).toBe("string");
  });
});

describe("fetchLiveHeadlines — a host that hangs is not allowed to hold the others", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    forgetLiveHeadlines();
  });

  /** A source whose own door is on `host` (which answers however the fake
   *  says) with a fast second door behind it on another host. */
  const twoDoors = (id: string, host: string): NewsSource => ({
    ...src(id),
    feed: `https://${host}/rss?q=${id}`,
    fallbacks: [{ feed: `https://second.test/rss?q=${id}`, kind: "topic", label: `Bing News · ${id}` }],
  });

  /** Holds the connection open (honouring the abort) on `host`; answers
   *  at once anywhere else. */
  const hangingHost = (host: string) =>
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(`https://${host}`)
        ? answer("", 10_000)(init)
        : answer(gnRss("Tower trades", "The Paper"), 5)(init),
    ) as typeof fetch;

  it("a door with another behind it waits in the host's queue at most half the budget, then moves on: four sources on one hanging host all answer through the second door inside the deadline", async () => {
    globalThis.fetch = hangingHost("stalls.test");
    const sources = Array.from({ length: 4 }, (_, i) => twoDoors(`q${i}`, "stalls.test"));
    const t0 = Date.now();
    const live = await fetchLiveHeadlines(sources, 30, { timeoutMs: 2_000 });
    // Two fetches hang (the gate's width) and time out at half the budget;
    // the other two wait in the queue at most half the budget. Either way
    // every source reaches its second door with time to spare.
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(live.sources.map((s) => [s.ok, s.via, s.count])).toEqual(sources.map((s) => [true, `Bing News · ${s.id}`, 1]));
    expect(live.sources.every((s) => s.error === undefined)).toBe(true);
  });

  it("a source with no other door waits the whole budget for its slot, and the error says the queue ate it", async () => {
    // Two requests that never settle and ignore the abort hold the host's
    // two slots until the wall clock; the third source has nowhere else to go.
    globalThis.fetch = vi.fn(async () => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const oneDoor = (id: string): NewsSource => ({ ...src(id), feed: `https://leaks.test/rss?q=${id}` });
    const sources = [oneDoor("b0"), oneDoor("b1"), oneDoor("b2")];
    const live = await fetchLiveHeadlines(sources, 30, { timeoutMs: 400 });
    expect(live.sources.map((s) => s.ok)).toEqual([false, false, false]);
    expect(live.sources[0].error).toMatch(/^no answer within 1100 ms$/);
    expect(live.sources[2].error).toMatch(/^leaks\.test: queued past the budget$/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("a host that timed out three times inside a minute is held at bay: its doors are skipped at once, the second door gets the whole budget, the health route names it", async () => {
    globalThis.fetch = hangingHost("hangs-a-lot.test");
    expect(heldHosts()).toEqual([]);
    // Three sources, one after another, each timing out on the host at
    // half its budget and answering through the second door.
    for (const id of ["h0", "h1", "h2"]) {
      const live = await fetchLiveHeadlines([twoDoors(id, "hangs-a-lot.test")], 10, { timeoutMs: 800 });
      expect(live.sources[0]).toMatchObject({ ok: true, via: `Bing News · ${id}` });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    const held = heldHosts();
    expect(held).toEqual([{ host: "hangs-a-lot.test", until: expect.any(String), failures: 3 }]);
    const until = Date.parse(held[0].until) - Date.now();
    expect(until).toBeGreaterThan(40_000);
    expect(until).toBeLessThanOrEqual(45_000);

    // The fourth source never asks the held host: one fetch, the second
    // door's, and an answer in a few milliseconds instead of 400.
    const t0 = Date.now();
    const live = await fetchLiveHeadlines([twoDoors("h3", "hangs-a-lot.test")], 10, { timeoutMs: 800 });
    expect(Date.now() - t0).toBeLessThan(150);
    expect(live.sources[0]).toMatchObject({ ok: true, via: "Bing News · h3" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(7);
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).toBe("https://second.test/rss?q=h3");

    // A source with no door but the held host says why it has nothing.
    const alone = await fetchLiveHeadlines([{ ...src("h4"), feed: "https://hangs-a-lot.test/rss?q=h4" }], 10, {
      timeoutMs: 800,
    });
    expect(alone.sources[0]).toMatchObject({ ok: false, count: 0 });
    expect(alone.sources[0].error).toMatch(/^hangs-a-lot\.test: hangs-a-lot\.test held at bay for 4\ds$/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(7);

    // Forgetting the copies lifts the hold too.
    forgetLiveHeadlines();
    expect(heldHosts()).toEqual([]);
  });

  it("a request cut short by its own budget is not the host's fault: three of those never hold it", async () => {
    // A request given under 300 ms that times out says nothing about the
    // host — the budget was too short to tell.
    globalThis.fetch = hangingHost("brief.test");
    for (const id of ["s0", "s1", "s2"]) {
      const live = await fetchLiveHeadlines([{ ...src(id), feed: `https://brief.test/rss?q=${id}` }], 10, {
        timeoutMs: 200,
      });
      expect(live.sources[0]).toMatchObject({ ok: false, count: 0 });
      expect(live.sources[0].error).toMatch(/timeout/i);
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(heldHosts()).toEqual([]);
  });

  it("three 503s hold a host too; three 403s never do — a refusal is the publisher's answer, not a struggling host", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://five.test")
        ? new Response("busy", { status: 503 })
        : new Response("no", { status: 403 }),
    ) as typeof fetch;
    for (const id of ["f0", "f1", "f2"]) {
      await fetchLiveHeadlines([{ ...src(id), feed: `https://five.test/rss?q=${id}` }], 10, { timeoutMs: 300 });
      await fetchLiveHeadlines([{ ...src(`r${id}`), feed: `https://four.test/rss?q=${id}` }], 10, { timeoutMs: 300 });
    }
    expect(heldHosts().map((h) => h.host)).toEqual(["five.test"]);
  });

  it("two doors that hang still leave the third its share: each door holds at most half of what is left, not half of the whole", async () => {
    // The GlobeSt shape — own feed, a second own URL, then the search
    // hosts. Doors 1 and 2 hold the connection; door 3 answers at once.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://third.test")
        ? answer(gnRss("Lender takes back the tower", "The Paper"), 5)(init)
        : answer("", 10_000)(init),
    ) as typeof fetch;
    const s: NewsSource = {
      ...src("three"),
      feed: "https://first.test/feed",
      fallbacks: [
        { feed: "https://first.test/rss", kind: "publisher", label: "first.test/rss" },
        { feed: "https://third.test/rss?q=site:three.test", kind: "topic", label: "Bing News · site:three.test" },
      ],
    };
    const t0 = Date.now();
    const live = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_600 });
    // 800 ms to the first door, 400 to the second, the last 400 to the third.
    expect(Date.now() - t0).toBeLessThan(1_600);
    expect(live.sources[0]).toMatchObject({ ok: true, count: 1, via: "Bing News · site:three.test" });
    expect(vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]))).toEqual([
      "https://first.test/feed",
      "https://first.test/rss",
      "https://third.test/rss?q=site:three.test",
    ]);
  });

  it("a stale copy keeps the way it came in, so the footer credits the host that answered", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://second.test")
        ? new Response(gnRss("Tower trades", "The Paper"), { status: 200 })
        : new Response("forbidden", { status: 403 }),
    ) as typeof fetch;
    const s = twoDoors("credit", "refuses.test");
    const first = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_000 });
    expect(first.sources[0]).toMatchObject({ ok: true, via: "Bing News · credit" });

    forgetLiveHeadlines();
    globalThis.fetch = vi.fn(async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    const again = await fetchLiveHeadlines([s], 10, { timeoutMs: 1_000 });
    expect(again.sources[0]).toMatchObject({ ok: false, stale: true, count: 1, via: "Bing News · credit" });
    expect(again.headlines.map((h) => h.title)).toEqual(["Tower trades"]);
  });

  it("a fetch that outlives its abort gives its slot back at the wall clock: the host stays open to the next source", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("q=late")
        ? new Response(rss("Rates hold"), { status: 200 })
        : new Promise<Response>(() => {}),
    ) as typeof fetch;
    const on = (id: string): NewsSource => ({ ...src(id), feed: `https://stuck.test/rss?q=${id}` });
    // Two requests that never settle take the host's two slots…
    const first = await fetchLiveHeadlines([on("stuck0"), on("stuck1")], 10, { timeoutMs: 50 });
    expect(first.sources.map((s) => s.error)).toEqual(["no answer within 750 ms", "no answer within 750 ms"]);
    // …and give them back when their wall clock runs out, so a third
    // source on the host is fetched, not queued past its budget.
    const then = await fetchLiveHeadlines([on("late")], 10, { timeoutMs: 50 });
    expect(then.sources[0]).toMatchObject({ ok: true, count: 1 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("an answer between two faults clears the host: it is intermittent, not down", async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      return n % 3 === 0 ? new Response(rss("Rates hold"), { status: 200 }) : new Response("busy", { status: 503 });
    }) as unknown as typeof fetch;
    for (const id of ["i0", "i1", "i2", "i3", "i4", "i5"]) {
      await fetchLiveHeadlines([{ ...src(id), feed: `https://flaky.test/rss?q=${id}` }], 10, { timeoutMs: 300 });
    }
    // 503, 503, 200, 503, 503, 200 — never three faults in a row.
    expect(n).toBe(6);
    expect(heldHosts()).toEqual([]);
  });
});
