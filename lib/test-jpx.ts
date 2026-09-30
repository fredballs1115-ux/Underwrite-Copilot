/**
 * Test tooling: a photograph stored as JPEG 2000 — the `/JPXDecode` image an
 * Acrobat-optimised memorandum carries — which nothing in the repository can
 * encode (sharp's libvips is built without OpenJPEG, and pdfkit embeds JPEG
 * and PNG only). So it is a file, made once, offline, and kept here.
 *
 * What it is: `testPixels(640, 400, 1)` (lib/test-memorandum), the test
 * picture with its band of light, encoded by OpenJPEG 2.5.0 (the system's
 * libopenjp2.so.7, driven from C) as a JP2 — the irreversible 9/7 wavelet,
 * the colour transform, one quality layer at 400:1 — and decoded back by
 * the same library at 53.9 dB PSNR against the source pixels: 1876 bytes.
 */

/** A page's image for `testMemorandum` as it stands. */
export const TEST_JPX = {
  width: 640,
  height: 400,
  /** the `testPixels` variant it was encoded from */
  variant: 1,
  jpx: Buffer.from(
    [
      "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",
      "gID/2Q==",
    ].join(""),
    "base64",
  ),
} as const;
