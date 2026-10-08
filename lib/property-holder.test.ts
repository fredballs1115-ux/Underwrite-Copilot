// Research pass 41's H2: the class readers said "the buyer" keeps the
// manager, funds the PIP, becomes one owner in an association or buys a
// shadow anchor's traffic on a note, a preferred equity position, a share
// and the land under a building, none of which buys the property. Each
// reader now says whose the property is (lib/interest `propertyHolderOf`),
// a note's sentence says what it means for the collateral, the panels print
// the same sentences, and a fee simple reads exactly as before.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { propertyHolderOf } from "@/lib/interest";
import { hotelNote, hotelShortLine, readHotelDeal } from "@/lib/hotel-deal";
import { condoNote, readCondo } from "@/lib/condo";
import { goingConcernNote, goingConcernShortLine, readGoingConcern } from "@/lib/going-concern";
import { readSelfStorage } from "@/lib/self-storage";
import { readAffordable } from "@/lib/affordable";
import { readRoster } from "@/lib/tenant-roster";
import { HotelPanel } from "@/app/hotel-panel";
import { CondoPanel } from "@/app/condo-panel";
import { GoingConcernPanel } from "@/app/going-concern-panel";
import { SelfStoragePanel } from "@/app/self-storage-panel";
import { AffordablePanel } from "@/app/affordable-panel";
import { RosterPanel } from "@/app/roster-panel";
import { visibleText } from "./render-lint";

const TODAY = new Date("2026-10-05T12:00:00Z");
const row = (label: string, value: string, page = "p. 6") => ({ label, value, flagged: false, page, basis: "na" as const });

type Interest = NonNullable<ExtractionResult["interest"]>;
const FEE: Interest = { kind: "fee_simple", summary: "", share: "", groundLease: "", loan: "", page: "" };
const NOTE: Interest = {
  kind: "note",
  summary: "Sale of a performing first mortgage note secured by the property.",
  share: "",
  groundLease: "",
  loan: "$15,000,000 at 11.0%, maturing March 31, 2028",
  page: "p. 5",
};
const NOTE_ROWS = [
  row("Unpaid principal balance", "$15,000,000", "p. 5"),
  row("Note rate", "11.0%", "p. 5"),
  row("Maturity date", "March 31, 2028", "p. 5"),
  row("Payment status", "Performing", "p. 5"),
  row("Whole-asset value", "$70,000,000", "p. 5"),
];
const POSITION: Interest = {
  kind: "preferred_equity",
  summary: "A $15,000,000 preferred equity position in the entity that owns the property, a 12% preferred return.",
  share: "",
  groundLease: "",
  loan: "",
  page: "p. 4",
};
const SHARE: Interest = {
  kind: "partial_interest",
  summary: "A 49% limited partnership interest in the partnership that owns the property.",
  share: "49% limited partnership interest",
  groundLease: "",
  loan: "",
  page: "p. 4",
};
const TIC: Interest = {
  kind: "partial_interest",
  summary: "An undivided 30% tenant-in-common interest in the fee simple, held under a TIC agreement.",
  share: "30% tenant-in-common interest",
  groundLease: "",
  loan: "",
  page: "p. 2",
};
const LEASED_FEE: Interest = {
  kind: "leased_fee",
  summary: "The fee interest in the land beneath the building, subject to a 99-year ground lease.",
  share: "",
  groundLease: "99-year ground lease expiring December 31, 2071; ground rent $1,200,000 a year",
  loan: "",
  page: "p. 4",
};

/** The deal as sold under another interest: the note's own rows ride with
 *  its interest, every other row is the deal's. */
const under = (ex: ExtractionResult, interest: Interest): ExtractionResult =>
  ({ ...ex, interest, metrics: [...(interest.kind === "note" ? NOTE_ROWS : []), ...(ex.metrics ?? [])] }) as ExtractionResult;

const render = (node: React.ReactElement) => visibleText(renderToStaticMarkup(node)).replace(/\s+/g, " ");

