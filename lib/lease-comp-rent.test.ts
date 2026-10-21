// What a lease comp's one line states as its rent (lib/lease-comp-rent):
// only what the text says, on its own yardstick.
import { describe, expect, it } from "vitest";
import { monthlyRentFloor, statedLeaseBasis, statedRent } from "./lease-comp-rent";

describe("statedRent", () => {
  it("reads a month's rent a unit as stated", () => {
    for (const line of ["$2,520/mo · 2BR", "$2,520 per month, two-bedroom", "$2,520/unit/mo", "$2,520 a unit a month", "Renovated 2BR at $2,520 monthly"]) {
      expect(statedRent(line), line).toEqual({ perUnitMonthly: 2_520, perSfYear: null, sfFromMonth: false });
    }
  });

  it("reads a rent a foot a year, and a month a foot carried to the year", () => {
    expect(statedRent("$38.00/SF/yr NNN, 12,000 SF")).toEqual({ perUnitMonthly: null, perSfYear: 38, sfFromMonth: false });
    expect(statedRent("$38 per SF per year, full service")).toEqual({ perUnitMonthly: null, perSfYear: 38, sfFromMonth: false });
    expect(statedRent("$3.10/SF/mo")).toEqual({ perUnitMonthly: null, perSfYear: 37.2, sfFromMonth: true });
  });

  it("reads a bare rent a foot as a year's only where the class quotes rent a foot a year", () => {
    expect(statedRent("$38.00/SF NNN").perSfYear).toBeNull();
    expect(statedRent("$38.00/SF NNN", { bareSfIsYear: true }).perSfYear).toBe(38);
    // An apartment's "$2.75/SF" is a month's, so it is never read as a year's.
    expect(statedRent("$2.75/SF, 900 SF")).toEqual({ perUnitMonthly: null, perSfYear: null, sfFromMonth: false });
  });

  it("reads nothing from a price, a bare figure, a range, a year's rent a unit or a nightly rate", () => {
    for (const line of ["$252k/unit · 5.6% cap", "$2,520 · 2BR", "$2,400–$2,600/mo", "$2,400 to $2,600 per month", "$30,000 per unit per year", "$189/night ADR", "$45/mo pet fee"]) {
      expect(statedRent(line), line).toEqual({ perUnitMonthly: null, perSfYear: null, sfFromMonth: false });
    }
  });
});

describe("a space's, a pad's or a bed's month is read as stated; a dwelling's under $100 is no rent", () => {
  it("lowers the floor by the class's own noun", () => {
    expect(monthlyRentFloor("unit")).toBe(100);
    expect(monthlyRentFloor("home")).toBe(100);
    for (const noun of ["space", "pad", "bed"]) expect(monthlyRentFloor(noun), noun).toBe(0);
    expect(statedRent("$85/space/mo").perUnitMonthly).toBeNull();
    expect(statedRent("$85/space/mo", { unitFloor: monthlyRentFloor("space") }).perUnitMonthly).toBe(85);
  });
});

describe("the lease basis a rent a foot is quoted on, only as the line states it", () => {
  it("reads net, full service, modified gross and gross, and nothing from a line that states none", () => {
    expect(statedLeaseBasis("$34.00/SF NNN")).toBe("net");
    expect(statedLeaseBasis("$34.00/SF triple net")).toBe("net");
    expect(statedLeaseBasis("$41.00/SF full service")).toBe("full service");
    expect(statedLeaseBasis("$41.00/SF FSG")).toBe("full service");
    expect(statedLeaseBasis("$28.00/SF modified gross")).toBe("modified gross");
    expect(statedLeaseBasis("$28.00/SF MG")).toBe("modified gross");
    expect(statedLeaseBasis("$30.00/SF gross")).toBe("gross");
    expect(statedLeaseBasis("$35.50/SF/yr")).toBeNull();
    expect(statedLeaseBasis("$35.50/SF/yr net effective")).toBeNull();
    expect(statedLeaseBasis("$35.50/SF, 12,000 gross leasable area")).toBeNull();
  });
});
