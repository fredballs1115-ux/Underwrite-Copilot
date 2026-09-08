import { describe, it, expect } from "vitest";
import {
  buildingSfFromMetrics,
  buyBoxCheckSource,
  evaluateBuyBox,
  occupancyPctFromMetrics,
  parseSf,
  findGoingInCap,
  findMetric,
  findPriceRow,
  METRIC_FIND,
  foldBuyBoxChecks,
  isEmptyBuyBox,
  buyBoxLines,
  parseMoney,
  parsePct,
  resolveBuyBoxStore,
  sanitizeGeoTargets,
  serializeBuyBoxStore,
  activeBox,
  type BuyBox,
  type BuyBoxStore,
} from "./criteria";

function ex(
  metrics: Array<[string, string]>,
  extra: { assetClass?: string; market?: string; address?: string } = {},
) {
  return {
    assetClass: extra.assetClass ?? "",
    market: extra.market ?? "",
    address: extra.address ?? "",
    metrics: metrics.map(([label, value]) => ({ label, value })),
  };
}

const check = (r: ReturnType<typeof evaluateBuyBox>, label: string) =>
  r.find((c) => c.label === label);

// These lock the shared METRIC_FIND patterns: evaluateBuyBox and
// scoreMandateFit read figures out of the extraction with the same regexes,
// so a drift in either would break one of these characterization cases.
describe("evaluateBuyBox — reads the expected figures", () => {
  it("passes a going-in cap that clears the floor", () => {
    const box: BuyBox = { minCapPct: 5.0 };
    const r = evaluateBuyBox("auto", ex([["Going-in cap rate", "5.50%"]]), box);
    expect(check(r, "Going-in cap")?.status).toBe("pass");
  });

  it("does not read the exit cap as the going-in cap", () => {
    const box: BuyBox = { minCapPct: 5.0 };
    // Only an exit cap present → the going-in check has no figure → unknown.
    const r = evaluateBuyBox("auto", ex([["Exit cap rate", "6.00%"]]), box);
    expect(check(r, "Going-in cap")?.status).toBe("unknown");
  });

  it("the Size check reads the building, never the land or a unit", () => {
    const box: BuyBox = { sfMin: 100_000, sfMax: 300_000 };
    const r = evaluateBuyBox(
      "auto",
      ex([
        ["Land SF", "871,200"],
        ["Average unit size", "850 SF"],
        ["Total SF", "200,000 SF"],
      ]),
      box,
    );
    expect(check(r, "Size")?.status).toBe("pass");
    const landOnly = evaluateBuyBox("auto", ex([["Land SF", "871,200"]]), box);
    expect(check(landOnly, "Size")?.status).toBe("unknown");
  });

  it("reads square footage but not a per-SF price", () => {
    const box: BuyBox = { sfMin: 100_000, sfMax: 300_000 };
    const r = evaluateBuyBox(
      "auto",
      ex([
        ["Price per SF", "$250"],
        ["Total SF", "200,000 SF"],
      ]),
      box,
    );
    expect(check(r, "Size")?.status).toBe("pass");
  });

  it("reads a sale price as the price, never what the building last traded for", () => {
    const box: BuyBox = { priceMaxM: 100 };
    const sale = evaluateBuyBox(
      "auto",
      ex([
        ["Last sale price (2019)", "$140,000,000"],
        ["Sale price", "$80,000,000"],
      ]),
      box,
    );
    expect(check(sale, "Price")?.status).toBe("pass");
    const onlyLast = evaluateBuyBox("auto", ex([["Last sale price (2019)", "$140,000,000"]]), box);
    expect(check(onlyLast, "Price")?.status).toBe("unknown");
  });

  it("the basis ceiling reads the price per unit, never a rent or an expense per unit", () => {
    const box: BuyBox = { maxPerUnitK: 100 };
    const r = evaluateBuyBox(
      "auto",
      ex([
        ["Avg rent per unit", "$2,400"],
        ["Insurance per unit", "$1,100"],
        ["Price per unit", "$252,000"],
      ]),
      box,
    );
    expect(check(r, "Basis / unit")?.status).toBe("miss");
    expect(check(r, "Basis / unit")?.detail).toContain("$252k");
    const rentOnly = evaluateBuyBox("auto", ex([["Avg rent per unit", "$2,400"]]), box);
    expect(check(rentOnly, "Basis / unit")?.status).toBe("unknown");
  });

  it("reads a 'Pricing' header as the price and never a reserve or bid figure", () => {
    const box: BuyBox = { priceMaxM: 100 };
    const r = evaluateBuyBox(
      "auto",
      ex([
        ["Reserve price", "$140,000,000"],
        ["Pricing", "$80,000,000"],
      ]),
      box,
    );
    expect(check(r, "Price")?.status).toBe("pass");
  });

  it("reads the asking price but not the per-unit price", () => {
    const box: BuyBox = { priceMaxM: 100 };
    const r = evaluateBuyBox(
      "auto",
      ex([
        ["Price per unit", "$180,000"],
        ["Asking price", "$80,000,000"],
      ]),
      box,
    );
    expect(check(r, "Price")?.status).toBe("pass");
  });

  it("folds an IRR shortfall to a near-miss inside 1pt", () => {
    const box: BuyBox = { minIrrPct: 15.0 };
    const r = evaluateBuyBox("auto", ex([["IRR", "14.5%"]]), box);
    expect(check(r, "Target return")?.status).toBe("near");
    expect(foldBuyBoxChecks(r)).toBe("near");
  });
});