describe("propertyHolderOf — who holds the property, by what the price buys", () => {
  const base = { dealName: "X", metrics: [] } as unknown as ExtractionResult;
  it("names the buyer only where the price buys the property", () => {
    expect(propertyHolderOf(under(base, FEE))).toBe("buyer");
    expect(propertyHolderOf({ ...base, interest: { ...FEE, kind: "leasehold" } } as ExtractionResult)).toBe("buyer");
    expect(propertyHolderOf({ ...base, interest: { ...FEE, kind: "unknown" } } as ExtractionResult)).toBe("buyer");
    // An extraction saved before the interest was read is fee simple.
    expect(propertyHolderOf(base)).toBe("buyer");
    expect(propertyHolderOf(under(base, NOTE))).toBe("borrower");
    expect(propertyHolderOf(under(base, POSITION))).toBe("entity");
    expect(propertyHolderOf(under(base, SHARE))).toBe("entity");
    expect(propertyHolderOf(under(base, TIC))).toBe("co_owners");
    expect(propertyHolderOf(under(base, LEASED_FEE))).toBe("leaseholder");
  });
});

describe("the hotel's contracts and PIP, said as their holder's", () => {
  const courtyard = (franchiseEnd = true) =>
    ({
      dealName: "Courtyard Capitol Hill",
      assetClass: "Hospitality",
      totalPages: 40,
      interest: FEE,
      hotel: {
        brand: "Courtyard by Marriott",
        franchise: "Marriott franchise agreement; transfer subject to Marriott's approval",
        management: "Third-party managed under an agreement that survives the sale",
        encumbrance: "management",
        pip: "",
        page: "p. 6",
      },
      metrics: [
        row("Asking price", "$26,000,000", "p. 2"),
        row("Keys", "120", "p. 2"),
        row("PIP cost", "$4,200,000"),
        ...(franchiseEnd ? [row("Franchise expiration", "June 30, 2034")] : []),
        row("Management agreement expiration", "2031"),
      ],
    }) as unknown as ExtractionResult;

  it("keeps every sentence of a fee simple as it was", () => {
    const r = readHotelDeal(courtyard(), TODAY)!;
    expect(r.holder).toBe("buyer");
    expect(r.sentences).toContain("It is sold encumbered by its management agreement: the buyer keeps the manager, its fee and its term rather than choosing its own.");
    expect(r.sentences).toContain("The brand's property improvement plan is $4.2M, $35k a key across its 120 keys — capital the buyer funds on top of the price.");
    expect(hotelShortLine(r)).toBe("Hotel: flagged Courtyard by Marriott, sold encumbered by management; PIP $4.2M ($35k a key); the franchise ends Jun 2034");
    const note = hotelNote(readHotelDeal(courtyard(false), TODAY)!);
    expect(note).toContain("its key-money are the buyer's to live with: read the agreement, not the summary");
    expect(note).toContain("ask for the license's term and whether it transfers to the buyer");
  });

  it("says a note's hotel is the borrower's collateral, and what that means for a lender that takes it", () => {
    const r = readHotelDeal(under(courtyard(), NOTE), TODAY)!;
    expect(r.holder).toBe("borrower");
    expect(r.headline).not.toMatch(/\bthe buyer\b/);
    expect(r.sentences).toContain(
      "The collateral is encumbered by its management agreement: the borrower keeps the manager, its fee and its term, and whether the agreement binds a lender that takes the hotel in a foreclosure is the loan documents' to say.",
    );
    expect(r.sentences).toContain(
      "The brand's property improvement plan is $4.2M, $35k a key across its 120 keys — capital the borrower funds, and whatever of it is unspent at a foreclosure the collateral bears.",
    );
    // The hotel is not sold; it stays as encumbered.
    expect(hotelShortLine(r)).toBe("Hotel: flagged Courtyard by Marriott, encumbered by management; PIP $4.2M ($35k a key); the franchise ends Jun 2034");
    const traps = hotelNote(readHotelDeal(under(courtyard(false), NOTE), TODAY)!);
    expect(traps).not.toMatch(/\bthe buyer\b/);
    expect(traps).toContain(
      "are the borrower's to live with, and whether they bind a lender that takes the hotel in a foreclosure is the loan documents' to say: read the agreement, not the summary",
    );
    expect(traps).toContain("ask for the license's term and whether it carries to a lender that takes the hotel in a foreclosure");
  });

  it("says a position's, a share's, a TIC's and a leased fee's hotel is its owner's", () => {
    const pos = readHotelDeal(under(courtyard(), POSITION), TODAY)!;
    expect(pos.sentences).toContain("It is encumbered by its management agreement: the owning entity keeps the manager, its fee and its term rather than choosing its own.");
    expect(pos.sentences).toContain("The brand's property improvement plan is $4.2M, $35k a key across its 120 keys — capital the owning entity funds, apart from the price of this interest.");
    expect(hotelNote(readHotelDeal(under(courtyard(false), SHARE), TODAY)!)).toContain(
      "ask for the license's term and whether a sale of an interest in the owning entity needs the brand's consent",
    );
    const tic = readHotelDeal(under(courtyard(), TIC), TODAY)!;
    expect(tic.sentences).toContain("It is encumbered by its management agreement: the co-owners keep the manager, its fee and its term rather than choosing their own.");
    expect(tic.sentences).toContain("The brand's property improvement plan is $4.2M, $35k a key across its 120 keys — capital the co-owners fund, this interest its share of it, beyond its price.");
    const land = readHotelDeal(under(courtyard(), LEASED_FEE), TODAY)!;
    expect(land.sentences).toContain("It is encumbered by its management agreement: the leaseholder keeps the manager, its fee and its term rather than choosing its own.");
    expect(land.headline).toContain("capital the leaseholder funds, which reaches this buyer only through the ground rent's cover.");
    for (const r of [pos, land]) expect(r.headline).not.toMatch(/\bthe buyer\b/);
  });

  it("prints the same sentences on the panel", () => {
    const text = render(React.createElement(HotelPanel, { hotel: readHotelDeal(under(courtyard(), NOTE), TODAY) }));
    expect(text).toContain("the borrower keeps the manager, its fee and its term");
    expect(text).toContain("capital the borrower funds, and whatever of it is unspent at a foreclosure the collateral bears");
    expect(text).not.toContain("the buyer keeps");
    expect(text).not.toContain("capital the buyer funds");
  });
});

