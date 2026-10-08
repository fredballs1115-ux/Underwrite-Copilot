// An operating business on its real estate (research pass 28, round 3) — a
// gas station and its store, a car wash, a marina, a golf course, a
// campground, a bowling center, a funeral home, a childcare center. The
// screen read each as a building with a rent: a memorandum's "NOI" that
// carries the fuel and store business was capitalised as rent, a stated
// EBITDA was read by nothing but the model's note (lib/underwrite/inputs),
// and nothing asked whose earnings these were.
//
// Pure — no I/O, no model call. Two branches, one reader:
//   A GOING CONCERN — the memorandum sells the business with the real
//     estate: its earnings are the operation's;
//   AN OPERATOR'S LEASE — the memorandum sells the real estate leased to
//     the operator (a sale-leaseback, a net lease to a station, a wash, a
//     childcare operator): the rent is the landlord's income, and the
//     unit's earnings over the rent are its credit.
//
// Six rules.
//
// THE BUSINESS IS NOT THE REAL ESTATE. An income stated for an operating
// business carries the business's earnings; a real estate cap struck on it
// prices the business as if it were rent. The split between the real
// estate, the fixtures and the business is said only as the memorandum
// states it, never derived.
//
// EBITDA IS NOT NOI. It is the operator's figure, before a management fee
// and a reserve for the fixtures (and EBITDAR before rent too), never the
// landlord's.
//
// THE RENT IS THE LANDLORD'S INCOME, THE COVERAGE ITS CREDIT. On a lease,
// the unit's EBITDAR over the rent says how much room the tenant has; a
// coverage is read as stated, or as EBITDAR over the stated rent, never
// from an EBITDA, which is after the rent.
//
// THE CONTRACTS GO WITH THE OPERATOR. A fuel supply agreement and its
// branding, a submerged-land lease, a franchise, a licence: what transfers
// is the memorandum's to say, and each is said as stated.
//
// THE GROUND HOLDS THE RISK. Tanks under a station, a wash's water, a fuel
// dock: a Phase I's finding is named here where the memorandum cites one
// (lib/site-reports), and a tank system is said as stated.
//
// A BLANK IS NULL.

import { compactUsd } from "@/lib/money";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { assetClassKey } from "@/lib/asset-words";
import { parseMoney } from "@/lib/criteria";
import { ebitdaFigure, type EbitdaFigure } from "@/lib/deal-strategy";
import { PROPERTY_HOLDER_WORDS, propertyHolderOf, type PropertyHolder } from "@/lib/interest";
import { FINDING_WORDS, readSiteReports } from "@/lib/site-reports";
import { readSingleTenant } from "@/lib/single-tenant";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

/** The businesses this reader names, each by the words a memorandum uses. */
export type OperatingBusiness =
  | "fuel"
  | "convenience_store"
  | "car_wash"
  | "marina"
  | "golf"
  | "campground"
  | "bowling"
  | "funeral"
  | "childcare"
  | "snf"
  | "senior_care";

