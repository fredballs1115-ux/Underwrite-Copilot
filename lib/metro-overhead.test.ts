import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OVERHEAD_TIMEOUT_MS, fetchMetroOverhead, forgetOverheads } from "./metro-overhead";

const jpeg = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#5a7a5a" } }).jpeg().toBuffer();

describe("a market's overhead, fetched once and kept (#449)", () => {
  beforeEach(() => forgetOverheads());
  afterEach(() => vi.unstubAllGlobals());

  it("asks USGS once for a frame, however many visitors ask at once, and keeps it", async () => {
    const body = await jpeg();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        await new Promise((r) => setTimeout(r, 20));
        return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg" } });
      }),
    );
    const [a, b] = await Promise.all([
      fetchMetroOverhead("montgomery_county", 480, 360),
      fetchMetroOverhead("montgomery_county", 480, 360),
    ]);
    expect(a?.type).toBe("image/jpeg");
    expect(b).toBe(a);
    expect(await fetchMetroOverhead("montgomery_county", 480, 360)).toBe(a);
    expect(calls).toHaveLength(1);
    // Another frame is its own ask.
    await fetchMetroOverhead("montgomery_county", 960, 720);
    expect(calls).toHaveLength(2);
  });

  it("keeps nothing from a failure, so the next visitor asks again", async () => {
    const body = await jpeg();
    let fail = true;
    const fetcher = vi.fn(async () =>
      fail
        ? new Response(JSON.stringify({ error: "timeout" }), { headers: { "content-type": "application/json" } })
        : new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchMetroOverhead("montgomery_county", 480, 360)).toBeNull();
    fail = false;
    expect(await fetchMetroOverhead("montgomery_county", 480, 360)).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives USGS the time a slow evening needs, and refuses an unknown market without asking", async () => {
    expect(OVERHEAD_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchMetroOverhead("atlantis", 480, 360)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
