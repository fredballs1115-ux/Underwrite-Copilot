// Structured address shared by the autocomplete component, the deal actions
// that persist it, and the pages that render/match against it. (Universal.)

export interface StructuredAddress {
  /** display line, e.g. "4200 Maple Ave, Dallas, TX 75219" */
  label: string;
  street: string;
  city: string;
  /** two-letter code when derivable, else as the geocoder returned it */
  state: string;
  zip: string;
  county: string;
  /** district/neighborhood when the geocoder can infer one */
  submarket: string;
}

const CAPS: Record<keyof StructuredAddress, number> = {
  label: 160,
  street: 80,
  city: 60,
  state: 30,
  zip: 12,
  county: 60,
  submarket: 60,
};

/** Parse + sanitize an address JSON string from a form. Unknown keys drop,
 *  every value is stringified and length-capped. Null when unusable. */
export function parseStructuredAddress(raw: unknown): StructuredAddress | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out = {} as StructuredAddress;
    for (const key of Object.keys(CAPS) as (keyof StructuredAddress)[]) {
      out[key] = String(obj[key] ?? "").slice(0, CAPS[key]);
    }
    return out.label.trim() ? out : null;
  } catch {
    return null;
  }
}

export const US_STATE_ABBREV: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function abbrevState(state: string): string {
  return US_STATE_ABBREV[state.trim().toLowerCase()] ?? state;
}

const STATE_CODES = new Set(Object.values(US_STATE_ABBREV));

// Longest first, so "West Virginia" is tried before "Virginia": tried in the
// table's order, "Charleston West Virginia" read as a city called
// "Charleston West" in Virginia.
const STATE_NAMES_LONGEST_FIRST = Object.entries(US_STATE_ABBREV).sort((a, b) => b[0].length - a[0].length);

/**
 * The city and state out of free text — an address the way an OM prints it
 * ("1200 Liberty Ave, Pittsburgh, PA 15222", "88 Main Street Cleveland OH
 * 44114") or a place the way a person types one ("Richmond, VA",
 * "Pittsburgh, Pennsylvania", "Washington, D.C."). Only what the text
 * states: a string with no recognisable state gives nothing, never a guess.
 */
export function placeOf(address: string): { city: string | null; state: string } | null {
  const text = address
    .replace(/\s+/g, " ")
    // A code written with its stops — "D.C.", "N.Y." — is the code.
    .replace(/\b([A-Z])\.\s?([A-Z])\.(?=[\s,]|$)/g, "$1$2")
    .trim();
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  // The state is in the last part (with or without a zip), or the last part
  // IS the zip and the state sits in the one before it.
  const stateIn = (part: string): { state: string; rest: string } | null => {
    const s = part.replace(/\b\d{5}(?:-\d{4})?\b/, "").trim();
    if (!s) return null;
    // A two-letter code counts only in capitals: "Oak Ct" is a street, not
    // Connecticut, and "Main St" is not a state at all.
    if (/^[A-Z]{2}$/.test(s) && STATE_CODES.has(s)) return { state: s, rest: "" };
    const full = US_STATE_ABBREV[s.toLowerCase()];
    if (full) return { state: full, rest: "" };
    // "Cleveland OH" or "Street Cleveland OH" — a trailing capital code.
    const m = /^(.*?)\s+([A-Z]{2})$/.exec(s);
    if (m && STATE_CODES.has(m[2])) return { state: m[2], rest: m[1].trim() };
    // A trailing full state name after a city in the same part.
    for (const [name, c] of STATE_NAMES_LONGEST_FIRST) {
      if (s.toLowerCase().endsWith(` ${name}`)) return { state: c, rest: s.slice(0, s.length - name.length).trim() };
    }
    return null;
  };
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 2); i--) {
    const hit = stateIn(parts[i]);
    if (!hit) continue;
    // The city: the rest of the state's own part, else the part before it.
    // A rest that is a whole street line ("88 Main Street Cleveland") keeps
    // only its last word, which is all the text states about the city there.
    let city = hit.rest || (i > 0 ? parts[i - 1] : "");
    if (hit.rest && /\d/.test(hit.rest)) city = hit.rest.split(" ").at(-1) ?? "";
    if (!hit.rest && i > 0 && /^\d/.test(city) && parts.length === 2) city = "";
    return { city: city.trim() || null, state: hit.state };
  }
  return null;
}
