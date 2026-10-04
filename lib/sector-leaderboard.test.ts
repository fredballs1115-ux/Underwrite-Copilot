import { describe, expect, it } from "vitest";
import { sectorLeaderboard, sectorStandings, sharedAreaFor, sharedFigureWords } from "./sector-leaderboard";
import { areaLabel, isUndated, olderThanAYear, periodEnds } from "./tracker-read";
import { metroFact } from "@/app/markets-marquee";
import metrosSeed from "@/data/research/metros.json";

// The research pass of 2026-10-01 found the tracker rankings claiming more
// than the data: one regional figure ranked once per jurisdiction, undated
// and year-old figures ranked, bands ranked by a midpoint no source states.
const TODAY = "2026-10-01";
const board = (sector: string, today = TODAY) => sectorLeaderboard(sector, today);
const rowOf = (sector: string, id: string, today = TODAY) => board(sector, today).rows.find((r) => r.markets.some((m) => m.id === id))!;

describe("periodEnds — the last day each dated part of a period covers", () => {
  it("reads quarters, halves, year-ends, months and bare years", () => {
    expect(periodEnds("Q2 2026")).toEqual(["2026-06-30"]);
    expect(periodEnds("year-end 2025")).toEqual(["2025-12-31"]);
    expect(periodEnds("2024")).toEqual(["2024-12-31"]);
    expect(periodEnds("Q4 2024")).toEqual(["2024-12-31"]);
    expect(periodEnds("mid-2026")).toEqual(["2026-06-30"]);
    expect(periodEnds("H2 2025")).toEqual(["2025-12-31"]);
    expect(periodEnds("April 2026")).toEqual(["2026-04-30"]);
    expect(periodEnds("Q1 and Q2 2026")).toEqual(["2026-03-31", "2026-06-30"]);
    expect(periodEnds("KLNB's Q1 2026 and CBRE's Q2 2026")).toEqual(["2026-03-31", "2026-06-30"]);
    expect(periodEnds("its 2026 Market Review, presented March 2026")).toEqual(["2026-03-31", "2026-12-31"]);
    expect(periodEnds("late 2025 / early 2026")).toEqual(["2025-12-31", "2026-03-31"]);
    expect(periodEnds(null)).toEqual([]);
    expect(periodEnds("the latest survey")).toEqual([]);
  });

  it("calls a figure undated or over a year old only from what its period says", () => {
    expect(isUndated({ period: null })).toBe(true);
    expect(isUndated({ period: "Q1 2026 for Newmark, the ODU survey undated" })).toBe(true);
    expect(isUndated({ period: "Q2 2026" })).toBe(false);
    expect(olderThanAYear({ period: "2024" }, TODAY)).toBe(true);
    expect(olderThanAYear({ period: "Q4 2024" }, TODAY)).toBe(true);
    expect(olderThanAYear({ period: "year-end 2025" }, TODAY)).toBe(false);
    expect(olderThanAYear({ period: "year-end 2025" }, "2027-01-15")).toBe(true);
    expect(areaLabel("Suburban Maryland (Montgomery and Prince George's together, not a county split)")).toBe("Suburban Maryland");
    expect(areaLabel("the Washington DC region")).toBe("Washington DC region");
  });
});

