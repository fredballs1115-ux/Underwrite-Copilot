import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import table from "@/data/cbsa-counties.json";
import { US_STATE_ABBREV } from "@/lib/address";
import { DATA_METROS, dataMetroForAddress, marketForAddress, metroForAddress, stateForAddress } from "@/lib/market-match";
import { SKYLINES } from "@/lib/skyline";
import { marketPictureFor } from "@/lib/market-picture";
import { CARD, bannerSources } from "@/lib/deal-banner";
import { BRIEFED_CBSA, cbsaOfMarket, countyLine, countyOf, placeDeal } from "./market-county";

// A tract in the county: the county's five digits and any six.
const tract = (county: string) => ({ status: "ok", tractGeoid: `${county}020100`, subject: undefined });
// A label-only address, as a typed line or a memorandum's leaves it.
const line = (label: string) => ({ label });

describe("the delineation the placement reads (#447)", () => {
  const counties = (table as { counties: Record<string, { cbsa: string; county: string; state: string }> }).counties;
  const titles = (table as { titles: Record<string, string> }).titles;

  it("files a metropolitan county in every state and the District, so a tract's state is always known", () => {
    const states = new Set(Object.values(counties).map((c) => US_STATE_ABBREV[c.state.toLowerCase()]).filter(Boolean));
    for (const code of Object.values(US_STATE_ABBREV)) expect(states.has(code), code).toBe(true);
  });

  it("holds every market the site reads to a metro area the delineation files", () => {
    for (const [id, cbsa] of Object.entries(BRIEFED_CBSA)) expect(titles[cbsa], id).toBeTruthy();
    for (const m of DATA_METROS) expect(titles[m.cbsa], m.id).toBeTruthy();
  });

  it("places every metro area the skyline table has a photograph for in a county countyOf can return (the audit of 2026-10-05)", () => {
    // A row no county reaches is a photograph no deal is ever shown:
    // Puerto Rico's four were, until its code was read here.
    const rows = Object.keys(SKYLINES)
      .map((id) => /^cbsa:(\d{5})$/.exec(id)?.[1])
      .filter((code): code is string => !!code);
    expect(rows.length).toBeGreaterThan(100);
    for (const code of rows) {
      const fips = Object.keys(counties).find((f) => counties[f].cbsa === code);
      expect(fips, `cbsa:${code} names a metro area the delineation files`).toBeTruthy();
      expect(countyOf(line("x"), tract(fips!))?.cbsa, `cbsa:${code}`).toBe(code);
    }
    expect(rows).toEqual(expect.arrayContaining(["10380", "32420", "38660", "41980"]));
  });

  it("holds the briefed markets' metro areas to the ones their Realtor.com rows are keyed on", () => {
    // scripts/fetch-realtor.mjs keys each briefed market's row on its CBSA;
    // the placement reads the same code, so the two cannot drift.
    const src = readFileSync("scripts/fetch-realtor.mjs", "utf8");
    const listed = [...src.matchAll(/\{ id: "([a-z_]+)", name: "[^"]+", cbsa: "(\d{5})"/g)].map((m) => [m[1], m[2]]);
    expect(listed.length).toBe(Object.keys(BRIEFED_CBSA).length);
    for (const [id, cbsa] of listed) expect(BRIEFED_CBSA[id], id).toBe(cbsa);
    for (const m of DATA_METROS) expect(cbsaOfMarket(m.id)).toBe(m.cbsa);
  });
});

describe("the deal's county", () => {
  it("reads the census tract's county, with its metro area", () => {
    const c = countyOf(line("5000 Main St, Frisco, TX 75034"), tract("48085"));
    expect(c).toMatchObject({ fips: "48085", name: "Collin County", state: "TX", cbsa: "19100", area: "Dallas-Fort Worth-Arlington, TX", from: "tract" });
    expect(countyLine(c!)).toBe("Collin County, TX");
  });

  it("knows a county in no metro area as that, never as unknown", () => {
    // Richmond County, VA (Warsaw) is in no metro area: not in the table.
    const c = countyOf(line("100 Main St, Warsaw, VA 22572"), tract("51159"));
    expect(c).toMatchObject({ fips: "51159", state: "VA", cbsa: null, name: null });
  });

  it("does not read a tract in another state than the address names", () => {
    expect(countyOf(line("5000 Main St, Frisco, TX 75034"), tract("06037"))).toBeNull();
  });

  it("does not read a tract still pending, or one looked up for the address the deal had before an edit", () => {
    expect(countyOf(line("5000 Main St, Frisco, TX 75034"), { status: "pending", tractGeoid: "48085020100" })).toBeNull();
    const old = { status: "ok", tractGeoid: "48113020100", subject: { lat: 32.8, lng: -96.8, label: "100 Elm St, Dallas, TX 75201" } };
    expect(countyOf(line("5000 Main St, Frisco, TX 75034"), old)).toBeNull();
    // Looked up for this very address, it is read.
    expect(countyOf(line("100 Elm St, Dallas, TX 75201"), old)?.fips).toBe("48113");
  });

  it("reads the county an address names only where it names one of the state's whole", () => {
    expect(countyOf({ label: "x", city: "Frisco", state: "TX", county: "Collin County" }, null)?.fips).toBe("48085");
    expect(countyOf({ label: "x", city: "Alexandria", state: "VA", county: "City of Alexandria" }, null)?.fips).toBe("51510");
    expect(countyOf({ label: "x", city: "Baltimore", state: "MD", county: "Baltimore City" }, null)?.fips).toBe("24510");
    expect(countyOf({ label: "x", city: "Towson", state: "MD", county: "Baltimore County" }, null)?.fips).toBe("24005");
    expect(countyOf({ label: "x", city: "St. Louis", state: "MO", county: "Saint Louis City" }, null)?.fips).toBe("29510");
    expect(countyOf({ label: "x", city: "Hyattsville", state: "MD", county: "Prince George’s County" }, null)?.fips).toBe("24033");
    // A bare name could be a county or a city of that name, and is not read.
    expect(countyOf({ label: "x", city: "Frisco", state: "TX", county: "Collin" }, null)).toBeNull();
    expect(countyOf({ label: "x", city: "Warsaw", state: "VA", county: "Richmond" }, null)).toBeNull();
    // A county the table does not list may be in no metro area, or not a county at all.
    expect(countyOf({ label: "x", city: "Warsaw", state: "VA", county: "Richmond County" }, null)).toBeNull();
  });

  it("places the District as its own county", () => {
    expect(countyOf(line("1100 15th St NW, Washington, DC 20005"), null)).toMatchObject({ fips: "11001", cbsa: "47900" });
  });
});

describe("where the deal is, with its county", () => {
  it("is exactly the address matchers' answer where no county is known", () => {
    const addresses = [
      line("4200 Maple Ave, Dallas, TX 75219"),
      line("1200 Liberty Ave, Pittsburgh, PA 15222"),
      line("5000 Main St, Frisco, TX 75034"),
      line("100 Main St, Harrisburg, PA 17101"),
      { label: "x", city: "Silver Spring", state: "MD" },
      { label: "x", city: "Hoboken", state: "NJ", county: "Hudson County" },
      {},
    ];
    for (const a of addresses) expect(placeDeal(a, null).live, JSON.stringify(a)).toEqual(marketForAddress(a));
  });

  it("reads a suburb its city's name misses as its metro area's figures, said as placed by its county", () => {
    const p = placeDeal(line("5000 Main St, Frisco, TX 75034"), countyOf(line("5000 Main St, Frisco, TX 75034"), tract("48085")));
    expect(p.briefed).toBeNull();
    expect(p.read).toEqual({ id: "dallas", name: "Dallas-Fort Worth" });
    expect(p.placedBy).toEqual({ county: "Collin County, TX", area: "Dallas-Fort Worth-Arlington, TX" });
    expect(p.live).toEqual({ id: "dallas", name: "Dallas-Fort Worth", placedBy: p.placedBy });
  });

  it("gives a county its market's keywords name that market, brief and all", () => {
    // Irving read by its tract is in Dallas County, and "dallas" is the market's word.
    const irving = line("400 E Las Colinas Blvd, Irving, TX 75039");
    const p = placeDeal(irving, countyOf(irving, tract("48113")));
    expect(p.briefed).toEqual({ id: "dallas", name: "Dallas-Fort Worth" });
    expect(p.placedBy).toBeNull();
    expect(p.live).toEqual({ id: "dallas", name: "Dallas-Fort Worth" });
    // Pasadena is Los Angeles County's.
    const pasadena = line("100 W Colorado Blvd, Pasadena, CA 91105");
    expect(placeDeal(pasadena, countyOf(pasadena, tract("06037"))).briefed?.id).toBe("los_angeles");
    // Dulles is Loudoun County's, which is Northern Virginia's word.
    const dulles = line("21000 Atlantic Blvd, Dulles, VA 20166");
    expect(placeDeal(dulles, countyOf(dulles, tract("51107"))).briefed?.id).toBe("nova");
  });

  it("reads a county in the same metro area as another market's figures only, never its brief", () => {
    // Orange County is in Los Angeles's metro area, and is not Los Angeles.
    const irvine = line("100 Spectrum Center Dr, Irvine, CA 92618");
    const p = placeDeal(irvine, countyOf(irvine, tract("06059")));
    expect(p.briefed).toBeNull();
    expect(p.read?.id).toBe("los_angeles");
    expect(p.placedBy?.county).toBe("Orange County, CA");
  });

  it("drops an address word naming a place in another metro area than the county's", () => {
    // "king" is Seattle's for King County; Kingston is in Kitsap County, the
    // Bremerton metro area, which the site does not read.
    const kingston = { label: "x", city: "Kingston", state: "WA", county: "Kitsap County" };
    expect(marketForAddress(kingston)?.id).toBe("seattle");
    const p = placeDeal(kingston, countyOf(kingston, null));
    expect(p.briefed).toBeNull();
    expect(p.live?.id).toBe("state:WA");
    // Dade City is in Pasco County: Tampa's by Tampa's own word, not Miami's.
    const dadeCity = { label: "x", city: "Dade City", state: "FL", county: "Pasco County" };
    expect(marketForAddress(dadeCity)?.id).toBe("miami");
    const q = placeDeal(dadeCity, countyOf(dadeCity, null));
    expect(q.live).toEqual({ id: "tampa", name: DATA_METROS.find((m) => m.id === "tampa")?.name });
    expect(q.placedBy).toBeNull();
  });

  it("places a deal in a county in no metro area in none, whatever its words match", () => {
    const warsaw = { label: "100 Main St, Warsaw, VA 22572", city: "Warsaw", state: "VA", county: "Richmond County" };
    expect(marketForAddress(warsaw)?.id).toBe("richmond");
    const p = placeDeal(warsaw, countyOf(warsaw, tract("51159")));
    expect(p.briefed).toBeNull();
    expect(p.read).toBeNull();
    expect(p.live).toEqual({ id: "state:VA", name: "Virginia" });
  });

  it("reads Washington's and New York's metro areas as the whole metro's markets where no suburb's word names the county", () => {
    const stafford = line("100 Garrisonville Rd, Stafford, VA 22554");
    expect(placeDeal(stafford, countyOf(stafford, tract("51179"))).live).toMatchObject({ id: "dc", placedBy: { county: "Stafford County, VA" } });
    const hackensack = line("25 Main St, Hackensack, NJ 07601");
    expect(placeDeal(hackensack, countyOf(hackensack, tract("34003"))).live).toMatchObject({ id: "newark_jc", placedBy: { county: "Bergen County, NJ" } });
    const garden = line("1 Old Country Rd, Garden City, NY 11530");
    expect(placeDeal(garden, countyOf(garden, tract("36059"))).live).toMatchObject({ id: "nyc", placedBy: { county: "Nassau County, NY" } });
    // Hudson County is Newark / Jersey City's word.
    const hoboken = line("100 Washington St, Hoboken, NJ 07030");
    expect(placeDeal(hoboken, countyOf(hoboken, tract("34017"))).briefed?.id).toBe("newark_jc");
  });

  it("reaches a metro area read without a brief across a state line its keywords never cross", () => {
    // Fort Mill, SC is in York County, the Charlotte metro area; Charlotte's
    // keywords are North Carolina's.
    const fortMill = line("100 Main St, Fort Mill, SC 29715");
    const p = placeDeal(fortMill, countyOf(fortMill, tract("45091")));
    expect(p.read?.id).toBe("charlotte");
    expect(p.placedBy?.county).toBe("York County, SC");
    // Cranberry Township is in Butler County, Pittsburgh's metro area.
    const cranberry = line("20330 Route 19, Cranberry Township, PA 16066");
    expect(placeDeal(cranberry, countyOf(cranberry, tract("42019"))).live).toMatchObject({ id: "pittsburgh", placedBy: { county: "Butler County, PA" } });
  });

  it("reads the state where the county's metro area is one the site does not read", () => {
    const bremerton = line("100 Pacific Ave, Bremerton, WA 98337");
    expect(placeDeal(bremerton, countyOf(bremerton, tract("53035"))).live).toEqual({ id: "state:WA", name: "Washington" });
  });
});

// The audit of 2026-10-05 (MED-6): no deal could reach a Puerto Rico metro
// area's photograph, since the county reader knew the states alone. Its
// county is read now, here only: it places the deal in no market and no
// state's series — the site reads no Puerto Rico figures — so the one thing
// any surface shows for it is the photograph.
describe("a deal in Puerto Rico", () => {
  const ponce = { label: "100 Calle Comercio, Ponce, PR 00716", street: "100 Calle Comercio", city: "Ponce", state: "PR", zip: "00716" };
  const flags = tract("72113");

  it("finds its county and metro area, whether its state is written PR, Puerto Rico or only on its line", () => {
    const want = { fips: "72113", name: "Ponce Municipio", state: "PR", cbsa: "38660", area: "Ponce, PR", from: "tract" };
    expect(countyOf(ponce, flags)).toEqual(want);
    expect(countyOf({ ...ponce, state: "Puerto Rico" }, flags)).toEqual(want);
    expect(countyOf(line(ponce.label), flags)).toEqual(want);
    // A tract in another state than the address names is not the building.
    expect(countyOf(ponce, tract("48085"))).toBeNull();
    expect(countyOf(line(ponce.label), tract("48085"))).toBeNull();
    // A municipio the address names whole, as a county is.
    expect(countyOf({ label: "x", city: "Mayagüez", state: "PR", county: "Mayagüez Municipio" }, null)).toMatchObject({
      fips: "72097",
      cbsa: "32420",
      from: "address",
    });
  });

  it("reads no figures and makes no claim about them: no brief, no market read, no county placement, no state's series", () => {
    const placement = placeDeal(ponce, countyOf(ponce, flags));
    expect(placement).toEqual({ briefed: null, read: null, placedBy: null, live: null, county: countyOf(ponce, flags) });
    // The readers every market surface shares know nothing of it either.
    for (const a of [ponce, line(ponce.label)]) {
      expect(marketForAddress(a)).toBeNull();
      expect(metroForAddress(a)).toBeNull();
      expect(dataMetroForAddress(a)).toBeNull();
      expect(stateForAddress(a)).toBeNull();
    }
  });

  it("wears its metro area's photograph on the deal page and the pipeline card", () => {
    const placement = placeDeal(ponce, countyOf(ponce, flags));
    // The deal page's and the pipeline page's own call.
    const picture = marketPictureFor(ponce, "Ponce, Puerto Rico", placement.briefed ?? placement.read, placement.county);
    expect(picture).toMatchObject({ id: "cbsa:38660", name: SKYLINES["cbsa:38660"].name ?? "Ponce, PR" });
    // The card's picture sources lead with it where the building has none.
    const sources = bannerSources(
      { dealId: "d1", pictureCredit: null, googleEnabled: false, hasStreetAddress: true, hasAddress: true, aerial: false, market: picture },
      CARD,
    );
    expect(sources.map((s) => s.kind)).toEqual(["market"]);
    expect(sources[0]).toMatchObject({ marketId: "cbsa:38660" });
    // San Juan's, Mayagüez's and Aguadilla's the same way.
    for (const [fips, code] of [["72127", "41980"], ["72097", "32420"], ["72005", "10380"]]) {
      const c = countyOf(line("x"), tract(fips));
      expect(marketPictureFor(line("x"), null, null, c)?.id, fips).toBe(`cbsa:${code}`);
    }
  });
});