describe("isEmptyBuyBox — new fields count as content", () => {
  it("a CoC-only box is not empty", () => {
    expect(isEmptyBuyBox({ minCoCPct: 6 })).toBe(false);
  });
  it("a dealbreaker-only box is not empty", () => {
    expect(isEmptyBuyBox({ dealbreakers: { requireGeography: true } })).toBe(false);
  });
  it("an all-off dealbreakers object is still empty", () => {
    expect(isEmptyBuyBox({ dealbreakers: {} })).toBe(true);
  });
});

describe("buyBoxLines — surfaces CoC and dealbreakers to the synthesizer", () => {
  it("includes the cash-on-cash floor and the active red lines", () => {
    const lines = buyBoxLines({
      minCoCPct: 6.5,
      dealbreakers: { requireGeography: true, maxPriceM: 75 },
    });
    expect(lines.some((l) => /cash-on-cash: 6.5%/i.test(l))).toBe(true);
    expect(lines.some((l) => /Dealbreakers:/.test(l))).toBe(true);
    expect(lines.some((l) => /≤ \$75M/.test(l))).toBe(true);
  });
});

describe("buy-box store — legacy + multi-box round-trips", () => {
  it("reads a legacy bare box as one default-named box", () => {
    const store = resolveBuyBoxStore({ minCapPct: 5 } as BuyBox);
    expect(store.boxes).toHaveLength(1);
    expect(store.boxes[0].name).toBe("Mandate");
    expect(store.activeId).toBe("default");
    expect(activeBox(store)?.minCapPct).toBe(5);
  });

  it("an empty stored value is an empty store with no active box", () => {
    expect(resolveBuyBoxStore(null).boxes).toHaveLength(0);
    expect(activeBox(resolveBuyBoxStore({}))).toBeNull();
  });

  it("reads a v2 envelope and honors the active id", () => {
    const store = resolveBuyBoxStore({
      v: 2,
      activeId: "b",
      boxes: [
        { id: "a", name: "Core", box: { minCapPct: 5 } },
        { id: "b", name: "Value-add", box: { minCapPct: 7 } },
      ],
    });
    expect(store.boxes).toHaveLength(2);
    expect(store.activeId).toBe("b");
    expect(activeBox(store)?.minCapPct).toBe(7);
  });

  it("falls back to the first box when the active id is stale", () => {
    const store = resolveBuyBoxStore({
      v: 2,
      activeId: "gone",
      boxes: [{ id: "a", name: "Core", box: { minCapPct: 5 } }],
    });
    expect(store.activeId).toBe("a");
  });

  it("serializes a single default box back to a bare box (backward-compatible)", () => {
    const store: BuyBoxStore = {
      boxes: [{ id: "default", name: "Mandate", box: { minCapPct: 5 } }],
      activeId: "default",
    };
    const out = serializeBuyBoxStore(store) as BuyBox;
    expect(out.minCapPct).toBe(5);
    expect("boxes" in (out as object)).toBe(false);
  });

  it("keeps the envelope when a single box has a custom name", () => {
    const store: BuyBoxStore = {
      boxes: [{ id: "x", name: "Core plus", box: { minCapPct: 5 } }],
      activeId: "x",
    };
    const out = serializeBuyBoxStore(store) as { boxes: unknown[] };
    expect(Array.isArray(out.boxes)).toBe(true);
    // …and it round-trips with the name intact.
    const back = resolveBuyBoxStore(out);
    expect(back.boxes[0].name).toBe("Core plus");
  });

  it("serializes an empty store to null", () => {
    expect(serializeBuyBoxStore({ boxes: [], activeId: "" })).toBeNull();
    expect(
      serializeBuyBoxStore({ boxes: [{ id: "a", name: "Mandate", box: {} }], activeId: "a" }),
    ).toBeNull();
  });

  it("round-trips two named boxes with the active selection", () => {
    const store: BuyBoxStore = {
      boxes: [
        { id: "a", name: "Core", box: { minCapPct: 5 } },
        { id: "b", name: "Value-add", box: { minCapPct: 7 } },
      ],
      activeId: "b",
    };
    const back = resolveBuyBoxStore(serializeBuyBoxStore(store));
    expect(back.boxes.map((x) => x.name)).toEqual(["Core", "Value-add"]);
    expect(back.activeId).toBe("b");
    expect(activeBox(back)?.minCapPct).toBe(7);
  });
});

