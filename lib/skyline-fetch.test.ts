import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { COMMONS_IN_FLIGHT, fetchSkylinePhoto, forgetSkylinePhotos, lighten } from "./skyline-fetch";
import { SKYLINES } from "./skyline";
import { testPixels } from "./test-memorandum";

const photo = (quality: number, w = 1200, h = 800) =>
  sharp(testPixels(w, h, 2), { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality }).toBuffer();
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("a market's photograph, encoded again to be served (#451)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serves an archive-quality JPEG lighter, the same picture at the same size", async () => {
    const heavy = await photo(98);
    const got = await lighten(ab(heavy), "image/jpeg");
    expect(got.type).toBe("image/jpeg");
    expect(got.body.byteLength).toBeLessThan(heavy.byteLength * 0.75);
    const m = await sharp(Buffer.from(got.body)).metadata();
    expect({ w: m.width, h: m.height, format: m.format }).toEqual({ w: 1200, h: 800, format: "jpeg" });
  });

  it("keeps what Commons sent where encoding again would not help or cannot run", async () => {
    // Already light: encoding again would come out larger.
    const light = await photo(40);
    expect((await lighten(ab(light), "image/jpeg")).body.byteLength).toBe(light.byteLength);
    // Not a JPEG: a PNG is served as it came.
    const png = await sharp(testPixels(64, 48, 1), { raw: { width: 64, height: 48, channels: 3 } }).png().toBuffer();
    const kept = await lighten(ab(png), "image/png");
    expect({ type: kept.type, n: kept.body.byteLength }).toEqual({ type: "image/png", n: png.byteLength });
    // Not a picture at all, whatever the header says.
    const junk = ab(Buffer.from("not a jpeg at all"));
    expect(await lighten(junk, "image/jpeg")).toEqual({ body: junk, type: "image/jpeg" });
  });

  it("holds and serves the lighter copy", async () => {
    const heavy = await photo(98);
    const fetcher = vi.fn(async () => new Response(new Uint8Array(heavy), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    const first = await fetchSkylinePhoto("dc", 1234);
    expect(first!.body.byteLength).toBeLessThan(heavy.byteLength);
    const again = await fetchSkylinePhoto("dc", 1234);
    expect(again!.body.byteLength).toBe(first!.body.byteLength);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("a market's photograph, asked of Commons once and a few at a time (the security review, 2026-09-30)", () => {
  beforeEach(() => forgetSkylinePhotos());
  afterEach(() => vi.unstubAllGlobals());

  /** A fetch that answers a small JPEG after `ms`, recording each width asked. */
  async function commons(ms = 15) {
    const body = await photo(80, 64, 48);
    const widths: string[] = [];
    let active = 0;
    const seen = { peak: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        widths.push(new URL(url).searchParams.get("width") ?? "");
        active++;
        seen.peak = Math.max(seen.peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
        return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg" } });
      }),
    );
    return { widths, seen };
  }

  it("asks once for a photograph several visitors ask for at once, and keeps it", async () => {
    const { widths } = await commons();
    const [a, b, c] = await Promise.all([
      fetchSkylinePhoto("chicago", 1600),
      fetchSkylinePhoto("chicago", 1600),
      fetchSkylinePhoto("chicago", 1600),
    ]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(c).toBe(a);
    // The held copy: the same bytes, not asked for again.
    expect((await fetchSkylinePhoto("chicago", 1600))?.body).toBe(a!.body);
    expect(widths).toEqual(["1600"]);
  });

  it("snaps a width a caller typed to one the route serves, so nearby widths are one fetch", async () => {
    const { widths } = await commons();
    const [a, b] = await Promise.all([fetchSkylinePhoto("chicago", 1599), fetchSkylinePhoto("chicago", 1601)]);
    expect(b).toBe(a);
    expect((await fetchSkylinePhoto("chicago", 1600))?.body).toBe(a!.body);
    await fetchSkylinePhoto("chicago", 12_345);
    await fetchSkylinePhoto("chicago", 1);
    await fetchSkylinePhoto("chicago", 1234);
    expect(widths).toEqual(["1600", "2400", "480", "1400"]);
  });

  it(`asks Commons for at most ${COMMONS_IN_FLIGHT} photographs at once, and answers every ask`, async () => {
    const { seen } = await commons();
    const ids = Object.keys(SKYLINES).slice(0, COMMONS_IN_FLIGHT * 3);
    const got = await Promise.all(ids.map((id) => fetchSkylinePhoto(id, 480)));
    expect(got.every((g) => g !== null)).toBe(true);
    expect(seen.peak).toBe(COMMONS_IN_FLIGHT);
  });
});