describe("the condominium's units, said as their holder's", () => {
  const bulk = {
    dealName: "Harbor View",
    assetClass: "Condominium Units (bulk sale)",
    totalPages: 40,
    interest: FEE,
    metrics: [
      row("Asking price", "$16,800,000"),
      row("Units", "42"),
      row("NOI (in-place)", "$840,000"),
      row("HOA dues", "$650 per unit per month"),
      row("Units in building", "120"),
    ],
  } as unknown as ExtractionResult;

  it("keeps a bulk purchase's sentences as they were", () => {
    const r = readCondo(bulk, TODAY)!;
    expect(r.sentences[0]).toBe(
      "The memorandum offers 42 of the condominium's 120 units, 35%: the buyer becomes one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike.",
    );
    expect(r.headline).toContain("Owning 35% of a project of 120 units, the buyer would be a single entity over the 20%");
    expect(r.headline).toContain("unless the section's exceptions hold, and the one it lists for a larger owner reaches 49% of the units, on conditions");
    expect(condoNote(r)).toContain("(a) CONTROL AND THE VOTES — the buyer's share of the association's votes");
  });

  it("says a note's units are the borrower's collateral, and what a lender that takes them steps into", () => {
    const r = readCondo(under(bulk, NOTE), TODAY)!;
    expect(r.headline).not.toMatch(/\bthe buyer\b/);
    expect(r.sentences[0]).toBe(
      "The note is secured by 42 of the condominium's 120 units, 35%: the borrower is one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike, and a lender that takes the units in a foreclosure would step into that share.",
    );
    expect(r.headline).toContain("Owning 35% of a project of 120 units, the borrower is a single entity over the 20%");
    expect(r.headline).toContain("unless the section's exceptions hold, which narrows the collateral's retail exit, the units sold one by one, and the one it lists");
    expect(condoNote(r)).toContain("(a) CONTROL AND THE VOTES — the borrower's share of the association's votes");
    const pos = readCondo(under(bulk, POSITION), TODAY)!;
    expect(pos.sentences[0]).toBe(
      "The owning entity holds 42 of the condominium's 120 units, 35%: it is one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike.",
    );
    const text = render(React.createElement(CondoPanel, { condo: r }));
    expect(text).toContain("The note is secured by 42 of the condominium's 120 units");
    expect(text).not.toContain("the buyer becomes one owner");
  });
});

