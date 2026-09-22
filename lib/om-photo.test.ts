import { describe, expect, it } from "vitest";
import { COVER_MIN, EARLY_SHARE, findOmImages, jpegInfo, pickCover } from "./om-photo";

/**
 * A JPEG that is a JPEG to the marker walk and to nothing else: SOI, an
 * APP0, a baseline frame header carrying the size and the channel count, a
 * scan marker, and EOI. The extractor reads headers, never pixels, so a
 * decodable picture is not needed to test what it reads.
 */
function fakeJpeg(width: number, height: number, components = 3, filler = 64): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00];
  const sof = [
    0xff, 0xc0, 0x00, 8 + 3 * components, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    components,
    ...Array.from({ length: components }, (_, i) => [i + 1, 0x11, 0x00]).flat(),
  ];
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  const body = Array.from({ length: filler }, (_, i) => (i * 37) % 251); // never 0xff
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof, ...sos, ...body, 0xff, 0xd9]);
}

/** A PDF with the given image XObjects, each a JPEG stream, plus one Flate one. */
function fakePdf(images: { w: number; h: number; c?: number; eol?: string; indirectLength?: boolean; filler?: number }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const push = (s: string) => parts.push(new TextEncoder().encode(s));
  push("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  let n = 10;
  for (const im of images) {
    const jpeg = fakeJpeg(im.w, im.h, im.c ?? 3, im.filler ?? 64);
    const eol = im.eol ?? "\n";
    const length = im.indirectLength ? `${n + 100} 0 R` : String(jpeg.length);
    push(
      `${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${length} >>\nstream${eol}`,
    );
    parts.push(jpeg);
    push(`${eol}endstream\nendobj\n`);
    n++;
  }
  // A Flate-encoded image: not a JPEG, never served.
  push(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width 3000 /Height 2000 /Filter /FlateDecode /Length 4 >>\nstream\nxxxx\nendstream\nendobj\n`);
  // And a JPEG wrapped in Flate — double encoded — which must be skipped too.
  push(`${n + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width 3000 /Height 2000 /Filter [/FlateDecode /DCTDecode] /Length 4 >>\nstream\nyyyy\nendstream\nendobj\n`);
  push("trailer\n<< /Root 1 0 R >>\n%%EOF\n");
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("a JPEG's own frame header", () => {
  it("reads the size and the channel count from the SOF marker", () => {
    expect(jpegInfo(fakeJpeg(2400, 1600))).toEqual({ width: 2400, height: 1600, components: 3 });
    expect(jpegInfo(fakeJpeg(640, 480, 4))).toEqual({ width: 640, height: 480, components: 4 });
    expect(jpegInfo(fakeJpeg(100, 50, 1))).toEqual({ width: 100, height: 50, components: 1 });
  });

  it("answers null for anything that is not a JPEG, or has no frame before its scan", () => {
    expect(jpegInfo(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(jpegInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    // SOI straight into a scan: nothing said the size.
    expect(jpegInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]))).toBeNull();
    expect(jpegInfo(new Uint8Array(0))).toBeNull();
  });
});

describe("the photographs in a memorandum", () => {
  it("lifts every plain JPEG out, byte for byte, with its size from its own header", () => {
    const pdf = fakePdf([
      { w: 300, h: 120 },
      { w: 2400, h: 1600, eol: "\r\n" },
      { w: 1200, h: 800, indirectLength: true },
    ]);
    const found = findOmImages(pdf);
    expect(found.map((f) => [f.width, f.height, f.components])).toEqual([
      [300, 120, 3],
      [2400, 1600, 3],
      [1200, 800, 3],
    ]);
    for (const f of found) {
      expect(f.bytes[0]).toBe(0xff);
      expect(f.bytes[1]).toBe(0xd8);
      expect(f.bytes[f.bytes.length - 2]).toBe(0xff);
      expect(f.bytes[f.bytes.length - 1]).toBe(0xd9);
    }
    // File order, by offset.
    expect(found[0].offset).toBeLessThan(found[1].offset);
    expect(found[1].offset).toBeLessThan(found[2].offset);
  });

  it("skips what is not a plain JPEG — Flate images, double-encoded ones, a stream that is not a JPEG", () => {
    const pdf = fakePdf([]);
    expect(findOmImages(pdf)).toEqual([]);
    // A DCTDecode object whose stream is not a JPEG at all.
    const bad = new TextEncoder().encode(
      "%PDF-1.7\n5 0 obj\n<< /Type /XObject /Subtype /Image /Width 900 /Height 600 /Filter /DCTDecode /Length 5 >>\nstream\nhello\nendstream\nendobj\n",
    );
    expect(findOmImages(bad)).toEqual([]);
    // And a DCTDecode that is not an image object (a form with an odd filter name in text).
    const notImage = new TextEncoder().encode(
      "%PDF-1.7\n6 0 obj\n<< /Type /XObject /Subtype /Form /Filter /DCTDecode /Length 5 >>\nstream\nhello\nendstream\nendobj\n",
    );
    expect(findOmImages(notImage)).toEqual([]);
  });

  it("finds nothing in a file with no images, quickly", () => {
    const text = new TextEncoder().encode("%PDF-1.7\n" + "1 0 obj\n<< /Type /Catalog >>\nendobj\n".repeat(2000));
    expect(findOmImages(text)).toEqual([]);
  });
});

describe("which photograph is the cover", () => {
  const images = (pdf: Uint8Array) => findOmImages(pdf);

  it("takes the largest photograph of a photograph's shape", () => {
    const pdf = fakePdf([
      { w: 300, h: 120 }, // a logo strip: too small
      { w: 1200, h: 800 },
      { w: 2400, h: 1600 },
      { w: 6000, h: 400 }, // a panorama strip: not a cover's shape
    ]);
    const cover = pickCover(images(pdf), pdf.length)!;
    expect(cover.width).toBe(2400);
    expect(cover.height).toBe(1600);
  });

  it("prefers an early image over a larger one deep in the file", () => {
    // The cover sits early; a comp's photograph deep in the deck can be
    // bigger and is not the building. The bonus is 1.5× on AREA: the late
    // one here is 1.29× the early one's area (2,070,000 against 1,600,000),
    // inside the bonus, so the early one wins at 2,400,000 to 2,070,000.
    const early = { w: 1600, h: 1000 };
    const late = { w: 1800, h: 1150, filler: 40000 };
    const pdf = fakePdf([early, { w: 100, h: 100, filler: 60000 }, { w: 100, h: 100, filler: 60000 }, late]);
    const found = images(pdf);
    expect(found[0].offset / pdf.length).toBeLessThan(EARLY_SHARE);
    expect(found[3].offset / pdf.length).toBeGreaterThan(EARLY_SHARE);
    const cover = pickCover(found, pdf.length)!;
    expect(cover.width).toBe(1600);
    // Unless the late one is bigger by more than the early bonus.
    const bigLate = { w: 4000, h: 2600, filler: 40000 };
    const pdf2 = fakePdf([early, { w: 100, h: 100, filler: 60000 }, { w: 100, h: 100, filler: 60000 }, bigLate]);
    expect(pickCover(images(pdf2), pdf2.length)!.width).toBe(4000);
  });

  it("accepts a CMYK print export and refuses a greyscale mask", () => {
    const pdf = fakePdf([
      { w: 2400, h: 1600, c: 1 },
      { w: 1800, h: 1200, c: 4 },
    ]);
    const cover = pickCover(images(pdf), pdf.length)!;
    expect(cover.components).toBe(4);
    expect(cover.width).toBe(1800);
  });

  it("answers null for a memorandum with no usable photograph", () => {
    expect(pickCover([], 100)).toBeNull();
    const tiny = fakePdf([{ w: 400, h: 300 }]);
    expect(pickCover(images(tiny), tiny.length)).toBeNull();
    expect(COVER_MIN.width).toBe(480);
  });
});
