// The market check's typical range, read one way on every surface that
// draws a figure against it: "5.25–5.75%", "5.25%–5.75%" (the unit after
// the low figure too), "5.25%-5.75%" (a hyphen), "$2,150–$2,450/mo", "2.5
// to 3.5%". The deal page had read every number in the text with a leading
// minus allowed, so a hyphen's range came back as 5.25 and −5.75 and drew
// no bar, while the report's own reader drew it. Pure: no imports.

/** The two ends as written ("$2,150", "5.75"), or null where the text
 *  states no range. */
export function typicalRangeParts(text: string): [string, string] | null {
  const m = text.match(/(\$?-?\d[\d,]*\.?\d*)\s*%?\s*(?:–|—|-|to)\s*(\$?-?\d[\d,]*\.?\d*)/);
  return m ? [m[1], m[2]] : null;
}

/** The two ends as numbers, low then high; null where the text states no
 *  range or its ends do not rise (a range written high to low is no range
 *  to draw a figure against). */
export function typicalRange(text: string): [number, number] | null {
  const parts = typicalRangeParts(text);
  if (!parts) return null;
  const [lo, hi] = parts.map((p) => Number(p.replace(/[$,]/g, "")));
  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : null;
}
