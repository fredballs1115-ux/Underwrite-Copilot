import { describe, expect, it } from "vitest";
import { ASSET_CLASS_LABEL, ASSET_CLASS_OPTIONS, assetClassLabel } from "./asset-class";
import {
  ASSET_CLASS_KEYS,
  assetClassKey,
  assetWords,
  countNoun,
  isResidentialClass,
  perSuffix,
} from "./asset-words";

describe("the asset-words table", () => {
  it("has a row for every class the label map files, and no other", () => {
    for (const key of Object.keys(ASSET_CLASS_LABEL)) {
      const w = assetWords(key);
      expect(w.key, key).toBe(key);
      expect(w.label, key).toBe(ASSET_CLASS_LABEL[key]);
    }
    expect(ASSET_CLASS_KEYS).toEqual(Object.keys(ASSET_CLASS_LABEL));
    expect(ASSET_CLASS_OPTIONS.map(([k]) => k)).toEqual(ASSET_CLASS_KEYS);
  });

  it("knows the deal types that come through a shop's door", () => {
    for (const key of [
      "multifamily",
      "office",
      "industrial",
      "retail",
      "net_lease",
      "medical_office",
      "mixed_use",
      "sfr_btr",
      "student_housing",
      "senior_housing",
      "manufactured_housing",
      "self_storage",
      "hospitality_str",
      "data_center",
      "parking",
      "land_infill",
    ]) {
      expect(ASSET_CLASS_LABEL[key], key).toBeTruthy();
    }
  });

  it("never lets a stored key reach a page raw", () => {
    for (const key of ASSET_CLASS_KEYS) {
      const label = assetWords(key).label;
      expect(label).not.toMatch(/_/);
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
      expect(label).toBe(assetClassLabel(key));
    }
  });

  it("speaks each class in its own noun and basis", () => {
    expect(assetWords("hospitality_str")).toMatchObject({
      noun: { one: "key", many: "keys" },
      basis: "unit",
      basisLabel: "Price / key",
      income: "ADR",
      countLabel: "Keys",
      residential: false,
      operating: true,
    });
    expect(assetWords("manufactured_housing")).toMatchObject({
      noun: { one: "pad", many: "pads" },
      basisLabel: "Price / pad",
      income: "rent / pad / mo",
      countLabel: "Pads",
      residential: true,
    });
    expect(assetWords("student_housing")).toMatchObject({
      noun: { one: "bed", many: "beds" },
      basisLabel: "Price / bed",
      countLabel: "Beds",
      residential: true,
    });
    expect(assetWords("office")).toMatchObject({
      noun: null,
      basis: "sf",
      basisLabel: "Price / SF",
      income: "rent / SF / yr",
      countLabel: "Total SF",
      residential: false,
    });
    expect(assetWords("self_storage")).toMatchObject({ noun: { one: "unit", many: "units" }, basis: "sf" });
    expect(assetWords("parking")).toMatchObject({ noun: { one: "space", many: "spaces" }, basisLabel: "Price / space" });
  });

  it("land has no income, no operating figures, and is counted in acres", () => {
    const land = assetWords("land_infill");
    expect(land.operating).toBe(false);
    expect(land.income).toBeNull();
    expect(land.basis).toBe("acre");
    expect(land.basisLabel).toBe("Price / acre");
    expect(land.countLabel).toBe("Acres");
    expect(perSuffix(land)).toBe("/acre");
    // Every other class operates.
    for (const key of ASSET_CLASS_KEYS) if (key !== "land_infill") expect(assetWords(key).operating, key).toBe(true);
  });

  it("names which classes the rent-control rules can reach: rental housing, never lodging, care or commercial", () => {
    for (const key of ["multifamily", "sfr_btr", "student_housing", "manufactured_housing", "mixed_use"]) {
      expect(isResidentialClass(key), key).toBe(true);
    }
    for (const key of [
      "office",
      "industrial",
      "retail",
      "net_lease",
      "medical_office",
      "self_storage",
      "hospitality_str",
      "senior_housing",
      "data_center",
      "parking",
      "land_infill",
    ]) {
      expect(isResidentialClass(key), key).toBe(false);
    }
    // Nothing read yet claims nothing.
    expect(isResidentialClass("auto")).toBe(false);
    expect(isResidentialClass(null)).toBe(false);
  });

  it("files a class the model phrased itself by its words", () => {
    expect(assetClassKey("Boutique hotel")).toBe("hospitality_str");
    expect(assetClassKey("NNN retail")).toBe("net_lease");
    expect(assetClassKey("Class A office")).toBe("office");
    expect(assetClassKey("Garden apartments")).toBe("multifamily");
    expect(assetClassKey("Student housing")).toBe("student_housing");
    expect(assetClassKey("Flex / light industrial")).toBe("industrial");
    expect(assetClassKey("Entitled land")).toBe("land_infill");
    expect(assetClassKey("Medical office building")).toBe("medical_office");
    expect(assetClassKey("Mixed-use")).toBe("mixed_use");
    expect(assetClassKey("HOSPITALITY_STR")).toBe("hospitality_str");
    // A stored key is itself.
    for (const key of ASSET_CLASS_KEYS) expect(assetClassKey(key)).toBe(key);
    // Nothing, "auto" and a phrase naming no class resolve to nothing.
    expect(assetClassKey("auto")).toBeNull();
    expect(assetClassKey("")).toBeNull();
    expect(assetClassKey("Something else entirely")).toBeNull();
  });

  it("gives an unknown phrase the generic words under its own label", () => {
    const w = assetWords("Something else entirely");
    expect(w.label).toBe("Something else entirely");
    expect(w.noun).toEqual({ one: "unit", many: "units" });
    expect(w.residential).toBe(false);
    expect(w.income).toBeNull();
    expect(assetWords("auto").label).toBe("");
  });

  it("reads a count row's own noun ahead of the class's", () => {
    // The OM said keys: keys, whatever the class is filed as.
    expect(countNoun("Keys", "multifamily")).toBe("keys");
    expect(countNoun("Guest rooms", "hospitality_str")).toBe("rooms");
    expect(countNoun("Homesites", "manufactured_housing")).toBe("homesites");
    expect(countNoun("Home sites", "manufactured_housing")).toBe("homesites");
    expect(countNoun("Beds", "student_housing")).toBe("beds");
    // Doors and apartments are units by another name.
    expect(countNoun("Doors", "multifamily")).toBe("units");
    expect(countNoun("Apartments", "multifamily")).toBe("units");
    // A label naming no noun falls to the class's own.
    expect(countNoun("Count", "hospitality_str")).toBe("keys");
    expect(countNoun("Count", "manufactured_housing")).toBe("pads");
    expect(countNoun(null, "office")).toBe("units");
    expect(countNoun(null, "land_infill")).toBe("acres");
  });

  it("wears the right suffix on a basis figure", () => {
    expect(perSuffix(assetWords("multifamily"))).toBe("/unit");
    expect(perSuffix(assetWords("hospitality_str"))).toBe("/key");
    expect(perSuffix(assetWords("manufactured_housing"))).toBe("/pad");
    expect(perSuffix(assetWords("office"))).toBe("/SF");
    expect(perSuffix(assetWords("self_storage"))).toBe("/SF");
  });

  it("files every class under a rent-roll profile family the profiles table has", () => {
    for (const key of ASSET_CLASS_KEYS) {
      expect(["multifamily", "office", "industrial", "retail"]).toContain(assetWords(key).profile);
    }
  });
});
