/**
 * The shorthand an analyst writes after a figure, and what it multiplies by.
 *
 * ONE TABLE. Two readers below ask different questions of a typed string —
 * "what building price is this" and "what number is this" — but they must
 * never disagree about what "M" means, so the scale lives here and both
 * read it. Longer spellings come first in the alternation the readers use
 * ("mm" before "m", "bn" before "b") or the short form wins the match and
 * "$2bn" reads as two billion's worth of nothing. "mil", "mn" and "bil"
 * are the shorthand a memorandum writes too ("$12.5 mil", "USD 25mn",
 * "$1.2 bil"): outside the table, "$12.5 mil" read as $12.50 (audit C3a).
 */
const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  mm: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  m: 1e6,
  bn: 1e9,
  bil: 1e9,
  billion: 1e9,
  b: 1e9,
};

/** The scale words, longest first, as the readers' alternation spells them. */
export const SCALE_WORDS = "k|thousand|million|mil|mm|mn|m|billion|bil|bn|b";

// The digits of a figure as a memorandum writes them: thousands commas kept
// (never a trailing one), a decimal part, and never part of a longer number
// ("$32.50psf" is never 32). The commas are kept so a year is told from a
// figure: "2026" can be a year, "2,026" cannot.
const DIGITS = String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?(?!\.?\d)`;
// The first figure in a line, as `parseUsd` has always found it: an
// optional dollar sign, the digits, a scale.
const FIRST_FIGURE = new RegExp(String.raw`\$?\s*(${DIGITS})\s*(${SCALE_WORDS})?\b`, "i");
// The figure's own sign, in any of its forms — the hyphen-minus, the minus
// sign (U+2212) and the en dash a word processor sets for one — either
// opening the value ("-250,000", "−$250k", "- $250,000") or set against
// the figure or its dollar sign ("Net -250,000", "$-250,000", "$ -250,000").
// Never a hyphen inside a word ("T-12"), and never a dash set apart between
// words and the figure ("Senior loan – $24,500,000"), which is punctuation.
const SIGN_OPENS = /^[\s(]*[-−–]\s*\$?\s*$/;
const SIGN_SET_AGAINST = /(?:^|[^A-Za-z0-9])[-−–]\$?$|\$\s*[-−–]\s*$/;
// Accounting brackets around the figure alone: "($250,000)", "$(250,000)".
const BRACKET_OPENS = /(?:\$\s*)?\(\s*\$?\s*$/;
const BRACKET_CLOSES = /^\s*\)/;
// What may follow a figure and make it a range's first end (`opensRange`):
// a dash — the hyphen, the minus sign, the en or em dash — or "to" /
// "through", then another figure, its dollar sign and its scale.
const OTHER_END = new RegExp(
  String.raw`^(\s*)([-−–—]|to\b|through\b)(\s*\$?\s*)(${DIGITS})(?:\s*(${SCALE_WORDS})(?![a-z]))?`,
  "i",
);
// A figure that is no dollar figure, by the words right after it: a
// percentage, basis points or a multiple.
const NOT_DOLLARS = /^\s*(?:%|percent\b|per\s?cent\b|pct\b|bps?\b|basis\s+points?\b|[x×](?![a-z]))/i;
// A year: four digits from 1900 to 2099 with no dollar sign, no thousands
// comma, no decimals and no scale ("2026" — never "$2,026" or "2,050").
const YEAR = /^(?:19|20)\d{2}$/;
const isYear = (written: string, digits: string, scale: string | undefined) =>
  !scale && !written.includes("$") && YEAR.test(digits);

const scaled = (digits: string, scale: string | undefined) =>
  Number(digits.replace(/,/g, "")) * (scale ? SCALE[scale.toLowerCase()] ?? 1 : 1);

/**
 * Whether the words right after a figure of `first` dollars make it the
 * first end of a range — two figures, not one (audit C3a, MED-1):
 *  - after a year, a dash or "to" and another figure is a span of years
 *    ("2025-26", "2026–27", "2025 to 2030"): a label, never the figure;
 *  - a hyphen or a minus sign joined to both figures ("40-42M",
 *    "$40-$42M") is a range or a compound label, neither of them the figure;
 *  - otherwise — an en or em dash, joined or spaced, a spaced hyphen, "to"
 *    or "through" — the other figure is a range's other end only where it
 *    is dollars and at least half the first, read with its own scale
 *    ("$40,000,000 – $42,000,000", "$40–42M", "$40 to $42 million"). A
 *    percentage, a multiple, a year or a smaller figure after it is words
 *    after the figure: "$450,000 – 10% bumps every 5 years", "$24,500,000 —
 *    3.45% fixed", "$520,500 – 2026 estimate", "$900,000 through 2031".
 * An abbreviation's period after a scale is read past ("$1.0 mil. – $1.2
 * mil.").
 */
function opensRange(after: string, first: number, firstIsYear: boolean, scaledFirst: boolean): boolean {
  const rest = scaledFirst ? after.replace(/^\./, "") : after;
  const m = OTHER_END.exec(rest);
  if (!m) return false;
  const [whole, gap, dash, between, digits, scale] = m;
  if (firstIsYear) return true;
  if (/^[-−]$/.test(dash) && !gap && /^\$?$/.test(between)) return true;
  if (NOT_DOLLARS.test(rest.slice(whole.length))) return false;
  if (isYear(between, digits, scale)) return false;
  return scaled(digits, scale) >= first / 2;
}

// Every figure in a line, as `statesRange` reads them.
const FIGURES = new RegExp(String.raw`\$?\s*(${DIGITS})(?:\s*(${SCALE_WORDS})(?![a-z]))?`, "gi");

/**
 * Whether a line states a range anywhere in it — a figure followed by a
 * range's other end, by `parseUsd`'s own rule (`opensRange`): "$600 - $700",
 * "$1.0M – $1.2M", "$15k-20k", "$450,000 to $520,000". The one test behind
 * every reader that refuses a range as no single figure, so none of them
 * drops a stated figure for the words after it ("$610,000 – 2% annual
 * increases", "$520,500 – 2026 estimate", "$650/mo (2025-26 budget)"): a
 * span of years is a label, never a range of the line's figures.
 */
export function statesRange(text: string): boolean {
  for (const m of text.matchAll(FIGURES)) {
    const [written, digits, scale] = m;
    if (isYear(written, digits, scale)) continue;
    if (opensRange(text.slice(m.index + written.length), scaled(digits, scale), false, !!scale)) return true;
  }
  return false;
}

/** What a scale word multiplies by; 1 for none or a word not in the table. */
export function scaleOf(word: string | undefined): number {
  return word ? (SCALE[word.toLowerCase()] ?? 1) : 1;
}

/**
 * Parse a human dollar string into whole dollars. Understands the notations
 * analysts actually type: "68000000", "$68,000,000", "$68.5M", "63 million",
 * "500k". Returns null for anything unparsable or below `floor` — the floor
 * is a typo guard ("$68" is never a building price). Callers pick the floor
 * for the figure's scale: whole-asset prices default to $10k; deposits pass
 * something smaller.
 *
 * Null too for a negative — a minus before the figure in any of its forms
 * ("-250,000", "−$250k", "$-250,000") or accounting brackets around the
 * figure alone ("($250,000)") — and for a range whose first end is the
 * figure ("$40M - $42M", "40-42M", "$40M to $42M", "$40–42M"), which is two
 * figures, not one. A hyphen in the words after the figure is neither:
 * "$24,500,000 (Freddie Mac, non-recourse)", "$410,000 (2025-26)" and
 * "$650,000 (T-12)" are the figures they state. (Any hyphen anywhere had
 * read as nothing, so a stated balance, ground rent or tax bill with a
 * hyphenated word beside it was silently dropped — research pass 37.) Nor
 * is a dash before a percentage, a year or a smaller figure, which are
 * words after the figure (`opensRange`): "$450,000 – 10% bumps every 5
 * years", "$24,500,000 — 3.45% fixed", "$520,500 – 2026 estimate" are the
 * figures they state (audit C3a: any dash and digit had read as a range).
 *
 * Shared by the LOI panel (client) and the LOI route (server) so the two
 * never disagree about what a price string means. Deliberately loose about
 * what surrounds the figure — it reads the first number in a line someone
 * may have pasted, which is why it is not `readFigure`.
 */
export function parseUsd(raw: string, floor = 10_000): number | null {
  const v = raw.trim();
  if (!v) return null;
  const m = FIRST_FIGURE.exec(v);
  if (!m) return null;
  const before = v.slice(0, m.index + m[0].indexOf(m[1]));
  const after = v.slice(m.index + m[0].length);
  if (SIGN_OPENS.test(before) || SIGN_SET_AGAINST.test(before)) return null;
  if (BRACKET_OPENS.test(before) && BRACKET_CLOSES.test(after)) return null;
  const n = scaled(m[1], m[2]);
  if (opensRange(after, n, isYear(m[0], m[1], m[2]), !!m[2])) return null;
  return Number.isFinite(n) && n >= floor ? Math.round(n) : null;
}

// A typed field's whole contents: a sign, the digits, a scale, a unit the
// field prints beside it.
const FIGURE_TYPED = new RegExp(String.raw`^([-+]?)([0-9]*\.?[0-9]+)(${SCALE_WORDS})?[%x]?$`, "i");

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
  const m = FIGURE_TYPED.exec(v);
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
  return `${minusFor(n, body)}$${body}`;
}

/**
 * The site's sign before a figure written from its absolute value — the rule
 * `compactUsd` writes a dollar by, for any figure that may run negative (a
 * percent, a count): U+2212 ("−3.65%") where the figure is under zero and
 * what is shown of it is not all zeros, nothing otherwise, never a
 * hyphen-minus (research pass 38: a cap-mismatch finding read "-3.65%").
 */
export function minusFor(n: number, shown: string): string {
  return n < 0 && /[1-9]/.test(shown) ? "−" : "";
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
