import { describe, expect, it } from "vitest";
import {
  isHighRiskZone,
  parseCensusTract,
  parseNfhlFlood,
  resolveNfhlLayerId,
} from "./core";

describe("isHighRiskZone", () => {
  it("flags A- and V-prefixed SFHA zones", () => {
    for (const z of ["A", "AE", "AH", "AO", "A99", "V", "VE"]) {
      expect(isHighRiskZone(z)).toBe(true);
    }
  });
  it("does not flag minimal/moderate/unmapped zones", () => {
    for (const z of ["X", "B", "C", "D", "", "AREA NOT INCLUDED"]) {
      expect(isHighRiskZone(z)).toBe(false);
    }
  });
});

describe("parseCensusTract", () => {
  const body = {
    result: {
      geographies: {
        "Census Tracts": [{ GEOID: "24033805903", NAME: "Census Tract 8059.03" }],
        States: [{ GEOID: "24" }],
      },
    },
  };
  it("extracts the 11-digit tract GEOID", () => {
    expect(parseCensusTract(body)).toBe("24033805903");
  });
  it("vintage-renamed layers still match on the loose key", () => {
    const renamed = {
      result: { geographies: { "2020 Census Tracts": [{ GEOID: "11001004701" }] } },
    };
    expect(parseCensusTract(renamed)).toBe("11001004701");
  });
  it("missing layers / malformed GEOIDs yield null, never a throw", () => {
    expect(parseCensusTract({})).toBeNull();
    expect(parseCensusTract({ result: { geographies: { States: [{ GEOID: "24" }] } } })).toBeNull();
    expect(
      parseCensusTract({ result: { geographies: { "Census Tracts": [{ GEOID: "invalid" }] } } })
    ).toBeNull();
  });
});

describe("parseNfhlFlood", () => {
  it("returns the zone with subtype and the risk call", () => {
    const f = parseNfhlFlood({
      features: [{ attributes: { FLD_ZONE: "AE", ZONE_SUBTY: "" } }],
    });
    expect(f).toEqual({ zone: "AE", subtype: null, isHighRisk: true });
  });
  it("overlapping polygons: the high-risk zone wins", () => {
    const f = parseNfhlFlood({
      features: [
        { attributes: { FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD" } },
        { attributes: { FLD_ZONE: "VE", ZONE_SUBTY: "" } },
      ],
    });
    expect(f?.zone).toBe("VE");
    expect(f?.isHighRisk).toBe(true);
  });
  it("no features = null (point outside mapped polygons), not an error", () => {
    expect(parseNfhlFlood({ features: [] })).toBeNull();
    expect(parseNfhlFlood({})).toBeNull();
  });
});

describe("resolveNfhlLayerId", () => {
  it("finds the Flood Hazard Zones layer by name", () => {
    const svc = {
      layers: [
        { id: 3, name: "LOMRs" },
        { id: 28, name: "Flood Hazard Zones" },
        { id: 29, name: "Flood Hazard Boundaries" },
      ],
    };
    expect(resolveNfhlLayerId(svc)).toBe(28);
  });
  it("returns null when absent — caller records 'unavailable', never guesses", () => {
    expect(resolveNfhlLayerId({ layers: [{ id: 1, name: "Something" }] })).toBeNull();
    expect(resolveNfhlLayerId({})).toBeNull();
  });
});
