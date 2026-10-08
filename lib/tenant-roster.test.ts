import { describe, expect, it } from "vitest";
import type { ExtractionResult, ExtractedTenant } from "@/lib/anthropic/types";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  ROSTER_HOLD_YEARS,
  readRoster,
  rentOf,
  rosterContextLine,
  rosterModelLine,
  rosterNote,
  rosterShortLine,
  rosterTag,
  rosterTermRows,
  statedWaltYears,
} from "./tenant-roster";
import { gluedWords } from "./render-lint";

// Every read is on one day, so every "years left" is fixed.
const TODAY = new Date(Date.UTC(2026, 8, 30));

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 12"): Row => ({ label, value, flagged: false, page, basis: "na" });
const tenant = (over: Partial<ExtractedTenant> & Pick<ExtractedTenant, "name">): ExtractedTenant => ({
  role: "inline",
  inSale: "yes",
  sf: "",
  rent: "",
  leaseExpiration: "",
  options: "",
  earlyTermination: "",
  rights: "",
  page: "p. 12",
  ...over,
});

/** A grocery-anchored center: Kroger in the sale and free to go dark,
 *  Target beside it and not in the sale, a kick-out, two co-tenancy
 *  clauses, a tenant month to month and a lease stated by its year. */
const CENTER = (over: Partial<ExtractionResult> = {}, tenants?: ExtractedTenant[]): ExtractionResult =>
  ({
    dealName: "Maple Grove Crossing",
    assetClass: "retail",
    totalPages: 40,
    metrics: [row("Total SF", "112,000 SF", "p. 2"), row("NOI (in-place)", "$1,420,000", "p. 2"), row("WALT", "6.8 years", "p. 12")],
    tenants: tenants ?? [
      tenant({ name: "Kroger", role: "anchor", sf: "58,000 SF", rent: "$725,000", leaseExpiration: "January 31, 2034", options: "Six 5-year options", rights: "Right to go dark; no continuous operating covenant" }),
      tenant({ name: "Target", role: "anchor", inSale: "no", sf: "125,000 SF" }),
      tenant({ name: "Staples", sf: "20,000 SF", rent: "$18.00/SF", leaseExpiration: "June 30, 2029" }),
      tenant({ name: "PetSmart", sf: "18,000 SF", rent: "$310,000", leaseExpiration: "2029" }),
      tenant({ name: "Chipotle", role: "outparcel", sf: "2,400 SF", rent: "$96,000", leaseExpiration: "March 31, 2031", rights: "Co-tenancy: may pay 50% of rent if Kroger ceases operating" }),
      tenant({ name: "Great Clips", sf: "1,200 SF", rent: "$28.50/SF", leaseExpiration: "Month-to-month", rights: "Co-tenancy tied to Kroger" }),
      tenant({ name: "Mattress Firm", sf: "4,000 SF", rent: "$26/SF", leaseExpiration: "December 31, 2032", earlyTermination: "December 31, 2027", rights: "Sales kick-out after year 5" }),
    ],
    ...over,
  }) as unknown as ExtractionResult;

describe("rentOf — the year's rent from what the memorandum states", () => {
  it("reads a year's figure, a figure a foot to the cent, and a month's", () => {
    expect(rentOf("$725,000", 58_000)).toEqual({ annual: 725_000, psf: 725_000 / 58_000 });
    expect(rentOf("$28.50/SF", 1_200)).toEqual({ annual: 34_200, psf: 28.5 });
    expect(rentOf("$12.50 PSF NNN", null)).toEqual({ annual: null, psf: 12.5 });
    expect(rentOf("$1.25/SF/month", 1_000)).toEqual({ annual: 15_000, psf: 15 });
    expect(rentOf("$8,000/mo", 2_000)).toEqual({ annual: 96_000, psf: 48 });
  });

  it("reads a year's rent with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no rent.
    expect(rentOf("$725,000 (NNN, 10-year term)", 58_000)).toEqual({ annual: 725_000, psf: 725_000 / 58_000 });
    expect(rentOf("$725,000 (non-cancellable)", null)).toEqual({ annual: 725_000, psf: null });
    // Its bumps after a dash are words after the rent (audit C3a).
    expect(rentOf("$725,000 – 3% annual bumps", null)).toEqual({ annual: 725_000, psf: null });
    expect(rentOf("$12.50/SF — 2.5% increases", 2_000)).toEqual({ annual: 25_000, psf: 12.5 });
  });

  it("a range is two figures and reads as none; a blank is null", () => {
    expect(rentOf("$18-$22/SF", 1_000)).toEqual({ annual: null, psf: null });
    expect(rentOf("", 1_000)).toEqual({ annual: null, psf: null });
    expect(rentOf("Confidential", 1_000)).toEqual({ annual: null, psf: null });
  });
});

