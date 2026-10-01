import { describe, expect, it } from "vitest";
import { shownAssetClass } from "@/lib/pipeline-slots";
import {
  MARKET_DEFAULT_ID,
  PROFILE_DEFAULTS,
  defaultProfileFor,
  openingProfile,
  profileFamilyOf,
  savedProfileFamily,
  type MarketLeasingProfile,
} from "./profiles";

const saved = (id: string, assetClass: string, name: string): MarketLeasingProfile => ({
  ...PROFILE_DEFAULTS.office,
  id,
  name,
  assetClass,
});

// Newest first, as the store reads them.
const PROFILES = [
  saved("apt", "multifamily", "Garden apartments"),
  saved("unread", "auto", "Saved before the class was read"),
  saved("off", "office", "Suburban office"),
];

describe("the deal's class decides the leasing profile", () => {
  it("reads a deal filed Auto-detect by its memorandum's class, never as an office", () => {
    const cls = shownAssetClass("auto", { assetClass: "multifamily" });
    expect(profileFamilyOf(cls)).toBe("multifamily");
    expect(defaultProfileFor(cls).name).toBe("Multifamily — market");
    // A class nothing has read is the generic row: an office's defaults.
    expect(defaultProfileFor(shownAssetClass("auto", null)).name).toBe("Office — market");
  });

  it("files a saved profile by the class it was saved for, and an unread class nowhere", () => {
    expect(savedProfileFamily("student_housing")).toBe("multifamily");
    expect(savedProfileFamily("office")).toBe("office");
    expect(savedProfileFamily("auto")).toBeNull();
  });

  it("opens a deal on the newest profile of its own family, never the newest saved on any deal", () => {
    expect((openingProfile(PROFILES, "office") as MarketLeasingProfile).id).toBe("off");
    expect((openingProfile(PROFILES, "multifamily") as MarketLeasingProfile).id).toBe("apt");
    // A student building leases like an apartment building.
    expect((openingProfile(PROFILES, "student_housing") as MarketLeasingProfile).id).toBe("apt");
    // A family with no saved profile opens on its market default.
    expect(openingProfile(PROFILES, "industrial")).toEqual(PROFILE_DEFAULTS.industrial);
    expect(openingProfile([PROFILES[1]], "office")).toEqual(PROFILE_DEFAULTS.office);
  });

  it("opens the profile asked for by id, whatever its family, and the default by name", () => {
    expect((openingProfile(PROFILES, "office", "apt") as MarketLeasingProfile).id).toBe("apt");
    expect(openingProfile(PROFILES, "office", MARKET_DEFAULT_ID)).toEqual(PROFILE_DEFAULTS.office);
    expect((openingProfile(PROFILES, "office", "no-such-id") as MarketLeasingProfile).id).toBe("off");
  });
});
