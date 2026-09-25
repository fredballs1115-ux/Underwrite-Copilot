// The report's flood map is one JPEG: the aerial with FEMA's transparent
// zones laid over it (#427). react-pdf embeds a single picture, so the two
// frames are composited server-side — and the composite has to be the
// aerial's own frame, with the zones exactly where FEMA drew them, or the
// ring the page draws at its centre marks the wrong ground.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));

import sharp from "sharp";
import { compositeFloodMap } from "./flood-map";
import { intactImage } from "@/lib/memo/cover-aerial";

const W = 104;
const H = 48;
const GREEN = { r: 40, g: 90, b: 40 };
const CYAN = { r: 0, g: 200, b: 220 };

async function aerialJpeg(): Promise<Buffer> {
  return sharp({ create: { width: W, height: H, channels: 3, background: GREEN } }).jpeg({ quality: 95 }).toBuffer();
}

/** FEMA's overlay: transparent, with the zone opaque over the left half. */
async function overlayPng(width = W, height = H): Promise<Buffer> {
  const zone = await sharp({
    create: { width: Math.round(width / 2), height, channels: 4, background: { ...CYAN, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: zone, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function pixel(jpeg: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const near = (got: [number, number, number], want: { r: number; g: number; b: number }) =>
  Math.max(Math.abs(got[0] - want.r), Math.abs(got[1] - want.g), Math.abs(got[2] - want.b)) <= 12;

describe("compositeFloodMap — the report's one picture (#427)", () => {
  it("lays FEMA's zones over the aerial where FEMA drew them, and leaves the rest of the photograph alone", async () => {
    const out = await compositeFloodMap(await aerialJpeg(), await overlayPng());
    // An intact JPEG, because react-pdf hangs on bytes it cannot read.
    expect(intactImage(out, "image/jpeg")).toBe(true);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", W, H]);
    expect(near(await pixel(out, 12, 24), CYAN)).toBe(true);
    expect(near(await pixel(out, 92, 24), GREEN)).toBe(true);
  });

  it("fits an overlay a server answered a pixel off onto the aerial's own frame", async () => {
    const out = await compositeFloodMap(await aerialJpeg(), await overlayPng(W + 2, H - 1));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([W, H]);
    expect(near(await pixel(out, 12, 24), CYAN)).toBe(true);
    expect(near(await pixel(out, 92, 24), GREEN)).toBe(true);
  });
});
