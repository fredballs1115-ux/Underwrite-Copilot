import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveHeadlines, forgetLiveHeadlines } from "./live";
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
