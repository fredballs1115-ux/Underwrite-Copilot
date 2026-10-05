import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
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

  it("writes every sentence without a glued word", () => {
    for (const d of [STATION, WASH]) {
      const r = readGoingConcern(d, TODAY)!;
      for (const text of [r.headline, goingConcernShortLine(r), goingConcernContextLine(r)]) expect(gluedWords(text)).toEqual([]);
    }
  });
});
