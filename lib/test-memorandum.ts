/**
 * Test tooling: real memoranda to search for a cover photograph, written by
 * the PDF writer the report and the memo already ship with
 * (`@react-pdf/pdfkit`, under `@react-pdf/renderer`). It embeds a JPEG as
 * the JPEG and a PNG as pixels (and a JPEG 2000 picture, which pdfkit cannot
 * read, as its own bytes: `TestJpxImage`), and it secures a file the way a broker's
 * export does: an owner password over an empty user password, with every
 * stream encrypted (RC4 40 and 128, AES 128 and 256 by the version asked
 * for), or a user password that must be typed to open it.
 */

import sharp from "sharp";

/** pdfkit ships no types; these are the few calls the tests make. */
interface PdfKitDoc {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  addPage(options?: object): PdfKitDoc;
  image(src: Buffer, x: number, y: number, options?: { width?: number }): PdfKitDoc;
  fontSize(size: number): PdfKitDoc;
  text(text: string, x?: number, y?: number): PdfKitDoc;
  /** an indirect object; a stream once `end` writes its bytes */
  ref(data: object): { end(chunk?: Buffer): void };
  page: { xobjects: Record<string, unknown> };
  save(): PdfKitDoc;
  restore(): PdfKitDoc;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): PdfKitDoc;
  addContent(content: string): PdfKitDoc;
  end(): void;
}
type PdfKit = new (options?: object) => PdfKitDoc;

/**
 * A picture stored as JPEG 2000 (`/JPXDecode`, lib/test-jpx), which pdfkit
 * cannot read: its size is said, and its bytes go into the file as they are.
 */
export interface TestJpxImage {
  jpx: Buffer;
  width: number;
  height: number;
}

/** How the file is secured, if it is. */
export type Security = "none" | "rc4-40" | "rc4-128" | "aes-128" | "aes-256" | "user-password";

const VERSION: Record<Exclude<Security, "none">, string> = {
  "rc4-40": "1.3",
  "rc4-128": "1.4",
  "aes-128": "1.7",
  "aes-256": "1.7ext3",
  "user-password": "1.7",
};

/** One page: the pictures it draws, in order, and a line of text. */
export interface TestPage {
  images?: (Buffer | TestJpxImage)[];
  text?: string;
}

/** A PDF of the given pages, secured as asked. */
export async function testMemorandum(pages: TestPage[], security: Security = "none"): Promise<Uint8Array> {
  // A specifier the type checker does not resolve: the package has no types.
  const spec = "@react-pdf/pdfkit";
  const { default: PDFDocument } = (await import(spec)) as { default: PdfKit };
  const options =
    security === "none"
      ? {}
      : {
          pdfVersion: VERSION[security],
          ownerPassword: "owner",
          ...(security === "user-password" ? { userPassword: "secret" } : {}),
          permissions: { printing: "lowResolution" },
        };
  const doc = new PDFDocument({ autoFirstPage: false, ...options });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));
  let jpx = 0;
  for (const page of pages) {
    doc.addPage({ size: "LETTER", layout: "landscape" });
    let y = 36;
    for (const img of page.images ?? []) {
      if (Buffer.isBuffer(img)) doc.image(img, 36, y, { width: 360 });
      else placeJpx(doc, img, 36, y, 360, `Jpx${++jpx}`);
      y += 240;
    }
    if (page.text) doc.fontSize(12).text(page.text, 420, 36);
  }
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Draw a JPEG 2000 picture the way pdfkit draws a JPEG: its own image
 * XObject, filtered `/JPXDecode` alone (so pdfkit neither deflates it nor
 * claims a colour space — the JP2 header says it), encrypted with the rest
 * of the file where it is secured, and painted into the page's top-down
 * frame flipped, as pdfkit's own `image()` does.
 */
