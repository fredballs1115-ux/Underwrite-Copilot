// The words each asset class is spoken in — what one of it is called, the
// basis its price is quoted on, how its income is quoted, what its count is
// labelled, and which rules can reach it. One table, read by every surface
// that prints a per-something figure or decides what applies to a deal, so
// a hotel's keys are never relabelled "units", a park's pads are never
// priced "per SF", a land parcel is never asked for its rent, and an
// office building is never told the city's rent-control rules cover it.
// Pure: no I/O.
//
// The rule behind every row: the OM's own noun wins where the screen read
// one (`unitCountRow` keeps the label as written), and this table supplies
// the noun only where nothing was read — a bare count, a form's label, a
// prompt asking for the figure.

import { ASSET_CLASS_LABEL, assetClassLabel } from "@/lib/asset-class";

/** The basis a price is quoted on. */
export type Basis = "unit" | "sf" | "acre";

/** The rent-roll profile family a class leases like. */
export type ProfileFamily = "multifamily" | "office" | "industrial" | "retail";

/** The research tables' sector a deal's benchmarks are filed under. */
export type ResearchSector = "multifamily" | "office" | "industrial";

export interface AssetWords {
  /** the stored key ("hospitality_str"), or the phrase the model wrote */
  key: string;
  /** what a page prints ("Hospitality / STR") */
  label: string;
  /** what one is called — "unit", "key", "pad", "bed", "home", "space",
   *  "acre"; null for a class measured by its area alone */
  noun: { one: string; many: string } | null;
  /** the basis its price is quoted on */
  basis: Basis;
  /** "Price / key", "Price / SF", "Price / acre" */
  basisLabel: string;
  /** how its income is quoted — "rent / unit / mo", "ADR", "rent / SF / yr";
   *  null where nothing lets (land) */
  income: string | null;
  /** the whole count's label the extraction is asked for — "Units", "Keys",
   *  "Total SF", "Acres" */
  countLabel: string;
  /** rent control, TOPA and just-cause rules can reach it: it is rental
   *  housing (licensed care and lodging are not) */
  residential: boolean;
  /** it produces operating income — land does not, so it has no NOI, no
   *  cap and no occupancy to ask about */
  operating: boolean;
  /** the rent-roll profile family it leases like */
  profile: ProfileFamily;
  /** the research tables' sector its benchmarks are filed under; null
   *  where the tables carry none for it */
  researchSector: ResearchSector | null;
}

type Row = Omit<AssetWords, "key" | "label" | "basisLabel">;

const UNIT = { one: "unit", many: "units" } as const;
const perSf: Row = {
  noun: null,
  basis: "sf",
  income: "rent / SF / yr",
  countLabel: "Total SF",
  residential: false,
  operating: true,
  profile: "office",
  researchSector: "office",
};

/**
 * The table, keyed as `ASSET_CLASS_LABEL` is — a test holds the two key
 * sets equal, so a class cannot be filed without its words.
 */
const WORDS: Record<string, Row> = {
  multifamily: {
    noun: UNIT,
    basis: "unit",
    income: "rent / unit / mo",
    countLabel: "Units",
    residential: true,
    operating: true,
    profile: "multifamily",
    researchSector: "multifamily",
  },
  office: perSf,
  industrial: { ...perSf, profile: "industrial", researchSector: "industrial" },
  retail: { ...perSf, profile: "retail", researchSector: null },
  // A single-tenant net lease is a retail or industrial box with one
  // credit behind it: priced per SF, leased like retail, no rent rules.
  net_lease: { ...perSf, profile: "retail", researchSector: null },
  medical_office: perSf,
  // A mixed-use building counts its apartments and is priced on the whole
  // by the foot; its apartments are rental housing and the rules reach them.
  mixed_use: {
    noun: UNIT,
    basis: "sf",
    income: "rent / SF / yr",
    countLabel: "Units",
    residential: true,
    operating: true,
    profile: "multifamily",
    researchSector: "multifamily",
  },
  sfr_btr: {
    noun: { one: "home", many: "homes" },
    basis: "unit",
    income: "rent / home / mo",
    countLabel: "Homes",
    residential: true,
    operating: true,
    profile: "multifamily",
    researchSector: "multifamily",
  },
  student_housing: {
    noun: { one: "bed", many: "beds" },
    basis: "unit",
    income: "rent / bed / mo",
    countLabel: "Beds",
    residential: true,
    operating: true,
    profile: "multifamily",
    researchSector: "multifamily",
  },
  // Independent, assisted and memory care are licensed care with a rent
  // inside the fee: priced per unit, leased month to month, and outside the
  // rental-housing rules the rent-control regimes write.
  senior_housing: {
    noun: UNIT,
    basis: "unit",
    income: "rent / unit / mo",
    countLabel: "Units",
    residential: false,
    operating: true,
    profile: "multifamily",
    researchSector: null,
  },
  manufactured_housing: {
    noun: { one: "pad", many: "pads" },
    basis: "unit",
    income: "rent / pad / mo",
    countLabel: "Pads",
    residential: true,
    operating: true,
    profile: "multifamily",
    researchSector: "multifamily",
  },
  // Storage counts its units and trades by the rentable foot; month to
  // month, so it leases like an apartment building and nothing like an
  // office.
  self_storage: {
    noun: UNIT,
    basis: "sf",
    income: "rent / SF / yr",
    countLabel: "Units",
    residential: false,
    operating: true,
    profile: "multifamily",
    researchSector: null,
  },
  // A hotel's lease is one night long: its count is keys, its price is per
  // key, and its rent is the average daily rate.
  hospitality_str: {
    noun: { one: "key", many: "keys" },
    basis: "unit",
    income: "ADR",
    countLabel: "Keys",
    residential: false,
    operating: true,
    profile: "multifamily",
    researchSector: null,
  },
  data_center: {
    ...perSf,
    income: "rent / kW / mo",
    profile: "industrial",
    researchSector: "industrial",
  },
  parking: {
    noun: { one: "space", many: "spaces" },
    basis: "unit",
    income: "rent / space / mo",
    countLabel: "Spaces",
    residential: false,
    operating: true,
    profile: "retail",
    researchSector: null,
  },
  // Land has no income, no cap and no occupancy; it is counted in acres and
  // priced by the acre (or the buildable foot, which needs the code).
  land_infill: {
    noun: { one: "acre", many: "acres" },
    basis: "acre",
    income: null,
    countLabel: "Acres",
    residential: false,
    operating: false,
    profile: "office",
    researchSector: null,
  },
};

