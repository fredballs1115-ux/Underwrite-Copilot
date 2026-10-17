import { describe, expect, it } from "vitest";
import { distanceFrom, placementNote, pointIsSubject, subjectPinLabel } from "./subject-point";

describe("a comps read's subject point, said by its precision", () => {
  it("stars only a point placed at the building", () => {
    expect(pointIsSubject("street")).toBe(true);
    expect(pointIsSubject(undefined)).toBe(true);
    expect(pointIsSubject("block")).toBe(false);
    expect(pointIsSubject("area")).toBe(false);
    expect(subjectPinLabel("street")).toBe("Subject property");
    expect(subjectPinLabel("area")).not.toContain("Subject");
    expect(subjectPinLabel("block")).toContain("not the building");
  });

  it("says what a distance is measured from", () => {
    expect(distanceFrom("street")).toBe("from the subject");
    expect(distanceFrom("block")).toBe("from the address's street");
    expect(distanceFrom("area")).toBe("from the area's centre");
  });

  it("carries a note only where the point is not the building", () => {
    expect(placementNote("street")).toBe("");
    expect(placementNote("area")).toMatch(/centre of the area/);
    expect(placementNote("block")).toMatch(/on its street/);
  });
});
