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

import { ASSET_CLASS_LABEL, assetClassLabel, shownAssetClass } from "@/lib/asset-class";

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

// Housing over shops or offices is one building of two uses — "Apartments
// over retail", "Retail/Residential", "Multifamily with ground-floor
// retail". Only the words "mixed use" reached the mixed-use rule, so the
// retail rule, which runs before the housing one, filed each as a store:
// commercial to the rules panel, and a 1962, 36-unit Los Angeles building
// filed "Apartments over retail" lost its rent ordinance (research pass 23).
// Housing words beside commercial words are mixed-use. A change of use from
// one to the other ("office-to-residential", "hotel-to-apartment", a
// conversion, an adaptive reuse) is a conversion, filed by the rules below
// as it was; a leasing or management office is part of an apartment
// building; and land named for both uses is land.
const HOUSING_WORDS = /\b(?:apartments?|residential|residences|multi[- ]?family|housing|dwelling\s+units?)\b/i;
const COMMERCIAL_WORDS =
  /\b(?:retail|commercial|shops?|storefronts?|restaurants?)\b|(?<!\b(?:leasing|management|rental|on[- ]site)\s)\boffices?\b/i;
const USE_WORD = String.raw`(?:office|retail|hotel|motel|commercial|industrial|warehouse|church|school|apartment|residential|multi[- ]?family|housing|condo|resi)s?`;
const CHANGE_OF_USE = new RegExp(
  String.raw`\b${USE_WORD}[\s-]+(?:to|into)[\s-]+${USE_WORD}\b|\bconver(?:sions?|ts?|ted|ting)\b|\badaptive[\s-]+re-?use\b|\bchange[\s-]+of[\s-]+use\b`,
  "i",
);
const NAMES_LAND = /\b(?:land|parcels?|acreage|acres?|lots|entitled)\b/i;
const housingWithCommercial = (s: string) =>
  HOUSING_WORDS.test(s) && COMMERCIAL_WORDS.test(s) && !CHANGE_OF_USE.test(s) && !NAMES_LAND.test(s);

// The housing classes' own words, each read by its rule below and by the
// resort rule's test of whether a phrase names homes (`NAMES_HOMES`).
// Senior housing is the care a resident buys with the home — assisted
// living, memory care, independent living's meals and services, a
// continuing-care community. An active-adult or 55+ community sells no care:
// it is rental housing with an age restriction, read by the housing rules
// (`AGE_RESTRICTED`), so the rent rules and an apartment's defaults reach
// it — filed as senior housing, a 55+ apartment building in Prince George's
// County lost its rent cap and ran on licensed care's defaults (research
// pass 28).
// Rehabilitation is a nursing facility's only beside the nursing words
// ("Nursing and Rehabilitation Center"): a rehabilitation hospital, an
// addiction or a behavioral-health rehabilitation center and an outpatient
// therapy clinic sell no residence (the audit of 2026-10-05 found each filed
// as senior housing, on licensed care's defaults and traps).
const SENIOR_WORDS = String.raw`senior|assisted living|memory care|independent living|skilled nursing|snf|nursing\s+(?:homes?|facilit(?:y|ies)|cent(?:er|re)s?)|post[\s-]+acute|(?:nursing|skilled|post[\s-]+acute|sub[\s-]?acute)\s+(?:and|&)\s+rehab(?:ilitation)?|rehab(?:ilitation)?\s+(?:and|&)\s+(?:nursing|skilled|post[\s-]+acute|sub[\s-]?acute)|ccrcs?|continuing[\s-]+care|life[\s-]+plan\s+communit(?:y|ies)|retirement\s+(?:communit(?:y|ies)|living|homes?|villages?)`;
// Senior APARTMENTS — "Senior Apartments (LIHTC, 62+)", "Affordable Senior
// Housing", "62+ apartments" — rent an age-restricted home and sell no care:
// rental housing the rent rules reach, as an active-adult community is
// (research pass 28's amendment; filed as senior housing they lost the rent
// rules and ran on licensed care's defaults). A care or service word keeps
// a phrase senior housing: independent living's meals and services are care
// a resident buys. "Senior living" is the industry's own word for a care
// community, apartments or not ("Senior Living Apartments") — but not beside
// an affordable or age-restricted program's own words: "Senior Living
// Apartments (LIHTC, 62+)" is a tax-credit building with an age restriction,
// which sells no care unless a care word proper says so (the pre-merge
// audit: filed as senior housing, it lost the rent rules and ran on licensed
// care's defaults and traps).
const CARE_WORDS =
  /\b(?:assisted|memory|skilled|nursing|snf|care|independent[\s-]+living|ccrcs?|continuing|life[\s-]+plan|licensed|services?|meals?|post[\s-]+acute|rehabilitation)\b/i;
