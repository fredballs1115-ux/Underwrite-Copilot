import { describe, expect, it } from "vitest";
import { assetClassLabel } from "./asset-class";
import { readMetroRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW } from "./live-rates.fixture";
import { metroDemand } from "./metro-demand";

// Washington's payrolls and four of its five sectors, one row each; the
// leisure figure is a year old.
const ROWS: RateRow[] = [
  { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
  { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
  { series_id: "SMU11479004300000001SA_YOY", obs_date: "2026-08-01", value: 0.6 },
  { series_id: "SMU11479004200000001SA_YOY", obs_date: "2026-08-01", value: -0.4 },
  { series_id: "WASH911LEIH_YOY", obs_date: "2025-08-01", value: 2.9 },
];

const RENTAL_HOUSING = "Rental housing runs on all payrolls, drawn first; the sectors beneath say where the metro area's jobs are growing.";

describe("metroDemand — the metro area's payrolls by sector as a picture's rows, with this building's sector marked", () => {
  it("puts all payrolls first, marks the deal's sector, keeps a stale sector and names it, and dates the newest month", () => {
    const d = metroDemand(readMetroRates("dc", ROWS, FIXTURE_NOW), "office")!;
    expect(d.area).toBe("Washington MSA");
    expect(d.newestMonth).toBe("Aug 2026");
    expect(d.mine).toBe("Professional & business services");
    expect(d.intro).toBe(
      "Professional & business services is the sector that fills this building's kind, drawn full; the metro area's other sectors are beside it, faded, and all payrolls first.",
    );
    expect(d.rows.map((r) => [r.label, r.text, r.all, r.mine, r.fresh])).toEqual([
      ["All payrolls", "1.2%", true, false, true],
      ["Professional & business services", "1.3%", false, true, true],
      ["Transportation, warehousing & utilities", "0.6%", false, false, true],
      ["Retail trade", "−0.4%", false, false, true],
      ["Leisure & hospitality", "2.9%", false, false, false],
    ]);
    expect(d.rows[1].href).toBe("https://fred.stlouisfed.org/series/WASH911PBSV");
    expect(d.rows[3].href).toBe("https://fred.stlouisfed.org/series/SMU11479004200000001SA");
    expect(d.rows[3].valuePct).toBe(-0.4);
    expect(d.stale).toEqual(["Leisure & hospitality as of Aug 1"]);
  });

  it("rental housing marks no sector and says so; a suburb reads its metro area's rows; nothing without a sector row", () => {
    const apt = metroDemand(readMetroRates("pg_county", ROWS, FIXTURE_NOW), "multifamily")!;
    expect(apt.mine).toBeNull();
    expect(apt.area).toBe("Washington MSA");
    expect(apt.rows.every((r) => !r.mine)).toBe(true);
    expect(apt.intro).toBe(RENTAL_HOUSING);
    expect(metroDemand(readMetroRates("dc", ROWS.slice(0, 1), FIXTURE_NOW), "office")).toBeNull();
    expect(metroDemand([], "office")).toBeNull();
  });

  it("the sentence under the heading is the class's: a class that reads no sector is never called rental housing", () => {
    const rates = readMetroRates("dc", ROWS, FIXTURE_NOW);
    // The metro has no education & health row: nothing is drawn full, and
    // the sentence names the figure that is missing rather than marking
    // another sector.
    const mob = metroDemand(rates, "medical_office")!;
    expect(mob.mine).toBeNull();
    expect(mob.intro).toBe(
      "The metro area has no figure for education and health services, the sector that fills medical offices, so nothing is drawn full: all payrolls first, then the sectors it does have.",
    );
    // Storage, land, a net lease: no sector, and not rental housing either.
    expect(metroDemand(rates, "self_storage")!.intro).toBe(
      "Self-storage reads no single sector — a sector picked for it would be a guess wearing a figure — so all payrolls are drawn first; the sectors beneath say where the metro area's jobs are growing.",
    );
    expect(metroDemand(rates, "land_infill")!.intro).toBe(
      `${assetClassLabel("land_infill")} reads no single sector — a sector picked for it would be a guess wearing a figure — so all payrolls are drawn first; the sectors beneath say where the metro area's jobs are growing.`,
    );
    expect(metroDemand(rates, "net_lease")!.intro).toMatch(/^Net lease reads no single sector/);
    // The rental-housing classes with no sector of their own.
    for (const cls of ["student_housing", "sfr_btr", "manufactured_housing", "mixed_use"]) {
      expect(metroDemand(rates, cls)!.intro, cls).toBe(RENTAL_HOUSING);
    }
    // A kind nothing has read yet is said to be unread, not called anything.
    const unread = "No sector is singled out until the deal's kind is read; all payrolls are drawn first, and the sectors beneath say where the metro area's jobs are growing.";
    expect(metroDemand(rates, "auto")!.intro).toBe(unread);
    expect(metroDemand(rates, null)!.intro).toBe(unread);
    // A phrase the model wrote is filed by its words, as every other surface files it.
    expect(metroDemand(rates, "boutique hotel")!.mine).toBe("Leisure & hospitality");
  });

  it("a state's rows are the state's, and every sentence says so rather than calling them a metro area's", () => {
    const pa = readMetroRates(
      "state:PA",
      [
        { series_id: "PANA_YOY", obs_date: "2026-08-01", value: 0.9 },
        { series_id: "PAPBSV_YOY", obs_date: "2026-08-01", value: 1.1 },
        { series_id: "PALEIH_YOY", obs_date: "2026-08-01", value: 2.0 },
      ],
      FIXTURE_NOW,
    );
    const office = metroDemand(pa, "office")!;
    expect(office.grain).toBe("state");
    expect(office.area).toBe("Pennsylvania");
    expect(office.intro).toBe(
      "Professional & business services is the sector that fills this building's kind, drawn full; the state's other sectors are beside it, faded, and all payrolls first.",
    );
    expect(metroDemand(pa, "multifamily")!.intro).toBe("Rental housing runs on all payrolls, drawn first; the sectors beneath say where the state's jobs are growing.");
    expect(metroDemand(pa, "medical_office")!.intro).toBe(
      "The state has no figure for education and health services, the sector that fills medical offices, so nothing is drawn full: all payrolls first, then the sectors it does have.",
    );
    expect(metroDemand(pa, "self_storage")!.intro).toContain("where the state's jobs are growing");
    expect(metroDemand(readMetroRates("dc", ROWS, FIXTURE_NOW), "office")!.grain).toBe("metro");
  });

  it("carries the supply side for rental housing only, and only where both permit series are on hand", () => {
    const monthsBack = (n: number): string => new Date(Date.UTC(2026, 6 - n, 1)).toISOString().slice(0, 10);
    const permits: RateRow[] = [
      ...Array.from({ length: 24 }, (_, i) => ({ series_id: "WASH911BPPRIV", obs_date: monthsBack(i), value: 1200 })),
      ...Array.from({ length: 24 }, (_, i) => ({ series_id: "WASH911BP1FH", obs_date: monthsBack(i), value: 500 })),
    ];
    const withPermits = readMetroRates("dc", [...ROWS, ...permits], FIXTURE_NOW);
    const apt = metroDemand(withPermits, "multifamily")!;
    expect(apt.supply?.multi).toBe(8_400);
    expect(apt.supply?.area).toBe("Washington MSA");
    // An office does not compete with new apartments.
    expect(metroDemand(withPermits, "office")!.supply).toBeNull();
    // Without the single-family series there is no split to say.
    expect(metroDemand(readMetroRates("dc", ROWS, FIXTURE_NOW), "multifamily")!.supply).toBeNull();
  });
});
