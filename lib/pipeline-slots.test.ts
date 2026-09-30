// The pipeline row's three slots follow the same rule as the meeting .xlsx,
// the analytics and the comp memory: a plan deal carries its yield on cost
// and no cap; a stabilized asset its going-in cap; the price reads through
// the shared reader with the first signal as the fallback.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { assetClassLabel } from "./asset-class";
import { pickSlots, shownAssetClass } from "./pipeline-slots";

describe("shownAssetClass — a row never says \"Auto\"", () => {
  it("shows the stored class, the extraction's read for an auto-detect deal, and nothing before any read", () => {
    expect(shownAssetClass("office", null)).toBe("office");
    expect(shownAssetClass("auto", { assetClass: "multifamily" })).toBe("multifamily");
    expect(shownAssetClass("Auto", { assetClass: "Industrial" })).toBe("industrial");
    expect(shownAssetClass("auto", null)).toBe("");
    expect(shownAssetClass("auto", { assetClass: "auto" })).toBe("");
    expect(shownAssetClass(null, { assetClass: "retail" })).toBe("retail");
    expect(shownAssetClass("", undefined)).toBe("");
  });

  it("a known class comes back as its key whatever its case; a class the model phrased itself keeps its case", () => {
    expect(shownAssetClass("Multifamily", null)).toBe("multifamily");
    expect(shownAssetClass("auto", { assetClass: "Self_Storage" })).toBe("self_storage");
    expect(shownAssetClass("auto", { assetClass: "NNN retail" })).toBe("NNN retail");
    expect(shownAssetClass("auto", { assetClass: "Medical office / MOB" })).toBe("Medical office / MOB");
    // …so the row's label never mangles an acronym the model wrote.
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "NNN retail" }))).toBe("NNN retail");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "SFR portfolio" }))).toBe("SFR portfolio");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "Self_Storage" }))).toBe("Self-storage");
  });
});

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "X", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;