/** The keys the table knows, in the label map's order. */
export const ASSET_CLASS_KEYS = Object.keys(ASSET_CLASS_LABEL) as readonly string[];

// Land is what a phrase names when it names a site, a parcel or a lot —
// unless the site is sold WITH a lease, which makes it income rather than
// land: a pad on a ground lease, land leased to a tenant, a NNN site. One
// tenant named or implied is a net lease; several are no net lease, and no
// land either. "Scattered-site" is a kind of housing, not a site.
const LAND_WORDS = /\b(land|site|parcel|lot|acreage|infill|entitled)\b/i;
const LEASE_WORDS = /\bground[- ]?leas(?:e|ed|es|ing)\b|\bleased\b|\blease\b|\bnnn\b|\btenant(?:s|ed)?\b/i;
const MANY_TENANTS = /\bmulti[- ]?tenant(?:ed)?\b|\btenants\b/i;
const leasedSite = (s: string) => LAND_WORDS.test(s) && LEASE_WORDS.test(s) && !MANY_TENANTS.test(s);
const bareLand = (s: string) => LAND_WORDS.test(s) && !LEASE_WORDS.test(s);

/** Where a class the model phrased itself ("NNN retail", "boutique hotel")
 *  is filed — by the words it used, first match wins, longest tells first. */
const PHRASE_TO_KEY: readonly (readonly [RegExp | ((phrase: string) => boolean), string])[] = [
  [/\b(hotel|hospitality|lodging|motel|resort|short[- ]term rental|str)\b/i, "hospitality_str"],
  [/\b(self[- ]?storage|mini[- ]?storage)\b/i, "self_storage"],
  // Storage that is a warehouse or a yard — refrigerated buildings and
  // industrial outdoor storage — is industrial, and is read before the bare
  // word "storage" can file a cold-storage warehouse as a self-storage
  // facility (the site-researcher's pass of 2026-09-30 ran "Cold Storage
  // Warehouse" and "Industrial Outdoor Storage" through this table and got
  // self-storage for both).
  [/\b(cold[- ]storage|refrigerated|freezer|industrial outdoor storage|outdoor storage|ios)\b/i, "industrial"],
  [/\b(storage)\b/i, "self_storage"],
  [/\b(manufactured|mobile[- ]home|mhc|rv park|rv resort)\b/i, "manufactured_housing"],
  [/\b(student)\b/i, "student_housing"],
  // A continuing care retirement community (a CCRC, a "life plan
  // community") and an active adult community are senior housing by their
  // own names; a 55+ park is read by the manufactured-housing rule above.
  [
    /\b(senior|assisted living|memory care|independent living|skilled nursing|ccrcs?|continuing[\s-]+care|life[\s-]+plan\s+communit(?:y|ies)|active[\s-]+adult|retirement\s+(?:communit(?:y|ies)|living|homes?|villages?))\b/i,
    "senior_housing",
  ],
  [/\b(medical office|mob\b|medical)\b/i, "medical_office"],
  [/\b(data ?cent(er|re)s?)\b/i, "data_center"],
  [/\b(parking|garage)\b/i, "parking"],
  [/\b(mixed[- ]use)\b/i, "mixed_use"],
  [/\b(net[- ]lease|nnn|single[- ]tenant)\b/i, "net_lease"],
  // Housing on scattered sites is single-family rental, never a site (the
  // land rule's "site" had filed "Scattered-site SFR portfolio" as land).
  [/\bscattered[- ]sites?\b/i, "sfr_btr"],
  // A cell tower or a billboard stands on land let to the one company that
  // owns it: its site is a net lease.
  [/\b(?:cell(?:ular)?|wireless|telecom(?:munications?)?|communications?)[\s-]+towers?\b|\bcell[\s-]+sites?\b|\bbillboards?\b/i, "net_lease"],
  // A site sold with its lease to one tenant is a net lease ("Retail pad
  // site (ground lease)"), and a site under lease to several is no land.
  [leasedSite, "net_lease"],
  [bareLand, "land_infill"],
  [/\b(sfr|single[- ]family|btr|build[- ]to[- ]rent|townhomes?|scattered)\b/i, "sfr_btr"],
  [/\b(office|creative|life science|lab)\b/i, "office"],
  [/\b(industrial|warehouse|logistics|distribution|flex|manufacturing|cold storage|ios|outdoor storage)\b/i, "industrial"],
  [/\b(retail|shopping|strip|grocery|restaurant|qsr)\b/i, "retail"],
  [/\b(multifamily|multi[- ]family|apartment|residential|condo|garden|mid[- ]rise|high[- ]rise|walk[- ]up)\b/i, "multifamily"],
  // Rental housing named by its program or its tenants ("Affordable Housing
  // (LIHTC)", "Workforce Housing") — last, so a student, senior,
  // manufactured or single-family phrase is read by its own rule first.
  [/\b(affordable|workforce|lihtc|section 8|housing)\b/i, "multifamily"],
];

