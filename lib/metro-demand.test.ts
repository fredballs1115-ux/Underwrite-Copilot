import { describe, expect, it } from "vitest";
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

describe("metroDemand — the metro area's payrolls by sector as a picture's rows, with this building's sector marked", () => {
  it("puts all payrolls first, marks the deal's sector, keeps a stale sector and names it, and dates the newest month", () => {
    const d = metroDemand(readMetroRates("dc", ROWS, FIXTURE_NOW), "jobs_pbs_yoy")!;
    expect(d.area).toBe("Washington MSA");
    expect(d.newestMonth).toBe("Aug 2026");
    expect(d.mine).toBe("Professional & business services");
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

  it("rental housing marks no sector; a suburb reads its metro area's rows; nothing without a sector row", () => {
    const apt = metroDemand(readMetroRates("pg_county", ROWS, FIXTURE_NOW), null)!;
    expect(apt.mine).toBeNull();
    expect(apt.area).toBe("Washington MSA");
    expect(apt.rows.every((r) => !r.mine)).toBe(true);
    expect(metroDemand(readMetroRates("dc", ROWS.slice(0, 1), FIXTURE_NOW), "jobs_pbs_yoy")).toBeNull();
    expect(metroDemand([], "jobs_pbs_yoy")).toBeNull();
    // A sector the metro has no row for marks nothing rather than another sector.
    expect(metroDemand(readMetroRates("dc", ROWS, FIXTURE_NOW), "jobs_eduhealth_yoy")!.mine).toBeNull();
  });
});