describe("shared parsers", () => {
  it("parseMoney handles suffixes and separators", () => {
    expect(parseMoney("$70.7M")).toBe(70_700_000);
    expect(parseMoney("285k")).toBe(285_000);
    expect(parseMoney("200,000 SF")).toBe(200_000);
  });
  it("parsePct pulls a percentage", () => {
    expect(parsePct("5.25%")).toBe(5.25);
  });
});

describe("sanitizeGeoTargets — the save keeps what the picker builds", () => {
  it("aliases survive the round-trip, sanitized and capped", () => {
    const raw = JSON.stringify([
      { label: "Dallas-Fort Worth", state: "TX", aliases: ["Dallas", " FORT WORTH ", "x", 7] },
    ]);
    const out = sanitizeGeoTargets(raw);
    // lowercased + trimmed; one-char entries ("x", 7→"7") are dropped
    expect(out?.[0].aliases).toEqual(["dallas", "fort worth"]);
  });
  it("accepts up to 24 chips — the picker's cap, not the old 12", () => {
    const raw = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({ label: `Market ${i}` })),
    );
    expect(sanitizeGeoTargets(raw)).toHaveLength(24);
  });
  it("junk never throws and never yields empty chips", () => {
    expect(sanitizeGeoTargets("not json")).toBeUndefined();
    expect(sanitizeGeoTargets(JSON.stringify([{ city: "no label" }]))).toBeUndefined();
    expect(sanitizeGeoTargets(JSON.stringify({ label: "not an array" }))).toBeUndefined();
  });
});

describe("geography — market-level territory chips", () => {
  it("an aliased chip matches every city in its market, and only those", () => {
    const box: BuyBox = {
      geos: [{ label: "Dallas-Fort Worth", state: "TX", aliases: ["dallas", "fort worth"] }],
    };
    const hit = evaluateBuyBox("auto", ex([], { market: "Fort Worth, TX" }), box);
    expect(check(hit, "Geography")?.status).toBe("pass");
    const miss = evaluateBuyBox("auto", ex([], { market: "Houston, TX" }), box);
    expect(check(miss, "Geography")?.status).toBe("miss");
  });
  it("alias needles are state-gated — a Seattle chip never hits King St in DC", () => {
    const seattle: BuyBox = {
      geos: [{ label: "Seattle", state: "WA", aliases: ["seattle", "king"] }],
    };
    const dc = evaluateBuyBox(
      "auto",
      ex([], { address: "1201 King St NW, Washington, DC 20005" }),
      seattle,
    );
    expect(check(dc, "Geography")?.status).toBe("miss");
    const wa = evaluateBuyBox("auto", ex([], { address: "410 S King St, Seattle, WA" }), seattle);
    expect(check(wa, "Geography")?.status).toBe("pass");
    // Without any state token the aliases stay off; the label still works.
    const bare = evaluateBuyBox("auto", ex([], { market: "Seattle" }), seattle);
    expect(check(bare, "Geography")?.status).toBe("pass"); // label needle, ungated
  });
});

// The first signal stands in for the extraction mid-screen. Its cap is a fast
// read with no label to check, so it counts as the going-in cap only when it
// can be a cap on the price at all — a yield on cost or a stabilized pro
// forma on a conversion reads as "105%" here, and a buy-box check on that
// would be confidently wrong.
describe("buyBoxCheckSource — the first signal's cap only when it can be a cap", () => {
  const signal = (goingInCap: string) => ({
    dealName: "1200 K Street — Office-to-Residential Conversion",
    assetClass: "multifamily",
    market: "Washington, DC",
    askPrice: "$20,000,000",
    goingInCap,
    perUnit: "$62,500 per unit",
  });
  const capRow = (src: ReturnType<typeof buyBoxCheckSource>) =>
    src?.metrics.find((m) => /going-in cap/i.test(m.label)) ?? null;

  it("keeps a plausible going-in cap", () => {
    const src = buyBoxCheckSource(null, signal("6.2%"), null);
    expect(capRow(src)?.value).toBe("6.2%");
    expect(src?.metrics.find((m) => m.label === "Asking price")?.value).toBe("$20,000,000");
  });

  it("drops a figure that cannot be a cap on the price — a yield on cost, a garbled read, a blank", () => {
    expect(capRow(buyBoxCheckSource(null, signal("105%"), null))).toBeNull();
    expect(capRow(buyBoxCheckSource(null, signal("0%"), null))).toBeNull();
    expect(capRow(buyBoxCheckSource(null, signal(""), null))).toBeNull();
    // The price still stands in either way.
    expect(buyBoxCheckSource(null, signal("105%"), null)?.metrics.length).toBeGreaterThan(0);
  });

  it("the full extraction, when present, is used as-is", () => {
    const extraction = {
      assetClass: "multifamily",
      market: "Washington, DC",
      metrics: [{ label: "Going-in cap rate", value: "5.9%" }],
    };
    expect(capRow(buyBoxCheckSource(extraction, signal("105%"), null))?.value).toBe("5.9%");
  });
});

