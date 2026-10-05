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

/**
 * A non-negative figure in `unit`s (1e6 for millions, 1e3 for thousands) at
 * `places` decimals, rounded half up on its last place IN WHOLE NUMBERS: the
 * figure is counted in that place — Math.round(5_550_000 / 1e5) is 56 tenths
 * of a million — and the string is built from the count's own digits. Never
 * a float's toFixed: (5_550_000 / 1e6).toFixed(1) is "5.5", because 5.55 is
 * stored as 5.5499…, so the pipeline card had said "$5.5M" for a note its
 * memo, its shared screen and its workbook cover said "$5.6M" for. `trim`
 * drops the zeros after the point ("40.0" → "40", "2.50" → "2.5").
 */
export function scaledText(abs: number, unit: number, places: number, trim = false): string {
  const count = Math.round(abs / (unit / 10 ** places));
  if (places === 0) return String(count);
  const digits = String(count).padStart(places + 1, "0");
  const text = `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return trim ? text.replace(/\.?0+$/, "") : text;
}

/** How a compact figure is written: what each surface chose, held to one
 *  rounding. */
export interface CompactUsdOptions {
  /** decimals on a figure in millions: 1 ("$5.6M", the default), 2
   *  ("$5.55M"), or "auto" — two under $10M, one from it ("$5.55M",
   *  "$48.0M") */
  millions?: 1 | 2 | "auto";
  /** drop the zeros after the point on a figure in millions: "$1M",
   *  "$1.5M" */
  trim?: boolean;
  /** from this size a figure in millions is written whole: "$120M" */
  wholeMillionsFrom?: number;
  /** under a million, from this size the figure is written in thousands
   *  ("$850k"), under it in whole dollars ("$9,350"): 1,000 by default; 0
   *  writes every figure under a million in thousands, Infinity none */
  thousandsFrom?: number;
  /** decimals on a figure in thousands: 0 ("$35k", the default) or up to
   *  one ("$12.5k", "$35k") */
  thousandsPlaces?: 0 | 1;
}

/**
 * A dollar figure written short — "$5.6M", "$850k", "$9,350" — the one
 * writer behind every surface that writes money that way, so a figure reads
 * the same on the pipeline card, the memo, the shared screen and the
 * workbook. Rounded half up on its last shown place in whole numbers
 * (`scaledText`); a thousands figure that rounds up to a thousand thousands
 * is a million ("$1.0M", never "$1000k"). A negative's minus sign goes
 * outside the dollar, the site's U+2212 ("−$1.5M"), and a figure that
 * rounds to nothing carries none.
 */
export function compactUsd(n: number, o: CompactUsdOptions = {}): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const body = compactBody(abs, o);
  return `${n < 0 && /[1-9]/.test(body) ? "−" : ""}$${body}`;
}

function compactBody(abs: number, o: CompactUsdOptions): string {
  if (abs < 1e6) {
    const kFrom = o.thousandsFrom ?? 1e3;
    if (abs < kFrom) return Math.round(abs).toLocaleString("en-US");
    const places = o.thousandsPlaces ?? 0;
    // Under a thousand thousands once rounded: the figure stays in thousands.
    if (Math.round(abs / (1e3 / 10 ** places)) < 1000 * 10 ** places) return `${scaledText(abs, 1e3, places, true)}k`;
  }
  const auto = o.millions === "auto";
  let places: number = o.millions === "auto" ? (abs >= 1e7 ? 1 : 2) : (o.millions ?? 1);
  // A figure that rounds up across a shape's edge is written in the next
  // shape, as a thousands figure that rounds to a thousand is a million:
  // $9,996,000 is "$10.0M" where ten millions take one place, and
  // $99,960,000 "$100M" where a hundred are written whole.
  if (auto && places === 2 && Math.round(abs / 1e4) >= 1_000) places = 1;
  const step = 1e6 / 10 ** places;
  if (o.wholeMillionsFrom != null && Math.round(abs / step) * step >= o.wholeMillionsFrom) places = 0;
  return `${scaledText(abs, 1e6, places, o.trim)}M`;
}
