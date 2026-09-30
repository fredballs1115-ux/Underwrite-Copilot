import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchSkylinePhoto, lighten } from "./skyline-fetch";
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