// The going-in cap is today's income against the price. A plan deal's
// stabilized / pro forma cap or yield on cost describes the finished project,
// and reading it as the going-in cap is how a conversion "cleared" a 6% floor
// at 11.7%. One reader for the buy-box check, the mandate score and the
// market memory.
describe("findGoingInCap — never the finished project's figure", () => {
  const rows = (pairs: Array<[string, string]>) => pairs.map(([label, value]) => ({ label, value }));

  it("prefers the labelled going-in figure over a stabilized cap in the same OM", () => {
    const m = findGoingInCap(rows([["Stabilized cap rate", "11.7%"], ["Going-in cap rate", "6.2%"]]));
    expect(m?.value).toBe("6.2%");
  });

  it("accepts a plain cap rate, but not the exit cap or the finished project's", () => {
    expect(findGoingInCap(rows([["Cap rate", "6.0%"]]))?.value).toBe("6.0%");
    expect(findGoingInCap(rows([["Exit cap rate", "5.5%"]]))).toBeNull();
    expect(findGoingInCap(rows([["Cap rate (stabilized, pro forma)", "11.7%"]]))).toBeNull();
    expect(findGoingInCap(rows([["Stabilized cap rate", "11.7%"]]))).toBeNull();
    expect(findGoingInCap(rows([["Going-in cap rate (stabilized)", "11.7%"]]))).toBeNull();
    expect(findGoingInCap(rows([["Yield on cost", "11.7%"]]))).toBeNull();
    expect(findGoingInCap(rows([["Cap rate at completion", "7.0%"]]))).toBeNull();
  });

  it("evaluateBuyBox: a conversion with only a stabilized cap is 'unknown' and says why, never a pass", () => {
    const box: BuyBox = { minCapPct: 5.0 };
    const conversion = {
      ...ex([
        ["Purchase price", "$20,000,000"],
        ["Stabilized cap rate", "11.7%"],
        ["NOI (stabilized, pro forma)", "$21,000,000"],
      ]),
      strategy: { kind: "conversion" },
    };
    const c = check(evaluateBuyBox("multifamily", conversion, box), "Going-in cap")!;
    expect(c.status).toBe("unknown");
    expect(c.detail).toMatch(/a conversion deal has no going-in cap/);
    expect(c.detail).toMatch(/yield on total cost/);
    // A stabilized asset with the same missing figure keeps the plain wording.
    const plain = check(evaluateBuyBox("multifamily", ex([["Purchase price", "$20,000,000"]]), box), "Going-in cap")!;
    expect(plain.status).toBe("unknown");
    expect(plain.detail).toMatch(/no parseable cap rate yet/);
  });
});

// The building's size is read by the shape of its label, as the unit count
// is: every name an OM gives the whole building, and never the land, a
// unit, a component or a partial.
describe("buildingSfFromMetrics — the building's size, never the land's, a unit's or a component's", () => {
  it("reads every name an OM gives the size", () => {
    for (const label of [
      "SF",
      "Total SF",
      "Total SF:",
      "Building SF",
      "Building size",
      "Building size (SF)",
      "Size (SF)",
      "Rentable SF",
      "Net rentable SF",
      "Rentable square feet",
      "Net rentable area",
      "Gross building area",
      "GBA",
      "RSF",
      "Total RSF",
      "NRA",
      "GLA",
      "RBA",
      "Square footage",
      "Sq. Ft.",
      "Total square feet",
      "Gross SF",
      "Leasable SF",
      "Floor area",
      "Total floor area",
      "Improvements (SF)",
      "SF (proposed)",
      "Proposed SF",
      "Total building SF",
      "Rentable area",
    ]) {
      expect(buildingSfFromMetrics([{ label, value: "250,000 SF" }]), label).toBe(250_000);
    }
  });

  it("never the land, a unit, a component or a partial", () => {
    for (const label of [
      "Land SF",
      "Site SF",
      "Site area",
      "Lot size",
      "Parcel size",
      "Land area",
      "Acres",
      "Average unit size",
      "Avg SF/unit",
      "Unit SF",
      "Retail SF",
      "Office SF",
      "Warehouse SF",
      "Vacant SF",
      "Available SF",
      "Leased SF",
      "Occupied SF",
      "SF per unit",
      "Price per SF",
      "Rent per SF",
      "Expansion SF",
      "Total SF (office)",
      "Total SF (Phase II)",
    ]) {
      expect(buildingSfFromMetrics([{ label, value: "250,000 SF" }]), label).toBeNull();
    }
    expect(
      buildingSfFromMetrics([
        { label: "Land SF", value: "217,800" },
        { label: "Total SF", value: "250,000" },
      ]),
    ).toBe(250_000);
  });

  it("parseSf reads the shapes a value takes and refuses what is not a building area", () => {
    expect(parseSf("250,000")).toBe(250_000);
    expect(parseSf("250,000 SF")).toBe(250_000);
    expect(parseSf("250k sq ft")).toBe(250_000);
    expect(parseSf("1.2M SF")).toBe(1_200_000);
    expect(parseSf("3,600 SF")).toBe(3_600);
    expect(parseSf("250,000 SF (rentable)")).toBe(250_000);
    expect(parseSf("approx. 250,000 SF")).toBe(250_000);
    expect(parseSf("12 acres")).toBeNull();
    expect(parseSf("248 units")).toBeNull();
    expect(parseSf("250,000–300,000 SF")).toBeNull();
    expect(parseSf("$45/SF")).toBeNull();
    expect(parseSf("50")).toBeNull();
    // A bare "Size" row whose value is an acreage is a land size, not a building.
    expect(buildingSfFromMetrics([{ label: "Size", value: "12 acres" }])).toBeNull();
    expect(buildingSfFromMetrics([{ label: "Size", value: "250,000 SF" }])).toBe(250_000);
  });
});