const BUSINESS_WORDS: ReadonlyArray<readonly [OperatingBusiness, RegExp]> = [
  // Fuel only by fuel's own words — a gas, fuel, filling or service station,
  // a truck stop, a travel centre — never a convenience store alone, which
  // is a business of its own with no pumps or tanks (the pre-merge audit:
  // "Convenience Store" was named "a fuel station and its store").
  [
    "fuel",
    /\b(?:gas(?:oline)?\s+stations?|fuel(?:ing)?\s+(?:stations?|centers?|plazas?)|filling\s+stations?|service\s+stations?|truck\s+stops?|travel\s+(?:centers?|plazas?))\b/i,
  ],
  // A store with a fuel word beside it sells fuel (audit C3a: "Convenience
  // Store with Fuel", "C-Store w/ Gas" and "(8 fueling positions)" had read
  // as a store with no pumps, and the challenger dropped the tanks). A
  // utility's gas ("gas and electric") is no fuel.
  [
    "fuel",
    /\b(?:convenience\s+stores?|c-stores?)\b[^.;]{0,40}?(?:\bfuel(?:ing)?\b|\bgas(?:oline)?\b(?!\s*(?:and|&|\/)\s*electric|\s+(?:utilit|meter|heat|service\b))|\bdiesel\b|\bpumps?\b|\bMPDs?\b)|\b(?:fuel(?:ing)?|gasoline|diesel)\b[^.;]{0,40}?\b(?:convenience\s+stores?|c-stores?)\b/i,
  ],
  ["convenience_store", /\bconvenience\s+stores?\b|\bc-stores?\b/i],
  ["car_wash", /\bcar\s*wash(?:es)?\b|\bexpress\s+(?:tunnel\s+)?wash\b/i],
  ["marina", /\bmarinas?\b|\bboat\s*(?:yards?|storage)\b|\bdry[\s-]stack\b/i],
  ["golf", /\bgolf\s+(?:courses?|clubs?|links)\b|\bcountry\s+clubs?\b/i],
  ["campground", /\bcampgrounds?\b|\bcamp\s*sites?\b|\brv\s+campgrounds?\b/i],
  ["bowling", /\bbowling\s+(?:centers?|alleys?|lanes)\b/i],
  ["funeral", /\bfuneral\s+homes?\b|\bmortuar(?:y|ies)\b/i],
  ["childcare", /\b(?:day\s*care|child\s*care|early\s+(?:learning|education|childhood)\s+cent(?:er|re)s?|preschools?)\b/i],
  // Care a resident buys is an operation too (research pass 28, round 6):
  // a skilled nursing facility's earnings are its operator's, and a
  // licensed community's census, labour and payor mix are the business.
  ["snf", /\b(?:snfs?|skilled\s+nursing|nursing\s+(?:homes?|facilit(?:y|ies)|cent(?:er|re)s?)|post[\s-]+acute)\b/i],
  ["senior_care", /\b(?:assisted\s+living|memory\s+care|independent\s+living|senior\s+living|ccrcs?|continuing[\s-]+care|life[\s-]+plan\s+communit(?:y|ies))\b/i],
];

const BUSINESS_NAME: Record<OperatingBusiness, string> = {
  fuel: "a fuel station and its store",
  convenience_store: "a convenience store",
  car_wash: "a car wash",
  marina: "a marina",
  golf: "a golf course",
  campground: "a campground",
  bowling: "a bowling center",
  funeral: "a funeral home",
  childcare: "a childcare center",
  snf: "a skilled nursing facility",
  senior_care: "a senior care community",
};

/** The memorandum sells the business with the real estate. */
const GOING_CONCERN_WORDS =
  /\bgoing[\s-]+concern\b|\b(?:business|operations?)\s+(?:is\s+|are\s+)?included\b|\bincludes?\s+(?:the\s+)?(?:business|operations?|ff&e|equipment|inventory)\b|\bturn[\s-]?key\s+(?:business|operation)\b|\bbusiness\s+and\s+(?:the\s+)?real\s+estate\b|\breal\s+estate\s+and\s+(?:the\s+)?business\b/i;