const HOUSING_PROGRAM = /\b(?:lihtc|tax[\s-]+credits?|section\s+8|age[\s-]+restricted)\b|\b(?:55|62)\s*\+|\b(?:55|62)[\s-]+and[\s-]+(?:over|older)\b/i;
const careOrService = (s: string) => CARE_WORDS.test(s) || (/\bsenior[\s-]+living\b/i.test(s) && !HOUSING_PROGRAM.test(s));
const seniorApartments = (s: string) =>
  /\bseniors?\b/i.test(s) &&
  (/\b(?:apartments?|affordable|lihtc|tax[\s-]+credit|section\s+8|age[\s-]+restricted|rental\s+housing)\b/i.test(s) || /\b(?:55|62)\s*\+/.test(s)) &&
  !careOrService(s);
const AGE_RESTRICTED = String.raw`active[\s-]+adult|age[\s-]+restricted|55[\s-]+and[\s-]+over`;
// A mobile home in the plural too ("Mobile homes" ran past the word's end),
// and a land-lease community, whose residents own their homes and rent the
// land under them — a park, never a net lease or bare land.
const MANUFACTURED_WORDS = String.raw`manufactured|mobile[- ]homes?|mhc|land[\s-]+lease\s+communit(?:y|ies)`;
const SFR_WORDS = String.raw`sfr|single[- ]family|btr|build[- ]to[- ]rent|townhomes?|scattered|rental\s+homes?`;

// "Resort" names lodging — "Boutique resort", "Golf resort and spa" —
// until the phrase names a building of homes: "Resort-style apartments",
// "Luxury resort-style multifamily", "Townhomes with resort-style
// amenities" describe the pool and the clubhouse, not the lease, and the
// hotel rule's bare "resort" had filed each as a hotel — a hotel's
// defaults, keys and nightly rate, and no rent rules, on an apartment deck.
// A hotel, a motel, lodging, hospitality, a short-term or a vacation rental
// is lodging whatever else the phrase names, and so is a resort counted in
// keys, or named by its suites, its villas or its rental program.
const LODGING_WORDS = /\b(?:hotel|hospitality|lodging|motel|short[- ]term rental|vacation[\s-]+rentals?|str)\b/i;
const RESORT_WORD = /\bresorts?\b/i;
// The homes a phrase names, in every housing rule's own words — apartments,
// units, residential, housing, and the single-family, senior, student and
// manufactured classes' — or an age restriction. The first cut read only
// the bare words senior, student and manufactured, so "Resort-style
// assisted living", "Resort-style MHC" and "Resort-style rental homes"
// still filed as hotels (the second pre-merge audit).
const NAMES_HOMES = new RegExp(
  String.raw`\b(?:apartments?|multi[- ]?family|units?|residential|housing|town(?:homes?|houses?)|student|${SFR_WORDS}|${SENIOR_WORDS}|${MANUFACTURED_WORDS}|${AGE_RESTRICTED})\b|\b55\s*\+`,
  "i",
);
// A resort's own rooms, however they are described: its suites, its villas,
// a condo-hotel's rental program.
const RESORT_ROOMS = /\b(?:all[- ]suites?|suites?|villas?|rental\s+program|condo[- ]?hotels?)\b/i;
// A word that describes rather than names: "resort-style" describes an
// apartment building's pool, "apartment-style" a resort's suites.
const STYLE_WORD = /\b[a-z0-9+]+[\s-]+style\b/gi;
// A count of keys ("150 keys", "a 120-key resort") — never a place called
// the Keys.
const COUNT_OF_KEYS = /\b\d[\d,]*[\s-]*keys?\b/i;
const lodging = (s: string) => {
  if (LODGING_WORDS.test(s)) return true;
  // What the phrase names, its "-style" words set aside.
  const named = s.replace(STYLE_WORD, " ");
  if (!RESORT_WORD.test(named)) return false;
  return COUNT_OF_KEYS.test(s) || RESORT_ROOMS.test(named) || !NAMES_HOMES.test(named);
};