function placeJpx(doc: PdfKitDoc, img: TestJpxImage, x: number, y: number, width: number, name: string): void {
  const height = (width * img.height) / img.width;
  const ref = doc.ref({ Type: "XObject", Subtype: "Image", Width: img.width, Height: img.height, Filter: "JPXDecode" });
  ref.end(img.jpx);
  doc.page.xobjects[name] = ref;
  doc.save();
  doc.transform(width, 0, 0, -height, x, y + height);
  doc.addContent(`/${name} Do`);
  doc.restore();
}

/**
 * A photograph-like picture — a colour gradient with a ripple through it —
 * as raw RGB, so a test can compare what comes back against what went in.
 * `variant` gives a different photograph (#448): a band of light across it
 * at its own angle and count, the same at any size, so a picture and its
 * resized copy are one photograph to the gallery and two variants are two.
 */
export function testPixels(width: number, height: number, variant = 0): Buffer {
  const raw = Buffer.alloc(width * height * 3);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const ripple = (Math.sin(x * 0.05) + Math.cos(y * 0.07)) * 12;
      const u = x / width;
      const v = y / height;
      const band = variant === 0 ? 0 : Math.sin((u * (variant + 1) + v * variant) * Math.PI * 2) * 70;
      raw[i] = clamp(40 + u * 170 + ripple + band);
      raw[i + 1] = clamp(70 + v * 120 + ripple + band);
      raw[i + 2] = clamp(200 - u * 90 + ripple + band);
    }
  }
  return raw;
}

/** The test picture, encoded as a file sharp writes. */
export async function testPicture(
  width: number,
  height: number,
  as: "jpeg" | "png" | "grey-jpeg" | "png-alpha",
  variant = 0,
): Promise<Buffer> {
  const img = sharp(testPixels(width, height, variant), { raw: { width, height, channels: 3 } });
  if (as === "jpeg") return img.jpeg({ quality: 90 }).toBuffer();
  if (as === "grey-jpeg") return img.greyscale().jpeg({ quality: 90 }).toBuffer();
  if (as === "png") return img.png().toBuffer();
  return img.ensureAlpha(0.5).png().toBuffer();
}

/**
 * A location map as a memorandum prints one: the flat fills of land, a park
 * and a river, a street grid, a pin and its labels. What the cover search
 * must never take for the building (#444).
 */
export async function testMap(width: number, height: number, as: "jpeg" | "png"): Promise<Buffer> {
  const streets = Array.from({ length: 12 }, (_, i) => {
    const x = Math.round(((i + 0.5) * width) / 12);
    const y = Math.round(((i + 0.5) * height) / 12);
    const w = i % 4 === 0 ? 18 : 8;
    return `<path d="M${x} 0 L${x + 40} ${height}" stroke="#ffffff" stroke-width="${w}"/><path d="M0 ${y} L${width} ${y + 25}" stroke="${i % 3 === 0 ? "#fcd6a4" : "#ffffff"}" stroke-width="${w}"/>`;
  }).join("");
  const labels = Array.from({ length: 8 }, (_, i) => `<text x="${40 + i * (width / 9)}" y="${60 + i * (height / 10)}" font-size="${Math.round(height / 40)}" fill="#555555">Main St</text>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#f2efe9"/>` +
    `<rect x="${width * 0.08}" y="${height * 0.1}" width="${width * 0.25}" height="${height * 0.25}" fill="#c8facc"/>` +
    `<path d="M0 ${height * 0.65} C${width * 0.3} ${height * 0.6} ${width * 0.6} ${height * 0.75} ${width} ${height * 0.7}" stroke="#aad3df" stroke-width="${height / 12}" fill="none"/>` +
    streets +
    `<circle cx="${width / 2}" cy="${height / 2}" r="${height / 40}" fill="#d93025"/>` +
    labels +
    `</svg>`;
  const img = sharp(Buffer.from(svg));
  return as === "jpeg" ? img.jpeg({ quality: 80 }).toBuffer() : img.png().toBuffer();
}
