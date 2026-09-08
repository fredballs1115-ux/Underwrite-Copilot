// Test tooling: the text a rendered PDF carries, read back from its content
// streams the way a reader's PDF viewer reads it. The document modules are
// only ever checked by page count and byte signature otherwise, which is how
// a memo's "Key terms" block dropped the asking price and its buy-box pass
// mark rendered as nothing for weeks with every render test green. Never
// imported by the app — the render tests only.
//
// Standard-font text is written by pdfkit as WinAnsi bytes inside `(…) Tj`
// and `[(…) kern (…)] TJ` operators, usually in a FlateDecode'd stream; each
// operator becomes one line here. Positions are ignored, so a table reads
// cell by cell in drawing order — enough for "does the page carry X".
import { inflateSync } from "node:zlib";

// The cp1252 code points above 0x7f that the standard fonts encode.
const WINANSI_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
  0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
  0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•",
  0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

const decodeBytes = (bytes: number[]): string =>
  bytes.map((b) => WINANSI_HIGH[b] ?? String.fromCharCode(b)).join("");

/** A PDF string operand — `(literal)` with its escapes, or `<hex>`. */
function decodeString(token: string): string {
  if (token.startsWith("<")) {
    const hex = token.slice(1, -1).replace(/\s+/g, "");
    const bytes: number[] = [];
    for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    return decodeBytes(bytes);
  }
  const inner = token.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== "\\") {
      bytes.push(inner.charCodeAt(i) & 0xff);
      continue;
    }
    const next = inner[++i];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(inner[i + 1] ?? "")) oct += inner[++i];
      bytes.push(parseInt(oct, 8) & 0xff);
    } else {
      const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (next === "\n") continue; // line continuation
      bytes.push(map[next] ?? next.charCodeAt(0));
    }
  }
  return decodeBytes(bytes);
}

const STRING = String.raw`\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>`;
const NUM = String.raw`-?\d*\.?\d+`;
// The operators that place text: the graphics stack (q / Q), transforms
// (cm), the text matrix (Tm / Td) and the two show-text forms. react-pdf
// splits one line into several runs at script boundaries — "$21.0" and "M"
// are two operators — and walks a line's runs with an x-only advance
// (`1 0 0 1 w 0 cm`) after each. Tracking the transform gives every run an
// absolute origin, so a run that starts exactly where the previous one
// ended, on the same baseline, is the same line; a table's next cell, on
// the same baseline but further along, is not.
const OPERATOR = new RegExp(
  String.raw`\[((?:${STRING}|[-+\d.]+|\s)*)\]\s*TJ` +
    String.raw`|(${STRING})\s*(?:Tj|'|")` +
    String.raw`|(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(cm|Tm)` +
    String.raw`|(${NUM})\s+(${NUM})\s+(Td|TD)` +
    String.raw`|(?<![A-Za-z])(q|Q|BT|ET)(?![A-Za-z])`,
  "g",
);
const ARRAY_ITEM = new RegExp(String.raw`(${STRING})|(-?\d+(?:\.\d+)?)`, "g");

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** m1 then m2, as PDF composes them (`cm` pre-multiplies the CTM). */
const compose = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[1] * m2[2],
  m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2],
  m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
  m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Every line of text of one content stream, in drawing order. */
function runsOf(content: string): string[] {
  const out: string[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let tm: Matrix = IDENTITY;
  let cur: { x: number; y: number; endX: number | null; text: string } | null = null;
  const flush = () => {
    if (cur?.text) out.push(cur.text);
    cur = null;
  };
  const show = (text: string) => {
    const [x, y] = apply(ctm, tm[4], tm[5]);
    if (cur && Math.abs(y - cur.y) < 0.5 && cur.endX != null && Math.abs(x - cur.endX) < 1.5) {
      cur.text += text;
      cur.endX = null;
    } else {
      flush();
      cur = { x, y, endX: null, text };
    }
  };
  // The x-only advance right after a run marks where that run ended.
  const advance = (dx: number) => {
    if (cur && cur.endX == null) cur.endX = cur.x + dx;
  };
  for (const m of content.matchAll(OPERATOR)) {
    if (m[13] !== undefined) {
      if (m[13] === "q") stack.push(ctm);
      else if (m[13] === "Q") ctm = stack.pop() ?? IDENTITY;
      else if (m[13] === "BT") tm = IDENTITY;
      continue;
    }
    if (m[9] !== undefined) {
      const mat = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as Matrix;
      if (m[9] === "Tm") {
        tm = mat;
      } else {
        if (mat[5] === 0 && mat[4] !== 0 && mat[0] === 1 && mat[3] === 1) advance(mat[4]);
        ctm = compose(mat, ctm);
      }
      continue;
    }
    if (m[12] !== undefined) {
      tm = compose([1, 0, 0, 1, Number(m[10]), Number(m[11])], tm);
      continue;
    }
    if (m[2] !== undefined) {
      show(decodeString(m[2]));
      continue;
    }
    let run = "";
    for (const item of (m[1] ?? "").matchAll(ARRAY_ITEM)) {
      if (item[1] !== undefined) run += decodeString(item[1]);
      // A large negative kern is how a word gap is sometimes written.
      else if (Number(item[2]) < -180) run += " ";
    }
    show(run);
  }
  flush();
  return out;
}

/** Every content stream in the document, inflated, in the order they appear. */
function streamsOf(pdf: Buffer): string[] {
  const streams: string[] = [];
  let at = 0;
  for (;;) {
    const start = pdf.indexOf("stream", at, "latin1");
    if (start === -1) break;
    // "endstream" also contains "stream" — skip a match that is one.
    if (start >= 3 && pdf.toString("latin1", start - 3, start) === "end") {
      at = start + 6;
      continue;
    }
    let dataStart = start + 6;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const end = pdf.indexOf("endstream", dataStart, "latin1");
    if (end === -1) break;
    const dict = pdf.toString("latin1", Math.max(0, start - 300), start);
    const raw = pdf.subarray(dataStart, end);
    try {
      streams.push((/\/FlateDecode/.test(dict) ? inflateSync(raw) : raw).toString("latin1"));
    } catch {
      streams.push(raw.toString("latin1"));
    }
    at = end + 9;
  }
  return streams;
}

/** The text of every content stream in the document, one line per text
 *  operator, in the order the streams appear. */
export function pdfTextOf(pdf: Buffer): string {
  return streamsOf(pdf)
    .flatMap((content) => runsOf(content))
    .join("\n");
}

/**
 * How many filled shapes the document draws — every `f` / `f*` operator
 * outside a text string. A View with a background is one fill, so the
 * pictures a page draws with plain Views (a bar, a dot) can be counted
 * against a render without them; text and stroked borders are not fills.
 */
export function pdfFillCountOf(pdf: Buffer): number {
  const strings = new RegExp(STRING, "g");
  let count = 0;
  for (const content of streamsOf(pdf)) {
    const ops = content.replace(strings, "()");
    count += (ops.match(/(?:^|\s)f\*?(?=\s|$)/g) ?? []).length;
  }
  return count;
}
