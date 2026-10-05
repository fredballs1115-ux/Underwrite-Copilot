/**
 * Every row label the extraction is asked for, run through every deal-type
 * reader's own row finder (research pass 41, M7). Each reader's own label
 * tests hold its labels TO the prompt; none held a label to one reader, so
 * a pattern written for one family took another family's label: a nursing
 * home's "CMS star rating" was read as its operator's credit rating ("its
 * credit as stated: 3 stars"), and a preferred equity position's "Extension
 * options" — the extension of its redemption — as a single tenant's renewal
 * options ("the tenant's to exercise").
 *
 * Each label is held to the families it is asked for, and to the few other
 * readers listed below, each with the reason the two never meet on one deal.
 * A reader's within-family patterns — a ground lease's "ends" read among the
 * ground lease's own rows, a master lease's options among the master
 * lease's — are not label readers and are not run here: each reader is run
 * through the finder that picks its rows (its key-terms rows, its exported
 * row patterns, or the single tenant's whole finder).
 */
import { describe, expect, it } from "vitest";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import type { AssetClass } from "@/lib/anthropic/types";
import { singleTenantRowsRead } from "@/lib/single-tenant";
import { mhTermRows } from "@/lib/manufactured-housing";
import { condoTermRows } from "@/lib/condo";
import { affordableTermRows } from "@/lib/affordable";
import { studentTermRows } from "@/lib/student-housing";
import { hotelTermRows } from "@/lib/hotel-deal";
import { valueAddTermRows } from "@/lib/value-add";
import { ALLOCATION_ROWS, COVERAGE_ROW, MARKET_RENT_ROW, STATED_ROWS, goingConcernTermRows } from "@/lib/going-concern";
import { mixedUseTermRows } from "@/lib/mixed-use";
import { siteReportTermRows } from "@/lib/site-reports";
import { sellerFinancingTermRows } from "@/lib/seller-financing";
import { noteTermRows } from "@/lib/note-yield";
import { forwardTermRows } from "@/lib/forward-purchase";
import { taxAbatementTermRows } from "@/lib/tax-abatement";
import { sandwichTermRows } from "@/lib/sandwich-lease";
import { rosterTermRows } from "@/lib/tenant-roster";
import { saleTermRows } from "@/lib/sale-terms";
import { storageTermRows } from "@/lib/self-storage";
import { regulationTermRows } from "@/lib/rent-regulation";
import {
  ACCRUAL_ROW,
  CURRENT_PAY_ROW,
  EXTENSION_ROW,
  PREF_AMOUNT_ROW,
  PREF_RETURN_ROW,
  REDEMPTION_ROW,
  REMEDIES_ROW,
  SENIOR_BALANCE_ROW,
  SENIOR_MATURITY_ROW,
  VALUE_ROW,
} from "@/lib/position";
import { assumableStatedRows, sellerNoteStatedRows } from "@/lib/loan-rows";

type Row = { label: string; value: string };
const anyOf = (patterns: readonly RegExp[]) => (rows: Row[]) => rows.filter((m) => patterns.some((re) => re.test(m.label)));

/** Each family's row finder: what it takes from a list of rows. */
const READERS: Record<string, (rows: Row[]) => Row[]> = {
  singleTenant: singleTenantRowsRead,
  park: mhTermRows,
  condo: condoTermRows,
  affordable: affordableTermRows,
  student: studentTermRows,
  hotel: hotelTermRows,
  valueAdd: valueAddTermRows,
  goingConcern: (rows) => [
    ...goingConcernTermRows(rows),
    ...anyOf([COVERAGE_ROW, MARKET_RENT_ROW, ...ALLOCATION_ROWS.map(([, re]) => re), ...STATED_ROWS.map(([, re]) => re)])(rows),
  ],
  mixedUse: mixedUseTermRows,
  siteReports: siteReportTermRows,
  sellerFinancing: (rows) => [...sellerFinancingTermRows(rows), ...sellerNoteStatedRows(rows).map((s) => s.row)],
  note: noteTermRows,
  position: anyOf([
    PREF_AMOUNT_ROW,
    PREF_RETURN_ROW,
    CURRENT_PAY_ROW,
    ACCRUAL_ROW,
    REDEMPTION_ROW,
    SENIOR_BALANCE_ROW,
    SENIOR_MATURITY_ROW,
    VALUE_ROW,
    EXTENSION_ROW,
    REMEDIES_ROW,
  ]),
  forward: forwardTermRows,
  abatement: taxAbatementTermRows,
  sandwich: sandwichTermRows,
  roster: rosterTermRows,
  sale: saleTermRows,
  storage: storageTermRows,
  regulation: regulationTermRows,
  assumable: (rows) => assumableStatedRows(rows).map((s) => s.row),
};