export const COVERAGE_ROW = /^\s*(?:rent|ebitdar?m?|ebitda\s*r?)\s+coverage\b|^\s*coverage\s+\((?:rent|ebitdar?)\)/i;
export const MARKET_RENT_ROW = /^\s*market\s+rent\b/i;
export const ALLOCATION_ROWS: ReadonlyArray<readonly ["realEstate" | "ffe" | "business", RegExp]> = [
  ["realEstate", /^\s*(?:real\s+estate|real\s+property|land\s+and\s+building)\s+(?:value|allocation)\b/i],
  ["ffe", /^\s*(?:ff&e|furniture,?\s+fixtures\s+(?:and|&)\s+equipment|equipment)\s+(?:value|allocation)\b/i],
  ["business", /^\s*(?:business|goodwill|intangibles?|business\s+enterprise)\s+(?:value|allocation)\b/i],
];
/** The contracts and the ground, each as stated. */
export const STATED_ROWS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Fuel supply agreement", /^\s*fuel\s+supply(?:\s+agreement)?\b|^\s*(?:fuel\s+)?brand(?:ing)?\s+agreement\b/i],
  ["Tank system", /^\s*(?:underground\s+storage\s+)?tanks?(?:\s+system)?\b|^\s*usts?\b/i],
  ["Submerged land lease", /^\s*submerged\s+land(?:s)?\s+lease\b/i],
  ["Franchise", /^\s*franchise(?:\s+agreement)?\b/i],
  ["Licence", /^\s*licen[cs]es?\b|^\s*(?:liquor|childcare|operating)\s+licen[cs]e\b/i],
  // A care operation's own facts, each as stated (round 6).
  ["Operating structure", /^\s*operating\s+structure\b|^\s*structure\s*\((?:operating|lease|management)\)/i],
  ["Licensed beds", /^\s*licensed\s+beds\b/i],
  ["Operating beds", /^\s*operating\s+beds\b/i],
  ["Payor mix", /^\s*payor\s+mix\b|^\s*payer\s+mix\b/i],
  ["CMS star rating", /^\s*(?:cms\s+)?(?:overall\s+)?star\s+rating\b/i],
  ["Certificate of need", /^\s*certificate\s+of\s+need\b|^\s*con\b/i],
  ["Management fee", /^\s*management\s+fee\b/i],
];
const RENT_ROW = /^\s*(?:annual\s+|current\s+|in[- ]place\s+)?base\s+rent\b|^\s*(?:lease|annual|contract)\s+rent$/i;

// A care operation's structure, as its "Operating structure" row states it:
// the real estate leased to an operator, or the operation run by its owner
// or for the owner under a management contract (a RIDEA structure, whose
// lease is the owner's own). A lease the row denies is no lease, and a row
// naming both, or neither, says nothing of what is sold.
const STRUCTURE_ROW = STATED_ROWS.find(([label]) => label === "Operating structure")![1];
const STRUCTURE_LEASED = /\b(?:triple[\s-]+net|nnn|leas(?:e|ed|es)|lessee)\b/i;
const STRUCTURE_OPERATED = /\bowner[\s/-]+operat(?:ed|ors?|ion)\b|\bself[\s-]+operated\b|\bmanagement\s+(?:agreements?|contracts?)\b|\bmanaged\b/i;
const STRUCTURE_LEASE_DENIED = /\b(?:no|not|never|without)\s+(?:an?\s+|the\s+|any\s+)?(?:[\w-]+\s+)?(?:leas(?:e|ed|es)|lessee)\b/gi;

function structureOf(value: string | null | undefined): "operator_lease" | "going_concern" | null {
  const v = (value ?? "").replace(STRUCTURE_LEASE_DENIED, " ");
  if (/\bridea\b/i.test(v)) return "going_concern";
  const leased = STRUCTURE_LEASED.test(v);
  const operated = STRUCTURE_OPERATED.test(v);
  return leased === operated ? null : leased ? "operator_lease" : "going_concern";
}

