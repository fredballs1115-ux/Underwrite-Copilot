import { describe, expect, it } from "vitest";
import { ASSET_CLASS_LABEL, ASSET_CLASS_OPTIONS, assetClassLabel } from "./asset-class";

describe("assetClassLabel", () => {
  it("a stored key shows its words, never its underscore", () => {
    expect(assetClassLabel("self_storage")).toBe("Self-storage");
    expect(assetClassLabel("manufactured_housing")).toBe("Manufactured housing");
    expect(assetClassLabel("sfr_btr")).toBe("SFR / BTR");
    expect(assetClassLabel("hospitality_str")).toBe("Hospitality / STR");
    expect(assetClassLabel("land_infill")).toBe("Land / infill");
    expect(assetClassLabel("multifamily")).toBe("Multifamily");
  });

  it("a key in any case still finds its label", () => {
    expect(assetClassLabel("Multifamily")).toBe("Multifamily");
    expect(assetClassLabel(" SELF_STORAGE ")).toBe("Self-storage");
  });

  it("a class the extraction phrased itself shows readable, first letter up", () => {
    expect(assetClassLabel("mixed-use")).toBe("Mixed-use");
    expect(assetClassLabel("student_housing")).toBe("Student housing");
    expect(assetClassLabel("Medical office")).toBe("Medical office");
  });

  it("nothing, and the form's Auto setting, show as nothing — Auto was never a class", () => {
    expect(assetClassLabel("")).toBe("");
    expect(assetClassLabel(null)).toBe("");
    expect(assetClassLabel(undefined)).toBe("");
    expect(assetClassLabel("auto")).toBe("");
    expect(assetClassLabel("Auto")).toBe("");
  });

  it("the forms' options are the map, in its order, with no Auto entry", () => {
    expect(ASSET_CLASS_OPTIONS.map(([k]) => k)).toEqual(Object.keys(ASSET_CLASS_LABEL));
    expect(ASSET_CLASS_OPTIONS[0]).toEqual(["multifamily", "Multifamily"]);
    expect(ASSET_CLASS_OPTIONS.some(([k]) => k === "auto")).toBe(false);
    // every option's label is what the same key shows on a row
    for (const [k, label] of ASSET_CLASS_OPTIONS) expect(assetClassLabel(k)).toBe(label);
  });
});
