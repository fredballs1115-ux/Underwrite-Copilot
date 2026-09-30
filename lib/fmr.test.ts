import { describe, expect, it } from "vitest";
import {
  DC_AREA_METRO,
  FMR_BEDS,
  fiscalYearOn,
  fmrBlock,
  fmrEffectiveOf,
  fmrLabel,
  fmrMetric,
  fmrMetroLabel,
  fmrOf,
  fmrPhase,
  fmrRows,
  fmrTwoBed,
  fyEnd,
  fyStart,
  newestFmrOnly,
  readFmrMetric,
} from "./fmr";

// HUD's fair market rents: one reader, the year in the data. The pages had
// "FY…" typed into their words and the research files into their key names,
// so on the day HUD's next year took effect every one of them went on
// printing last year's rents as current.

const BLOCK = {
  fy: 2027,
  effective: "2026-10-01",
  area: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA",
  "0br": 1438,
  "1br": 1558,
  "2br": 1860,
  "3br": 2216,
  "4br": 2445,
  status: "verified",
  sources: ["https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_FMRs.xlsx"],
  as_of: "2026-09-30",
  note: "One HUD area across Philadelphia, Camden and Wilmington.",
};

describe("HUD's fiscal year", () => {
  it("runs Oct 1 of the year before through Sep 30 of its own", () => {
    expect(fyStart(2027)).toBe("2026-10-01");
    expect(fyEnd(2027)).toBe("2027-09-30");
    expect(fiscalYearOn("2026-09-30")).toBe(2026);
    expect(fiscalYearOn("2026-10-01")).toBe(2027);
    expect(fiscalYearOn("2027-01-15")).toBe(2027);
    expect(fiscalYearOn("2027-12-31")).toBe(2028);
    expect(fmrLabel(2027)).toBe("FY2027");
  });

  it("says where a year's figures stand on a day: ahead, in force, or ended", () => {
    const fmr = fmrBlock(BLOCK)!;
    expect(fmrPhase(fmr, "2026-09-30")).toBe("ahead");
    expect(fmrPhase(fmr, "2026-10-01")).toBe("in_force");
    expect(fmrPhase(fmr, "2027-09-30")).toBe("in_force");
    expect(fmrPhase(fmr, "2027-10-01")).toBe("ended");
    // A mid-year revision is in force from its own day to the year's end.
    expect(fmrPhase({ fy: 2026, effective: "2026-05-21" }, "2026-05-20")).toBe("ahead");
    expect(fmrPhase({ fy: 2026, effective: "2026-05-21" }, "2026-09-30")).toBe("in_force");
  });
});

describe("fmrBlock / fmrOf — the one reader", () => {
  it("reads a metros.json block: the year, the day, HUD's area, five bedrooms and provenance", () => {
    const fmr = fmrOf({ id: "philadelphia", name: "Philadelphia PA", fmr: BLOCK })!;
    expect(fmr).toEqual({
      fy: 2027,
      effective: "2026-10-01",
      area: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA",
      rents: { "0br": 1438, "1br": 1558, "2br": 1860, "3br": 2216, "4br": 2445 },
      status: "verified",
      sources: ["https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_FMRs.xlsx"],
      asOf: "2026-09-30",
      note: "One HUD area across Philadelphia, Camden and Wilmington.",
    });
  });

  it("reads the sector files' convention too, the bedrooms under `value`", () => {
    const { "0br": a, "1br": b, "2br": c, "3br": d, "4br": e, ...rest } = BLOCK;
    const fmr = fmrBlock({ ...rest, value: { "0br": a, "1br": b, "2br": c, "3br": d, "4br": e }, unit: "usd_month" })!;
    expect(fmr.rents).toEqual(fmrBlock(BLOCK)!.rents);
  });

  it("a bedroom the file does not state is null, never zero", () => {
    const fmr = fmrBlock({ ...BLOCK, "4br": null, "3br": 0, "1br": "1558" })!;
    expect(fmr.rents["4br"]).toBeNull();
    expect(fmr.rents["3br"]).toBeNull();
    expect(fmr.rents["1br"]).toBeNull();
    expect(fmr.rents["2br"]).toBe(1860);
    // A block with no figure at all still names its year, for the page's
    // "not yet confirmed" line.
    const none = fmrBlock({ ...BLOCK, "0br": null, "1br": null, "2br": null, "3br": null, "4br": null, status: "unverified_not_found" })!;
    expect(none.fy).toBe(2027);
    expect(Object.values(none.rents).every((v) => v === null)).toBe(true);
    expect(fmrTwoBed(none)).toBeNull();
  });

  it("a block that cannot say which year it is for is no block", () => {
    expect(fmrOf(null)).toBeNull();
    expect(fmrOf({ id: "x" })).toBeNull();
    // The old key, with no year in the block, is not read.
    expect(fmrOf({ fmr_fy2026: { "2br": 1810 } })).toBeNull();
    expect(fmrBlock({ ...BLOCK, fy: undefined })).toBeNull();
    expect(fmrBlock({ ...BLOCK, fy: "2027" })).toBeNull();
    expect(fmrBlock({ ...BLOCK, fy: 2027.5 })).toBeNull();
    expect(fmrBlock({ ...BLOCK, effective: undefined })).toBeNull();
    // A day outside the year's own window is a typo, not a revision.
    expect(fmrBlock({ ...BLOCK, effective: "2025-10-01" })).toBeNull();
    expect(fmrBlock({ ...BLOCK, effective: "2027-10-01" })).toBeNull();
    expect(fmrBlock({ ...BLOCK, effective: "Oct 1, 2026" })).toBeNull();
    expect(fmrBlock({ ...BLOCK, area: "  " })).toBeNull();
    // A revision inside the year reads.
    expect(fmrBlock({ ...BLOCK, fy: 2026, effective: "2026-05-21" })?.effective).toBe("2026-05-21");
  });

  it("an unknown status reads as sourced, and a file with no read day is undated", () => {
    const fmr = fmrBlock({ ...BLOCK, status: "confirmed", as_of: undefined, sources: ["", 7, "https://x.test"], note: "  " })!;
    expect(fmr.status).toBe("sourced");
    expect(fmr.asOf).toBe("");
    expect(fmr.sources).toEqual(["https://x.test"]);
    expect(fmr.note).toBeNull();
  });

  it("hands the two-bedroom figure over with its year", () => {
    expect(fmrTwoBed(fmrBlock(BLOCK))).toEqual({ rent: 1860, fy: 2027 });
    expect(fmrTwoBed(null)).toBeNull();
  });
});

