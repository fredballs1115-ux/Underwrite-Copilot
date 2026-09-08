// Test tooling: a valid one-pixel PNG built with the real deflate and a real
// CRC, because a hand-typed fixture once carried a bad zlib checksum — a
// browser shrugs at that, Node's zlib does not, and react-pdf hangs its
// whole render on it. (Imported by tests only, never by the app.)
import { deflateSync } from "node:zlib";

let TABLE: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

/** A 1×1 RGB PNG of the given colour (the brand teal by default). */
export function tinyPng(rgb: [number, number, number] = [17, 78, 84]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.from([0, ...rgb]); // one row: filter byte, then the pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const TINY_PNG = tinyPng();
export const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG.toString("base64")}`;

/** A PNG whose zlib stream fails its data check — a browser paints it, Node
 *  refuses it. What the cover fetcher must never hand to react-pdf. */
export const CORRUPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P/hPwAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);