describe("readRoster — the tenants a memorandum lists, against the model's sale", () => {
  it("holds the hold to the model's", () => {
    expect(ROSTER_HOLD_YEARS).toBe(HOLD_MONTHS / 12);
  });

  it("reads the listed tenants, the shadow anchor apart, and the roll by rent", () => {
    const r = readRoster(CENTER(), TODAY)!;
    expect(r.tenants.map((t) => t.name)).toEqual(["Kroger", "Staples", "PetSmart", "Mattress Firm", "Chipotle", "Great Clips"]);
    expect(r.shadow.map((t) => t.name)).toEqual(["Target"]);
    expect(r.listedSf).toBe(103_600);
    expect(r.buildingSf).toBe(112_000);
    expect(Math.round(r.coveragePct!)).toBe(93);
    expect(r.rollBasis).toBe("rent");
    // Great Clips month to month in year 1, Mattress Firm's kick-out in
    // year 2 (its lease runs to 2032), Staples and PetSmart in year 3 (a
    // year alone is read as its first day), Chipotle in year 5; Kroger
    // runs past the sale.
    expect(r.years.map((y) => [y.year, y.sharePct, y.tenants])).toEqual([
      [1, 2.1, ["Great Clips"]],
      [2, 6.4, ["Mattress Firm"]],
      [3, 41.1, ["Staples", "PetSmart"]],
      [4, 0, []],
      [5, 5.9, ["Chipotle"]],
    ]);
    expect(r.rollWithinHoldPct).toBe(55.5);
    expect(r.worst?.year).toBe(3);
    expect(r.largest).toEqual({ name: "Kroger", sharePct: 44.5 });
    expect(r.coTenancy).toEqual({ names: ["Chipotle", "Great Clips"], sf: 3_600, sharePct: 8 });
    expect(r.goDark).toEqual(["Kroger"]);
    expect(r.statedWalt).toBe(6.8);
    expect(r.unplaced).toEqual([]);
  });

  it("says what the list covers, the roll and its worst year, the WALT by rent, the break, the anchor outside the sale and the clauses", () => {
    const r = readRoster(CENTER(), TODAY)!;
    expect(r.headline).toContain("The memorandum lists six tenants on 103,600 SF, 93% of the building's 112,000 SF; every figure here is theirs.");
    expect(r.headline).toContain("Of their rent, 56% expires before the model's sale in year 5 — the most in year 3, when Staples and PetSmart roll (41%).");
    expect(r.headline).toMatch(/The memorandum quotes a WALT of 6\.8 years; weighted by rent, the leases it lists run 5\.0 years\./);
    expect(r.headline).toContain("The largest, Kroger, pays 45% of the listed rent.");
    expect(r.headline).toContain(
      "Target anchors the property but is not part of the offering, as stated: the buyer buys the traffic it draws, not its rent, and it can close, sell or redevelop without the buyer's say.",
    );
    expect(r.headline).toContain("Two tenants' leases carry co-tenancy rights (8% of the listed rent), as stated");
    expect(r.headline).toContain("Kroger may go dark, as stated: it can close and keep paying");
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("a break is the lease's end: the kick-out takes years off the term to the first date each tenant may leave", () => {
    const r = readRoster(CENTER(), TODAY)!;
    expect(r.roll!.waltToBreak!).toBeLessThan(r.roll!.waltByRent!);
    expect(r.headline).toMatch(/Early termination rights take 0\.4 years off that: to the first date each tenant may leave, 4\.6 years\./);
  });

  it("a break already open, or open today, rolls in year 1 in the list, the shares and the headline alike (the audit of 2026-10-04)", () => {
    // The grocer may leave from January 1, 2026: read on October 4 that
    // right is open. The list had put it in year 1 at 0% while the schedule
    // counted its rent at the 2029 expiry, under nobody's name.
    const day = new Date(Date.UTC(2026, 9, 4));
    for (const earlyTermination of ["January 1, 2026", "October 4, 2026"]) {
      const r = readRoster(
        CENTER({}, [
          tenant({ name: "Grocer", role: "anchor", sf: "40,000 SF", rent: "$600,000", leaseExpiration: "December 31, 2029", earlyTermination }),
          tenant({ name: "Pharmacy", sf: "10,000 SF", rent: "$300,000", leaseExpiration: "March 31, 2035" }),
        ]),
        day,
      )!;
      const year1 = r.years.find((y) => y.year === 1)!;
      expect(year1, earlyTermination).toEqual({ year: 1, sharePct: 66.7, tenants: ["Grocer"] });
      for (const y of r.years) expect(y.sharePct > 0, `${earlyTermination} year ${y.year}`).toBe(y.tenants.length > 0);
      expect(r.worst, earlyTermination).toEqual(year1);
      expect(r.headline, earlyTermination).toContain("Of their rent, 67% expires before the model's sale in year 5 — the most in year 1, when Grocer rolls (67%).");
    }
  });

  it("reads by area where the list states no rents, and names the tenants it cannot place", () => {
    const r = readRoster(
      CENTER({}, [
        tenant({ name: "Suite 100 — Acme Law", sf: "12,000 SF", leaseExpiration: "2028" }),
        tenant({ name: "Suite 200 — Birch Health", sf: "8,000 SF", leaseExpiration: "2035" }),
        tenant({ name: "Suite 300 — Cedar Tech", sf: "6,000 SF" }),
      ]),
      TODAY,
    )!;
    expect(r.rollBasis).toBe("area");
    expect(r.rollWithinHoldPct).toBe(60);
    expect(r.largest).toBeNull();
    expect(r.unplaced).toEqual(["Suite 300 — Cedar Tech"]);
    expect(r.headline).toContain("Of their space, 60% expires before the model's sale in year 5");
    expect(r.headline).toContain("Suite 300 — Cedar Tech states no area or no lease end, so it is not in the schedule.");
  });

  it("nothing on one tenant, a single-tenant lease, a leased fee, housing, or an extraction from before", () => {
    expect(readRoster(CENTER({}, [tenant({ name: "Kroger", sf: "58,000 SF" })]), TODAY)).toBeNull();
    const single = CENTER({ singleTenant: { tenant: "Kroger", guarantor: "", leaseType: "", landlordObligations: "", tenantRights: "", page: "" } } as Partial<ExtractionResult>);
    expect(readRoster(single, TODAY)).toBeNull();
    expect(readRoster(CENTER({ interest: { kind: "leased_fee", summary: "", share: "", groundLease: "", loan: "", page: "" } } as Partial<ExtractionResult>), TODAY)).toBeNull();
    expect(readRoster(CENTER({ assetClass: "multifamily" }), TODAY)).toBeNull();
    expect(readRoster(CENTER({ tenants: undefined }), TODAY)).toBeNull();
    expect(readRoster(null, TODAY)).toBeNull();
  });

  it("each tenant once, and an anchor not in the sale is never counted in the roll", () => {
    const twice = CENTER({}, [
      tenant({ name: "Staples", sf: "20,000 SF", rent: "$360,000", leaseExpiration: "June 30, 2029" }),
      tenant({ name: "staples", sf: "20,000 SF", rent: "$360,000", leaseExpiration: "June 30, 2029" }),
      tenant({ name: "Target", role: "anchor", inSale: "no", sf: "125,000 SF", rent: "$1,000,000", leaseExpiration: "2027" }),
      tenant({ name: "PetSmart", sf: "18,000 SF", rent: "$310,000", leaseExpiration: "2040" }),
    ]);
    const r = readRoster(twice, TODAY)!;
    expect(r.tenants.map((t) => t.name)).toEqual(["Staples", "PetSmart"]);
    expect(r.roll!.totalRent).toBe(670_000);
  });
});

describe("the roster on every summary", () => {
  it("the model line says the leasing capital it does not carry and the vacancy it holds flat through the cliff", () => {
    const r = readRoster(CENTER(), TODAY)!;
    const line = rosterModelLine(r, { holdMonths: 60, tiPsf: 0, lcPct: 0, vacancyPct: 0.06 });
    expect(line).toBe(
      "The model carries no leasing capital — its tenant improvements and commissions are placeholders of zero — while 56% of the listed rent expires before its sale in year 5: re-leasing that space is in none of its returns. Enter a TI and a commission a foot, or price the roll on the rollover card. Its vacancy stays at 6% through year 3, when 41% rolls at once.",
    );
    expect(rosterModelLine(r, { holdMonths: 60, tiPsf: 20, lcPct: 0.05, vacancyPct: 0.06 })).toContain("56% of the listed rent expires before the model's sale in year 5.");
  });

  it("the tag, the short line, the context and the traps", () => {
    expect(rosterTag(CENTER(), TODAY)).toBe("Shadow-anchored, 56% rolls in 5 yrs");
    const r = readRoster(CENTER(), TODAY)!;
    expect(rosterShortLine(r)).toBe(
      "Six tenants listed on 93% of the building; 56% of their rent expires before year 5, the most in year 3; Kroger pays 45% of the listed rent; Target anchors it from outside the sale; two tenants hold co-tenancy rights",
    );
    const context = rosterContextLine(r);
    expect(context.startsWith("The tenants: The memorandum lists six tenants")).toBe(true);
    expect(context).toContain("As listed: Kroger (anchor, 58,000 SF, $725,000 a year, ends Jan 2034)");
    expect(context).toContain("Mattress Firm (4,000 SF, $104,000 a year, ends Dec 2032, may leave Dec 2027)");
    expect(context).toContain("Great Clips (1,200 SF, $34,200 a year, month to month)");
    const note = rosterNote(r);
    expect(note).toContain("MULTI-TENANT TRAPS, checked by name");
    expect(note).toContain("(a) THE ROLL");
    expect(note).toContain("(g) THE SHADOW ANCHOR — Target is not bought");
    expect(note).toContain("(h) CO-TENANCY AND GO-DARK");
    expect(gluedWords(`${note} ${rosterShortLine(r)}`)).toEqual([]);
  });

  it("a roster rolling little and with no shadow anchor carries no tag", () => {
    const quiet = CENTER({}, [
      tenant({ name: "Acme", sf: "40,000 SF", rent: "$800,000", leaseExpiration: "2036" }),
      tenant({ name: "Birch", sf: "10,000 SF", rent: "$150,000", leaseExpiration: "2029" }),
    ]);
    expect(rosterTag(quiet, TODAY)).toBeNull();
    const r = readRoster(quiet, TODAY)!;
    expect(r.rollWithinHoldPct).toBe(15.8);
  });

  it("the quoted WALT: its row leads the key terms, read in years or months", () => {
    expect(statedWaltYears(CENTER())?.years).toBe(6.8);
    expect(statedWaltYears(CENTER({ metrics: [row("Weighted average lease term", "74 months")] }))?.years).toBe(6.2);
    expect(rosterTermRows(CENTER().metrics).map((m) => m.label)).toEqual(["WALT"]);
  });

  it("the prompt asks for the fields the reader reads, and the WALT row by its label", () => {
    const prompt = extractionInstruction("retail" as never);
    for (const field of ["`tenants`", "`role`", "`inSale`", "`sf`", "`rent`", "`leaseExpiration`", "`options`", "`earlyTermination`", "`rights`"]) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain('a row "WALT"');
    expect(prompt).toContain("a shadow anchor");
  });
});
