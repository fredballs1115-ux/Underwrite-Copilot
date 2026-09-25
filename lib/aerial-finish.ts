import "server-only";

/**
 * The finish every USGS frame gets (#429). NAIP is shot in flat midday
 * light, so a little contrast and colour go back in, and an unsharp mask
 * sized to the photograph's grain — variant E of the aerial sheet
 * (skyline-sheet run 36193817674), chosen by eye over the plain export.
 * Tone and sharpness only: the frame's geometry is untouched, so the flood
 * overlay and the report's composite still lie over it pixel for pixel.
 *
 * Its own module so a route that serves an overhead (the metro imagery
 * route) takes sharp and nothing else of lib/imagery's.
 */
export async function finishAerial(bytes: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes)
    .modulate({ brightness: 1.02, saturation: 1.12 })
    .linear(1.06, -6)
    .sharpen({ sigma: 0.7, m1: 0.6, m2: 2.2 })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}