/** The known key a stored class or a phrase of the model's resolves to;
 *  null for "auto", nothing, or a phrase naming no class this table knows. */
export function assetClassKey(key: string | null | undefined): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  const lower = k.toLowerCase();
  if (lower === "auto") return null;
  if (WORDS[lower]) return lower;
  for (const [test, known] of PHRASE_TO_KEY) if (typeof test === "function" ? test(k) : test.test(k)) return known;
  return null;
}

/** What a deal of no known class is spoken in: counted in units, priced
 *  per unit, nothing assumed about its rules. */
const GENERIC: Row = {
  noun: UNIT,
  basis: "unit",
  income: null,
  countLabel: "Units",
  residential: false,
  operating: true,
  profile: "office",
  researchSector: null,
};

function basisLabelFor(row: Row): string {
  return row.basis === "sf" ? "Price / SF" : row.basis === "acre" ? "Price / acre" : `Price / ${row.noun?.one ?? "unit"}`;
}

/**
 * The words for a stored class, a phrase the model wrote, or nothing. A
 * known class reads from the table; a phrase is filed by its words; "auto"
 * and an unknown phrase get the generic row under whatever label
 * `assetClassLabel` gives them.
 */
export function assetWords(key: string | null | undefined): AssetWords {
  const known = assetClassKey(key);
  const row = known ? WORDS[known] : GENERIC;
  const k = known ?? (key ?? "").trim();
  return { key: k, label: assetClassLabel(k), ...row, basisLabel: basisLabelFor(row) };
}

/** A class whose rent is quoted a month a unit — an apartment's "rent /
 *  unit / mo", a home's, a bed's, a pad's — so its rent roll is read per
 *  unit a month, never per foot a year. A mixed-use building is rental
 *  housing priced by the foot, and its roll mixes suites with apartments:
 *  it is read by the foot. */
export function rentQuotedMonthly(key: string | null | undefined): boolean {
  const w = assetWords(key);
  return w.noun != null && w.income === `rent / ${w.noun.one} / mo`;
}

/** Rent control, TOPA and just-cause rules can reach a deal of this class. */
export function isResidentialClass(key: string | null | undefined): boolean {
  return assetWords(key).residential;
}

/** "/unit", "/key", "/pad", "/SF", "/acre" — the suffix a basis figure wears. */
export function perSuffix(words: Pick<AssetWords, "basis" | "noun">): string {
  return words.basis === "sf" ? "/SF" : words.basis === "acre" ? "/acre" : `/${words.noun?.one ?? "unit"}`;
}

/** The plural noun a count row's own label names — "Keys" → "keys",
 *  "Guest rooms" → "rooms", "Homesites" → "sites" — or the class's own
 *  where the label names none, so a bare "212" reads "212 keys" on a
 *  hotel and "212 units" on an apartment building. */
export function countNoun(label: string | null | undefined, cls: string | null | undefined): string {
  const l = (label ?? "").toLowerCase();
  const m = l.match(/\b(home ?sites?|keys?|beds?|pads?|rooms?|homes?|lots?|sites?|spaces?|suites?|apartments?|doors?|units?|acres?)\b/g);
  if (m?.length) {
    const last = m[m.length - 1].replace(/\s+/g, "");
    const base = last.replace(/s$/, "");
    // "doors" and "apartments" are units by another name.
    if (base === "door" || base === "apartment" || base === "suite") return "units";
    return `${base}s`;
  }
  return assetWords(cls).noun?.many ?? "units";
}
