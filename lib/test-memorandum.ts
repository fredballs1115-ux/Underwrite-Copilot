/**
 * Test tooling: real memoranda to search for a cover photograph, written by
 * the PDF writer the report and the memo already ship with
 * (`@react-pdf/pdfkit`, under `@react-pdf/renderer`). It embeds a JPEG as
 * the JPEG and a PNG as pixels, and it secures a file the way a broker's
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
  end(): void;
}
type PdfKit = new (options?: object) => PdfKitDoc;

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
  images?: Buffer[];
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
  for (const page of pages) {
    doc.addPage({ size: "LETTER", layout: "landscape" });
    let y = 36;
    for (const img of page.images ?? []) {
      doc.image(img, 36, y, { width: 360 });
      y += 240;
    }
    if (page.text) doc.fontSize(12).text(page.text, 420, 36);
  }
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * A photograph-like picture — a colour gradient with a ripple through it —
 * as raw RGB, so a test can compare what comes back against what went in.
 */
export function testPixels(width: number, height: number): Buffer {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const ripple = (Math.sin(x * 0.05) + Math.cos(y * 0.07)) * 12;
      raw[i] = Math.round(40 + (x / width) * 170 + ripple);
      raw[i + 1] = Math.round(70 + (y / height) * 120 + ripple);
      raw[i + 2] = Math.round(200 - (x / width) * 90 + ripple);
    }
  }
  return raw;
}

/** The test picture, encoded as a file sharp writes. */
export async function testPicture(
  width: number,
  height: number,
  as: "jpeg" | "png" | "grey-jpeg" | "png-alpha",
): Promise<Buffer> {
  const img = sharp(testPixels(width, height), { raw: { width, height, channels: 3 } });
  if (as === "jpeg") return img.jpeg({ quality: 90 }).toBuffer();
  if (as === "grey-jpeg") return img.greyscale().jpeg({ quality: 90 }).toBuffer();
  if (as === "png") return img.png().toBuffer();
  return img.ensureAlpha(0.5).png().toBuffer();
}