describe("sectorLeaderboard — one row a figure, ranked only where the sources state a place", () => {
  it("makes one row of a figure several markets read, naming every one of them and whose figure it is", () => {
    const dmv = rowOf("multifamily", "montgomery_county");
    expect(dmv.markets.map((m) => m.id)).toEqual(["dc", "pg_county", "montgomery_county", "nova"]);
    expect(dmv.sharedArea).toBe("Washington DC region");
    // The region's figure names no publisher: one row, listed, not ranked.
    expect(dmv).toMatchObject({ rank: null, reason: "publisher not recorded" });
    expect(sharedFigureWords(dmv)).toBe("Washington DC region — Washington DC, Prince George's County MD, Montgomery County MD, Northern Virginia");
    const suburban = rowOf("office", "pg_county");
    expect(suburban.markets.map((m) => m.id)).toEqual(["pg_county", "montgomery_county"]);
    expect(suburban.sharedArea).toBe("Suburban Maryland");
    expect(suburban.rank).not.toBeNull();
    // One rank for the figure, never one a jurisdiction: each place is its
    // position among the ranked rows, and an equal figure — the same
    // loosest end, a point beside a point — shares the place before it.
    const loosest = (r: { vLow: number | null; vHigh: number | null }) => r.vHigh ?? r.vLow;
    const point = (r: { vLow: number | null; vHigh: number | null }) => r.vHigh === null || r.vHigh === r.vLow;
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      const rows = board(sector).rows.filter((r) => r.rank !== null);
      rows.forEach((r, i) => {
        const prev = rows[i - 1];
        const equal = !!prev && loosest(prev) === loosest(r) && point(prev) === point(r);
        expect(r.rank, `${sector} ${r.id}`).toBe(equal ? prev.rank : i + 1);
      });
    }
  });

  it("gives equal figures one place, never an order by name (the audit of 2026-10-04)", () => {
    // Miami's and New York's industrial vacancy are both 7.7% for Q2 2026:
    // they had read #5 and #6, apart only by their names.
    const miami = rowOf("industrial", "miami");
    const nyc = rowOf("industrial", "nyc");
    expect(miami.vLow).toBe(7.7);
    expect(nyc.vLow).toBe(7.7);
    expect(miami.rank).not.toBeNull();
    expect(nyc.rank).toBe(miami.rank);
    expect(miami.tied && nyc.tied).toBe(true);
    // The next figure takes its own position's place, never the next number.
    expect(rowOf("industrial", "norfolk_hampton_roads").rank).toBe(miami.rank! + 2);
    const s = sectorStandings(["industrial"], TODAY).industrial;
    expect(s.miami).toMatchObject({ rank: miami.rank, tied: true });
    expect(s.nyc).toMatchObject({ rank: miami.rank, tied: true });
    // A figure no other ranked row equals is not marked tied.
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      const rows = board(sector).rows.filter((r) => r.rank !== null);
      for (const r of rows) expect(r.tied, `${sector} ${r.id}`).toBe(rows.filter((x) => x.rank === r.rank).length > 1);
    }
  });

  it("never ranks a figure whose publisher the file does not record", () => {
    // Chicago's 4.7% industrial ("publisher not recorded, 2026") had been #1.
    expect(rowOf("industrial", "chicago")).toMatchObject({ rank: null, reason: "publisher not recorded" });
    expect(rowOf("office", "dallas")).toMatchObject({ rank: null, reason: "publisher not recorded" });
    expect(rowOf("office", "chicago")).toMatchObject({ rank: null, reason: "publisher not recorded" });
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      for (const r of board(sector).rows.filter((x) => x.rank !== null)) {
        expect(r.figures.find((f) => f.label === "Vacancy")?.read.house, `${sector} ${r.id}`).toBeTruthy();
      }
    }
  });

  it("never carries one vacancy figure, under one read, on two rows", () => {
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      const keys = board(sector)
        .rows.filter((r) => r.vLow !== null)
        .map((r) => JSON.stringify([r.vLow, r.vHigh, r.figures.find((f) => f.label === "Vacancy")?.read]));
      expect(new Set(keys).size, sector).toBe(keys.length);
    }
  });

  it("lists an undated, a year-old or a narrower-stock figure after the ranked rows, with the reason", () => {
    const nova = rowOf("industrial", "nova");
    expect(nova.rank).toBeNull();
    expect(nova.reason).toBe("publisher not recorded; undated; small-bay space only; a spread of two reads");
    expect(rowOf("multifamily", "chicago").reason).toBe("undated; a spread of two reads");
    expect(rowOf("retail", "newark_jc")).toMatchObject({ rank: null, reason: "2024, over a year old" });
    expect(rowOf("retail", "richmond")).toMatchObject({ rank: null, reason: "undated" });
    // Ranked rows first, then the unranked, then the rows with no vacancy figure.
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      const rows = board(sector).rows;
      const firstUnranked = rows.findIndex((r) => r.rank === null);
      if (firstUnranked >= 0) expect(rows.slice(firstUnranked).every((r) => r.rank === null), sector).toBe(true);
    }
  });

  it("never ranks a band of two reads, and places a printed range by its loosest end", () => {
    // Norfolk's 7.1–12.7% (one end from an undated survey) was #1 office and
    // Baltimore's 10–20.9% (two inventories) ranked by its midpoint.
    expect(rowOf("office", "norfolk_hampton_roads")).toMatchObject({ rank: null });
    expect(rowOf("office", "baltimore")).toMatchObject({ rank: null, reason: "a spread of two reads" });
    expect(rowOf("office", "dc")).toMatchObject({ rank: null, reason: "a spread of two reads" });
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      for (const r of board(sector).rows.filter((x) => x.rank !== null)) {
        expect(r.vHigh === r.vLow || r.printedBand, `${sector} ${r.id} is a band`).toBe(true);
      }
    }
    // Hampton Roads retail is one review's printed 4.4–4.6%: ranked by 4.6,
    // after Atlanta's 4.6% point and before Dallas's 5.1%.
    const retail = board("retail").rows;
    const norfolk = retail.find((r) => r.id === "norfolk_hampton_roads")!;
    expect(norfolk).toMatchObject({ vLow: 4.4, vHigh: 4.6, printedBand: true, reason: null });
    const atlanta = retail.find((r) => r.id === "atlanta")!;
    const dallas = retail.find((r) => r.id === "dallas")!;
    expect(norfolk.rank).toBe(atlanta.rank! + 1);
    expect(dallas.rank).toBe(norfolk.rank! + 1);
  });

  it("reads the day it is given: a figure ages out of the ranking", () => {
    // Philadelphia's Q2 2026 apartment figure is ranked on Oct 1, 2026 and
    // not once a year has passed since its quarter ended.
    expect(rowOf("multifamily", "philadelphia").rank).not.toBeNull();
    expect(rowOf("multifamily", "philadelphia", "2027-07-15")).toMatchObject({ rank: null, reason: "Q2 2026, over a year old" });
    // The DMV region's year-end 2025 figure names no publisher, and ages.
    expect(rowOf("multifamily", "dc", "2027-01-15")).toMatchObject({ rank: null, reason: "publisher not recorded; year-end 2025, over a year old" });
  });

  it("gives each market its standing, shared or not", () => {
    const s = sectorStandings(["office", "multifamily"], TODAY);
    expect(s.office.pg_county.rank).toBe(s.office.montgomery_county.rank);
    expect(s.office.pg_county.row).toBe(s.office.montgomery_county.row);
    expect(s.office.dc).toMatchObject({ rank: null, reason: "a spread of two reads" });
    expect(s.multifamily.nova.total).toBe(board("multifamily").ranked);
  });
});

describe("a market's tile names whose figure it shows, never the county's", () => {
  const entry = (id: string) => metrosSeed.metros.find((m) => m.id === id)!;
  it("says Suburban Maryland on Montgomery County's office figure, and the region on the DMV's apartments", () => {
    expect(sharedAreaFor("office", "montgomery_county")).toBe("Suburban Maryland");
    expect(sharedAreaFor("office", "chicago")).toBeNull();
    // The tile rotates through the sectors that carry a vacancy figure.
    const office = metroFact(entry("montgomery_county"), 0)!;
    expect(office.text).toMatch(/^Office 19\.2% vac \(Suburban Maryland, Q1 2026\)/);
    const apartments = metroFact(entry("montgomery_county"), 1)!;
    expect(apartments.text).toMatch(/^Multifamily 5\.2% vac \(Washington DC region, year-end 2025\)/);
    // A market's own figure is said as before.
    expect(metroFact(entry("chicago"), 0)!.text).toMatch(/^Office 27\.3% vac \(Q1 2026\)/);
  });
});