export interface GoingConcernRead {
  business: OperatingBusiness | null;
  /** what is sold: the business with the real estate, the real estate
   *  leased to the operator, or not said */
  branch: "going_concern" | "operator_lease" | "unstated";
  /** who holds the property and the operation on this deal, by what the
   *  price buys (lib/interest `propertyHolderOf`): the buyer where the
   *  memorandum sells them, the borrower on a note they secure, the owning
   *  entity on a position or a share */
  holder: PropertyHolder;
  /** the operator's earnings as stated (lib/deal-strategy `ebitdaFigure`) */
  ebitda: EbitdaFigure | null;
  /** an EBITDAR or EBITDARM — before rent — as stated */
  beforeRent: boolean;
  /** the annual rent, where the memorandum states one */
  rent: number | null;
  /** the unit's EBITDAR over the rent: as stated, else the two stated rows
   *  divided; null from an EBITDA (after rent) */
  coverage: { times: number; from: "stated" | "ebitdar_over_rent" } | null;
  marketRent: string | null;
  /** the split as the memorandum states it, each part or null */
  allocation: { realEstate: number | null; ffe: number | null; business: number | null } | null;
  /** the contracts and the ground as stated, in the reader's order */
  stated: Array<{ label: string; value: string }>;
  /** a cited Phase I's finding in words ("a recognized environmental
   *  condition", "no recognized environmental conditions"), or its own
   *  words quoted; null where the memorandum cites no finding */
  phaseI: string | null;
  sentences: string[];
  headline: string;
}

const money = (n: number): string => compactUsd(n, { millions: "auto" });
const times = (n: number) => `${n.toFixed(2)}x`;

/** The words the sale is described in — the class, the name, the plan, the
 *  interest and a single tenant — read only for whether the business is
 *  sold with the real estate (`GOING_CONCERN_WORDS`), never for what the
 *  business is. */
function wordsOf(ex: ExtractionResult): string {
  return [ex.assetClass, ex.dealName, ex.strategy?.summary, ex.interest?.summary, ex.singleTenant?.tenant]
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .join(" \n ");
}

// The classes the site reads by readers of their own — a building of
// apartments, offices, shops or warehouses, a hotel, a data center. On one
// of them a business is named only by the class's own words ("Retail
// (convenience store / gas station)"), and a stated EBITDA alone makes no
// read: a hotel's EBITDA is its own industry's figure, after its management
// fee, and a data center's is its operator's, never an operating business on
// a building that rents.
const READ_OTHERWISE: ReadonlySet<string> = new Set(["multifamily", "office", "retail", "industrial", "hospitality_str", "data_center"]);
const readOtherwise = (ex: ExtractionResult) => READ_OTHERWISE.has(assetClassKey(ex.assetClass ?? "") ?? "");

// A fuel word the phrase denies — "no fuel", "no gas sales", "without
// fuel", "non-fuel", "former gas station", "pumps removed" — is struck
// before the fuel rules read, as lib/asset-words strikes a denied care word
// (audit C5, LOW-3: "Convenience Store (no fuel)" had filed as a fuel
// seller, and the challenger asked about tanks the store does not have).
const FUEL_WORD = String.raw`(?:fuel(?:ing)?|gas(?:oline)?|diesel|pumps?|MPDs?|dispensers?|tanks?|USTs?)`;
const DENIED_FUEL = new RegExp(
  String.raw`\b(?:no|without|non|not|former(?:ly)?|ex)[\s-]+(?:[a-z]+[\s-]+){0,2}?${FUEL_WORD}\b(?:\s+(?:sales|service|positions|stations?))?` +
    String.raw`|\b${FUEL_WORD}(?:\s+(?:and|&)\s+${FUEL_WORD})?(?:\s+(?:have\s+been|were|was|are|is))?\s+(?:removed|decommissioned|discontinued|closed|abandoned)\b`,
  "gi",
);

function businessIn(words: string | null | undefined): OperatingBusiness | null {
  if (typeof words !== "string" || words.trim() === "") return null;
  const said = words.replace(DENIED_FUEL, " ");
  for (const [kind, re] of BUSINESS_WORDS) {
    if (!re.test(said)) continue;
    // Words the class table files as rental housing name no care business:
    // "Senior Living Apartments (LIHTC, 62+)" is an age-restricted
    // tax-credit building that sells no care (lib/asset-words), and the
    // two readers say one thing of it (the pre-merge audit).
    if (kind === "senior_care" && assetClassKey(said) === "multifamily") continue;
    return kind;
  }
  return null;
}