/** The labels the extraction prompt files for each family, in its words. */
const OWN: Record<string, readonly string[]> = {
  valueAdd: ["Units to renovate", "Units renovated", "Renovation cost per unit", "Renovation premium", "Achieved renovation premium", "Classic rent", "Renovated rent", "Annual turnover", "Renovation period"],
  forward: ["Delivery date", "Outside date", "Deposit", "Delivery cap rate", "Rent commencement", "Price adjustment", "Developer", "Completion guaranty"],
  note: ["Unpaid principal balance", "Note rate", "Maturity date", "Amortization", "Payment status", "Senior loan balance", "Whole-asset value"],
  position: ["Preferred equity amount", "Preferred return", "Current pay rate", "Accrual rate", "Mandatory redemption date", "Senior loan balance", "Senior loan maturity", "Whole-asset value", "Extension options", "Remedies"],
  affordable: ["Restricted units", "Market-rate units", "Units under HAP contract", "Affordability expiration", "Compliance period end", "HAP contract expiration"],
  regulation: ["Rent regulation", "Rent-regulated units", "Legal regulated rent", "Preferential rent"],
  singleTenant: ["Lease expiration", "Lease term remaining", "Renewal options", "Rent increases", "Annual base rent", "Tenant credit rating", "Early termination date"],
  hotel: ["PIP cost", "PIP cost per key", "Franchise expiration", "Management agreement expiration", "ADR", "RevPAR", "RevPAR index", "FF&E reserve"],
  sale: ["Starting bid", "Reserve price", "Buyer's premium", "Bid deadline", "Stalking horse bid"],
  roster: ["WALT"],
  abatement: ["Tax abatement", "Tax abatement expiration", "Abated real estate taxes", "Unabated real estate taxes", "Annual tax abatement savings", "Tax abatement phase-out"],
  sellerFinancing: ["Seller financing amount", "Seller financing rate", "Seller financing term", "Seller financing amortization", "Seller financing position"],
  siteReports: ["Phase I ESA date", "Phase I ESA findings", "Phase II ESA", "PCA date", "PCA immediate repairs", "PCA replacement reserves", "Seismic PML", "Zoning conformance"],
  student: ["Pre-leased", "Pre-leased last year", "Beds", "Rent per bed", "Distance to campus", "University", "University enrollment", "Parental guarantees", "Lease term"],
  park: ["Pads", "Occupied pads", "Lot rent", "Market lot rent", "Park-owned homes", "Tenant-owned homes", "Park-owned home rent", "Water and sewer", "Utility billing", "Age restriction", "RV sites", "Rent control"],
  storage: ["Physical occupancy", "SF occupancy", "Economic occupancy", "In-place rent", "Street rate", "Climate-controlled", "Tenant insurance", "Management", "Expansion", "Storage SF per capita"],
  mixedUse: ["Residential income", "Commercial income", "Commercial SF", "Commercial occupancy"],
  goingConcern: [
    "Rent coverage",
    "Market rent",
    "Real estate value",
    "FF&E value",
    "Business value",
    "Fuel supply agreement",
    "Tank system",
    "Submerged land lease",
    "Franchise",
    "Licence",
    "Operating structure",
    "Licensed beds",
    "Operating beds",
    "Payor mix",
    "CMS star rating",
    "Certificate of need",
    "Management fee",
    "EBITDA",
    "EBITDAR",
  ],
  condo: ["Units offered", "Units in condominium", "HOA dues", "Special assessment", "Association reserves", "Rental restrictions", "Declarant control", "Milestone inspection", "Structural integrity reserve study"],
  sandwich: ["Master lease rent", "Sublease income", "Master lease expiration", "Master lease term remaining", "Master lease options"],
  assumable: [
    "Assumable loan balance",
    "Assumable loan rate",
    "Assumable loan maturity",
    "Assumable loan amortization",
    "Assumable loan debt service",
    "Assumption fee",
    "Assumable loan rate cap",
    "Mortgage insurance premium",
    "Prepayment",
    "Assumable supplemental loan balance",
    "Assumable supplemental loan rate",
    "Assumable supplemental loan maturity",
  ],
};

/** The labels no deal-type family owns — the plan's, the ground lease's
 *  (read by the interest), the offering's and every deal's — none of which a
 *  family's finder may take but where listed below. */