describe("the operating business, said as its holder's", () => {
  const station = {
    dealName: "Route 9 Fuel & Market",
    assetClass: "Gas Station / Convenience Store",
    totalPages: 36,
    interest: FEE,
    strategy: { kind: "stabilized", summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
    metrics: [
      row("Asking price", "$3,200,000"),
      row("NOI (in-place)", "$256,000"),
      row("EBITDA (T-12)", "$410,000"),
      row("Real estate value", "$2,000,000"),
      row("FF&E value", "$400,000"),
      row("Business value", "$800,000"),
    ],
  } as unknown as ExtractionResult;

  it("keeps a sale's sentences as they were", () => {
    const r = readGoingConcern(station, TODAY)!;
    expect(r.sentences[0]).toBe(
      "The memorandum sells a fuel station and its store with its real estate: its earnings are the operation's, and a real estate cap struck on them prices the business as if it were rent.",
    );
    expect(r.sentences).toContain("The memorandum splits the price: real estate $2.00M, fixtures and equipment $400k, business $800k.");
    expect(goingConcernShortLine(r)).toBe("Fuel station and its store: sold with the business; EBITDA (T-12) $410k");
    expect(render(React.createElement(GoingConcernPanel, { goingConcern: r }))).toContain("The price as the memorandum splits it");
  });

  it("says a note's operation is the borrower's collateral, and its split the collateral's value", () => {
    const r = readGoingConcern(under(station, NOTE), TODAY)!;
    expect(r.headline).not.toMatch(/\bthe buyer\b|memorandum sells|splits the price/);
    expect(r.sentences[0]).toBe(
      "The note's collateral is a fuel station and its store with its real estate, the business with it: its earnings are the operation's, a real estate cap struck on them prices the business as if it were rent, and a lender that takes the collateral in a foreclosure takes an operation to run or sell.",
    );
    expect(r.sentences).toContain("The memorandum splits the collateral's value: real estate $2.00M, fixtures and equipment $400k, business $800k.");
    expect(goingConcernShortLine(r)).toBe("Fuel station and its store: held with the business; EBITDA (T-12) $410k");
    const text = render(React.createElement(GoingConcernPanel, { goingConcern: r }));
    expect(text).toContain("The collateral's value as the memorandum splits it");
    expect(text).not.toContain("The price as the memorandum splits it");
    const share = readGoingConcern(under(station, SHARE), TODAY)!;
    expect(share.sentences[0]).toBe(
      "The owning entity holds a fuel station and its store with its real estate, the business with it: its earnings are the operation's, and a real estate cap struck on them prices the business as if it were rent.",
    );
    expect(share.sentences).toContain("The memorandum splits the property's value: real estate $2.00M, fixtures and equipment $400k, business $800k.");
  });

  it("asks a care operation's change of ownership of whoever's ownership changes", () => {
    const snf = { ...station, dealName: "Buckeye Care Center", assetClass: "Skilled Nursing Facility", strategy: undefined } as unknown as ExtractionResult;
    expect(goingConcernNote(readGoingConcern(snf, TODAY)!)).toContain("(h) THE CHANGE OF OWNERSHIP — ask whether the buyer takes the Medicare provider agreement");
    const onNote = goingConcernNote(readGoingConcern(under(snf, NOTE), TODAY)!);
    expect(onNote).toContain("(h) THE CHANGE OF OWNERSHIP — ask whether a lender that takes the property in a foreclosure takes the Medicare provider agreement");
    expect(onNote).not.toMatch(/\bthe buyer\b/);
  });
});

describe("the storage platform's income, said as its holder's", () => {
  const facility = {
    dealName: "Lakewood Self Storage",
    assetClass: "Self-Storage",
    totalPages: 30,
    interest: FEE,
    metrics: [
      row("Asking price", "$9,800,000"),
      row("Physical occupancy", "91%"),
      row("Tenant insurance", "71% penetration"),
      row("Management", "Third-party managed by Extra Space at 6% of revenue"),
    ],
  } as unknown as ExtractionResult;

  it("keeps a sale's sentences, and says a note's as the collateral's", () => {
    const r = readSelfStorage(facility)!;
    expect(r.sentences).toContain("Tenant insurance, as stated: 71% penetration. It is the operator's program, and a buyer keeps its income only by running one.");
    expect(r.headline).toContain("the fee belongs in the expenses, and a buyer on another platform changes the brand and the pricing system that sets the street rates.");
    const onNote = readSelfStorage(under(facility, NOTE))!;
    expect(onNote.headline).not.toMatch(/\ba buyer\b|\bthe buyer\b/);
    expect(onNote.sentences).toContain(
      "Tenant insurance, as stated: 71% penetration. It is the operator's program, so the collateral earns its income only while one runs, and a lender that takes the facility in a foreclosure keeps it only by running one.",
    );
    expect(onNote.headline).toContain("a lender that took the facility onto another platform would change the brand and the pricing system that sets the street rates.");
    expect(readSelfStorage(under(facility, POSITION))!.sentences).toContain(
      "Tenant insurance, as stated: 71% penetration. It is the operator's program, and the owning entity keeps its income only while it runs one.",
    );
    const text = render(React.createElement(SelfStoragePanel, { storage: onNote }));
    expect(text).toContain("the collateral earns its income only while one runs");
    expect(text).not.toContain("a buyer keeps its income");
  });
});

describe("a restricted rent's gap to market, said as its holder's", () => {
  const maple = {
    dealName: "Maple Court",
    assetClass: "Multifamily",
    totalPages: 40,
    interest: FEE,
    affordable: {
      programs: ["lihtc"],
      summary: "A 2011 LIHTC property.",
      agreement: "Extended Use Agreement; 180 units at or below 60% AMI",
      assistance: "",
      tiers: [],
      page: "p. 14",
    },
    metrics: [row("Units", "240", "p. 2"), row("Restricted units", "180", "p. 14")],
  } as unknown as ExtractionResult;

  it("keeps a sale's sentence, and says a note's collateral earns the restricted rents", () => {
    expect(readAffordable(maple, TODAY)!.headline).toContain(
      "the gap to market on those units is the restriction's cost, not loss to lease, and it is the buyer's only when the restriction ends.",
    );
    const onNote = readAffordable(under(maple, NOTE), TODAY)!;
    expect(onNote.headline).not.toMatch(/\bthe buyer\b/);
    expect(onNote.headline).toContain(
      "and it is the borrower's only when the restriction ends: the collateral earns the restricted rents until then.",
    );
    expect(readAffordable(under(maple, SHARE), TODAY)!.headline).toContain("and it is the owning entity's only when the restriction ends.");
    expect(render(React.createElement(AffordablePanel, { affordable: onNote }))).toContain("the collateral earns the restricted rents until then");
  });
});

describe("a shadow anchor's traffic, said as its holder's", () => {
  const t = (name: string, over: Record<string, string> = {}) => ({
    name,
    role: "inline",
    inSale: "yes",
    sf: "",
    rent: "",
    leaseExpiration: "",
    options: "",
    earlyTermination: "",
    rights: "",
    page: "p. 14",
    ...over,
  });
  const center = {
    dealName: "Maple Grove Crossing",
    assetClass: "Retail",
    totalPages: 40,
    interest: FEE,
    metrics: [row("Total SF", "160,000 SF", "p. 3")],
    tenants: [
      t("Giant Food", { role: "anchor", sf: "58,000 SF", rent: "$725,000", leaseExpiration: "January 31, 2029" }),
      t("Target", { role: "anchor", inSale: "no", sf: "125,000 SF" }),
      t("PetSmart", { sf: "18,500 SF", rent: "$296,000", leaseExpiration: "March 31, 2028" }),
    ],
  } as unknown as ExtractionResult;

  it("keeps a sale's sentence, and says a note's anchor is outside the collateral", () => {
    expect(readRoster(center, TODAY)!.sentences).toContain(
      "Target anchors the property but is not part of the offering, as stated: the buyer buys the traffic it draws, not its rent, and it can close, sell or redevelop without the buyer's say.",
    );
    const onNote = readRoster(under(center, NOTE), TODAY)!;
    expect(onNote.headline).not.toMatch(/\bthe buyer\b/);
    expect(onNote.sentences).toContain(
      "Target anchors the property but is not part of the collateral, as stated: the collateral has the traffic it draws, not its rent, and it can close, sell or redevelop without the borrower's say — the collateral's value with it.",
    );
    expect(readRoster(under(center, POSITION), TODAY)!.sentences).toContain(
      "Target anchors the property but is not part of the owning entity's property, as stated: the owning entity has the traffic it draws, not its rent, and it can close, sell or redevelop without the owning entity's say.",
    );
    expect(render(React.createElement(RosterPanel, { roster: onNote }))).toContain("the collateral has the traffic it draws");
  });
});
