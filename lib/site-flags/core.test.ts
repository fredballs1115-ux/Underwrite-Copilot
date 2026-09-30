import { describe, expect, it } from "vitest";
import {
  isHighRiskZone,
  opportunityZoneFrom,
  opportunityZoneRead,
  OZ_CURRENT_NUMBER_CAVEAT,
  OZ_STATE_RULE_V,
  parseCensusCounty,
  parseCensusPlace,
  parseCensusTract,
  parseNfhlFlood,
  resolveNfhlLayerId,
  SITE_FLAGS_V,
  siteFlagsOutdated,
  siteFlagsStale,
  tractStateFips,
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

// ── FEMA's legend and the zone at the building (#425) ───────────────────────
import { floodZoneLine, isMinimalHazard, legendEntryFor, parseNfhlLegend } from "./core";

// The zones layer's legend as the runner printed it (flood-sheet run,
// 2026-09-25): FEMA's labels verbatim — "Regulatory Floodway " carries a
// trailing space — and a few of each entry's FLD_ZONE,ZONE_SUBTY pairs.
const SWATCH = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LEGEND_JSON = {
  layers: [
    { layerId: 27, layerName: "Flood Hazard Boundaries", legend: [{ label: "Limit Lines", imageData: SWATCH, contentType: "image/png", values: [] }] },
    {
      layerId: 28,
      layerName: "Flood Hazard Zones",
      legend: [
        { label: "1% Annual Chance Flood Hazard", imageData: SWATCH, contentType: "image/png", values: ["A,<Null>", "AE,<Null>", "AE,COASTAL FLOODPLAIN", "VE,<Null>", "AE,"] },
        { label: "Regulatory Floodway ", imageData: SWATCH, contentType: "image/png", values: ["AE,FLOODWAY", "AE,FLOODWAY CONTAINED IN CHANNEL"] },
        { label: "Special Floodway", imageData: SWATCH, contentType: "image/png", values: ["AE,DENSITY FRINGE AREA"] },
        { label: "Area of Undetermined Flood Hazard", imageData: SWATCH, contentType: "image/png", values: ["D,<Null>"] },
        { label: "0.2% Annual Chance Flood Hazard", imageData: SWATCH, contentType: "image/png", values: ["X,0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "X,1 PCT DEPTH LESS THAN 1 FOOT"] },
        { label: "Future Conditions 1% Annual Chance Flood Hazard", imageData: SWATCH, contentType: "image/png", values: ["X,1 PCT FUTURE CONDITIONS"] },
        { label: "Area with Reduced Risk Due to Levee", imageData: SWATCH, contentType: "image/png", values: ["X,AREA WITH REDUCED FLOOD RISK DUE TO LEVEE"] },
        { label: "Area with Risk Due to Levee", imageData: SWATCH, contentType: "image/png", values: ["D,AREA WITH FLOOD RISK DUE TO LEVEE"] },
      ],
    },
  ],
};

describe("parseNfhlLegend — FEMA's own legend for the zones layer", () => {
  it("reads the zones layer's eight entries, labels trimmed, swatches as data URIs", () => {
    const legend = parseNfhlLegend(LEGEND_JSON, 28);
    expect(legend.map((e) => e.label)).toEqual([
      "1% Annual Chance Flood Hazard",
      "Regulatory Floodway",
      "Special Floodway",
      "Area of Undetermined Flood Hazard",
      "0.2% Annual Chance Flood Hazard",
      "Future Conditions 1% Annual Chance Flood Hazard",
      "Area with Reduced Risk Due to Levee",
      "Area with Risk Due to Levee",
    ]);
    expect(legend[0].image).toBe(`data:image/png;base64,${SWATCH}`);
    expect(legend[1].values).toContain("AE,FLOODWAY");
  });

  it("answers nothing for another layer, another shape, or a swatch that is not base64", () => {
    expect(parseNfhlLegend(LEGEND_JSON, 99)).toEqual([]);
    expect(parseNfhlLegend({ error: { code: 500 } }, 28)).toEqual([]);
    expect(parseNfhlLegend(null, 28)).toEqual([]);
    const odd = parseNfhlLegend({ layers: [{ layerId: 28, legend: [{ label: "X", imageData: "<svg onload=…>", values: [] }] }] }, 28);
    expect(odd[0].image).toBeNull();
  });
});

describe("legendEntryFor and floodZoneLine — what the map says at the building", () => {
  const legend = parseNfhlLegend(LEGEND_JSON, 28);
  const flag = (zone: string, subtype: string | null) => ({ zone, subtype, isHighRisk: /^[AV]/.test(zone) });

  it("finds the entry a zone is drawn in, by FEMA's own zone and subtype pairs", () => {
    expect(legendEntryFor(legend, flag("AE", null))?.label).toBe("1% Annual Chance Flood Hazard");
    expect(legendEntryFor(legend, flag("AE", "FLOODWAY"))?.label).toBe("Regulatory Floodway");
    expect(legendEntryFor(legend, flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"))?.label).toBe("0.2% Annual Chance Flood Hazard");
    // Zone X of minimal hazard has no entry: FEMA maps it and does not draw it.
    expect(legendEntryFor(legend, flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBeNull();
    expect(isMinimalHazard(flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBe(true);
    expect(isMinimalHazard(flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"))).toBe(false);
  });

  it("says the zone, FEMA's name for it and what it means for a loan", () => {
    expect(floodZoneLine(flag("AE", null), legend)).toBe(
      "The building sits in Zone AE (1% annual chance flood hazard), a Special Flood Hazard Area: a federally backed loan requires flood insurance, and the premium belongs in the expense line.",
    );
    expect(floodZoneLine(flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"), legend)).toContain(
      "Zone X (0.2% annual chance flood hazard), outside the Special Flood Hazard Area",
    );
    expect(floodZoneLine(flag("X", "AREA OF MINIMAL FLOOD HAZARD"), legend)).toContain("an area of minimal flood hazard, which FEMA maps and leaves undrawn");
  });

  it("keeps a point off FEMA's digital map apart from a point of minimal hazard, and says nothing it was not told", () => {
    expect(floodZoneLine(null, legend)).toContain("has no zone at the building's point");
    expect(floodZoneLine(null, legend)).not.toMatch(/no hazard|minimal/i);
    expect(floodZoneLine("unavailable", legend)).toBeNull();
    expect(floodZoneLine(undefined, legend)).toBeNull();
    // Without the legend the zone is still said, without FEMA's name for it.
    expect(floodZoneLine(flag("VE", null))).toBe(
      "The building sits in Zone VE, a coastal high-hazard area where storm waves add to the flood, a Special Flood Hazard Area: a federally backed loan requires flood insurance, and the premium belongs in the expense line.",
    );
  });

  it("says open water, an area the map leaves out, an unstudied Zone D and a plain Zone X as what they are (#472)", () => {
    // A building's point in the river is a point off the building.
    const water = floodZoneLine(flag("OPEN WATER", null), legend)!;
    expect(water).toContain("open water");
    expect(water).not.toContain("Zone OPEN WATER");
    const excluded = floodZoneLine(flag("AREA NOT INCLUDED", null), legend)!;
    expect(excluded).toContain("does not include");
    expect(excluded).not.toContain("Zone AREA");
    // Zone D is a hazard FEMA has not studied — never "mapped".
    const d = floodZoneLine(flag("D", null), legend)!;
    expect(d).toContain("where FEMA has not determined the flood hazard");
    expect(d).not.toContain("the hazard is mapped");
    // A Zone X with no subtype is not one of the shaded hazards.
    const x = floodZoneLine(flag("X", null), legend)!;
    expect(x).toBe("The building sits in Zone X, outside the Special Flood Hazard Area: flood insurance is not required by a federally backed lender.");
    // The regulatory floodway says what it is.
    expect(floodZoneLine(flag("AE", "FLOODWAY"), legend)).toContain("in the regulatory floodway, a Special Flood Hazard Area where new building and fill are restricted");
  });

  it("says FEMA's base flood elevation where FEMA states one, and nothing where it writes -9999 (#472)", () => {
    // The runner's frame query (flood-sheet run 36745937081): Hoboken's AE
    // at 9 feet NAVD88, New Orleans' at -1, a Philadelphia AE with none.
    const hoboken = parseNfhlFlood({ features: [{ attributes: { FLD_ZONE: "AE", ZONE_SUBTY: null, STATIC_BFE: 9, LEN_UNIT: "Feet", V_DATUM: "NAVD88", DEPTH: -9999 } }] })!;
    expect(hoboken.bfe).toEqual({ value: 9, unit: "Feet", datum: "NAVD88" });
    expect(floodZoneLine(hoboken, legend)).toContain("FEMA's base flood elevation there is 9 feet (NAVD88).");
    const nola = parseNfhlFlood({ features: [{ attributes: { FLD_ZONE: "AE", STATIC_BFE: -1, LEN_UNIT: "Feet", V_DATUM: "NAVD88", DEPTH: -9999 } }] })!;
    expect(floodZoneLine(nola, legend)).toContain("there is -1 foot (NAVD88).");
    const none = parseNfhlFlood({ features: [{ attributes: { FLD_ZONE: "AE", STATIC_BFE: -9999, LEN_UNIT: null, V_DATUM: null, DEPTH: -9999 } }] })!;
    expect(none.bfe).toBeUndefined();
    expect(floodZoneLine(none, legend)).not.toContain("base flood elevation");
    const ao = parseNfhlFlood({ features: [{ attributes: { FLD_ZONE: "AO", STATIC_BFE: -9999, DEPTH: 2, LEN_UNIT: "Feet" } }] })!;
    expect(floodZoneLine(ao, legend)).toContain("FEMA maps the flood there at 2 feet deep.");
  });
});

import { floodCell, floodShortLine, floodTag } from "./core";

describe("the flood zone on every summary (#426)", () => {
  const flag = (zone: string, subtype: string | null) => ({ zone, subtype, isHighRisk: /^[AV]/.test(zone) });

  it("tags a pipeline row only in a Special Flood Hazard Area", () => {
    expect(floodTag(flag("AE", null))).toBe("Flood AE");
    expect(floodTag(flag("VE", null))).toBe("Flood VE");
    expect(floodTag(flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"))).toBeNull();
    expect(floodTag(flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBeNull();
    expect(floodTag(null)).toBeNull();
    expect(floodTag("unavailable")).toBeNull();
    expect(floodTag(undefined)).toBeNull();
  });

  it("gives a document's header one line in FEMA's words, and nothing for minimal hazard or an absence", () => {
    expect(floodShortLine(flag("AE", null))).toBe(
      "Flood zone AE: a Special Flood Hazard Area, where flood insurance is required on federally backed debt (FEMA)",
    );
    expect(floodShortLine(flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"))).toBe("Flood zone X — 0.2% annual chance flood hazard (FEMA)");
    expect(floodShortLine(flag("X", "AREA WITH REDUCED FLOOD RISK DUE TO LEVEE"))).toBe(
      "Flood zone X — area with reduced flood risk due to levee (FEMA)",
    );
    expect(floodShortLine(flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBeNull();
    expect(floodShortLine(null)).toBeNull();
    expect(floodShortLine("unavailable")).toBeNull();
  });

  it("says every case as a cell, blank only where the lookup has not answered", () => {
    expect(floodCell(flag("AE", null))).toBe("AE (SFHA)");
    expect(floodCell(flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBe("X (minimal)");
    expect(floodCell(flag("X", "0.2 PERCENT ANNUAL CHANCE FLOOD HAZARD"))).toBe("X (0.2% annual chance flood hazard)");
    expect(floodCell(flag("D", null))).toBe("D");
    expect(floodCell(null)).toBe("no FEMA digital map");
    expect(floodCell("unavailable")).toBe("");
    expect(floodCell(undefined)).toBe("");
  });
});

import { floodContextLine } from "./core";
import { dealContextFor } from "@/lib/deal-context";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractionResult } from "@/lib/anthropic/types";

describe("floodContextLine and the deal context — the zone as the Claude steps read it (#426)", () => {
  const flag = (zone: string, subtype: string | null) => ({ zone, subtype, isHighRisk: /^[AV]/.test(zone) });

  it("names the premium the seller's figures may not carry in a Special Flood Hazard Area, and says the other cases plainly", () => {
    expect(floodContextLine(flag("AE", null))).toBe(
      "FEMA's flood map puts the building in Zone AE, a Special Flood Hazard Area: a federally backed loan requires flood insurance, so the expense line needs a flood premium the seller's figures may not carry.",
    );
    expect(floodContextLine(flag("X", "AREA OF MINIMAL FLOOD HAZARD"))).toBe("FEMA's flood map puts the building in Zone X, an area of minimal flood hazard.");
    expect(floodContextLine(flag("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"))).toContain("Zone X (0.2% annual chance flood hazard), outside the Special Flood Hazard Area");
    expect(floodContextLine(null)).toContain("whether it floods is not known from the map");
    expect(floodContextLine("unavailable")).toBeNull();
    expect(floodContextLine(undefined)).toBeNull();
  });

  it("rides in the deal context after what is being sold, and leaves the context as it was without a lookup", () => {
    const ex = SAMPLE_DEAL.extraction as unknown as ExtractionResult;
    const withFlood = dealContextFor(ex, { flood: flag("AE", null) }) ?? "";
    expect(withFlood).toContain("FEMA's flood map puts the building in Zone AE, a Special Flood Hazard Area");
    const without = dealContextFor(ex) ?? "";
    expect(without).not.toContain("FEMA");
    expect(dealContextFor(ex, null)).toBe(dealContextFor(ex));
  });
});

describe("siteFlagsStale — flags looked up for an address the deal no longer has (#447)", () => {
  const flags = { subject: { lat: 32.8, lng: -96.8, label: "100 Elm St, Dallas, TX 75201" } };
  it("is stale where the lookup's address is not the deal's", () => {
    expect(siteFlagsStale(flags, "5000 Main St, Frisco, TX 75034")).toBe(true);
    expect(siteFlagsStale(flags, "")).toBe(true);
    expect(siteFlagsStale(flags, null)).toBe(true);
  });
  it("is current for the same address, and flags that name no address cannot be judged", () => {
    expect(siteFlagsStale(flags, " 100 Elm St, Dallas, TX 75201 ")).toBe(false);
    expect(siteFlagsStale({}, "5000 Main St, Frisco, TX 75034")).toBe(false);
    expect(siteFlagsStale(null, "5000 Main St, Frisco, TX 75034")).toBe(false);
  });
});

describe("the building's municipality and county from the Census geocoder (#452)", () => {
  // The shapes the runner printed (zori.yml probe run 36658903671), trimmed
  // to the layers read.
  const geo = (layers: Record<string, unknown[]>) => ({ result: { input: {}, geographies: { States: [{ NAME: "California" }], ...layers } } });
  const place = (BASENAME: string, NAME: string, GEOID: string) => ({ BASENAME, NAME, GEOID, LSADC: "25", FUNCSTAT: "A" });
  const county = (NAME: string, GEOID: string) => ({ NAME, GEOID, BASENAME: NAME.replace(/ County$/, ""), LSADC: "06" });

  it("names the incorporated place — the municipality, not the postal city", () => {
    const vanNuys = geo({ "Incorporated Places": [place("Los Angeles", "Los Angeles city", "0644000")], Counties: [county("Los Angeles County", "06037")] });
    expect(parseCensusPlace(vanNuys)).toEqual({ name: "Los Angeles", geoid: "0644000" });
    expect(parseCensusCounty(vanNuys)).toEqual({ name: "Los Angeles County", geoid: "06037" });
    const pasadena = geo({ "Incorporated Places": [place("Pasadena", "Pasadena city", "0656000")], Counties: [county("Los Angeles County", "06037")] });
    expect(parseCensusPlace(pasadena)?.name).toBe("Pasadena");
  });

  it("an unincorporated point is in no place, and a county-equivalent city keeps its own name", () => {
    // Towson: no Incorporated Places layer at all, and Baltimore County.
    const towson = geo({ Counties: [county("Baltimore County", "24005")] });
    expect(parseCensusPlace(towson)).toBeNull();
    expect(parseCensusCounty(towson)).toEqual({ name: "Baltimore County", geoid: "24005" });
    const baltimore = geo({ "Incorporated Places": [place("Baltimore", "Baltimore city", "2404000")], Counties: [county("Baltimore city", "24510")] });
    expect(parseCensusCounty(baltimore)).toEqual({ name: "Baltimore city", geoid: "24510" });
    // An empty layer says the same as none.
    expect(parseCensusPlace(geo({ "Incorporated Places": [], Counties: [county("Baltimore County", "24005")] }))).toBeNull();
  });

  it("a response that is not a geographies answer says nothing either way", () => {
    expect(parseCensusPlace({ result: {} })).toBeUndefined();
    expect(parseCensusPlace(null)).toBeUndefined();
    // Geographies with no county answered nothing a "none" can be read from.
    expect(parseCensusPlace(geo({}))).toBeUndefined();
    expect(parseCensusCounty({ result: {} })).toBeNull();
  });

  it("an answered lookup made under older rules is made again; one that never geocoded is not", () => {
    expect(siteFlagsOutdated({ status: "ok" })).toBe(true);
    // v2 read the place, but looked up at the address's own geocode (#472)
    // and said "not in a zone" against any state's zones.
    expect(siteFlagsOutdated({ status: "ok", v: 2 })).toBe(true);
    expect(siteFlagsOutdated({ status: "ok", v: SITE_FLAGS_V })).toBe(false);
    expect(siteFlagsOutdated({ status: "geocode_failed" })).toBe(false);
    expect(siteFlagsOutdated({ status: "pending" })).toBe(false);
    expect(siteFlagsOutdated(null)).toBe(false);
  });

  it("asks FEMA again for a flood zone it did not answer, once the retry wait has passed (#472)", () => {
    const at = "2026-09-30T00:00:00.000Z";
    const missed = { status: "ok" as const, v: 3, flood: "unavailable" as const, retrievedAt: at };
    expect(siteFlagsOutdated(missed, Date.parse(at) + 60 * 60 * 1000)).toBe(false);
    expect(siteFlagsOutdated(missed, Date.parse(at) + 7 * 60 * 60 * 1000)).toBe(true);
    // An answered zone is not asked again.
    const answered = { ...missed, flood: { zone: "AE", subtype: null, isHighRisk: true } };
    expect(siteFlagsOutdated(answered, Date.parse(at) + 7 * 60 * 60 * 1000)).toBe(false);
  });
});

describe("the Opportunity Zone check — not on the list only where the list holds the tract's state", () => {
  it("reads a tract's state off its GEOID's first two digits, and nothing off anything else", () => {
    expect(tractStateFips("24033805903")).toBe("24"); // Maryland
    expect(tractStateFips("48085030100")).toBe("48"); // Texas
    expect(tractStateFips("06037")).toBeNull(); // a county, not a tract
    expect(tractStateFips("2403380590X")).toBeNull();
    expect(tractStateFips(null)).toBeNull();
    expect(tractStateFips(undefined)).toBeNull();
  });

  it("a tract off a list that holds its state's zones is not listed; a list without them did not check", () => {
    const md = { sourceDataset: "Maryland Opportunity Zones (Socrata hu7s-ph9b)" };
    expect(opportunityZoneFrom({ hit: md, zonesInState: null })).toEqual({ opportunityZone: md });
    expect(opportunityZoneFrom({ hit: null, zonesInState: 149 })).toEqual({ opportunityZone: null });
    // A Texas tract against a registry of Maryland's zones: no answer.
    expect(opportunityZoneFrom({ hit: null, zonesInState: 0 })).toEqual({
      opportunityZone: "unchecked",
      opportunityZoneUnchecked: "state_not_loaded",
    });
    // The state's count could not be read: no answer either.
    expect(opportunityZoneFrom({ hit: null, zonesInState: null })).toEqual({
      opportunityZone: "unchecked",
      opportunityZoneUnchecked: "lookup_failed",
    });
  });

  it("says a miss was checked by the tract's current number, and never that the site is outside a zone", () => {
    const off = opportunityZoneRead({ opportunityZone: null, v: SITE_FLAGS_V });
    expect(off.kind).toBe("not_listed");
    expect(off.label).toBe("Tract's current number not on the 2018 Opportunity Zone list");
    expect(off.caveat).toBe(OZ_CURRENT_NUMBER_CAVEAT);
    expect(off.caveat).toContain("checked by the tract's current number");
    for (const text of [off.label, off.caveat ?? ""]) {
      expect(text).not.toMatch(/not in an opportunity zone/i);
      expect(text).not.toMatch(/outside (an|the) opportunity zone/i);
    }
    expect(opportunityZoneRead({ opportunityZone: { sourceDataset: "x" }, v: SITE_FLAGS_V })).toEqual({
      kind: "listed",
      label: "Opportunity Zone tract (2018 designations)",
      caveat: null,
    });
  });

  it("a miss read by the 2010 tract the zones were designated on owes no caveat (#473)", () => {
    const off = opportunityZoneRead({ opportunityZone: null, v: SITE_FLAGS_V, ozTract: { geoid: "24005400100", vintage: "2010" } });
    expect(off).toEqual({ kind: "not_listed", label: "Tract not on the 2018 Opportunity Zone list", caveat: null });
    // Read by the current number, it keeps the caveat.
    const current = opportunityZoneRead({ opportunityZone: null, v: SITE_FLAGS_V, ozTract: { geoid: "24005400100", vintage: "current" } });
    expect(current.caveat).toBe(OZ_CURRENT_NUMBER_CAVEAT);
  });

  it("a 'not on the list' stored before the state rule is no answer, and a check that did not run says why", () => {
    // v2 and earlier read the miss against whatever state the registry held.
    expect(OZ_STATE_RULE_V).toBeLessThanOrEqual(SITE_FLAGS_V);
    expect(opportunityZoneRead({ opportunityZone: null, v: 2 })).toEqual({ kind: "unchecked", label: "Opportunity Zone: not checked", caveat: null });
    expect(opportunityZoneRead({ opportunityZone: null })).toEqual({ kind: "unchecked", label: "Opportunity Zone: not checked", caveat: null });
    const why = (r: "no_tract" | "tract_failed" | "state_not_loaded" | "lookup_failed") =>
      opportunityZoneRead({ opportunityZone: "unchecked", opportunityZoneUnchecked: r, v: SITE_FLAGS_V }).label;
    expect(why("state_not_loaded")).toBe("Opportunity Zone: not checked (no zones on file for this state)");
    expect(why("no_tract")).toBe("Opportunity Zone: not checked (no census tract for this point)");
    expect(why("tract_failed")).toBe("Opportunity Zone: not checked (the census tract lookup failed)");
    expect(why("lookup_failed")).toBe("Opportunity Zone: not checked (the zone list could not be read)");
    // An older "unchecked" carries no reason: it names none rather than guess one.
    expect(opportunityZoneRead({ opportunityZone: "unchecked", v: 2 }).label).toBe("Opportunity Zone: not checked");
  });
});
