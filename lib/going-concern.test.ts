import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  ALLOCATION_ROWS,
  COVERAGE_ROW,
  MARKET_RENT_ROW,
  STATED_ROWS,
  goingConcernContextLine,
  goingConcernModelLine,
  goingConcernNote,
  goingConcernShortLine,
  goingConcernTag,
  goingConcernTermRows,
  operatingBusinessOf,
  readGoingConcern,
} from "./going-concern";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

const TODAY = new Date("2026-10-05T12:00:00Z");
const row = (label: string, value: string, page = "p. 5") => ({ label, value, page, flagged: false });
const deal = (over: Partial<ExtractionResult>, metrics: ReturnType<typeof row>[]): ExtractionResult =>
  ({ dealName: "Deal", assetClass: "", totalPages: 30, metrics, ...over }) as unknown as ExtractionResult;

// A gas station sold with its store business, the way pass 28 found one: an
// "NOI" that carries the fuel and store business.
const STATION = deal(
  {
    dealName: "Route 9 Fuel & Market",
    assetClass: "Gas Station / Convenience Store",
    strategy: { kind: "stabilized", summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
  },
  [
    row("Asking price", "$3,200,000", "p. 2"),
    row("NOI (in-place)", "$256,000"),
    row("EBITDA (T-12)", "$410,000"),
    row("Fuel supply agreement", "Shell branded supply through 2029"),
    row("Tank system", "Three double-walled fiberglass USTs, installed 2004"),
    row("Phase I ESA findings", "One REC: a 2011 release, closed with no further action"),
  ],
);

// A car wash sold as real estate leased to its operator.
const WASH = deal(
  {
    dealName: "Express Wash NNN",
    assetClass: "Net lease (car wash)",
    singleTenant: {
      tenant: "Tidal Wave Auto Spa",
      guarantor: "Tidal Wave Auto Spa, LLC (corporate)",
      leaseType: "Absolute NNN",
      landlordObligations: "None",
      tenantRights: "Right of first refusal",
    } as ExtractionResult["singleTenant"],
  },
  [
    row("Asking price", "$4,600,000", "p. 2"),
    row("Annual base rent", "$276,000"),
    row("EBITDAR (T-12)", "$720,000"),
    row("Lease expiration", "December 31, 2041"),
  ],
);

describe("an operating business on its real estate (pass 28, round 3)", () => {
  it("names the business from the deal's own words, never a center's tenant list", () => {
    expect(operatingBusinessOf(STATION)).toBe("fuel");
    expect(operatingBusinessOf(WASH)).toBe("car_wash");
    expect(operatingBusinessOf(deal({ assetClass: "Marina" }, []))).toBe("marina");
    expect(operatingBusinessOf(deal({ assetClass: "Golf Course" }, []))).toBe("golf");
    expect(operatingBusinessOf(deal({ assetClass: "RV Campground" }, []))).toBe("campground");
    expect(operatingBusinessOf(deal({ assetClass: "Childcare Center (NNN)" }, []))).toBe("childcare");
    expect(operatingBusinessOf(deal({ assetClass: "Funeral Home" }, []))).toBe("funeral");
    // A shopping center with a station on its outparcel is a center.
    const center = deal(
      {
        assetClass: "Grocery-anchored retail",
        tenants: [{ name: "Shell gas station (outparcel)" }, { name: "Kroger" }] as unknown as ExtractionResult["tenants"],
      },
      [],
    );
    expect(operatingBusinessOf(center)).toBeNull();
    expect(readGoingConcern(center, TODAY)).toBeNull();
  });

  it("reads a going concern: the operator's earnings, the contracts and the ground, as stated", () => {
    const r = readGoingConcern(STATION, TODAY)!;
    expect(r).toMatchObject({ business: "fuel", branch: "going_concern", beforeRent: false, rent: null, coverage: null, allocation: null });
    expect(r.ebitda).toMatchObject({ label: "EBITDA (T-12)", value: 410_000 });
    expect(r.stated).toEqual([
      { label: "Fuel supply agreement", value: "Shell branded supply through 2029" },
      { label: "Tank system", value: "Three double-walled fiberglass USTs, installed 2004" },
    ]);
    expect(r.phaseI).toBe("a recognized environmental condition");
    expect(r.headline).toBe(
      "The memorandum sells a fuel station and its store with its real estate: its earnings are the operation's, and a real estate cap struck on them prices the business as if it were rent. " +
        "It states EBITDA (T-12) of $410k: the operator's earnings, before a management fee and a reserve for the fixtures, never the real estate's NOI. " +
        "It states no split between the real estate, the fixtures and the business. " +
        "Fuel supply agreement, as stated: Shell branded supply through 2029. " +
        "Tank system, as stated: Three double-walled fiberglass USTs, installed 2004. " +
        "The seller's Phase I found a recognized environmental condition: the ground is the risk on a site an operation has run on.",
    );
    expect(goingConcernTag(STATION, TODAY)).toBe("Going concern");
    expect(goingConcernShortLine(r)).toBe("Fuel station and its store: sold with the business; EBITDA (T-12) $410k");
  });

  it("reads an operator's lease: the rent is the income, EBITDAR over it the coverage", () => {
    const r = readGoingConcern(WASH, TODAY)!;
    expect(r).toMatchObject({ business: "car_wash", branch: "operator_lease", beforeRent: true, rent: 276_000 });
    expect(r.coverage).toEqual({ times: 2.61, from: "ebitdar_over_rent" });
    expect(r.headline).toContain("The memorandum sells the real estate under a car wash, leased to its operator");
    expect(r.headline).toContain("before a management fee and a reserve for the fixtures and before rent, never the real estate's NOI");
    expect(r.headline).toContain("Its EBITDAR covers the $276k rent 2.61x.");
    expect(goingConcernTag(WASH, TODAY)).toBe("Operator lease, 2.61x coverage");
    // A coverage the memorandum states is read as stated.
    const stated = deal({ assetClass: "Car wash", singleTenant: WASH.singleTenant }, [row("Annual base rent", "$276,000"), row("Rent coverage", "2.4x")]);
    expect(readGoingConcern(stated, TODAY)!.coverage).toEqual({ times: 2.4, from: "stated" });
    // An EBITDA is after the rent: no coverage is read from it.
    const after = deal({ assetClass: "Car wash", singleTenant: WASH.singleTenant }, [row("Annual base rent", "$276,000"), row("EBITDA", "$450,000")]);
    const ra = readGoingConcern(after, TODAY)!;
    expect(ra.coverage).toBeNull();
    expect(ra.headline).toContain("Its EBITDA is after rent, so no coverage is read from it");
  });

  it("says the split only as the memorandum states it", () => {
    const split = deal({ assetClass: "Marina", strategy: { kind: "stabilized", summary: "Going concern sale", capitalBudget: "", timeline: "" } }, [
      row("Real estate value", "$8,500,000"),
      row("FF&E value", "$1,200,000"),
      row("Business value", "$2,300,000"),
      row("Submerged land lease", "State sovereignty submerged lands lease through 2031, $48,000 a year"),
    ]);
    const r = readGoingConcern(split, TODAY)!;
    expect(r.allocation).toEqual({ realEstate: 8_500_000, ffe: 1_200_000, business: 2_300_000 });
    expect(r.headline).toContain("The memorandum splits the price: real estate $8.50M, fixtures and equipment $1.20M, business $2.30M.");
    expect(r.headline).toContain("Submerged land lease, as stated: State sovereignty submerged lands lease through 2031, $48,000 a year.");
  });

  it("says the model capitalises the operation's income as rent, and is silent on a lease", () => {
    expect(goingConcernModelLine(readGoingConcern(STATION, TODAY), { noi1: 256_000, exitCapPct: 0.06 })).toBe(
      "The model capitalises its $256k year-one income at a 6.00% exit cap as if it were rent; on a fuel station and its store that income is the operation's, which the real estate does not earn without an operator, and the model allocates nothing to the business.",
    );
    expect(goingConcernModelLine(readGoingConcern(WASH, TODAY), { noi1: 276_000, exitCapPct: 0.06 })).toBeNull();
    expect(goingConcernModelLine(null, null)).toBeNull();
  });

  // The audit of 2026-10-05: the business was read from the deal's name and
  // its plan's summary, so an apartment building called "Marina Bay" was "a
  // marina", and a stated EBITDA made a hotel and a data center operating
  // businesses whose earnings were "before a management fee".
  it("never names a business from the deal's name or its summary, and reads no EBITDA alone on a class the site reads otherwise", () => {
    const units = [row("Asking price", "$40,000,000"), row("Units", "240"), row("NOI (in-place)", "$2,400,000")];
    const plan = (summary: string) => ({ strategy: { kind: "stabilized", summary, capitalBudget: "", timeline: "" } }) as Partial<ExtractionResult>;
    const none: [string, ExtractionResult][] = [
      ["Marina Bay Apartments", deal({ assetClass: "Multifamily", dealName: "Marina Bay Apartments" }, units)],
      ["The Residences at Country Club", deal({ assetClass: "Multifamily", dealName: "The Residences at Country Club" }, units)],
      [
        "a grocery center with a station outparcel",
        deal({ assetClass: "Retail", dealName: "Main Street Plaza", ...plan("Grocery-anchored center with a convenience store and gas station outparcel.") }, units),
      ],
      ["apartments beside a golf course", deal({ assetClass: "Multifamily", dealName: "Fairway Commons", ...plan("Renovate units in a community adjacent to a golf course.") }, units)],
      ["a strip with a daycare", deal({ assetClass: "Retail", dealName: "Oak Plaza", ...plan("Strip center with a daycare and a nail salon.") }, units)],
      ["Marina Corporate Center", deal({ assetClass: "Office", dealName: "Marina Corporate Center" }, units)],
      [
        "a hotel stating its EBITDA",
        deal({ assetClass: "Hotel", dealName: "Hampton Inn Downtown" }, [
          row("Asking price", "$42,000,000"),
          row("Keys", "150"),
          row("EBITDA (T-12)", "$3,400,000"),
          row("NOI (in-place)", "$2,900,000"),
        ]),
      ],
      ["a data center stating its EBITDA", deal({ assetClass: "Data Center", dealName: "DC-1" }, [row("Asking price", "$200,000,000"), row("EBITDA", "$14,000,000")])],
    ];
    for (const [what, d] of none) {
      expect(operatingBusinessOf(d), what).toBeNull();
      expect(readGoingConcern(d, TODAY), what).toBeNull();
      expect(goingConcernTag(d, TODAY), what).toBeNull();
    }
    // The class's own words still name it on a class the site reads otherwise.
    const station = deal({ assetClass: "Retail (convenience store / gas station)" }, [row("EBITDA", "$410,000")]);
    expect(operatingBusinessOf(station)).toBe("fuel");
    // And a single tenant's name names it where the class says nothing.
    const wash = deal({ assetClass: "Net lease", singleTenant: { ...WASH.singleTenant!, tenant: "Express Car Wash LLC" } }, [row("Annual base rent", "$276,000")]);
    expect(operatingBusinessOf(wash)).toBe("car_wash");
  });

  it("is no read where nothing names an operating business and no EBITDA is stated", () => {
    expect(readGoingConcern(deal({ assetClass: "Multifamily" }, [row("NOI (in-place)", "$1,200,000")]), TODAY)).toBeNull();
    // An EBITDA alone makes a read, with the business unnamed.
    const unnamed = readGoingConcern(deal({ assetClass: "Special purpose" }, [row("EBITDAR (T-12)", "$2,800,000")]), TODAY)!;
    expect(unnamed).toMatchObject({ business: null, branch: "unstated" });
    expect(unnamed.headline).toMatch(/^The property is an operating business; the memorandum does not say whether the business is sold with it or leased from it/);
    expect(readGoingConcern(null, TODAY)).toBeNull();
  });

  it("hands the challenger the facts, then the traps by name, and orders the key terms", () => {
    const note = goingConcernNote(readGoingConcern(STATION, TODAY)!);
    expect(note).toMatch(/^OPERATING BUSINESS AS STATED: The memorandum sells/);
    for (const trap of ["(a) THE ALLOCATION", "(b) THE OPERATOR", "(c) THE CONTRACTS", "(d) THE TANKS AND THE SITE", "(e) THE COVERAGE", "(f) THE EXIT"])
      expect(note).toContain(trap);
    expect(goingConcernContextLine(readGoingConcern(WASH, TODAY)!)).toMatch(/^Operating business: The memorandum sells the real estate/);
    expect(goingConcernTermRows(STATION.metrics as ReturnType<typeof row>[]).map((m) => m.label)).toEqual([
      "EBITDA (T-12)",
      "Fuel supply agreement",
      "Tank system",
    ]);
  });

  it("reads a care operation as one: a skilled nursing facility's EBITDAR over its rent, and its own facts as stated (round 6)", () => {
    const snf = deal(
      {
        assetClass: "Skilled Nursing Facility (NNN)",
        singleTenant: { tenant: "Harbor Care Operations LLC", guarantor: "", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "" } as ExtractionResult["singleTenant"],
      },
      [
        row("Asking price", "$18,000,000", "p. 2"),
        row("Licensed beds", "120"),
        row("Operating beds", "112"),
        row("Annual base rent", "$1,440,000"),
        row("EBITDAR (T-12)", "$2,016,000"),
        row("Payor mix", "Medicaid 68%, Medicare 14%, private 18%"),
        row("CMS star rating", "3 stars (Aug 2026)"),
      ],
    );
    const r = readGoingConcern(snf, TODAY)!;
    expect(r).toMatchObject({ business: "snf", branch: "operator_lease", rent: 1_440_000 });
    expect(r.coverage).toEqual({ times: 1.4, from: "ebitdar_over_rent" });
    expect(r.headline).toContain("The memorandum sells the real estate under a skilled nursing facility, leased to its operator");
    expect(r.headline).toContain("Its EBITDAR covers the $1.44M rent 1.40x.");
    expect(r.headline).toContain("Payor mix, as stated: Medicaid 68%, Medicare 14%, private 18%.");
    expect(r.headline).toContain("Licensed beds, as stated: 120.");
    expect(r.headline).toContain("Operating beds, as stated: 112.");
    expect(goingConcernTag(snf, TODAY)).toBe("Operator lease, 1.40x coverage");
    const note = goingConcernNote(r);
    for (const trap of ["(g) THE STRUCTURE", "(h) THE CHANGE OF OWNERSHIP", "(i) THE PAYOR MIX", "(j) SURVEYS AND STARS", "(k) LICENSED AND OPERATING BEDS"])
      expect(note).toContain(trap);
    // A community sold with its operations asks the structure's question.
    const al = readGoingConcern(deal({ assetClass: "Assisted Living / Memory Care" }, [row("Operating structure", "Owner-operated")]), TODAY)!;
    expect(al).toMatchObject({ business: "senior_care", branch: "unstated" });
    expect(al.headline).toContain("Operating structure, as stated: Owner-operated.");
    // The care traps ride only on a care operation.
    expect(goingConcernNote(readGoingConcern(STATION, TODAY)!)).not.toContain("CARE-OPERATION TRAPS");
  });

  it("writes every sentence without a glued word", () => {
    for (const d of [STATION, WASH]) {
      const r = readGoingConcern(d, TODAY)!;
      for (const text of [r.headline, goingConcernShortLine(r), goingConcernContextLine(r)]) expect(gluedWords(text)).toEqual([]);
    }
  });
});

describe("the prompt asks for what the reader reads", () => {
  it("names each operating-business row by a label the reader's own pattern takes", () => {
    const prompt = extractionInstruction("auto");
    const stated = new Map(STATED_ROWS.map(([label, re]) => [label, re] as const));
    const labels: [string, RegExp][] = [
      ["Rent coverage", COVERAGE_ROW],
      ["Market rent", MARKET_RENT_ROW],
      ...ALLOCATION_ROWS.map(([key, re]) => [{ realEstate: "Real estate value", ffe: "FF&E value", business: "Business value" }[key], re] as [string, RegExp]),
      ...[...stated.entries()],
    ];
    expect(labels).toHaveLength(17);
    for (const [label, re] of labels) {
      expect(prompt).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    // EBITDA and EBITDAR were asked for already, never under an NOI label.
    expect(prompt).toContain('under "EBITDA" or "EBITDAR" exactly as stated');
    // Each label, as the extraction writes it, is read.
    const r = readGoingConcern(
      deal({ assetClass: "Gas Station / Convenience Store" }, [
        row("Rent coverage", "2.4x"),
        row("Market rent", "$180,000 a year"),
        row("Real estate value", "$8,500,000"),
        row("FF&E value", "$1,200,000"),
        row("Business value", "$2,300,000"),
        ...[...stated.keys()].map((label) => row(label, `${label} as stated`)),
      ]),
      TODAY,
    )!;
    expect(r.coverage).toEqual({ times: 2.4, from: "stated" });
    expect(r.marketRent).toBe("$180,000 a year");
    expect(r.allocation).toEqual({ realEstate: 8_500_000, ffe: 1_200_000, business: 2_300_000 });
    expect(r.stated.map((s) => s.label)).toEqual([...stated.keys()]);
  });
});
