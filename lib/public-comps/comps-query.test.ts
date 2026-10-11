import { describe, expect, it } from "vitest";
import { askOf, readCompsQuery } from "./comps-query";
import { COMPS_CLASS_OPTIONS } from "./classes";
import { RECORDED_SALES, RECORDED_SALES_MAX_RADIUS_M, RECORDED_SALES_RADIUS_CHOICES } from "@/lib/public-record-asks";

describe("/comps' search as a link", () => {
  it("reads only the choices offered", () => {
    expect(readCompsQuery({ r: "3", m: "12", cls: "office" })).toEqual({ radiusMiles: 3, monthsBack: 12, cls: "office" });
    expect(readCompsQuery({ r: "5", m: "60", cls: "specialty" })).toEqual({ radiusMiles: null, monthsBack: null, cls: "" });
  });

  it("asks nothing of its own where the reader set nothing, and the asks file's kilometres where they did", () => {
    expect(askOf(readCompsQuery({}))).toBeNull();
    expect(askOf(readCompsQuery({ r: "1" }))).toEqual({ radiusKm: RECORDED_SALES.radiusKm });
    expect(askOf(readCompsQuery({ m: "36" }))).toEqual({ monthsBack: 36 });
  });

  it("offers no radius past the widest migration 0037 answers", () => {
    for (const c of RECORDED_SALES_RADIUS_CHOICES) expect(Math.round(c.km * 1000)).toBeLessThanOrEqual(RECORDED_SALES_MAX_RADIUS_M);
  });

  it("offers the classes the property database files, by the site's own words", () => {
    expect(COMPS_CLASS_OPTIONS.map(([k]) => k)).toEqual(
      expect.arrayContaining(["multifamily", "office", "industrial", "retail", "mixed_use"]),
    );
    expect(COMPS_CLASS_OPTIONS.find(([k]) => k === "retail")?.[1]).toBe("Retail");
  });
});
