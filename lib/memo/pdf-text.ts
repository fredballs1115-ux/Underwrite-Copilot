// PDF text safety for the standard-Helvetica exports. The built-in fonts
// carry ONLY WinAnsi (cp1252) glyphs; anything else is silently written as
// whatever byte pdfkit maps it to — U+2193 became a curly quote, U+2191 a
// stray apostrophe. A wrong glyph on an IC page is worse than a missing one,
// so: map the few characters we have good stand-ins for, keep everything
// WinAnsi encodes, DROP the rest. (Universal module so it's unit-testable;
// the react-pdf documents re-export it.)

// The 27 printable cp1252 code points outside Latin-1: € ‚ ƒ „ … † ‡ ˆ ‰ Š
// ‹ Œ Ž ' ' " " • – — ˜ ™ š › œ ž Ÿ
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export const pdfSafe = (s: string): string =>
  s
    .replace(/\u2192/g, "\u203a") // → becomes ›
    .replace(/[\u2212\u2013]/g, "-") // minus sign / en dash become hyphen
    .replace(/[^\n\u0020-\u007e\u00a0-\u00ff]/gu, (ch) =>
      WINANSI_EXTRA.has(ch.codePointAt(0)!) ? ch : "",
    );
