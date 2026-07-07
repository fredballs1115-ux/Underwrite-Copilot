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
