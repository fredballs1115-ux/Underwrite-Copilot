import { describe, it, expect } from "vitest";
import {
  evaluateBuyBox,
  foldBuyBoxChecks,
  isEmptyBuyBox,
  buyBoxLines,
  parseMoney,
  parsePct,
  resolveBuyBoxStore,
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