// Today's occupancy — the cell the Excel model labels "In-Place Occupancy"
// and the retrade diff's Occupancy row — is never the sponsor's stabilized
// or pro forma figure.
describe("occupancyPctFromMetrics — today's occupancy, never the sponsor's stabilized figure", () => {
  it("an in-place row wins over a stabilized one listed first", () => {
    expect(
      occupancyPctFromMetrics([
        { label: "Stabilized occupancy", value: "95%" },
        { label: "Current occupancy", value: "42%" },
      ]),
    ).toBe(42);
    expect(
      occupancyPctFromMetrics([
        { label: "Occupancy (pro forma)", value: "95%" },
        { label: "Occupancy", value: "88%" },
      ]),
    ).toBe(88);
  });

  it("a plain occupancy row reads; a forward, break-even, market or pre-leasing row never does", () => {
    expect(occupancyPctFromMetrics([{ label: "Occupancy", value: "93.5%" }])).toBe(93.5);
    expect(occupancyPctFromMetrics([{ label: "Physical occupancy", value: "91%" }])).toBe(91);
    expect(occupancyPctFromMetrics([{ label: "Leased", value: "96%" }])).toBe(96);
    for (const label of [
      "Stabilized occupancy",
      "Occupancy (pro forma)",
      "Projected occupancy",
      "Target occupancy",
      "Year 1 occupancy",
      "Occupancy at stabilization",
      "Pre-leased",
      "Break-even occupancy",
      "Submarket occupancy",
      "Market occupancy",
      "Average occupancy (comps)",
      "Economic occupancy",
    ]) {
      expect(occupancyPctFromMetrics([{ label, value: "95%" }]), label).toBeNull();
    }
  });
});

// The third review's cases: a label that carries "asking", "pricing" or a
// slash is not the price unless it names the ask; a value that carries a
// square-footage noun in any spelling is a size.
describe("METRIC_FIND.price — rents, rates, per-key figures and loan pricing are never the price", () => {
  const price = (label: string) =>
    findMetric([{ label, value: "$2,150" }], METRIC_FIND.price.inc, METRIC_FIND.price.exc);

  it("refuses an asking rent or rate, a price per key in either spelling, and loan / debt / insurance pricing", () => {
    for (const label of [
      "Asking Rent",
      "Asking Cap Rate",
      "Asking Yield",
      "Asking rate",
      "Price / Key",
      "Price/Door",
      "Asking Price / Key",
      "List Price / Key",
      "Whisper Price / Key",
      "Price / RSF",
      "Price / GLA",
      "Price / NRSF",
      "Price / Acre",
      "Price Per Door",
      "Loan Pricing",
      "Debt Pricing",
      "Insurance Pricing",
      "Repricing Risk",
      "Pricing (Spread)",
      "Pricing Date",
      "Original List Price",
      "Offers Due",
      "Bid Deadline",
    ]) {
      expect(price(label), label).toBeNull();
    }
  });

  it("still reads the ask under every name an OM gives it", () => {
    for (const label of [
      "Ask",
      "Asking",
      "Asking price",
      "Asking Price (Reduced)",
      "Pricing",
      "Pricing Guidance",
      "Guidance Pricing",
      "Price / Terms",
      "Purchase Price / Terms",
      "Purchase price per the PSA",
      "Whisper",
      "Sale price",
      "List price",
      "Offer price",
      "Acquisition cost",
      "Price",
    ]) {
      expect(price(label)?.label, label).toBe(label);
    }
  });
});

