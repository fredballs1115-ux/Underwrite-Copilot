import { describe, expect, it } from "vitest";
import { pickAssessmentRoll, resourceName, rollYear, type CkanResource } from "./boston-roll";

// The names are the portal's, as the runner printed them (zori run
// 37231906743): `name` null, the name in `name_translated.en`.
const res = (id: string, en: string, served = true): CkanResource => ({
  id,
  name: null,
  name_translated: { en },
  datastore_active: served,
});

describe("Boston's assessment roll, chosen by the fiscal year its name states", () => {
  it("reads a four-digit fiscal year whole, so FY2026 and FY2027 are two years", () => {
    expect(rollYear("Property Assessment FY2026")).toBe(2026);
    expect(rollYear("Property Assessment FY2027")).toBe(2027);
    expect(rollYear("Property Assessment FY26")).toBe(2026);
    expect(rollYear("Property Assessment FY 2025")).toBe(2025);
  });

  it("reads no year off a data key, a dictionary or a bare year", () => {
    expect(rollYear("Property Assessment FY2026 Data Key")).toBeNull();
    expect(rollYear("Property Assessment Data Dictionary FY2026")).toBeNull();
    expect(rollYear("Property Occupancy Codes")).toBeNull();
    expect(rollYear("Assessment 2026")).toBeNull();
  });

  it("takes the name from its English translation where `name` is null", () => {
    expect(resourceName(res("a", "Property Assessment FY2026"))).toBe("Property Assessment FY2026");
    expect(resourceName({ id: "b", name: "Roll FY2024" })).toBe("Roll FY2024");
    expect(resourceName({ id: "c" })).toBe("");
  });

  it("picks the highest fiscal year the portal can serve rows from, wherever the list puts it", () => {
    const list = [
      res("codes", "Property Occupancy Codes", false),
      res("fy25", "Property Assessment FY2025"),
      res("fy26key", "Property Assessment FY2026 Data Key"),
      res("fy27", "Property Assessment FY2027"),
      res("fy26", "Property Assessment FY2026"),
    ];
    expect(pickAssessmentRoll(list)).toEqual({ id: "fy27", name: "Property Assessment FY2027", year: 2027 });
    // A newer roll the portal cannot serve rows from yet is passed over.
    list[3].datastore_active = false;
    expect(pickAssessmentRoll(list)?.id).toBe("fy26");
  });

  it("falls back to the portal's own order where no name states a year, and to nothing where none is served", () => {
    expect(pickAssessmentRoll([res("x", "Assessment roll"), res("y", "Older roll")])).toEqual({ id: "x", name: "Assessment roll", year: null });
    expect(pickAssessmentRoll([res("x", "Property Assessment FY2026", false)])).toBeNull();
  });
});