/** The business the memorandum's own words name, or null: the class's
 *  words, then the name of a single tenant that leases the whole property —
 *  never the deal's name ("Marina Bay Apartments" is an apartment building),
 *  the plan's summary or a center's tenant list, where a station on an
 *  outparcel or a daycare in a strip is one tenant among many (the audit of
 *  2026-10-05). On a class the site reads otherwise, the class's words
 *  alone. */
export function operatingBusinessOf(ex: ExtractionResult | null | undefined): OperatingBusiness | null {
  if (!ex) return null;
  const fromClass = businessIn(ex.assetClass);
  if (fromClass || readOtherwise(ex)) return fromClass;
  return businessIn(ex.singleTenant?.tenant);
}

/** A coverage as written: "2.10x", "2.1 times", "1.85". */
function coverageOf(value: string): number | null {
  const m = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(?:x|×|times)?/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 20 ? n : null;
}

/**
 * The operating business on the property, as stated: what is sold, the
 * operator's earnings, the rent and its coverage, the split, the contracts
 * and the ground. Null unless the memorandum's own words name an operating
 * business, or it states an EBITDA on a class the site reads no other way.
 */
export function readGoingConcern(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): GoingConcernRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  const business = operatingBusinessOf(ex);
  const ebitda = ebitdaFigure(rows);
  if (!business && (!ebitda || readOtherwise(ex))) return null;
  const find = (re: RegExp) => rows.find((m) => re.test(m.label)) ?? null;

  const tenant = readSingleTenant(ex, asOf);
  const rentRow = find(RENT_ROW);
  const rentRead = tenant?.rent ?? (rentRow && !/\/\s*mo|per\s+month|monthly|per\s*sf|psf/i.test(rentRow.value) ? parseMoney(rentRow.value) : null);
  const rent = rentRead != null && rentRead > 0 ? rentRead : null;
  const words = wordsOf(ex);
  // The stated structure decides where the sale's words say nothing (the
  // audit of 2026-10-05: "Operating structure: Triple-net lease to a
  // regional operator" had been read as a sale that did not say).
  const structure = structureOf(find(STRUCTURE_ROW)?.value);
  const branch: GoingConcernRead["branch"] = GOING_CONCERN_WORDS.test(words)
    ? "going_concern"
    : structure ?? (tenant || rent != null ? "operator_lease" : "unstated");
  const beforeRent = !!ebitda && /ebitdar/i.test(ebitda.label);
  const coverageRow = find(COVERAGE_ROW);
  const statedCoverage = coverageRow ? coverageOf(coverageRow.value) : null;
  const coverage =
    statedCoverage != null
      ? { times: statedCoverage, from: "stated" as const }
      : beforeRent && ebitda && rent != null && rent > 0
        ? { times: Math.round((ebitda.value / rent) * 100) / 100, from: "ebitdar_over_rent" as const }
        : null;

  const parts = Object.fromEntries(
    ALLOCATION_ROWS.map(([key, re]) => {
      const r = find(re);
      const n = r ? parseMoney(r.value) : null;
      return [key, n != null && n > 0 ? n : null];
    }),
  ) as { realEstate: number | null; ffe: number | null; business: number | null };
  const allocation = parts.realEstate != null || parts.ffe != null || parts.business != null ? parts : null;
  const stated = STATED_ROWS.flatMap(([label, re]) => {
    const r = find(re);
    return r ? [{ label, value: r.value.trim() }] : [];
  });
  const marketRow = find(MARKET_RENT_ROW);
  const p1 = readSiteReports(ex, asOf)?.phaseI ?? null;
  const phaseI = !p1?.finding ? null : p1.finding === "stated" ? (p1.words ? `"${p1.words}"` : null) : FINDING_WORDS[p1.finding] || null;

  const read: Omit<GoingConcernRead, "sentences" | "headline"> = {
    business,
    branch,
    holder: propertyHolderOf(ex),
    ebitda,
    beforeRent,
    rent,
    coverage,
    marketRent: marketRow?.value.trim() ?? null,
    allocation,
    stated,
    phaseI,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

/** What the memorandum's split of figures is a split of: the price where
 *  the price buys the property, the collateral's value on a note, and the
 *  property's value on a position, a share or the land under it — the price
 *  of each of those is no property's. */
export function splitSubject(r: Pick<GoingConcernRead, "holder">): string {
  return r.holder === "buyer" ? "the price" : r.holder === "borrower" ? "the collateral's value" : "the property's value";
}

function sentencesOf(r: Omit<GoingConcernRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  const what = r.business ? BUSINESS_NAME[r.business] : "an operating business";
  // Who holds the operation (lib/interest `propertyHolderOf`): the
  // memorandum sells it only where the price buys the property; a note's is
  // its collateral, and what a lender that took it would hold.
  const h = r.holder;
  const w = PROPERTY_HOLDER_WORDS[h];
  const who = `${w.who[0].toUpperCase()}${w.who.slice(1)}`;
  const hold = w.plural ? "hold" : "holds";
  if (r.branch === "going_concern") {
    out.push(
      h === "buyer"
        ? `The memorandum sells ${what} with its real estate: its earnings are the operation's, and a real estate cap struck on them prices the business as if it were rent.`
        : h === "borrower"
          ? `The note's collateral is ${what} with its real estate, the business with it: its earnings are the operation's, a real estate cap struck on them prices the business as if it were rent, and a lender that takes the collateral in a foreclosure takes an operation to run or sell.`
          : `${who} ${hold} ${what} with its real estate, the business with it: its earnings are the operation's, and a real estate cap struck on them prices the business as if it were rent.`,
    );
  } else if (r.branch === "operator_lease") {
    out.push(
      h === "buyer"
        ? `The memorandum sells the real estate under ${what}, leased to its operator: the rent is the landlord's income, and the operator's earnings are its credit.`
        : h === "borrower"
          ? `The note's collateral is the real estate under ${what}, leased to its operator: the rent is the borrower's income and what services the note, and the operator's earnings are its credit.`
          : `${who} ${hold} the real estate under ${what}, leased to its operator: the rent is the landlord's income, and the operator's earnings are its credit.`,
    );
  } else {
    out.push(
      h === "buyer"
        ? `The property is ${what}; the memorandum does not say whether the business is sold with it or leased from it, and the two are priced differently.`
        : h === "borrower"
          ? `The collateral is ${what}; the memorandum does not say whether the business goes with it or leases it, and the two are worth different things as collateral.`
          : `The property is ${what}; the memorandum does not say whether the business is held with it or leases it, and the two are valued differently.`,
    );
  }
  if (r.ebitda) {
    out.push(
      `It states ${r.ebitda.label} of ${money(r.ebitda.value)}: the operator's earnings, before a management fee and a reserve for the fixtures${
        r.beforeRent ? " and before rent" : ""
      }, never the real estate's NOI.`,
    );
  }
  if (r.coverage && r.rent != null) {
    out.push(
      r.coverage.from === "stated"
        ? `The rent of ${money(r.rent)} is covered ${times(r.coverage.times)}, as stated.`
        : `Its EBITDAR covers the ${money(r.rent)} rent ${times(r.coverage.times)}.`,
    );
  } else if (r.coverage) {
    out.push(`The rent is covered ${times(r.coverage.times)}, as stated.`);
  } else if (r.rent != null && r.ebitda && !r.beforeRent) {
    out.push(`Its ${r.ebitda.label} is after rent, so no coverage is read from it; an EBITDAR would say how much room the operator has.`);
  }
  if (r.marketRent) out.push(`Market rent, as stated: ${r.marketRent.replace(/\.$/, "")}.`);
  if (r.allocation) {
    const parts = [
      r.allocation.realEstate != null ? `real estate ${money(r.allocation.realEstate)}` : "",
      r.allocation.ffe != null ? `fixtures and equipment ${money(r.allocation.ffe)}` : "",
      r.allocation.business != null ? `business ${money(r.allocation.business)}` : "",
    ].filter(Boolean);
    out.push(`The memorandum splits ${splitSubject(r)}: ${parts.join(", ")}.`);
  } else if (r.branch === "going_concern") {
    out.push("It states no split between the real estate, the fixtures and the business.");
  }
  for (const s of r.stated) out.push(`${s.label}, as stated: ${s.value.replace(/\.$/, "")}.`);
  if (r.phaseI) out.push(`The seller's Phase I found ${r.phaseI}: the ground is the risk on a site an operation has run on.`);
  return out;
}

/** The model's read (`meta.goingConcern`): it capitalises the income it
 *  runs on as rent and allocates nothing to the business. Null on a lease
 *  to the operator, whose rent IS the landlord's income; said as a
 *  condition where the memorandum does not say whether the business is
 *  sold. Where the model assumed its year-one income (`noiAssumed`: no NOI
 *  the memorandum states, an assumed 6% of the price), the figure is never
 *  named as the deal's income (research pass 38: "its $240k year-one
 *  income" was the assumed 6%). */
export function goingConcernModelLine(
  r: GoingConcernRead | null,
  m: { noi1: number | null; exitCapPct: number; noiAssumed?: boolean } | null,
): string | null {
  if (!r || r.branch === "operator_lease" || !m || m.noi1 == null) return null;
  const what = r.business ? BUSINESS_NAME[r.business] : "the operating business";
  const whose =
    r.branch === "unstated" ? "if the business is sold with the real estate, that income is the operation's" : `on ${what} that income is the operation's`;
  const income = m.noiAssumed ? "an assumed year-one income, not one the memorandum states," : `its ${money(m.noi1)} year-one income`;
  return `The model capitalises ${income} at ${withArticle(`${(m.exitCapPct * 100).toFixed(2)}% exit cap`)} as if it were rent; ${whose}, which the real estate does not earn without an operator, and the model allocates nothing to the business.`;
}

/** The pipeline row's tag: "Going concern", "Operator lease, 2.10x
 *  coverage", "Operating business". */
export function goingConcernTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readGoingConcern(ex, asOf);
  if (!r) return null;
  if (r.branch === "going_concern") return "Going concern";
  if (r.branch === "operator_lease") return r.coverage ? `Operator lease, ${times(r.coverage.times)} coverage` : "Operator lease";
  return "Operating business";
}