/** Where a class the model phrased itself ("NNN retail", "boutique hotel")
 *  is filed — by the words it used, first match wins, longest tells first. */
const PHRASE_TO_KEY: readonly (readonly [RegExp | ((phrase: string) => boolean), string])[] = [
  // An RV park or an RV resort lets its sites as a park lets its pads, and
  // is filed as one: the hotel rule's "resort" ran first and filed "RV
  // Resort & Campground" as a hotel — a hotel's defaults, invented floor
  // area and a hotel's reserve — while "RV Park" filed as a park (research
  // pass 23). Read ahead of the hotel rule.
  [/\brv[\s-]+(?:parks?|resorts?)\b/i, "manufactured_housing"],
  // Lodging by its own words; a resort only where the phrase names no
  // homes, or counts its keys (`lodging`).
  [lodging, "hospitality_str"],
  [/\b(self[- ]?storage|mini[- ]?storage)\b/i, "self_storage"],
  // Storage that is a warehouse or a yard — refrigerated buildings and
  // industrial outdoor storage — is industrial, and is read before the bare
  // word "storage" can file a cold-storage warehouse as a self-storage
  // facility (the site-researcher's pass of 2026-09-30 ran "Cold Storage
  // Warehouse" and "Industrial Outdoor Storage" through this table and got
  // self-storage for both).
  // A truck terminal, a truck yard and a storage yard are yards too — the
  // plausibility check already read them as yards (lib/deal-strategy
  // `isOutdoorStorageYard`) while the class table filed the first two as
  // nothing and "Storage yard" as self-storage (research pass 28).
  [/\b(cold[- ]storage|refrigerated|freezer|industrial outdoor storage|outdoor storage|ios|truck[\s-]+(?:terminals?|yards?)|storage[\s-]+yards?)\b/i, "industrial"],
  [/\b(storage)\b/i, "self_storage"],
  [new RegExp(String.raw`\b(?:${MANUFACTURED_WORDS})\b`, "i"), "manufactured_housing"],
  [/\b(student)\b/i, "student_housing"],
  // Senior apartments are rental housing (`seniorApartments`), read ahead
  // of the senior rule their word would otherwise file them under.
  [seniorApartments, "multifamily"],
  // A continuing care retirement community (a CCRC, a "life plan
  // community"), a skilled nursing facility by any of its names (an SNF, a
  // nursing home, post-acute care, a rehabilitation center) and an active
  // adult community are senior housing by their own names; a 55+ park is
  // read by the manufactured-housing rule above.
  [new RegExp(String.raw`\b(?:${SENIOR_WORDS})\b`, "i"), "senior_housing"],
  // Housing beside shops or offices, read ahead of the office and retail
  // rules that had filed it as one of them (`housingWithCommercial`).
  [housingWithCommercial, "mixed_use"],
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
  [new RegExp(String.raw`\b(?:${SFR_WORDS})\b`, "i"), "sfr_btr"],
  // A laboratory is filed with the life-science buildings, as an office
  // (research pass 23: "Laboratory" filed nowhere, "Life Sciences" nowhere
  // either — the plural ran past the word's end). The research tracker and
  // the lessor rent index read neither for it (lib/tracker-read).
  [/\b(office|creative|life sciences?|labs?|laborator(?:y|ies))\b/i, "office"],
  [/\b(industrial|warehouse|logistics|distribution|flex|manufacturing|cold storage|ios|outdoor storage)\b/i, "industrial"],
  [/\b(retail|shopping|strip|grocery|restaurant|qsr)\b/i, "retail"],
  // A medical tenant's outpatient space by its own name — a dialysis center,
  // an urgent care, an ambulatory surgery center, a freestanding ER, a
  // veterinary clinic — is medical office (research pass 28: each filed as
  // no class, so every class's traps and the generic defaults). Read after
  // the net-lease rule, so "Dialysis Center (NNN)" or a single-tenant urgent
  // care stays the net lease it filed as, and after the retail rule, so a
  // strip an urgent care anchors stays retail.
  [
    /\b(?:dialysis|urgent[\s-]+care|ambulatory[\s-]+(?:surgery|surgical|care)|asc|surg(?:ery|ical)[\s-]+cent(?:er|re)s?|free[\s-]?standing[\s-]+(?:er|emergency)|veterinary|vet[\s-]+clinics?|animal[\s-]+hospitals?)\b/i,
    "medical_office",
  ],
  // "Apartments" in the plural too: the bare word ran past the rule's end
  // and filed nowhere, a building of apartments read as no class at all.
  [/\b(multifamily|multi[- ]family|apartments?|residential|condo|garden|mid[- ]rise|high[- ]rise|walk[- ]up)\b/i, "multifamily"],
  // Rental housing named by its program or its tenants ("Affordable Housing
  // (LIHTC)", "Workforce Housing") — last, so a student, senior,
  // manufactured or single-family phrase is read by its own rule first.
  [/\b(affordable|workforce|lihtc|section 8|housing)\b/i, "multifamily"],
  // An active-adult or 55+ community that names no other housing: rental
  // housing with an age restriction (`AGE_RESTRICTED`).
  [new RegExp(String.raw`\b(?:${AGE_RESTRICTED})\b|\b(?:55|62)\s*\+`, "i"), "multifamily"],
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

/**
 * A deal's one class, as the key two deals are compared by: the class the
 * analyst filed, else the one the deck turned out to be (lib/asset-class
 * `shownAssetClass`), filed by its words (`assetClassKey`). Wherever deals
 * are pooled by class — the analytics' price per unit, the internal comps,
 * the market memory — the raw words had been compared, so a deck's
 * "Garden-style multifamily" matched nothing called multifamily, and the
 * analytics read the deck's words ahead of the analyst's class. A phrase
 * no rule files keeps its own words, lowercased, so two deals of the same
 * unknown class still pool; "" where neither names a class.
 */
export function dealClassKey(
  stored: string | null | undefined,
  extraction: { assetClass?: string | null } | null | undefined,
): string {
  const shown = shownAssetClass(stored, extraction);
  return assetClassKey(shown) ?? shown.trim().toLowerCase();
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
  // A marina's slips and a campground's campsites in their own words
  // (research pass 28), beside a care facility's licensed beds.
  const m = l.match(/\b(home ?sites?|camp ?sites?|keys?|beds?|pads?|rooms?|homes?|lots?|sites?|spaces?|suites?|slips?|apartments?|doors?|units?|acres?)\b/g);
  if (m?.length) {
    const last = m[m.length - 1].replace(/\s+/g, "");
    const base = last.replace(/s$/, "");
    // "doors" and "apartments" are units by another name.
    if (base === "door" || base === "apartment" || base === "suite") return "units";
    return `${base}s`;
  }
  return assetWords(cls).noun?.many ?? "units";
}