describe("parseSf — the shapes the third review found blank, and the sizes it found skipped", () => {
  it("reads the figure the square-footage noun follows, in every spelling", () => {
    expect(parseSf("250,000 Sq. Ft.")).toBe(250_000);
    expect(parseSf("250,000 s.f.")).toBe(250_000);
    expect(parseSf("±250,000 SF")).toBe(250_000);
    expect(parseSf("250,000 SF+")).toBe(250_000);
    expect(parseSf("250,000 SF total")).toBe(250_000);
    expect(parseSf("1.2 million SF")).toBe(1_200_000);
    expect(parseSf("250,000 SF on 12.5 acres")).toBe(250_000);
    expect(parseSf("250,000 SF; 6.2 AC site")).toBe(250_000);
    expect(parseSf("2 buildings totaling 250,000 SF")).toBe(250_000);
    expect(parseSf("Approximately 250,000 rentable SF")).toBe(250_000);
    expect(parseSf("250,000 NRSF")).toBe(250_000);
    expect(parseSf("250K")).toBe(250_000);
    expect(parseSf("0.25M")).toBe(250_000);
    expect(parseSf("250,000 / 12,000 SF")).toBeNull();
    expect(parseSf("250,000 - 300,000 SF")).toBeNull();
  });

  it("reads NRSF, GSF, an approximate or ± label, a property size and 'Building Size / SF'", () => {
    for (const label of [
      "NRSF",
      "Total NRSF",
      "GSF",
      "Building GSF",
      "USF",
      "Approx. SF",
      "± SF",
      "Building Size / SF",
      "Property Size",
      "Asset Size",
      "Size",
    ]) {
      expect(buildingSfFromMetrics([{ label, value: "250,000 SF" }]), label).toBe(250_000);
    }
    expect(buildingSfFromMetrics([{ label: "Units / SF", value: "250,000 SF" }])).toBeNull();
  });

  it("a bare 'Size' row is the land's on a deck that states acreage or a lot, and needs a square-footage noun elsewhere", () => {
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "545,000 SF" },
        { label: "Acres", value: "12.5" },
        { label: "Zoning", value: "C-2" },
      ]),
    ).toBeNull();
    expect(buildingSfFromMetrics([{ label: "Size", value: "250,000" }])).toBeNull();
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "250,000 SF" },
        { label: "Asking price", value: "$50,000,000" },
      ]),
    ).toBe(250_000);
  });
});

// The fourth review's cases: an occupancy COST or GROWTH is not an
// occupancy, a row without a percentage never shadows the one with it, a
// T-12 average is today's figure; a value naming two sizes is neither; a
// bare "Asking:" and a total consideration read, an exit price and a prior
// year's sale never do; a bare "Size" beside a stated lot is the land's
// only when the two figures agree.
describe("the fourth review's occupancy, size and price cases", () => {
  it("an occupancy cost or growth rate is never the occupancy, and a row with no percentage never shadows it", () => {
    expect(occupancyPctFromMetrics([{ label: "Occupancy cost ratio", value: "12%" }])).toBeNull();
    expect(occupancyPctFromMetrics([{ label: "Occupancy cost", value: "12.5%" }])).toBeNull();
    expect(occupancyPctFromMetrics([{ label: "Occupancy growth", value: "2%" }])).toBeNull();
    expect(
      occupancyPctFromMetrics([
        { label: "Leased SF", value: "240,000" },
        { label: "Occupancy", value: "92%" },
      ]),
    ).toBe(92);
    expect(
      occupancyPctFromMetrics([
        { label: "Occupied units", value: "288" },
        { label: "Occupancy", value: "92%" },
      ]),
    ).toBe(92);
    expect(occupancyPctFromMetrics([{ label: "T-12 Average Occupancy", value: "91%" }])).toBe(91);
    expect(occupancyPctFromMetrics([{ label: "Occupancy (as of 8/1/2026)", value: "89.5%" }])).toBe(89.5);
    expect(
      occupancyPctFromMetrics([
        { label: "Occupancy", value: "95% (stabilized)" },
        { label: "Current occupancy", value: "42%" },
      ]),
    ).toBe(42);
  });

  it("a value naming two square footages is neither of them", () => {
    expect(parseSf("40,000 SF office and 210,000 SF warehouse")).toBeNull();
    expect(parseSf("Bldg A 120,000 SF, Bldg B 130,000 SF")).toBeNull();
    expect(parseSf("250,000 SF (2 buildings)")).toBe(250_000);
    expect(
      buildingSfFromMetrics([
        { label: "Total SF", value: "40,000 SF office and 210,000 SF warehouse" },
        { label: "Building SF", value: "250,000 SF" },
      ]),
    ).toBe(250_000);
  });

  it("a bare 'Asking:' or 'Ask —' and a total consideration read; an exit price or a prior year's sale never does", () => {
    const price = (label: string) =>
      findMetric([{ label, value: "$42,000,000" }], METRIC_FIND.price.inc, METRIC_FIND.price.exc);
    for (const label of ["Asking:", "Ask —", "Ask -", "Asking (unpriced)", "Total consideration", "Purchase Price:"]) {
      expect(price(label)?.label, label).toBe(label);
    }
    for (const label of [
      "Exit price",
      "Sale price (2019)",
      "Sale Price (2021)",
      "Last sale price",
      "Price range",
      "Strike price",
      "Target price",
      "Reserve price",
      "Underwritten price",
    ]) {
      expect(price(label), label).toBeNull();
    }
  });

  it("a bare 'Size' or 'Total Area' beside a stated lot is the land's only when the two figures agree", () => {
    expect(
      buildingSfFromMetrics([
        { label: "Total Area", value: "285,000 SF" },
        { label: "Land area", value: "4.2 acres" },
      ]),
    ).toBe(285_000);
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "545,000 SF" },
        { label: "Acres", value: "12.5" },
      ]),
    ).toBeNull();
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "250,000 SF" },
        { label: "Lot size", value: "1.2 acres" },
      ]),
    ).toBe(250_000);
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "52,272 SF" },
        { label: "Lot size", value: "1.2 acres" },
      ]),
    ).toBeNull();
    expect(
      buildingSfFromMetrics([
        { label: "Size", value: "545,000 SF" },
        { label: "Lot size", value: "545,000 SF" },
      ]),
    ).toBeNull();
    // A label that names the building is the building even when the lot is
    // the same size — only a bare label is ambiguous.
    expect(
      buildingSfFromMetrics([
        { label: "Total SF", value: "545,000" },
        { label: "Acres", value: "12.5" },
      ]),
    ).toBe(545_000);
  });
});