describe("the benchmarks table's FMR rows", () => {
  it("names a row by its year and bedroom count, and reads the name back", () => {
    for (const bed of FMR_BEDS) expect(readFmrMetric(fmrMetric(2027, bed))).toEqual({ fy: 2027, bed });
    expect(fmrMetric(2031, "2br")).toBe("hud_fmr_fy2031_2br");
    expect(readFmrMetric("zori_rent")).toBeNull();
    expect(readFmrMetric("hud_fmr_fy2027_5br")).toBeNull();
    expect(readFmrMetric("hud_fmr_fy27_2br")).toBeNull();
  });

  it("writes a row a stated bedroom, dated the day read, the year's window in the note", () => {
    const rows = fmrRows(fmrBlock({ ...BLOCK, "4br": null })!, "Philadelphia PA");
    expect(rows.map((r) => r.metric)).toEqual([
      "hud_fmr_fy2027_0br",
      "hud_fmr_fy2027_1br",
      "hud_fmr_fy2027_2br",
      "hud_fmr_fy2027_3br",
    ]);
    const two = rows.find((r) => r.metric.endsWith("_2br"))!;
    expect(two).toMatchObject({
      sector: "multifamily",
      metro: "Philadelphia PA",
      low: 1860,
      high: 1860,
      unit: "usd_month",
      source: "https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_FMRs.xlsx",
      as_of: "2026-09-30",
      status: "verified",
    });
    expect(two.note).toBe(
      "FY2027, effective 2026-10-01 through 2027-09-30. Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA. One HUD area across Philadelphia, Camden and Wilmington.",
    );
  });

  it("reads the day a row takes effect back out of its own note, and nothing out of another", () => {
    const [row] = fmrRows(fmrBlock(BLOCK)!, "Philadelphia PA");
    expect(fmrEffectiveOf(row.note)).toBe("2026-10-01");
    // A row an earlier seed wrote says it the same way.
    expect(fmrEffectiveOf("FY2026, effective 2025-10-01 through 2026-09-30. Washington-Arlington-Alexandria DC-VA-MD HMFA.")).toBe(
      "2025-10-01",
    );
    expect(fmrEffectiveOf("HUD FMR API, entity METRO37980M37980")).toBeNull();
    expect(fmrEffectiveOf(null)).toBeNull();
  });

  it("labels the Washington area's rows as the table does", () => {
    expect(fmrMetroLabel({ id: "dc", name: "Washington DC" })).toBe(DC_AREA_METRO);
    expect(fmrMetroLabel({ id: "nova", name: "Northern Virginia" })).toBe("Northern Virginia");
  });
});

describe("newestFmrOnly — an older fiscal year is never shown as current", () => {
  const row = (metro: string, metric: string, low: number) => ({ sector: "multifamily", metro, metric, low });

  it("drops every fair market rent of a year older than the newest present, whatever its label", () => {
    const rows = [
      row(DC_AREA_METRO, "hud_fmr_fy2027_2br", 2438),
      row(DC_AREA_METRO, "hud_fmr_fy2026_2br", 2246),
      row(DC_AREA_METRO, "hud_fmr_fy2026_4br", 3413),
      // A database row under another label, from an older pull: superseded
      // too, since HUD publishes every area's year at once.
      row("Washington DC", "hud_fmr_fy2026_2br", 2246),
      row("Philadelphia PA", "hud_fmr_fy2027_2br", 1860),
      row("Washington DC", "multifamily_vacancy_pct", 5),
    ];
    const kept = newestFmrOnly(rows);
    expect(kept.map((r) => `${r.metro}|${r.metric}`)).toEqual([
      `${DC_AREA_METRO}|hud_fmr_fy2027_2br`,
      "Philadelphia PA|hud_fmr_fy2027_2br",
      "Washington DC|multifamily_vacancy_pct",
    ]);
  });

  it("a newer year replaces this one the same way, and a set with one year passes whole", () => {
    const rows = [row("Boston", "hud_fmr_fy2027_2br", 3008), row("Boston", "hud_fmr_fy2028_2br", 3100)];
    expect(newestFmrOnly(rows).map((r) => r.metric)).toEqual(["hud_fmr_fy2028_2br"]);
    const one = [row("Boston", "hud_fmr_fy2027_2br", 3008), row("Boston", "zori_rent", 3200)];
    expect(newestFmrOnly(one)).toEqual(one);
    expect(newestFmrOnly([])).toEqual([]);
  });
});
