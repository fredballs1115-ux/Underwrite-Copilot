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
// $220k) by the rule `priceRange` reads a price by (lib/criteria): where,
// so scaled, the first lies within a range's reach below the second — at
// or under it, and at or over its half. Where it carries to neither, a
// second end more than twice the first is no range ("$950–$1.2M" had read
// as $950 to $1,200,000). Two ends on one scale are read as written however
// wide, an end at or under zero included: the refusal answers the scale's
// question, never a rate's width ("3–8%", "−0.5%–1.0%"). The ends are numbers
// through the verdict ranges' figure reader (lib/verdict-range
// `rangeFigure`), the one the deal page reads the OM's figure through, so
// the range and the figure drawn against it are one scale.
import { rangeFigure } from "@/lib/verdict-range";

// A sign: either one standing before the figure (and its dollar sign, if it
// has one), or one after the dollar sign.
const SIGN = "[-−–]";
const END = String.raw`((?:${SIGN}\$?|\$${SIGN}?)?\d[\d,]*\.?\d*)\s*(k|thousand|mm|mn|million|m|bn|billion|b)?\b`;
const RANGE = new RegExp(String.raw`${END}\s*%?\s*(?:–|—|-|to)\s*${END}`, "iu");

/** Whether the text is shaped as a range — two figures with a dash or "to"
 *  between them — whether or not its ends make one to draw against (a
 *  reconciliation row's value written as a range is no single figure to
 *  subtract, lib/gap-detail). */
export function looksLikeRange(text: string | null | undefined): boolean {
  return RANGE.test(text ?? "");
}

/** The two ends as written with their scales ("$2,150", "5.75", "$180k"),
 *  the second's scale carried to a first written without one as a price
 *  range carries it; null where the text states no range, or where the
 *  ends, the scale carried to neither, are more than twice apart. */
export function typicalRangeParts(text: string): [string, string] | null {
  const m = RANGE.exec(text);
  if (!m) return null;
  const [, first, firstScale, second, secondScale] = m;
  let scale1 = firstScale ?? "";
  const scale2 = secondScale ?? "";
  if (!scale1 && scale2) {
    const n1 = rangeFigure(first)?.value;
    const n2 = rangeFigure(second)?.value;
    if (n1 != null && n2 != null) {
      if (n1 > 0 && n2 > 0) {
        // "$180–$220k": the first borrows the second's scale where, so
        // scaled, it lies within a range's reach below the second — the
        // scale cancels, so the figures as written decide (lib/criteria
        // `priceRange`'s rule).
        if (n1 <= n2 && n1 * 2 >= n2) scale1 = scale2;
        else {
          // Carried to neither: the ends as written must make a range on
          // their own, at most twice apart ("$950,000–$1.2M" does;
          // "$950–$1.2M" does not).
          const lo = rangeFigure(first)?.value;
          const hi = rangeFigure(`${second}${scale2}`)?.value;
          if (lo == null || hi == null || hi > lo * 2) return null;
        }
      } else if (n1 <= n2) {
        scale1 = scale2;
      }
    }
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