const OTHER = [
  "Total project cost", "Construction budget", "Renovation budget", "Land cost", "Units (proposed)", "SF (proposed)", "Construction period", "Lease-up period", "Stabilized in",
  "Asking price", "Entity loan balance", "Entity construction loan", "Ground rent", "Income before ground rent", "Ground lease expiration", "Ground lease term remaining",
  "Ground lease extension options", "Ground lease termination right", "NOI (in-place)", "Offers due", "Price per unit", "Price per SF", "Last sale price", "Units", "Total SF",
  "Land area", "Average unit size", "Occupancy", "Stabilized occupancy", "Going-in cap rate", "Stabilized cap rate", "NOI (Year 1)", "NOI (stabilized, pro forma)",
];

/** A family's finder that takes a label of another's, and why the two never
 *  meet on one deal. */
const ALSO: Record<string, Record<string, string>> = {
  regulation: {
    "Rent control": "a park's rent-control row names its regime: the rules' read of it, said once beside the park's own (lib/rent-regulation regulationSaidByPark)",
  },
  goingConcern: {
    "Franchise expiration": "the going concern reads no hotel, whose class the site reads by a reader of its own (lib/going-concern READ_OTHERWISE)",
  },
  singleTenant: {
    "Master lease expiration": "a net lease's master lease is its tenant's own; a sandwich position's is dropped (lib/interest isMasterLeasehold)",
    "Master lease term remaining": "as the master lease's expiration",
    "In-place rent": "a single tenant's in-place rent is its lease's; a storage facility, whose label it is, leases to no single tenant",
  },
  note: {
    "Entity loan balance": "the note's rows are read only where the price buys a note, whose loan is the one sold — no share's entity loan is on its memorandum",
    "Assumable loan balance": "no seller's loan is offered for assumption beside a note: the assumable reader runs only where the price buys the building",
    "Assumable loan maturity": "as the assumable loan's balance",
    "Assumable supplemental loan balance": "as the assumable loan's balance",
    "Assumable supplemental loan maturity": "as the assumable loan's balance",
  },
};

const LABELS = [...new Set([...Object.values(OWN).flat(), ...OTHER])];
const VALUES = ["5", "Stated as written", "$1,000,000", "June 30, 2031"];
const claims = (label: string): string[] =>
  Object.entries(READERS)
    .filter(([, read]) => VALUES.some((value) => read([{ label, value }]).length > 0))
    .map(([family]) => family);

describe("every extraction label, through every deal-type reader's finder (research pass 41)", () => {
  it("lists only labels the extraction prompt asks for", () => {
    const classes: AssetClass[] = ["auto", "multifamily", "office", "industrial", "retail", "hospitality_str", "manufactured_housing", "self_storage", "student_housing", "senior_housing", "mixed_use", "net_lease"];
    const prompt = classes.map((c) => extractionInstruction(c)).join("\n");
    for (const label of LABELS) expect(prompt, label).toContain(`"${label}"`);
    for (const [family, extra] of Object.entries(ALSO)) {
      expect(Object.hasOwn(READERS, family), family).toBe(true);
      for (const label of Object.keys(extra)) expect(LABELS, `${family}: ${label}`).toContain(label);
    }
  });

  it("holds each label to the families it is asked for, and to the readers listed with their reason", () => {
    const strays: string[] = [];
    for (const label of LABELS) {
      for (const family of claims(label)) {
        if (OWN[family]?.includes(label)) continue;
        if (ALSO[family]?.[label]) continue;
        strays.push(`${family} takes "${label}"`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("reads the two that collided as their own family's only", () => {
    // A nursing home's star rating is no credit rating, and a position's
    // extension options are no tenant's renewal options.
    expect(claims("CMS star rating")).toEqual(["goingConcern"]);
    expect(claims("Extension options")).toEqual(["position"]);
    // Each family's own still reads.
    expect(claims("Tenant credit rating")).toEqual(["singleTenant"]);
    expect(claims("Renewal options")).toEqual(["singleTenant"]);
    for (const label of ["Credit rating", "Guarantor credit rating", "S&P rating", "Rating", "Lease extension options", "Renewal and extension options", "Options to renew"]) {
      expect(singleTenantRowsRead([{ label, value: "As stated" }]), label).toHaveLength(1);
    }
    for (const label of ["Energy Star rating", "Star rating", "Walk Score rating"]) {
      expect(singleTenantRowsRead([{ label, value: "As stated" }]), label).toEqual([]);
    }
  });

  it("finds every family's own rows through its finder", () => {
    for (const [family, read] of Object.entries(READERS)) {
      const own = OWN[family] ?? [];
      expect(
        own.some((label) => VALUES.some((value) => read([{ label, value }]).length > 0)),
        family,
      ).toBe(true);
    }
  });
});
