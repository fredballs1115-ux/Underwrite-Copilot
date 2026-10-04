// The market check's typical range, read one way on every surface that
// draws a figure against it: "5.25–5.75%", "5.25%–5.75%" (the unit after
// the low figure too), "5.25%-5.75%" (a hyphen), "$2,150–$2,450/mo", "2.5
// to 3.5%". The deal page had read every number in the text with a leading
// minus allowed, so a hyphen's range came back as 5.25 and −5.75 and drew
// no bar, while the report's own reader drew it.
//
// An end's own minus is read in each of its forms — the hyphen-minus, the
// minus sign (U+2212) and the en dash a word processor sets for one — where
// it stands before the figure: "−0.5%–1.0%" had read as 0.5 to 1. An end's
// scale is read too ("$180k–$220k", "$1.0M–$1.5M"), and a second end's
// scale carries to a first written without one ("$180–$220k" is $180k to
// $220k) wherever, so scaled, the first lies at or below the second — the
// way `priceRange` reads a price (lib/criteria). The ends are numbers
// through the verdict ranges' figure reader (lib/verdict-range
// `rangeFigure`), the one the deal page reads the OM's figure through, so
// the range and the figure drawn against it are one scale.
import { rangeFigure } from "@/lib/verdict-range";

// A sign: either one standing before the figure (and its dollar sign, if it
// has one), or one after the dollar sign.
const SIGN = "[-−–]";
const END = String.raw`((?:${SIGN}\$?|\$${SIGN}?)?\d[\d,]*\.?\d*)\s*(k|thousand|mm|mn|million|m|bn|billion|b)?\b`;
const RANGE = new RegExp(String.raw`${END}\s*%?\s*(?:–|—|-|to)\s*${END}`, "iu");

/** The two ends as written with their scales ("$2,150", "5.75", "$180k"),
 *  the second's scale carried to a first written without one; null where
 *  the text states no range. */
export function typicalRangeParts(text: string): [string, string] | null {
  const m = RANGE.exec(text);
  if (!m) return null;
  const [, first, firstScale, second, secondScale] = m;
  let scale1 = firstScale ?? "";
  const scale2 = secondScale ?? "";
  if (!scale1 && scale2) {
    const n1 = rangeFigure(first)?.value;
    const n2 = rangeFigure(second)?.value;
    // "$180–$220k": the first borrows the second's scale where, so scaled,
    // it lies at or below the second ("$950–$1.2M" keeps its $950).
    if (n1 != null && n2 != null && n1 <= n2) scale1 = scale2;
  }
  return [`${first}${scale1}`, `${second}${scale2}`];
}

/** The two ends as numbers, low then high; null where the text states no
 *  range or its ends do not rise (a range written high to low is no range
 *  to draw a figure against). */
export function typicalRange(text: string): [number, number] | null {
  const parts = typicalRangeParts(text);
  if (!parts) return null;
  const lo = rangeFigure(parts[0])?.value;
  const hi = rangeFigure(parts[1])?.value;
  return lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : null;
}
