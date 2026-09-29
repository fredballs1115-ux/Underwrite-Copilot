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

/**
 * An address as the deal row stores it: the structured shape, and where it
 * came from when nobody typed it — `memorandum` for the line the deal's own
 * memorandum states (#441), which a later memorandum may replace and a
 * typed address always does.
 */
export type StoredAddress = StructuredAddress & { from?: "memorandum" };

/** A spelled number a street address can open on: "One Liberty Plaza". */
const NUMBER_WORD = /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+\S/i;

/**
 * A one-line address read into the structured shape (#441): the line as
 * its label, the city and state `placeOf` reads, the ZIP after the street,
 * and the street where the line opens on a number ("4200 Maple Ave",
 * "One Liberty Plaza"). The county and the submarket stay blank, since a
 * line does not state them. Null where the line names no state: a line is
 * placed by what it says, never by a guess.
 */
export function addressFromLine(line: string): StructuredAddress | null {
  const label = line.replace(/\s+/g, " ").trim().slice(0, CAPS.label);
  if (!label) return null;
  const place = placeOf(label);
  if (!place) return null;
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  const opensOnNumber = (s: string) => /^\d+[A-Za-z]?(?:[-–]\d+)?\s+\S/.test(s) || NUMBER_WORD.test(s);
  let street = "";
  if (parts.length > 1) {
    // The street is the part before the city that opens on a number: a
    // building's name may come first ("The Maddox, 1400 Market St, …").
    const cityAt = place.city ? parts.findIndex((p) => p.toLowerCase() === place.city!.toLowerCase()) : -1;
    const before = parts.slice(0, cityAt > 0 ? cityAt : parts.length - 1);
    street = before.find(opensOnNumber) ?? "";
  } else if (opensOnNumber(label) && place.city) {
    // "88 Main Street Cleveland OH 44114": the words before the city.
    const at = label.toLowerCase().lastIndexOf(` ${place.city.toLowerCase()}`);
    street = at > 0 ? label.slice(0, at).trim() : "";
  }
  // The ZIP after the street, so a five-digit street number is never it.
  const tail = street ? label.slice(label.indexOf(street) + street.length) : label;
  const zips = tail.match(/\b\d{5}(?:-\d{4})?\b/g);
  return {
    label,
    street: street.slice(0, CAPS.street),
    city: (place.city ?? "").slice(0, CAPS.city),
    state: place.state,
    zip: zips ? zips[zips.length - 1].slice(0, 5) : "",
    county: "",
    submarket: "",
  };
}

/**
 * The address a memorandum gives its deal (#441): the line it states,
 * read, where the line names a street and a state. None for a portfolio,
 * whose properties each carry their own address, and none for a line with
 * no street ("Downtown Dallas, TX"), which places a market, not a building.
 */
export function memorandumAddress(
  ex: { address?: string | null; properties?: readonly unknown[] | null } | null | undefined,
): StoredAddress | null {
  const line = ex?.address?.trim();
  if (!line) return null;
  if ((ex?.properties?.length ?? 0) >= 2) return null;
  const read = addressFromLine(line);
  return read?.street ? { ...read, from: "memorandum" } : null;
}

/**
 * What a deal row's address should become, or null where it is right as it
 * is (#441). Two upgrades, and nothing else is ever rewritten:
 *
 * - a row with no address takes the one its memorandum states
 *   (`memorandumAddress`): the deal was uploaded with the address box left
 *   empty, and nothing placed it, although the memorandum names its street;
 * - a typed line (an address saved without picking a suggestion, so a label
 *   and nothing else) is filled with what the line itself states: its street,
 *   city, state and ZIP (`addressFromLine`). Every reader of those fields
 *   (the market's figures and photograph, the geocoder's street-level
 *   lookup, Street View, the flood map) found them blank, and a deal at
 *   "4200 Maple Ave, Dallas, TX 75219" was placed nowhere.
 *
 * A picked suggestion (it has a state) is never touched; neither is a line
 * that names no state, nor the sample deal (the callers skip it).
 */
export function addressUpgrade(
  current: unknown,
  ex?: { address?: string | null; properties?: readonly unknown[] | null } | null,
): StoredAddress | null {
  const held: Partial<StoredAddress> | null =
    typeof current === "string"
      ? parseStructuredAddress(current)
      : current && typeof current === "object"
        ? (current as Partial<StoredAddress>)
        : null;
  const label = String(held?.label ?? "").trim();
  const said = (k: keyof StructuredAddress) => String(held?.[k] ?? "").trim() !== "";
  // No address at all: the memorandum's. One with fields and no line is
  // someone's address all the same, and is left alone.
  if (!label) return said("street") || said("city") || said("state") ? null : memorandumAddress(ex);
  if (said("state")) return null;
  const read = addressFromLine(label);
  if (!read) return null;
  return {
    ...read,
    label: String(held?.label ?? read.label).slice(0, CAPS.label),
    county: String(held?.county ?? "").slice(0, CAPS.county),
    submarket: String(held?.submarket ?? "").slice(0, CAPS.submarket),
    ...(held?.from === "memorandum" ? { from: "memorandum" as const } : {}),
  };
}

/**
 * An address a person typed without picking a suggestion, as the row stores
 * it (#441): the line, with the street, city, state and ZIP it states read
 * out, or the bare line where it names no state. Every reader downstream
 * reads it the way it reads a picked suggestion.
 */
export function typedAddress(line: string): StructuredAddress {
  const label = line.replace(/\s+/g, " ").trim().slice(0, CAPS.label);
  return addressFromLine(label) ?? { label, street: "", city: "", state: "", zip: "", county: "", submarket: "" };
}
