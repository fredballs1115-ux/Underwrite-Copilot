import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  rateWords,
  readSelfStorage,
  selfStorageTag,
  storageContextLine,
  storageModelLine,
  storageNote,
  storageRateOf,
  storageShortLine,
  storageTermRows,
} from "./self-storage";

const row = (label: string, value: string, page = "p. 5") => ({ label, value, page, flagged: false });
const facility = (metrics: ReturnType<typeof row>[], assetClass = "self_storage"): ExtractionResult =>
  ({ dealName: "Lakewood Self Storage", assetClass, totalPages: 50, metrics: [row("Asking price", "$9,800,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

describe("a self-storage facility, read as stated (#471)", () => {
  const full = facility([
    row("Units", "612"),
    row("Physical occupancy", "91%"),
    row("SF occupancy", "86%"),
    row("Economic occupancy", "84%"),
    row("In-place rent", "$1.38/SF/month"),
    row("Street rate", "$1.14/SF/month"),
    row("Climate-controlled", "38% of NRSF"),
    row("Tenant insurance", "62% penetration"),
    row("Management", "Third-party managed by Extra Space at 6% of revenue"),
    row("Storage SF per capita", "7.2 SF within 3 miles"),
  ]);

  it("reads the two occupancies apart, and the in-place rent against the street's on one footing", () => {
    const r = readSelfStorage(full)!;
    expect(r).toMatchObject({
      physicalPct: 91,
      sfPct: 86,
      economicPct: 84,
      economicGapPts: 7,
      leaseUp: false,
      premiumPct: 21.1,
      rollDownPct: 17.4,
      climatePct: 38,
      tenantInsurance: "62% penetration",
      management: { thirdParty: true, feePct: 6 },
      perCapita: "7.2 SF within 3 miles",
      page: "p. 5",
    });
    expect(r.headline).toContain(
      "It is 91% occupied by units, 86% by area, 84% economically: the 7 points between the units let and the rent collected are discounts, concessions and delinquency.",
    );
    expect(r.headline).toContain("By area it runs lower than by units: the small units fill first");
    expect(r.headline).toContain(
      "Sitting tenants pay $1.38/SF a month against a street rate of $1.14/SF a month: 21.1% over it, the premium years of rate increases built, and every move-out gives it back, since the unit re-lets at street. With every tenant at street the rent would be 17.4% lower",
    );
    expect(r.headline).toContain("It is managed by a third party, as stated (Third-party managed by Extra Space at 6% of revenue)");
    expect(r.headline).toContain("Tenant insurance, as stated: 62% penetration. It is the operator's program");
    expect(selfStorageTag(full)).toBe("In-place 21.1% over street, Economic 84%");
    expect(selfStorageTag(full, Infinity)).toBe("In-place 21.1% over street, Economic 84%, 3rd-party managed");
  });

  it("reads a rate's basis and period only from its words, and compares only on one footing", () => {
    expect(storageRateOf("$1.38/SF/month")).toMatchObject({ value: 1.38, basis: "sf", period: "month" });
    expect(storageRateOf("$16.56 per SF per year")).toMatchObject({ value: 16.56, basis: "sf", period: "year" });
    expect(storageRateOf("$118 per unit per month")).toMatchObject({ value: 118, basis: "unit", period: "month" });
    expect(storageRateOf("$1.10 - $1.30/SF")).toBeNull();
    expect(rateWords(storageRateOf("$118 per unit per month")!)).toBe("$118 a unit a month");
    // A yearly in-place rent against a monthly street rate is converted…
    const converted = readSelfStorage(facility([row("In-place rent", "$16.56/SF/yr"), row("Street rate", "$1.15/SF/mo")]))!;
    expect(converted.premiumPct).toBe(20);
    // …a per-unit figure is never set against a per-SF one…
    const apart = readSelfStorage(facility([row("In-place rent", "$118 per unit per month"), row("Street rate", "$1.15/SF/mo")]))!;
    expect(apart.premiumPct).toBeNull();
    expect(apart.headline).toContain("are not stated on one basis, so they are not compared");
    // …and two figures stated the same bare way compare as stated.
    expect(readSelfStorage(facility([row("In-place rent", "$1.20"), row("Street rate", "$1.00")]))!.premiumPct).toBe(20);
  });

  it("reads a facility under 85% by units as a lease-up, and says so first on the tag", () => {
    const r = readSelfStorage(facility([row("Occupancy", "72%"), row("Street rate", "$1.05/SF/month")]))!;
    expect(r.leaseUp).toBe(true);
    expect(r.headline).toContain("Under 85% by units, it is in lease-up");
    expect(selfStorageTag(facility([row("Occupancy", "72%"), row("Street rate", "$1.05/SF/month")]))).toBe("Lease-up, 72% occupied");
  });

  it("says sitting tenants under street as room, not a premium", () => {
    const r = readSelfStorage(facility([row("In-place rent", "$1.05/SF/month"), row("Street rate", "$1.14/SF/month")]))!;
    expect(r.premiumPct).toBe(-7.9);
    expect(r.rollDownPct).toBeNull();
    expect(r.headline).toContain("7.9% under it — room the rate increases have not yet taken");
    expect(selfStorageTag(facility([row("In-place rent", "$1.05/SF/month"), row("Street rate", "$1.14/SF/month")]))).toBe("In-place 7.9% under street");
  });

  it("says what the model does with the premium and a lease-up", () => {
    const r = readSelfStorage(full)!;
    expect(storageModelLine(r, { rentAnnual: 1_000_000, exitCapPct: 0.06, vacancyPct: 9 })).toBe(
      "The model grows today's rent, the rate increases' premium included; with every tenant at street its year-one rent would be $174k lower, $2.9M at its 6.00% exit cap — a downside it does not run.",
    );
    const lease = readSelfStorage(facility([row("Occupancy", "72%"), row("Street rate", "$1.05/SF/month")]))!;
    expect(storageModelLine(lease, { rentAnnual: 800_000, exitCapPct: 0.06, vacancyPct: 28 })).toBe(
      "Its 28% vacancy is held flat across its years: a lease-up to a stabilized occupancy is in none of them.",
    );
  });

  it("is null on anything but storage, and where the memorandum states nothing storage is read by", () => {
    expect(readSelfStorage(facility([row("Units", "240"), row("Occupancy", "95%")], "multifamily"))).toBeNull();
    expect(readSelfStorage(facility([row("Units", "612"), row("Occupancy", "91%")]))).toBeNull();
    expect(readSelfStorage(facility([row("Economic occupancy", "N/A"), row("Street rate", "—")]))).toBeNull();
    expect(readSelfStorage(null)).toBeNull();
    // A street rate beside an in-place rent reads where no class was read,
    // and never on a deal read as another class: apartments quote street
    // rents too.
    expect(readSelfStorage(facility([row("In-place rent", "$1.20/SF/mo"), row("Street rate", "$1.00/SF/mo")], "auto"))?.premiumPct).toBe(20);
    expect(readSelfStorage(facility([row("In-place rent", "$1,850/unit/mo"), row("Street rate", "$1,795/unit/mo")], "multifamily"))).toBeNull();
  });

  it("says it in one line, hands the steps after the extraction the read, and leads the key terms", () => {
    const r = readSelfStorage(full)!;
    expect(storageShortLine(r)).toBe(
      "Self-storage: 91% occupied by units, 84% economic; in-place $1.38/SF a month against street $1.14/SF a month (+21.1%); 38% climate-controlled; third-party managed",
    );
    expect(storageContextLine(r)).toMatch(/^Self-storage: It is 91% occupied by units/);
    expect(storageNote(r)).toContain("SELF-STORAGE AS STATED:");
    expect(storageTermRows(full.metrics).map((m) => m.label)).toEqual(["Economic occupancy", "Street rate", "In-place rent"]);
  });
});

describe("the prompt asks for what the reader reads (#471)", () => {
  it("names every storage row by the label the reader takes", () => {
    const prompt = extractionInstruction("self_storage" as never);
    for (const label of [
      "Physical occupancy",
      "SF occupancy",
      "Economic occupancy",
      "In-place rent",
      "Street rate",
      "Climate-controlled",
      "Tenant insurance",
      "Management",
      "Expansion",
      "Storage SF per capita",
    ]) {
      expect(prompt).toContain(`"${label}"`);
    }
  });
});
