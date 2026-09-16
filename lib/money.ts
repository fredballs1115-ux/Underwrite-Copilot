/**
 * The shorthand an analyst writes after a figure, and what it multiplies by.
 *
 * ONE TABLE. Two readers below ask different questions of a typed string —
 * "what building price is this" and "what number is this" — but they must
 * never disagree about what "M" means, so the scale lives here and both
 * read it. Longer spellings come first in the alternation the readers use
 * ("mm" before "m", "bn" before "b") or the short form wins the match and
 * "$2bn" reads as two billion's worth of nothing.
 */
const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  mm: 1e6,
  million: 1e6,
  m: 1e6,
  bn: 1e9,
  billion: 1e9,
  b: 1e9,
};

/**
 * Parse a human dollar string into whole dollars. Understands the notations
 * analysts actually type: "68000000", "$68,000,000", "$68.5M", "63 million",
 * "500k". Returns null for anything negative, unparsable, or below `floor` —
 * the floor is a typo guard ("$68" is never a building price). Callers pick
 * the floor for the figure's scale: whole-asset prices default to $10k;
 * deposits pass something smaller.
 *
 * Shared by the LOI panel (client) and the LOI route (server) so the two
 * never disagree about what a price string means. Deliberately loose about
 * what surrounds the figure — it reads the first number in a line someone
 * may have pasted, which is why it is not `readFigure`.
 */
export function parseUsd(raw: string, floor = 10_000): number | null {
  const v = raw.trim();
  if (!v || v.includes("-")) return null;
  const m = v
    .replace(/,/g, "")
    .match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(k|thousand|mm|million|m|bn|billion|b)?\b/i);
  if (!m) return null;
  const mult = m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) && n >= floor ? Math.round(n) : null;
}

/**
 * One typed figure, read as a number — for a numeric field a person fills in.
 *
 * It takes what people actually type rather than what a number input would
 * accept: "$20M", "20m", "500k", "1,200,000", "1.2mm", "63 million", "6.5%",
 * "1.25x", "-250,000". A field that silently ignores "$20M" is a field that
 * shows a page of em dashes to someone who typed a perfectly ordinary
 * number, which is worse than refusing it out loud.
 *
 * NO FLOOR AND NO SIGN RULE, unlike `parseUsd`. Both of those belong to the
 * caller here: a negative NOI is a real thing to type into a debt sizer
 * (and `sizeLoan` deliberately has an answer for it), and a floor that
 * protects a purchase price from a typo would swallow a $36 rent.
 *
 * Strict about the whole string, again unlike `parseUsd` — a field's entire
 * contents are the figure, so "20x6" is a mistake to report rather than a
 * twenty to read out of it.
 */
export function readFigure(raw: string): number | null {
  // Commas and spaces are grouping, never meaning; a currency symbol may
  // sit either side of a minus sign ("-$250,000" and "$-250,000" both).
  const v = raw.replace(/[,\s]/g, "").replace(/^([-+]?)\$/, "$1");
  const m = /^([-+]?)([0-9]*\.?[0-9]+)(k|thousand|mm|million|m|bn|billion|b)?[%x]?$/i.exec(v);
  if (!m) return null;
  const n = Number(m[2]) * (m[3] ? SCALE[m[3].toLowerCase()] ?? 1 : 1) * (m[1] === "-" ? -1 : 1);
  if (!Number.isFinite(n)) return null;
  // "-0" is a number JavaScript will happily print with its sign attached.
  return n === 0 ? 0 : n;
}

/** parseUsd, then "$68,000,000" formatting — "" when unusable. */
export function fmtUsd(raw: string | null, floor = 10_000): string {
  const n = parseUsd(raw ?? "", floor);
  return n !== null ? `$${n.toLocaleString("en-US")}` : "";
}
