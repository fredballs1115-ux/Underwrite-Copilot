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

/** A word longer than this wraps by `nameBreaks`; shorter, it wraps whole. */
const NAME_WORD_WHOLE = 24;
/** The pieces a run with no separator is cut into, as the memo's own
 *  hyphenation cuts a long word. */
const NAME_PIECE = 12;
/** An empty part react-pdf reads as a break with nothing drawn: textkit
 *  removes a soft hyphen from a part, and an empty part is zero-width glue,
 *  where a break draws no hyphen (a break between two parts of a word is a
 *  penalty, and react-pdf draws "-" at every one). */
const BREAK_HERE = "­";

/**
 * Where a deal's name may break on paper (research pass 42, L1): react-pdf's
 * hyphenation callback for the Text that prints it. A word of the name that
 * fits any column wraps whole. A longer one — a URL pasted as the name —
 * breaks after its slashes (never inside "//") and after each hyphen, dot or
 * underscore it already has, and a run still longer than a column is cut in
 * twelve-letter pieces; every break draws nothing, so the printed name is
 * the name: "…/1400-Market-St-P- hiladelphia-…" had been drawn by the
 * memo's own hyphenation, which puts a hyphen at every break.
 */
export function nameBreaks(word: string): string[] {
  if (word.length <= NAME_WORD_WHOLE) return [word];
  const pieces = word
    .split(/(?<=[-_.])|(?<=\/)(?!\/)/)
    .filter(Boolean)
    .flatMap((p) => (p.length > NAME_WORD_WHOLE ? (p.match(new RegExp(`.{1,${NAME_PIECE}}`, "gu")) ?? [p]) : [p]));
  return pieces.flatMap((p, i) => (i === 0 ? [p] : [BREAK_HERE, p]));
}

export const pdfSafe = (s: string): string =>
  STAND_INS.reduce((t, f) => f(t), s).replace(/[^\n\u0020-\u007e\u00a0-\u00ff]/gu, (ch) =>
    WINANSI_EXTRA.has(ch.codePointAt(0)!) ? ch : "",
  );

/** What the memo and the report call a deal whose name the font cannot
 *  print (research pass 42, M5). */
export const NAME_NOT_PRINTABLE = "Deal (name not printable in this PDF's font)";

const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;

/** A text as the PDF can print it: composed (a letter typed with a combining
 *  accent is the accented letter WinAnsi has: "Café", never "Cafe"), safe,
 *  and its spaces folded; null where printing it would lose a letter. */
function printableWhole(s: unknown): string | null {
  const raw = typeof s === "string" ? s.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  const safe = pdfSafe(raw).replace(/\s+/g, " ").trim();
  return letterCount(safe) === letterCount(raw) ? safe : null;
}

/**
 * The deal's name as the memo and the report print it: the title, the
 * running header and the PDF's own title alike. Standard Helvetica prints
 * WinAnsi alone, and `pdfSafe` drops the rest: a name in Japanese printed as
 * "2", one in Arabic as "12", and two such deals' memos could be taken one
 * for the other. Where printing the name would lose a letter, it is
 * NAME_NOT_PRINTABLE followed by the first of `places` (the address, then
 * the market) the font can print whole: "Deal (name not printable in this
 * PDF's font) · 1200 N 31st St, Philadelphia, PA". A symbol the font lacks
 * (an emoji) is no letter and is dropped as before; a name of none at all is
 * "Deal".
 */
export function printableName(name: unknown, places: readonly unknown[] = []): string {
  const whole = printableWhole(name);
  if (whole != null) return whole || "Deal";
  const place = places.map(printableWhole).find((p): p is string => !!p);
  return place ? `${NAME_NOT_PRINTABLE} · ${place}` : NAME_NOT_PRINTABLE;
}
