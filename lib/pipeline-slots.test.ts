// The pipeline row's three slots follow the same rule as the meeting .xlsx,
// the analytics and the comp memory: a plan deal carries its yield on cost
// and no cap; a stabilized asset its going-in cap; the price reads through
// the shared reader with the first signal as the fallback.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { assetClassLabel } from "./asset-class";
import { pickSlots, readingTerms, shownAssetClass } from "./pipeline-slots";
import { noteCapSlot } from "./compare-interest";

describe("shownAssetClass — a row never says \"Auto\"", () => {
  it("shows the stored class, the extraction's read for an auto-detect deal, and nothing before any read", () => {
    expect(shownAssetClass("office", null)).toBe("office");
    expect(shownAssetClass("auto", { assetClass: "multifamily" })).toBe("multifamily");
    expect(shownAssetClass("Auto", { assetClass: "Industrial" })).toBe("industrial");
    expect(shownAssetClass("auto", null)).toBe("");
    expect(shownAssetClass("auto", { assetClass: "auto" })).toBe("");
    expect(shownAssetClass(null, { assetClass: "retail" })).toBe("retail");
    expect(shownAssetClass("", undefined)).toBe("");
  });

  it("a known class comes back as its key whatever its case; a class the model phrased itself keeps its case", () => {
    expect(shownAssetClass("Multifamily", null)).toBe("multifamily");
    expect(shownAssetClass("auto", { assetClass: "Self_Storage" })).toBe("self_storage");
    expect(shownAssetClass("auto", { assetClass: "NNN retail" })).toBe("NNN retail");
    expect(shownAssetClass("auto", { assetClass: "Medical office / MOB" })).toBe("Medical office / MOB");
    // …so the row's label never mangles an acronym the model wrote.
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "NNN retail" }))).toBe("NNN retail");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "SFR portfolio" }))).toBe("SFR portfolio");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "Self_Storage" }))).toBe("Self-storage");
  });

  it("the compare page prints the deal's one class, never the stored \"auto\" that reads as a dash", () => {
    // The page's column is a loader over the Supabase row, so it is held at
    // its source, the way the document routes' buy-box reads are
    // (lib/memo/documents-review.test.ts). The workbook's row is
    // lib/pipeline-export-row, tested there.
    const src = readFileSync("app/(app)/deals/compare/page.tsx", "utf8");
    expect(src).toMatch(/assetClass: shownAssetClass\(deal\.asset_class, ex\)/);
    expect(src).not.toMatch(/assetClass: deal\.asset_class\b/);
  });
});

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "X", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;