/** The read in one line, for the memo, the workbook's cover and the
 *  report. */
export function goingConcernShortLine(r: GoingConcernRead): string {
  // Sold only where the price buys the property (`holder`).
  const sold = r.holder === "buyer";
  const parts = [
    r.branch === "going_concern"
      ? sold
        ? "sold with the business"
        : "held with the business"
      : r.branch === "operator_lease"
        ? "leased to the operator"
        : sold
          ? "sale of the business not stated"
          : "whether the business goes with it not stated",
    r.ebitda ? `${r.ebitda.label} ${money(r.ebitda.value)}` : "",
    r.coverage ? `rent covered ${times(r.coverage.times)}` : "",
  ].filter(Boolean);
  const what = r.business ? BUSINESS_NAME[r.business].replace(/^an? /, "") : "operating business";
  return `${what[0].toUpperCase()}${what.slice(1)}: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function goingConcernContextLine(r: GoingConcernRead): string {
  return `Operating business: ${r.headline}`;
}

// The site's trap: a fuel station's tanks by name; on any other business
// the site, and a tank only where one is named (the pre-merge audit: a
// convenience store with no pumps was asked about its tanks).
const SITE_TRAP_FUEL = "(d) THE TANKS AND THE SITE — the tanks' age, compliance and release history, and a state fund's coverage;";
const SITE_TRAP = "(d) THE SITE — what the seller's Phase I found on ground an operation has run on, and a storage tank only where the memorandum or the Phase I names one;";
const trapsFor = (business: OperatingBusiness | null) =>
  `OPERATING-BUSINESS TRAPS, checked by name where the OM gives the inputs: (a) THE ALLOCATION — the real estate, the fixtures and the business, as stated or not at all; (b) THE OPERATOR — whose earnings these are, and what the property is worth with another operator or none; (c) THE CONTRACTS — a fuel supply agreement and its branding, a dealer's rights on a leased station, a submerged-land lease and its permits, a franchise, a licence that does not transfer; ${
    business === "fuel" ? SITE_TRAP_FUEL : SITE_TRAP
  } (e) THE COVERAGE — on a lease, the unit's EBITDAR over the rent and its trend, and the tenant's reporting; (f) THE EXIT — a buyer of a business pays a multiple of its earnings and a buyer of real estate a cap on its rent: which one is the exit.`;

// A care operation's own questions, after the six (round 6): each a
// question to ask, never a figure or a claim of law. The change of
// ownership is asked of whoever's ownership changes (`holder`): the buyer's
// on a sale; on a note, a lender that takes the property; on a position or
// a share, an interest in the owning entity changing hands; on the land
// under it, the leaseholder's, if the lease ended.
const CHANGE_OF_OWNERSHIP: Record<PropertyHolder, string> = {
  buyer:
    "ask whether the buyer takes the Medicare provider agreement and with it the seller's overpayments and penalties, and how the licence and any certificate of need move under the state's process",
  co_owners:
    "ask whether the buyer takes the Medicare provider agreement and with it the seller's overpayments and penalties, and how the licence and any certificate of need move under the state's process",
  borrower:
    "ask whether a lender that takes the property in a foreclosure takes the Medicare provider agreement and with it the operator's overpayments and penalties, and how the licence and any certificate of need move under the state's process",
  entity:
    "ask whether a sale of an interest in the owning entity is a change of ownership for the Medicare provider agreement, the licence and any certificate of need, under the program's rules and the state's process",
  leaseholder:
    "the operation is the leaseholder's: ask how its Medicare provider agreement, its licence and any certificate of need would move if the ground lease ended",
};
const careTraps = (holder: PropertyHolder) =>
  `CARE-OPERATION TRAPS: (g) THE STRUCTURE — a lease to an operator (the rent, its coverage and the operator's credit), a management contract (census, labour and the payor mix are the owner's) or owner-operated, and whether the stated NOI is before or after a management fee; (h) THE CHANGE OF OWNERSHIP — ${CHANGE_OF_OWNERSHIP[holder]}; (i) THE PAYOR MIX — each payor's share as stated, and the state's Medicaid rate behind its share; (j) SURVEYS AND STARS — the survey history and the CMS star rating, which are public; (k) LICENSED AND OPERATING BEDS — the beds in service against the beds licensed.`;

/** The facts, then the traps by name, for the assumption review — a care
 *  operation's own after the six. */
export function goingConcernNote(r: GoingConcernRead): string {
  const care = r.business === "snf" || r.business === "senior_care";
  return `OPERATING BUSINESS AS STATED: ${r.headline} ${trapsFor(r.business)}${care ? ` ${careTraps(r.holder)}` : ""}`;
}

/** The rows a key-terms block leads with, each only where stated: the
 *  earnings, the coverage, then the contracts. */
export function goingConcernTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label));
  return [pick(/^\s*ebitdar?m?\b/i), pick(COVERAGE_ROW), ...STATED_ROWS.map(([, re]) => pick(re))].filter((m): m is M => m != null);
}
