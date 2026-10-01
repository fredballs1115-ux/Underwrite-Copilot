// PDF text safety for the standard-Helvetica exports. The built-in fonts
// carry ONLY WinAnsi (cp1252) glyphs; anything else is silently written as
// whatever byte pdfkit maps it to — U+2193 became a curly quote, U+2191 a
// stray apostrophe. A wrong glyph on an IC page is worse than a missing one,
// so: map the characters we have good stand-ins for, keep everything
// WinAnsi encodes, DROP the rest. A dropped symbol can still change what a
// line says ("NOI ↓ 4%" printed as "NOI  4%"), so every symbol a model or a
// template is likely to write gets a stand-in that reads right. (Universal
// module so it's unit-testable; the react-pdf documents re-export it.)

// The 27 printable cp1252 code points outside Latin-1: € ‚ ƒ „ … † ‡ ˆ ‰ Š
// ‹ Œ Ž ' ' " " • – — ˜ ™ š › œ ž Ÿ
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** A symbol said as a word: spaced from a letter or a figure beside it, so
 *  "NOI↓4%" reads "NOI down 4%", never "NOIdown4%". */
const asWord = (symbol: string, word: string) => (s: string) =>
  s
    .replace(new RegExp(`(?<=[\\p{L}\\p{N}%])${symbol}`, "gu"), ` ${symbol}`)
    .replace(new RegExp(`${symbol}(?=[\\p{L}\\p{N}$€£])`, "gu"), `${symbol} `)
    .replace(new RegExp(symbol, "gu"), word);

/** The symbols outside WinAnsi that a sentence cannot lose, each with the
 *  text that says the same thing: a comparison, a direction, an arrow. */
const STAND_INS: ((s: string) => string)[] = [
  (s) => s.replace(/\u2265/g, ">="), // ≥
  (s) => s.replace(/\u2264/g, "<="), // ≤
  (s) => s.replace(/\u2248/g, "~"), // ≈
  asWord("\u2191", "up"), // ↑
  asWord("\u2193", "down"), // ↓
  (s) => s.replace(/\u2192/g, "->"), // →
  (s) => s.replace(/\u2190/g, "<-"), // ←
  (s) => s.replace(/[\u2010\u2011]/g, "-"), // hyphen, non-breaking hyphen
  (s) => s.replace(/[\u2212\u2013]/g, "-"), // minus sign / en dash
  // Typographic spaces (thin, narrow no-break, figure …) are a space, not
  // nothing: dropped, "12 months" would read "12months".
  (s) => s.replace(/[\u2002-\u200a\u202f\u205f]/g, " "),
];

export const pdfSafe = (s: string): string =>
  STAND_INS.reduce((t, f) => f(t), s).replace(/[^\n\u0020-\u007e\u00a0-\u00ff]/gu, (ch) =>
    WINANSI_EXTRA.has(ch.codePointAt(0)!) ? ch : "",
  );
