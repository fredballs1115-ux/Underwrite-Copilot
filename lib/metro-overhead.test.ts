import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OVERHEAD_IN_FLIGHT, OVERHEAD_TIMEOUT_MS, fetchMetroOverhead, forgetOverheads } from "./metro-overhead";
import { METRO_VIEWS } from "./metro-imagery";

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

describe("a market's overhead, drawn only at the pages' own frames (the security review, 2026-09-30)", () => {
  beforeEach(() => forgetOverheads());
  afterEach(() => vi.unstubAllGlobals());

  /** USGS answering after `ms`, recording each frame's size as asked. */
  async function usgs(ms = 15) {
    const body = await jpeg();
    const sizes: string[] = [];
    let active = 0;
    const seen = { peak: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        sizes.push(new URL(url).searchParams.get("size") ?? "");
        active++;
        seen.peak = Math.max(seen.peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
        return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg" } });
      }),
    );
    return { sizes, seen };
  }

  it("snaps a size a caller typed to the nearest frame a page asks for, so nearby sizes are one fetch", async () => {
    const { sizes } = await usgs();
    const [a, b] = await Promise.all([
      fetchMetroOverhead("montgomery_county", 481, 359),
      fetchMetroOverhead("montgomery_county", 479, 361),
    ]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(await fetchMetroOverhead("montgomery_county", 480, 360)).toBe(a);
    await fetchMetroOverhead("montgomery_county", 9_999, 9_999);
    await fetchMetroOverhead("montgomery_county", 1400, 500);
    expect(sizes).toEqual(["480,360", "1600,900", "1400,480"]);
  });

  it(`asks USGS for at most ${OVERHEAD_IN_FLIGHT} frames at once, and answers every ask`, async () => {
    const { seen } = await usgs();
    const ids = Object.keys(METRO_VIEWS).slice(0, OVERHEAD_IN_FLIGHT * 4);
    const got = await Promise.all(ids.map((id) => fetchMetroOverhead(id, 480, 360)));
    expect(got.every((g) => g !== null)).toBe(true);
    expect(seen.peak).toBe(OVERHEAD_IN_FLIGHT);
  });
});
