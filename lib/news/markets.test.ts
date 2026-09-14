import { describe, expect, it } from "vitest";
import { headlineMarkets } from "./markets";

const ids = (title: string, snippet = "") => headlineMarkets({ title, snippet }).map((m) => m.id);

describe("headlineMarkets", () => {
  it("tags the covered market a headline names, linking to its brief", () => {
    const [atl] = headlineMarkets({ title: "Investor takes over distressed Atlanta apartment asset" });
    expect(atl).toMatchObject({ id: "atlanta", label: "Atlanta", href: "/market?metro=atlanta" });
    expect(atl.name.length).toBeGreaterThan(0);
    expect(ids("PGIM refis Manhattan office-to-storage conversion")).toEqual(["nyc"]);
    expect(ids("Fort Worth industrial park sells")).toEqual(["dallas"]);
    expect(ids("Bay Area office vacancy hits a record")).toEqual(["san_francisco"]);
    expect(ids("Hampton Roads apartments trade")).toEqual(["norfolk_hampton_roads"]);
  });

  it("reads the snippet too, and never tags the same market twice", () => {
    expect(ids("Lender takes back tower", "The Chicago loop office defaulted in Chicago's worst quarter.")).toEqual([
      "chicago",
    ]);
  });

  it("leaves a word that names two places alone", () => {
    expect(ids("Washington passes statewide rent cap")).toEqual([]);
    expect(ids("Arlington council votes on zoning")).toEqual([]);
    expect(ids("Richmond apartments sell")).toEqual([]);
    expect(ids("Richmond, VA apartments sell")).toEqual(["richmond"]);
    expect(ids("Washington, D.C. office conversion approved")).toEqual(["dc"]);
    expect(ids("D.C. office conversion approved")).toEqual(["dc"]);
  });

  it("matches on word boundaries, so a name inside a word does not count", () => {
    expect(ids("Miamian developer buys land")).toEqual([]);
    expect(ids("Bostonian Society sells its hall")).toEqual([]);
    expect(ids("Burger King signs a lease")).toEqual([]);
  });

  it("caps at two, in the table's order", () => {
    expect(ids("Boston, Miami and Seattle lead the rent rebound")).toEqual(["boston", "seattle"]);
  });

  it("tags nothing on a headline naming no covered market", () => {
    expect(ids("Fed holds rates as CMBS delinquencies climb")).toEqual([]);
    expect(ids("Phoenix industrial park sells")).toEqual([]);
  });
});
