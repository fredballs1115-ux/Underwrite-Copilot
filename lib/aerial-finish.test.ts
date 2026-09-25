// The finish every USGS frame gets (#429): tone and sharpness only. It must
// hand back an intact JPEG of exactly the frame it was given — the flood
// overlay and the report's composite lie over the aerial pixel for pixel —
// and it must lift the flat midday light the aerial sheet showed.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { finishAerial } from "./aerial-finish";
import { intactImage } from "@/lib/memo/cover-aerial";

async function flatFrame(): Promise<Buffer> {
  // A low-contrast frame: two greys and a green, the way NAIP reads at noon.
  const W = 120;
  const H = 80;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const v = x < W / 3 ? [118, 120, 116] : x < (2 * W) / 3 ? [140, 142, 138] : [96, 122, 90];
      raw[i] = v[0];
      raw[i + 1] = v[1];
      raw[i + 2] = v[2];
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function lumaSpread(jpeg: Buffer): Promise<number> {
  const stats = await sharp(jpeg).greyscale().stats();
  return stats.channels[0].stdev;
}

describe("finishAerial", () => {
  it("hands back an intact JPEG of exactly the frame it was given", async () => {
    const out = await finishAerial(await flatFrame());
    expect(intactImage(out, "image/jpeg")).toBe(true);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 120, 80]);
  });

  it("lifts the flat light: more tonal spread than the export it was given", async () => {
    const before = await flatFrame();
    const after = await finishAerial(before);
    expect(await lumaSpread(after)).toBeGreaterThan(await lumaSpread(before));
  });
});