describe("pickSlots — the pipeline row agrees with the export on which figure a deal carries", () => {
  it("a stabilized asset: its going-in cap, its price, no yield on cost", () => {
    const s = pickSlots(ex([m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%"), m("In-place NOI", "$2,310,000")]), null);
    expect(s).toEqual({ cap: "5.50%", price: "$42,000,000", yoc: null, interest: null, debt: null, affordable: null, tenancy: null, hotel: null });
  });

  it("says a covenant on the rents beside the price (#453), and nothing on a market-rate deal", () => {
    const base = [m("Asking price", "$38,000,000"), m("Going-in cap rate", "5.10%"), m("Units", "240")];
    const lihtc = pickSlots(
      ex([...base, m("Restricted units", "180")], {
        affordable: { programs: ["lihtc"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
      }),
      null,
    );
    expect(lihtc.affordable).toBe("LIHTC, 75% restricted");
    // The price still buys the building: the price and its cap stand.
    expect(lihtc.price).toBe("$38,000,000");
    expect(lihtc.cap).toBe("5.10%");
    expect(pickSlots(ex(base), null).affordable).toBeNull();
  });

  it("says how long a single tenant's lease has left (#454), and nothing on a multi-tenant deal", () => {
    const base = [m("Asking price", "$6,500,000"), m("Going-in cap rate", "6.00%")];
    const tenant = { tenant: "Walgreens Co.", guarantor: "", leaseType: "NNN", landlordObligations: "", tenantRights: "", page: "" };
    // A lease a century out, so the whole years left never move with the day the test runs.
    const s = pickSlots(ex([...base, m("Lease expiration", "December 31, 2126")], { singleTenant: tenant }), null);
    expect(s.tenancy).toMatch(/^Single tenant, \d+ yrs left$/);
    expect(pickSlots(ex(base, { singleTenant: tenant }), null).tenancy).toBe("Single tenant");
    expect(pickSlots(ex(base, { singleTenant: { ...tenant, tenant: "" } }), null).tenancy).toBeNull();
    expect(pickSlots(ex(base), null).tenancy).toBeNull();
  });

  it("says what a hotel is sold with (#455), and nothing on anything but a hotel", () => {
    const base = [m("Asking price", "$26,000,000"), m("Keys", "120")];
    const hotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management" as const, pip: "", page: "" };
    expect(pickSlots(ex([...base, m("PIP cost", "$4,200,000")], { hotel }), null).hotel).toBe("Mgmt encumbered, PIP $35k/key");
    expect(pickSlots(ex(base, { hotel: { ...hotel, encumbrance: "unencumbered" } }), null).hotel).toBe("Unencumbered");
    expect(pickSlots(ex(base), null).hotel).toBeNull();
  });

  it("says what the price buys where it is not the building outright (#415)", () => {
    const base = [m("Asking price", "$20,000,000"), m("Going-in cap rate", "5.50%")];
    const with_ = (interest: NonNullable<ExtractionResult["interest"]>) =>
      pickSlots(ex(base, { interest }), null).interest;
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(with_({ ...blank, kind: "partial_interest", share: "49% limited partnership interest" })).toBe("49% share");
    expect(with_({ ...blank, kind: "partial_interest", share: "a majority stake" })).toBe("Share");
    expect(with_({ ...blank, kind: "note" })).toBe("Note");
    expect(with_({ ...blank, kind: "leasehold" })).toBe("Leasehold");
    expect(with_({ ...blank, kind: "leased_fee" })).toBe("Leased fee");
    expect(with_({ ...blank, kind: "fee_simple", groundLease: "a 40-year lease under the deck" })).toBeNull();
    expect(with_({ ...blank, kind: "unknown" })).toBeNull();
    expect(pickSlots(ex(base), null).interest).toBeNull();
  });

  it("says where the seller's loan is offered for assumption (#419) — never on a note, a share or the land", () => {
    const base = [m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%")];
    const loan = [m("Assumable loan balance", "$30,000,000"), m("Assumable loan rate", "3.45%")];
    expect(pickSlots(ex([...base, ...loan]), null).debt).toBe("Assumable 3.45%");
    expect(pickSlots(ex([...base, loan[0]]), null).debt).toBe("Assumable loan");
    expect(pickSlots(ex(base), null).debt).toBeNull();
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(pickSlots(ex([...base, ...loan], { interest: { ...blank, kind: "note" } }), null).debt).toBeNull();
    expect(pickSlots(ex([...base, ...loan], { interest: { ...blank, kind: "leasehold" } }), null).debt).toBe("Assumable 3.45%");
  });

  it("a value-add with a stated going-in cap: the yield on cost, and NO cap — as the .xlsx prints 'n/a — plan'", () => {
    const s = pickSlots(
      ex([m("Asking price", "$42,000,000"), m("Renovation budget", "$8,600,000"), m("Units", "240"), m("Going-in cap rate", "5.00%"), m("Stabilized NOI", "$3,400,000")], {
        strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s.cap).toBeNull();
    expect(s.price).toBe("$42,000,000");
    expect(s.yoc).toBe(`${((3_400_000 / 50_600_000) * 100).toFixed(1)}%`);
  });

  it("a development priced at its land: the land cost is the price, the yield on cost is over land + budget", () => {
    const s = pickSlots(
      ex([m("Land cost", "$8,000,000"), m("Construction budget", "$92,000,000"), m("Units (proposed)", "420"), m("Stabilized NOI", "$11,000,000"), m("Stabilized cap rate", "7.0%")], {
        strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s).toEqual({ cap: null, price: "$8,000,000", yoc: "11.0%", interest: null, debt: null, affordable: null, tenancy: null, hotel: null });
  });

  it("before the extraction lands, the first signal's ask fills the price — only when it is a figure", () => {
    const bare = ex([]);
    expect(pickSlots(bare, { askPrice: "$20,000,000", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBe("$20,000,000");
    expect(pickSlots(bare, { askPrice: "Call for offers", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBeNull();
  });
});