describe("pickSlots — the pipeline row agrees with the export on which figure a deal carries", () => {
  it("a stabilized asset: its going-in cap, its price, no yield on cost", () => {
    const s = pickSlots(ex([m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%"), m("In-place NOI", "$2,310,000")]), null);
    expect(s).toEqual({ cap: "5.50%", capWithheld: null, noteYield: null, price: "$42,000,000", yoc: null, interest: null, debt: null, affordable: null, tenancy: null, hotel: null, sale: null, roster: null, valueAdd: null, abatement: null, sellerNote: null, reports: null, broker: null, student: null, mh: null, storage: null, regulation: null, forward: null, mixedUse: null, goingConcern: null, condo: null, sandwich: null, exchange: null, basis: null });
  });

  it("says a covenant on the rents beside the price (#453), and nothing on a market-rate deal", () => {
    const base = [m("Asking price", "$38,000,000"), m("Going-in cap rate", "5.10%"), m("Units", "240")];
    const lihtc = pickSlots(
      ex([...base, m("Restricted units", "180")], {
        affordable: { programs: ["lihtc"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
      }),
      null,
    );
    expect(lihtc.affordable).toBe("LIHTC, 75% restricted");
    // The price still buys the building: the price and its cap stand.
    expect(lihtc.price).toBe("$38,000,000");
    expect(lihtc.cap).toBe("5.10%");
    expect(pickSlots(ex(base), null).affordable).toBeNull();
  });

  it("says how long a single tenant's lease has left (#454), and nothing on a multi-tenant deal", () => {
    const base = [m("Asking price", "$6,500,000"), m("Going-in cap rate", "6.00%")];
    const tenant = { tenant: "Walgreens Co.", guarantor: "", leaseType: "NNN", landlordObligations: "", tenantRights: "", page: "" };
    // A lease a century out, so the whole years left never move with the day the test runs.
    const s = pickSlots(ex([...base, m("Lease expiration", "December 31, 2126")], { singleTenant: tenant }), null);
    expect(s.tenancy).toMatch(/^Single tenant, \d+ yrs left$/);
    expect(pickSlots(ex(base, { singleTenant: tenant }), null).tenancy).toBe("Single tenant");
    expect(pickSlots(ex(base, { singleTenant: { ...tenant, tenant: "" } }), null).tenancy).toBeNull();
    expect(pickSlots(ex(base), null).tenancy).toBeNull();
  });

  it("says what a hotel is sold with (#455), and nothing on anything but a hotel", () => {
    const base = [m("Asking price", "$26,000,000"), m("Keys", "120")];
    const hotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management" as const, pip: "", page: "" };
    expect(pickSlots(ex([...base, m("PIP cost", "$4,200,000")], { hotel }), null).hotel).toBe("Mgmt encumbered, PIP $35k/key");
    expect(pickSlots(ex(base, { hotel: { ...hotel, encumbrance: "unencumbered" } }), null).hotel).toBe("Unencumbered");
    expect(pickSlots(ex(base), null).hotel).toBeNull();
  });

  it("says how the property is sold (#456), and nothing on a negotiated sale", () => {
    const rows = [m("NOI (in-place)", "$480,000"), m("Starting bid", "$2,500,000"), m("Buyer's premium", "5%")];
    const sale = { method: "auction" as const, terms: "", condition: "", page: "" };
    const s = pickSlots(ex(rows, { sale }), null);
    expect(s.sale).toBe("Auction, 5% premium");
    // An auction has no asking price, and the row never shows the starting bid as one.
    expect(s.price).toBeNull();
    expect(pickSlots(ex([m("Asking price", "$3,000,000")], { sale: { ...sale, method: "negotiated" } }), null).sale).toBeNull();
  });

  it("says a multi-tenant property's shadow anchor and its roll (#457), and nothing on a quiet roster", () => {
    // Years counted from the day the test runs, so the roll never moves with it.
    const y = new Date().getUTCFullYear();
    const t = (name: string, over: Record<string, string>) => ({
      name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const tenants = [
      t("Staples", { sf: "10,000 SF", rent: "$300,000", leaseExpiration: String(y + 2) }),
      t("Kroger", { sf: "40,000 SF", rent: "$600,000", leaseExpiration: String(y + 30) }),
      { ...t("Target", { sf: "125,000 SF" }), role: "anchor" as const, inSale: "no" as const },
    ];
    const rows = [m("Asking price", "$14,000,000"), m("Total SF", "60,000 SF")];
    expect(pickSlots(ex(rows, { assetClass: "retail", tenants } as Partial<ExtractionResult>), null).roster).toBe("Shadow-anchored, 33% rolls in 5 yrs");
    const quiet = [tenants[1], t("Staples", { sf: "10,000 SF", rent: "$300,000", leaseExpiration: String(y + 20) })];
    expect(pickSlots(ex(rows, { assetClass: "retail", tenants: quiet } as Partial<ExtractionResult>), null).roster).toBeNull();
  });

  it("says a value-add program's premium and its return on cost (#460), and nothing where none is stated", () => {
    const rows = [m("Asking price", "$48,000,000"), m("Units to renovate", "192"), m("Renovation cost per unit", "$15,000"), m("Renovation premium", "$250")];
    const strategy = { kind: "value_add" as const, summary: "", capitalBudget: "", timeline: "" };
    expect(pickSlots(ex(rows, { strategy }), null).valueAdd).toBe("Reno $250/mo, 20% on cost");
    expect(pickSlots(ex(rows.slice(0, 1), { strategy }), null).valueAdd).toBeNull();
  });

  it("says a tax abatement's years left and its step-up (#461), and nothing where none is stated", () => {
    const rows = [
      m("Asking price", "$55,000,000"),
      m("Tax abatement", "10-year Philadelphia tax abatement"),
      m("Tax abatement expiration", "2099"),
      m("Abated real estate taxes", "$70,000"),
      m("Unabated real estate taxes", "$520,000"),
    ];
    expect(pickSlots(ex(rows), null).abatement).toMatch(/^Tax abated, \d+ yrs left, \+\$450k\/yr$/);
    expect(pickSlots(ex(rows.slice(0, 1)), null).abatement).toBeNull();
  });

  it("says a student building's pre-leasing against last year's (#468), and nothing on anything else", () => {
    const rows = [m("Asking price", "$61,200,000"), m("Beds", "612"), m("Pre-leased", "87% for Fall 2026 vs. 90% a year ago")];
    expect(pickSlots({ ...ex(rows), assetClass: "student_housing" }, null).student).toBe("Pre-leased 87%, −3 pts y/y");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).student).toBeNull();
  });

  it("says a park's lot rent against the market's and a private system (#470), and nothing on anything else", () => {
    const rows = [m("Asking price", "$9,300,000"), m("Pads", "150"), m("Lot rent", "$430"), m("Market lot rent", "$525"), m("Water and sewer", "City water; septic")];
    expect(pickSlots({ ...ex(rows), assetClass: "manufactured_housing" }, null).mh).toBe("Lot rent $430 vs $525 mkt, Private sewer");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).mh).toBeNull();
  });

  it("says the rent rules that reach the building where the caller hands its place and day (lib/rent-regulation), and nothing where none reach it", () => {
    const walkUp = ex([m("Asking price", "$14,000,000"), m("Units", "48"), m("Year built", "1931"), m("Rent-regulated units", "41")]);
    const brooklyn = { address: { state: "NY", city: "Brooklyn", county: "Kings County", label: "100 Walk-up St, Brooklyn, NY 11215" }, siteFlags: null, today: "2026-10-05" };
    expect(pickSlots(walkUp, null, "multifamily", brooklyn).regulation).toBe("Rent-stabilized, 41 of 48");
    // A year the memorandum does not state leaves the rules' question open.
    const noYear = ex([m("Asking price", "$14,000,000"), m("Units", "48")]);
    expect(pickSlots(noYear, null, "multifamily", brooklyn).regulation).toBe("Rent rules: check");
    // Filed as an office: no rent rules read, and the memorandum names none.
    expect(pickSlots(noYear, null, "office", brooklyn).regulation).toBeNull();
    // Outside every regime the site's rules hold, and with no place handed in.
    expect(pickSlots(noYear, null, "multifamily", { address: { state: "TX", city: "Austin" }, siteFlags: null, today: "2026-10-05" }).regulation).toBeNull();
    expect(pickSlots(walkUp, null, "multifamily").regulation).toBeNull();
  });

  it("says a forward purchase's yield at delivery, or the delivery it counts down to, on the day handed in (lib/forward-purchase)", () => {
    const strategy = { kind: "development" as const, summary: "Forward purchase of a build-to-suit distribution center at completion", capitalBudget: "", timeline: "" };
    const rows = [m("Purchase price", "$48,000,000"), m("Delivery date", "Q3 2027")];
    const on = (today: string) => ({ address: null, siteFlags: null, today });
    expect(pickSlots(ex(rows, { strategy }), null, "industrial", on("2026-10-05")).forward).toBe("Build-to-suit, delivers Q3 2027");
    // Past the delivery the tag stops counting down.
    expect(pickSlots(ex(rows, { strategy }), null, "industrial", on("2027-11-01")).forward).toBe("Build-to-suit purchase");
    // A cap at delivery is said, and never read as the going-in cap.
    const capped = pickSlots(ex([...rows, m("Delivery cap rate", "6.00%"), m("NOI (Year 1)", "$2,880,000")], { strategy }), null, "industrial", on("2026-10-05"));
    expect(capped.forward).toBe("Build-to-suit, 6.00% at delivery");
    expect(capped.cap).toBeNull();
    // The developer funds the works: the yield slot is the NOI at delivery over the price.
    expect(capped.yoc).toBe("6.0%");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).forward).toBeNull();
  });

  it("says a mixed-use building's commercial share of the income, else of the area (lib/mixed-use), and nothing on anything else", () => {
    const rows = [m("Asking price", "$25,000,000"), m("Residential income", "$1,520,000"), m("Commercial income", "$610,000")];
    expect(pickSlots(ex(rows, { assetClass: "Retail / Multifamily" }), null).mixedUse).toBe("Commercial 29% of income");
    const area = [m("Asking price", "$25,000,000"), m("Commercial SF", "9,500 SF"), m("Total SF", "62,000 SF")];
    expect(pickSlots(ex(area, { assetClass: "Mixed-Use" }), null).mixedUse).toBe("Commercial 15% of area");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).mixedUse).toBeNull();
  });

  it("says an operating business sold with its real estate, or leased to its operator with the coverage (lib/going-concern), and nothing on anything else", () => {
    const station = ex([m("Asking price", "$3,200,000"), m("NOI (in-place)", "$256,000"), m("EBITDA (T-12)", "$410,000")], {
      assetClass: "Gas Station / Convenience Store",
      strategy: { kind: "stabilized", summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
    });
    expect(pickSlots(station, null).goingConcern).toBe("Going concern");
    const wash = ex([m("Asking price", "$4,600,000"), m("Annual base rent", "$276,000"), m("EBITDAR (T-12)", "$720,000")], {
      assetClass: "Car wash",
      singleTenant: { tenant: "Tidal Wave Auto Spa", guarantor: "", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" },
    });
    expect(pickSlots(wash, null).goingConcern).toBe("Operator lease, 2.61x coverage");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).goingConcern).toBeNull();
  });

  it("says condominium units bought in bulk as the units offered of the condominium's (lib/condo), and nothing on anything else", () => {
    const bulk = ex([m("Asking price", "$16,800,000"), m("Units", "42"), m("HOA dues", "$650 per unit per month"), m("Units in building", "120")], {
      assetClass: "Condominium Units (bulk sale)",
    });
    expect(pickSlots(bulk, null).condo).toBe("Bulk 42 of 120 (35%)");
    const whole = ex([m("Units offered", "120"), m("Units in condominium", "120")], { assetClass: "Condominium (entire building)" });
    expect(pickSlots(whole, null).condo).toBe("Condo units");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).condo).toBeNull();
  });

  it("says a sandwich position's spread and its cover (lib/sandwich-lease), and nothing on a plain leasehold", () => {
    const interest = {
      kind: "leasehold" as const,
      summary: "Leasehold interest under a master lease of the building, sublet to 14 office tenants",
      share: "",
      groundLease: "Master lease of the building from its owner",
      loan: "",
      page: "",
    };
    const position = ex([m("Asking price", "$6,500,000"), m("Master lease rent", "$1,100,000"), m("Sublease income", "$1,820,000")], { interest });
    expect(pickSlots(position, null).sandwich).toBe("Spread $720k, 1.65× cover");
    const under = ex([m("Master lease rent", "$1,100,000"), m("Sublease income", "$950,000")], { interest });
    expect(pickSlots(under, null).sandwich).toBe("Subleases under the master rent");
    // One rent alone is no spread, and a plain leasehold is no position.
    expect(pickSlots(ex([m("Master lease rent", "$1,100,000")], { interest }), null).sandwich).toBeNull();
    const plain = { ...interest, summary: "Leasehold under a 99-year ground lease", groundLease: "Ground lease to 2090" };
    expect(pickSlots(ex([m("Master lease rent", "$1,100,000"), m("Sublease income", "$1,820,000")], { interest: plain }), null).sandwich).toBeNull();
  });

  it("says the reader's 1031 exchange against the deal only where the caller passes it (lib/exchange-deal), on the slots' day", () => {
    const rows = ex([m("Asking price", "$20,000,000"), m("Units", "240")]);
    const place = { address: null, siteFlags: null, today: "2026-10-05" };
    const block = { relinquishedTransferOn: "2026-09-15", filer: "partnership" as const };
    expect(pickSlots(rows, null, "auto", place, { block, offersDue: "2026-10-20" }).exchange).toBe("1031: identify by Oct 30");
    expect(pickSlots(rows, null, "auto", place, { block, offersDue: "2026-11-02" }).exchange).toBe("1031: offers due after ID");
    // No exchange passed, none in the box, or its period over: no slot.
    expect(pickSlots(rows, null, "auto", place).exchange).toBeNull();
    expect(pickSlots(rows, null, "auto", place, { block: undefined, offersDue: "2026-11-02" }).exchange).toBeNull();
    expect(pickSlots(rows, null, "auto", { ...place, today: "2027-06-01" }, { block, offersDue: null }).exchange).toBeNull();
  });

  it("says a storage facility's lease-up or premium over street (#471), and nothing on anything else", () => {
    const rows = [m("Asking price", "$9,800,000"), m("Occupancy", "72%"), m("In-place rent", "$1.20/SF/mo"), m("Street rate", "$1.00/SF/mo")];
    expect(pickSlots({ ...ex(rows), assetClass: "self_storage" }, null).storage).toBe("Lease-up, 72% occupied, In-place 20% over street");
    expect(pickSlots(ex([m("Asking price", "$20,000,000"), m("Units", "240")]), null).storage).toBeNull();
  });

  it("says the most serious thing the reports found (#465), and nothing where they found none", () => {
    const rows = [m("Asking price", "$42,000,000"), m("Phase I ESA findings", "No RECs"), m("Seismic PML", "24%")];
    expect(pickSlots(ex(rows), null).reports).toBe("PML 24%");
    expect(pickSlots(ex([...rows, m("Phase I ESA date", "2019"), m("PCA immediate repairs", "None")].filter((r) => r.label !== "Seismic PML")), null).reports).toBe(
      "Phase I over a year old",
    );
    expect(pickSlots(ex([m("Asking price", "$42,000,000"), m("Phase I ESA findings", "No RECs")]), null).reports).toBeNull();
  });

  it("says a note the seller will carry and its rate (#462), and nothing where none is offered", () => {
    const rows = [m("Asking price", "$20,000,000"), m("Seller financing amount", "$14,000,000"), m("Seller financing rate", "5.00%")];
    expect(pickSlots(ex(rows), null).sellerNote).toBe("Seller financing 5.00%");
    expect(pickSlots(ex(rows.slice(0, 1)), null).sellerNote).toBeNull();
  });

  it("says what the price buys where it is not the building outright (#415)", () => {
    const base = [m("Asking price", "$20,000,000"), m("Going-in cap rate", "5.50%")];
    const with_ = (interest: NonNullable<ExtractionResult["interest"]>) =>
      pickSlots(ex(base, { interest }), null).interest;
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(with_({ ...blank, kind: "partial_interest", share: "49% limited partnership interest" })).toBe("49% share");
    expect(with_({ ...blank, kind: "partial_interest", share: "a majority stake" })).toBe("Share");
    expect(with_({ ...blank, kind: "note" })).toBe("Note");
    expect(with_({ ...blank, kind: "leasehold" })).toBe("Leasehold");
    expect(with_({ ...blank, kind: "leased_fee" })).toBe("Leased fee");
    expect(with_({ ...blank, kind: "fee_simple", groundLease: "a 40-year lease under the deck" })).toBeNull();
    expect(with_({ ...blank, kind: "unknown" })).toBeNull();
    expect(pickSlots(ex(base), null).interest).toBeNull();
  });

  it("withholds a note's collateral cap, its yield to maturity in the slot where the note pays (the audit of 2026-09-30)", () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    // A maturity decades out, so the note never matures with the day the test runs.
    const terms = [
      m("Asking price", "$20,000,000"),
      m("Going-in cap rate", "9.50%"),
      m("Unpaid principal balance", "$24,400,000"),
      m("Note rate", "5.25%"),
      m("Maturity date", "March 31, 2060"),
      m("Amortization", "Interest-only"),
      m("Payment status", "Performing"),
    ];
    const note = ex(terms, { interest: { ...blank, kind: "note" } });
    const s = pickSlots(note, null);
    // The collateral's 9.50% is not the buyer's figure (the key terms and
    // the compare table already say so).
    expect(s.cap).toBeNull();
    expect(s.capWithheld).toBe("note");
    expect(s.noteYield).toBe(`${noteCapSlot(note)!.ytmPct!.toFixed(1)}%`);
    // A note that is not paying: the cap withheld, no yield nobody earns.
    const npl = ex([...terms.slice(0, 6), m("Payment status", "Non-performing")], { interest: { ...blank, kind: "note" } });
    expect(pickSlots(npl, null)).toMatchObject({ cap: null, capWithheld: "note", noteYield: null });
    // A building's cap stands.
    expect(pickSlots(ex(terms), null)).toMatchObject({ cap: "9.50%", capWithheld: null, noteYield: null });
  });

  it("says where the seller's loan is offered for assumption (#419) — never on a note, a share or the land", () => {
    const base = [m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%")];
    const loan = [m("Assumable loan balance", "$30,000,000"), m("Assumable loan rate", "3.45%")];
    expect(pickSlots(ex([...base, ...loan]), null).debt).toBe("Assumable 3.45%");
    expect(pickSlots(ex([...base, loan[0]]), null).debt).toBe("Assumable loan");
    expect(pickSlots(ex(base), null).debt).toBeNull();
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(pickSlots(ex([...base, ...loan], { interest: { ...blank, kind: "note" } }), null).debt).toBeNull();
    expect(pickSlots(ex([...base, ...loan], { interest: { ...blank, kind: "leasehold" } }), null).debt).toBe("Assumable 3.45%");
  });

  it("a value-add with a stated going-in cap: the yield on cost, and NO cap — as the .xlsx prints 'n/a — plan'", () => {
    const s = pickSlots(
      ex([m("Asking price", "$42,000,000"), m("Renovation budget", "$8,600,000"), m("Units", "240"), m("Going-in cap rate", "5.00%"), m("Stabilized NOI", "$3,400,000")], {
        strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s.cap).toBeNull();
    expect(s.price).toBe("$42,000,000");
    expect(s.yoc).toBe(`${((3_400_000 / 50_600_000) * 100).toFixed(1)}%`);
  });

  it("a development priced at its land: the land cost is the price, the yield on cost is over land + budget", () => {
    const s = pickSlots(
      ex([m("Land cost", "$8,000,000"), m("Construction budget", "$92,000,000"), m("Units (proposed)", "420"), m("Stabilized NOI", "$11,000,000"), m("Stabilized cap rate", "7.0%")], {
        strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s).toEqual({ cap: null, capWithheld: null, noteYield: null, price: "$8,000,000", yoc: "11.0%", interest: null, debt: null, affordable: null, tenancy: null, hotel: null, sale: null, roster: null, valueAdd: null, abatement: null, sellerNote: null, reports: null, broker: null, student: null, mh: null, storage: null, regulation: null, forward: null, mixedUse: null, goingConcern: null, condo: null, sandwich: null, exchange: null, basis: null });
  });

  it("before the extraction lands, the first signal's ask fills the price — only when it is a figure", () => {
    const bare = ex([]);
    expect(pickSlots(bare, { askPrice: "$20,000,000", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBe("$20,000,000");
    expect(pickSlots(bare, { askPrice: "Call for offers", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBeNull();
  });

  it("with no extraction at all — a first screen's first minute — the first signal's ask is the price and nothing else is read yet", () => {
    const signal = { askPrice: "$20,000,000", goingInCap: "5.2%", perUnit: "$83k/unit", assetClass: "multifamily", market: "Dallas, TX", take: "", dealName: "X", size: "240 units" };
    // The deal page's summary bar prints the same ask before the extraction
    // lands; the card printed "Price —" because the page never asked.
    expect(pickSlots(null, signal)).toEqual({ cap: null, price: "$20,000,000", yoc: null });
    expect(pickSlots(null, { ...signal, askPrice: "Unpriced" }).price).toBeNull();
    expect(pickSlots(null, { ...signal, askPrice: "" }).price).toBeNull();
    // No signal yet either: nothing to show.
    expect(pickSlots(null, null)).toEqual({ cap: null, price: null, yoc: null });
  });

  it("the pipeline page asks for the slots whatever the extraction, so the first signal's ask reaches the card", () => {
    // The page is a loader over the Supabase rows, so it is held at its
    // source, the way the compare page's class is above: it skipped
    // pickSlots until the extraction landed, and the promise above never
    // reached a card.
    const src = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(src).toMatch(/slots: pickSlots\(extraction, /);
    expect(src).not.toMatch(/slots: extraction\s*\?/);
    // …and it marks a fit judged on the first signal the deal page's way.
    expect(src).toMatch(/fitFirstRead: !extraction && !!d\.first_signal/);
    // …and says which empty slots are still being read.
    expect(src).toMatch(/reading: readingTerms\(jobStatus, !!extraction, !!d\.om_storage_path\)/);
  });
});

describe("readingTerms — an empty slot is not read yet only while a first screen reads the memorandum", () => {
  it("a live screen on a memorandum nothing has read yet", () => {
    expect(readingTerms("running", false, true)).toBe(true);
  });

  it("a finished read's empty slot is not stated, a re-screen's included; a typed deal has no memorandum; a stalled or failed run reads nothing", () => {
    // The terms are in (a first screen past its extraction, or a re-screen
    // holding the last finished read's): the dash.
    expect(readingTerms("running", true, true)).toBe(false);
    // Typed facts, no memorandum.
    expect(readingTerms("running", false, false)).toBe(false);
    expect(readingTerms("stalled", false, true)).toBe(false);
    expect(readingTerms("failed", false, true)).toBe(false);
    expect(readingTerms(null, false, true)).toBe(false);
    expect(readingTerms(undefined, false, true)).toBe(false);
  });
});

describe("the basis at a glance (#469)", () => {
  const m = (label: string, value: string) => ({ label, value, flagged: false, page: "" });
  const ex = (metrics: ReturnType<typeof m>[], assetClass: string, extra: Record<string, unknown> = {}) =>
    ({ dealName: "x", assetClass, metrics, ...extra }) as unknown as import("@/lib/anthropic/types").ExtractionResult;

  it("prints the price by the class's own basis and the memorandum's own noun", () => {
    expect(pickSlots(ex([m("Asking price", "$68,000,000"), m("Units", "248")], "multifamily"), null).basis).toBe("$274k/unit");
    expect(pickSlots(ex([m("Asking price", "$24,000,000"), m("Keys", "120")], "hospitality_str"), null).basis).toBe("$200k/key");
    expect(pickSlots(ex([m("Asking price", "$61,200,000"), m("Beds", "612")], "student_housing"), null).basis).toBe("$100k/bed");
    expect(pickSlots(ex([m("Asking price", "$42,000,000"), m("Rentable SF", "198,000")], "office"), null).basis).toBe("$212/SF");
    // A range reads at its top (#466), as every price does.
    expect(pickSlots(ex([m("Pricing guidance", "$60,000,000 – $62,000,000"), m("Units", "248")], "multifamily"), null).basis).toBe("$250k/unit");
  });

  it("speaks in the deal's one class: the analyst's where they filed one, the deck's where they left it to the deck", () => {
    // A deck read as apartments that the analyst filed as an office: the
    // header and every other surface say office (shownAssetClass), so the
    // basis is by the foot, never by the unit.
    const rows = [m("Asking price", "$42,000,000"), m("Rentable SF", "198,000"), m("Units", "248")];
    expect(pickSlots(ex(rows, "multifamily"), null, "office").basis).toBe("$212/SF");
    expect(pickSlots(ex(rows, "multifamily"), null, "auto").basis).toBe("$169k/unit");
    // A caller that names no filed class reads the deck's, as before.
    expect(pickSlots(ex(rows, "multifamily"), null).basis).toBe("$169k/unit");
  });

  it("prints none where the price is not the building's or the count is not stated", () => {
    expect(pickSlots(ex([m("Asking price", "$68,000,000")], "multifamily"), null).basis).toBeNull();
    const note = { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(pickSlots(ex([m("Asking price", "$18,000,000"), m("Units", "248")], "multifamily", { interest: note }), null).basis).toBeNull();
    const plan = { kind: "development", summary: "", capitalBudget: "", timeline: "" };
    expect(pickSlots(ex([m("Land price", "$4,000,000"), m("Units (proposed)", "240")], "multifamily", { strategy: plan }), null).basis).toBeNull();
  });

  it("prints no per-SF basis on an outdoor-storage yard, which trades by the acre", () => {
    const rows = [m("Asking price", "$12,000,000"), m("Building SF", "4,000"), m("Usable acres", "8.5")];
    // The card had read $12M over the 4,000 SF shop as "$3,000/SF".
    expect(pickSlots(ex(rows, "Industrial Outdoor Storage (IOS)"), null).basis).toBeNull();
    // The analyst filed it as industrial: the deck's words still say yard.
    expect(pickSlots(ex(rows, "Industrial Outdoor Storage (IOS)"), null, "industrial").basis).toBeNull();
    // A warehouse on the same figures keeps its basis.
    expect(pickSlots(ex(rows, "industrial"), null).basis).toBe("$3,000/SF");
  });
});