// The fifth review's cases — a whole-reader pass on the current code.
describe("the fifth review's price, per-unit, cap, size, occupancy and money cases", () => {
  const price = (label: string) => findPriceRow([{ label, value: "$42,000,000" }]);

  it("a price per anything is never the ask; a price per the PSA or per OM still is", () => {
    for (const label of [
      "Price per home",
      "Price per apartment",
      "Price per bay",
      "Price per berth",
      "Price / home",
      "Price / apt",
      "Price per parking space",
      "Asking price per key",
    ]) {
      expect(price(label), label).toBeNull();
    }
    for (const label of ["Purchase price per the PSA", "Asking price (per OM)", "Price per broker guidance"]) {
      expect(price(label)?.label, label).toBe(label);
    }
  });

  it("a projected, residual, disposition, forward, pro forma or prior-year sale price is never the ask", () => {
    for (const label of [
      "Projected sale price (Year 5)",
      "Projected sale price",
      "Residual sale price",
      "Disposition price",
      "Pro forma sale price",
      "Forward sale price",
      "Year 5 sale price",
      "2019 sale price",
      "Sale price, 2019",
      "Sale price 2019",
      "Price at stabilization",
    ]) {
      expect(price(label), label).toBeNull();
    }
    expect(
      findPriceRow([
        { label: "Projected sale price (Year 5)", value: "$58,000,000" },
        { label: "Asking price", value: "$42,000,000" },
      ])?.value,
    ).toBe("$42,000,000");
  });

  it("the land cost is the price row on a development only, and the buy box's band judges it", () => {
    const land = [
      { label: "Land cost", value: "$4,000,000" },
      { label: "Acres", value: "12" },
      { label: "Zoning", value: "MF-2" },
    ];
    expect(findPriceRow(land, "development")?.value).toBe("$4,000,000");
    expect(findPriceRow(land, "stabilized")).toBeNull();
    expect(findPriceRow(land)).toBeNull();
    const dev = { assetClass: "multifamily", market: "", address: "", metrics: land, strategy: { kind: "development" } };
    const inside = check(evaluateBuyBox("multifamily", dev, { priceMinM: 1, priceMaxM: 10 }), "Price")!;
    expect(inside.status).toBe("pass");
    expect(inside.detail).toContain("the land cost is $4.0M");
    const beyond = check(evaluateBuyBox("multifamily", dev, { priceMaxM: 3 }), "Price")!;
    expect(beyond.status).toBe("miss");
    // On an operating asset the same land line is an allocation, not a price.
    const op = { ...dev, strategy: { kind: "stabilized" } };
    expect(check(evaluateBuyBox("multifamily", op, { priceMaxM: 3 }), "Price")?.status).toBe("unknown");
  });

  it("the buy-box source carries the deal's kind, the page's inferred kind first", () => {
    const extraction = {
      assetClass: "multifamily",
      market: "",
      address: "",
      metrics: [{ label: "Purchase price", value: "$20,000,000" }],
      strategy: { kind: "conversion" },
    };
    expect(buyBoxCheckSource(extraction, null, null)?.strategy?.kind).toBe("conversion");
    expect(buyBoxCheckSource(extraction, null, null, "development")?.strategy?.kind).toBe("development");
    expect(buyBoxCheckSource({ ...extraction, strategy: null }, null, null)?.strategy).toBeNull();
  });

  it("an opex, R&M, concession or renovation spend per unit never clears a basis ceiling", () => {
    const box: BuyBox = { maxPerUnitK: 100 };
    for (const label of ["Opex per unit", "R&M per unit", "Concessions per unit", "Renovation spend per unit", "Management fee per unit", "Deposit per unit"]) {
      const r = check(evaluateBuyBox("multifamily", ex([[label, "$4,800"], ["Price per unit", "$252,000"]]), box), "Basis / unit")!;
      expect(r.status, label).toBe("miss");
    }
  });

  it("'Price / Unit' with the spaced slash and '$ / Unit' are the per-unit price", () => {
    const box: BuyBox = { maxPerUnitK: 100 };
    for (const label of ["Price / Unit", "Price / unit", "$ / Unit", "Price/unit", "Price per unit"]) {
      expect(check(evaluateBuyBox("multifamily", ex([[label, "$252,000"]]), box), "Basis / unit")?.status, label).toBe("miss");
    }
    for (const label of ["Avg rent per unit", "Insurance per unit", "NOI per unit", "Units per acre", "Total units", "Unit mix"]) {
      expect(findMetric([{ label, value: "$252,000" }], METRIC_FIND.perUnit.inc, METRIC_FIND.perUnit.exc), label).toBeNull();
    }
  });

  it("a Year-2+ cap rate or a cap on cost is never the going-in cap; a Year-1 cap still is", () => {
    for (const label of ["Cap rate (Year 3)", "Year 3 cap rate", "Yr 3 cap rate", "Cap rate — Year 5", "Cap rate on cost"]) {
      expect(findGoingInCap([{ label, value: "7.50%" }]), label).toBeNull();
    }
    expect(findGoingInCap([{ label: "Year 1 cap rate", value: "5.50%" }])?.value).toBe("5.50%");
    expect(findGoingInCap([{ label: "Cap rate", value: "5.50%" }])?.value).toBe("5.50%");
  });

  it("a bare 'Size:' or 'Size (SF)' beside the acreage is the lot, exactly as a bare 'Size' is", () => {
    for (const label of ["Size:", "Size (SF)", "Property Size:", "Total Area:"]) {
      expect(
        buildingSfFromMetrics([
          { label, value: "545,000 SF" },
          { label: "Acres", value: "12.5" },
        ]),
        label,
      ).toBeNull();
    }
    expect(buildingSfFromMetrics([{ label: "Size:", value: "250,000" }])).toBeNull();
    expect(buildingSfFromMetrics([{ label: "Building size:", value: "545,000 SF" }, { label: "Acres", value: "12.5" }])).toBe(545_000);
  });

  it("an occupancy whose VALUE says stabilized is not today's; a physical / economic pair reads the first figure", () => {
    for (const value of ["95% (stabilized)", "95% at stabilization", "95% pro forma", "95% target"]) {
      expect(occupancyPctFromMetrics([{ label: "Occupancy", value }]), value).toBeNull();
    }
    expect(occupancyPctFromMetrics([{ label: "Occupancy", value: "88% physical / 84% economic" }])).toBe(88);
    expect(occupancyPctFromMetrics([{ label: "Occupancy", value: "92% (as of 8/1/2026)" }])).toBe(92);
  });

  it("parseMoney reads the approximations and negatives an OM writes", () => {
    expect(parseMoney("±$42,000,000")).toBe(42_000_000);
    expect(parseMoney("~$42M")).toBe(42_000_000);
    expect(parseMoney("≈ $42,000,000")).toBe(42_000_000);
    expect(parseMoney("approximately $42,000,000")).toBe(42_000_000);
    expect(parseMoney("Approx. $42,000,000")).toBe(42_000_000);
    expect(parseMoney("circa $42M")).toBe(42_000_000);
    expect(parseMoney("USD 42,000,000")).toBe(42_000_000);
    expect(parseMoney("US$42M")).toBe(42_000_000);
    expect(parseMoney("-$250,000")).toBe(-250_000);
    expect(parseMoney("($250,000)")).toBe(-250_000);
    expect(parseMoney("−$1.2M")).toBe(-1_200_000);
    expect(parseMoney("$42,000,000 ($135k/unit)")).toBe(42_000_000);
    expect(parseMoney("(see p. 14)")).toBeNull();
    expect(parseMoney("Call for offers")).toBeNull();
    expect(parseMoney("$0")).toBe(0);
  });
});
