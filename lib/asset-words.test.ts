import { describe, expect, it } from "vitest";
import { ASSET_CLASS_LABEL, ASSET_CLASS_OPTIONS, assetClassLabel } from "./asset-class";
import {
  ASSET_CLASS_KEYS,
  assetClassKey,
  assetWords,
  countNoun,
  isResidentialClass,
  perSuffix,
  rentQuotedMonthly,
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

  it("reads a rent roll a month a unit where the class's rent is quoted that way", () => {
    for (const key of ["multifamily", "sfr_btr", "student_housing", "manufactured_housing", "senior_housing", "parking"]) {
      expect(rentQuotedMonthly(key), key).toBe(true);
    }
    // Mixed-use is rental housing priced by the foot, its roll suites and
    // apartments together; a hotel's rate is nightly; a data centre's rent is
    // a month a kilowatt, not a unit.
    for (const key of ["mixed_use", "office", "industrial", "retail", "net_lease", "self_storage", "hospitality_str", "data_center", "land_infill", "auto"]) {
      expect(rentQuotedMonthly(key), key).toBe(false);
    }
    expect(rentQuotedMonthly(null)).toBe(false);
    expect(rentQuotedMonthly("Garden-style apartments")).toBe(true);
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
    // A warehouse or a yard that stores things is industrial; only storage
    // rented to the public by the unit is self-storage (the pass of
    // 2026-09-30 found the bare word "storage" filing both as self-storage).
    expect(assetClassKey("Cold Storage Warehouse")).toBe("industrial");
    expect(assetClassKey("Refrigerated distribution")).toBe("industrial");
    expect(assetClassKey("Industrial Outdoor Storage (IOS)")).toBe("industrial");
    expect(assetClassKey("IOS")).toBe("industrial");
    expect(assetClassKey("Self-Storage")).toBe("self_storage");
    expect(assetClassKey("Self storage with outdoor storage")).toBe("self_storage");
    expect(assetClassKey("Climate-controlled storage")).toBe("self_storage");
    expect(assetClassKey("Mini-storage")).toBe("self_storage");
    // Rental housing named by its program is rental housing; a student,
    // senior, manufactured or single-family phrase keeps its own class.
    expect(assetClassKey("Affordable Housing (LIHTC)")).toBe("multifamily");
    expect(assetClassKey("Workforce Housing")).toBe("multifamily");
    expect(assetClassKey("Section 8 housing")).toBe("multifamily");
    expect(assetClassKey("Senior housing")).toBe("senior_housing");
    expect(assetClassKey("Manufactured housing community")).toBe("manufactured_housing");
    expect(assetClassKey("Single-family housing portfolio")).toBe("sfr_btr");
    // "Portfolios" and "studios" hold "ios" inside a word, never as one.
    expect(assetClassKey("Studios")).toBeNull();
    // A stored key is itself.
    for (const key of ASSET_CLASS_KEYS) expect(assetClassKey(key)).toBe(key);
    // Nothing, "auto" and a phrase naming no class resolve to nothing.
    expect(assetClassKey("auto")).toBeNull();
    expect(assetClassKey("")).toBeNull();
    expect(assetClassKey("Something else entirely")).toBeNull();
  });

  it("files a site as land only where no lease comes with it, and scattered-site housing as housing", () => {
    // The land rule's bare "site" ran first and filed all three as land: no
    // NOI, no rate seed, the land traps.
    expect(assetClassKey("Scattered-site SFR portfolio")).toBe("sfr_btr");
    expect(assetClassKey("Scattered site single-family rentals")).toBe("sfr_btr");
    // A site sold with its lease is income: one tenant named or implied is
    // a net lease.
    expect(assetClassKey("Retail pad site (ground lease)")).toBe("net_lease");
    expect(assetClassKey("Ground-leased parcel, leased to Chick-fil-A")).toBe("net_lease");
    expect(assetClassKey("Land leased to a single tenant")).toBe("net_lease");
    expect(assetClassKey("Cell tower site")).toBe("net_lease");
    expect(assetClassKey("Billboard site")).toBe("net_lease");
    // A site under lease to several tenants is no net lease and no land.
    expect(assetClassKey("Retail pad sites leased to three tenants")).toBe("retail");
    expect(assetClassKey("Pad sites leased to tenants")).toBeNull();
    // A bare pad or development site, with no lease words, stays land.
    expect(assetClassKey("Pad site")).toBe("land_infill");
    expect(assetClassKey("Development site")).toBe("land_infill");
    expect(assetClassKey("Infill parcel")).toBe("land_infill");
    // What a net lease already was, it stays.
    expect(assetClassKey("NNN pad site")).toBe("net_lease");
    // A class the site's words never reached keeps its own rule.
    expect(assetClassKey("Parking lot")).toBe("parking");
    expect(assetClassKey("Office tower")).toBe("office");
  });

  it("files a continuing care, life plan or active adult community as senior housing, and a 55+ park as a park", () => {
    // Each resolved to no class at all.
    for (const phrase of [
      "CCRC",
      "Continuing care retirement community",
      "Continuing-care community",
      "Life plan community",
      "Active adult community",
      "Active adult (55+) apartments",
      "Retirement community",
    ]) {
      expect(assetClassKey(phrase), phrase).toBe("senior_housing");
    }
    // An age-restricted park is a park: the manufactured-housing rule reads
    // it first.
    expect(assetClassKey("55+ manufactured home community")).toBe("manufactured_housing");
    expect(assetClassKey("55+ mobile home park")).toBe("manufactured_housing");
    expect(assetClassKey("Active adult manufactured housing community")).toBe("manufactured_housing");
  });

  // Research pass 23: the retail rule ran before the housing one and only
  // the words "mixed use" reached the mixed-use rule, so a building of
  // apartments over shops filed as a store — commercial to the rules panel,
  // which dropped a 1962, 36-unit Los Angeles building's rent ordinance.
  it("files housing beside shops or offices as mixed-use, rental housing to the rules", () => {
    for (const phrase of [
      "Apartments over retail",
      "Retail/Residential",
      "Multifamily with ground-floor retail",
      "Residential over retail",
      "Ground-floor retail with apartments above",
      "Office/Residential",
      "Residential and commercial",
      "Apartments over shops",
      "Residences over restaurants",
      "Multi-family over storefronts",
      "Affordable housing over retail (LIHTC)",
      // The parking and medical rules no longer take a building of housing
      // and shops before it is read as one.
      "Apartments over retail with structured parking",
      "Apartments over medical office",
    ]) {
      expect(assetClassKey(phrase), phrase).toBe("mixed_use");
      expect(isResidentialClass(phrase), phrase).toBe(true);
    }
    // A change of use stays a conversion, filed by the building it is now.
    expect(assetClassKey("Office-to-residential")).toBe("office");
    expect(assetClassKey("Office-to-residential conversion")).toBe("office");
    expect(assetClassKey("Adaptive reuse (office to residential)")).toBe("office");
    expect(assetClassKey("Office building; residential conversion potential")).toBe("office");
    expect(assetClassKey("Retail to residential conversion")).toBe("retail");
    expect(assetClassKey("Hotel-to-apartment conversion")).toBe("hospitality_str");
    // A student, senior or park phrase keeps its own class; land named for
    // both uses is land; a commercial building with no housing is as it was.
    expect(assetClassKey("Student housing with ground-floor retail")).toBe("student_housing");
    expect(assetClassKey("Commercial and residential land")).toBe("land_infill");
    expect(assetClassKey("Retail with office above")).toBe("office");
    expect(assetClassKey("Retail condo")).toBe("retail");
    // A building of apartments is rental housing in the plural too.
    expect(assetClassKey("Apartments")).toBe("multifamily");
    expect(isResidentialClass("Apartments")).toBe(true);
  });

  it("files an RV resort as an RV park is filed, never as a hotel", () => {
    // The hotel rule's "resort" read first and filed it as lodging.
    expect(assetClassKey("RV Resort & Campground")).toBe("manufactured_housing");
    expect(assetClassKey("RV Resorts")).toBe("manufactured_housing");
    expect(assetClassKey("RV Park")).toBe("manufactured_housing");
    // A resort with no RV in it is still a hotel; RV storage is still storage.
    expect(assetClassKey("Resort hotel")).toBe("hospitality_str");
    expect(assetClassKey("RV and boat storage")).toBe("self_storage");
  });

  // The hotel rule's bare "resort" filed a building of apartments marketed
  // for its "resort-style amenities" as a hotel: a hotel's defaults, keys and
  // a nightly rate, and no rent rules, on an apartment deck.
  it("files a building named as homes as housing, whatever resort words describe its amenities", () => {
    for (const phrase of [
      "Resort-style apartments",
      "Luxury resort-style multifamily",
      "Multifamily with resort-style amenities",
      "Garden apartments with resort amenities",
      "Resort-style multi-family community, 312 units",
    ]) {
      expect(assetClassKey(phrase), phrase).toBe("multifamily");
      expect(isResidentialClass(phrase), phrase).toBe(true);
    }
    // Each housing class keeps its own rule.
    expect(assetClassKey("Resort-style townhomes")).toBe("sfr_btr");
    expect(assetClassKey("Build-to-rent community with resort-style amenities")).toBe("sfr_btr");
    expect(assetClassKey("Resort-style senior living")).toBe("senior_housing");
    expect(assetClassKey("Resort-style student housing")).toBe("student_housing");
    expect(assetClassKey("Resort-style manufactured home community")).toBe("manufactured_housing");
    expect(assetClassKey("Resort-style apartments over retail")).toBe("mixed_use");
    // A resort that names no homes is lodging, as it was; so is one named
    // with a hotel, lodging or a count of keys beside its homes.
    for (const phrase of [
      "Resort",
      "Boutique resort",
      "Resort hotel",
      "Golf resort and spa",
      "Resort hotel with residential condominiums",
      "Resort lodging and apartments",
      "Resort with 150 keys and 40 residential units",
    ]) {
      expect(assetClassKey(phrase), phrase).toBe("hospitality_str");
      expect(isResidentialClass(phrase), phrase).toBe(false);
    }
    // A place called the Keys is no count of keys.
    expect(assetClassKey("Resort-style apartments in the Florida Keys")).toBe("multifamily");
  });

  it("files a laboratory with the life-science buildings, as an office", () => {
    for (const phrase of ["Laboratory", "Laboratory building", "Laboratories", "Labs", "Life Sciences Campus", "Life Science / Lab"]) {
      expect(assetClassKey(phrase), phrase).toBe("office");
    }
    // A medical lab is still read by the medical rule first.
    expect(assetClassKey("Medical laboratory")).toBe("medical_office");
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
