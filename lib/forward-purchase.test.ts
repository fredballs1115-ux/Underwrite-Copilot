import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { ForwardPanel } from "@/app/forward-panel";
import {
  DELIVERY_CAP_ROW,
  DELIVERY_ROW,
  DEPOSIT_ROW,
  DEVELOPER_ROW,
  GUARANTY_ROW,
  OUTSIDE_ROW,
  PRICE_ADJUSTMENT_ROW,
  RENT_COMMENCEMENT_ROW,
  deliveryText,
  forwardContextLine,
  forwardModelLine,
  forwardNote,
  forwardShortLine,
  forwardTag,
  forwardTermRows,
  isForwardPurchase,
  readDeliveryDate,
  readForwardPurchase,
} from "./forward-purchase";
import { gluedWords, visibleText } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";
import { findGoingInCap } from "./criteria";

// Research pass 28's two forward deals (rp28/deals.ts), with the rows the
// extraction will file for them.
const row = (label: string, value: string, page = "p. 4") => ({ label, value, page, flagged: false });
const deal = (summary: string, metrics: ReturnType<typeof row>[], assetClass = "Industrial"): ExtractionResult =>
  ({
    dealName: "Forward deal",
    assetClass,
    totalPages: 48,
    strategy: { kind: "development", summary, capitalBudget: "", timeline: "" },
    metrics,
  }) as unknown as ExtractionResult;

const TODAY = new Date("2026-10-05T12:00:00Z");

const bts = deal("Forward purchase of a 300,000 SF build-to-suit distribution center at completion", [
  row("Purchase price", "$48,000,000", "p. 2"),
  row("Total SF", "300,000 SF"),
  row("NOI (Year 1)", "$2,880,000"),
  row("Cap rate", "6.00%"),
  row("Delivery date", "Q3 2027"),
  row("Outside date", "March 31, 2028"),
  row("Deposit", "$2,400,000 at signing"),
  row("Rent commencement", "Substantial completion"),
  row("Developer", "Ridgeline Logistics Partners"),
]);

const btr = deal(
  "Forward purchase of a 180-home build-to-rent community, purchase at certificate of occupancy",
  [
    row("Purchase price", "$72,000,000", "p. 2"),
    row("Homes", "180"),
    row("NOI (stabilized, pro forma)", "$3,960,000"),
    row("Deposit", "10% at signing, non-refundable after due diligence"),
    row("Estimated delivery", "June 2028"),
  ],
  "Build-to-Rent Community",
);

describe("a forward purchase, read as stated (pass 28)", () => {
  it("reads a build-to-suit bought at delivery: the price, the clock, the deposit and the cap at delivery", () => {
    const r = readForwardPurchase(bts, TODAY)!;
    expect(r).toMatchObject({
      kind: "bts",
      price: 48_000_000,
      slackMonths: 6,
      monthsToDelivery: 11,
      deliveryPassed: false,
      deliveryYieldPct: 6,
      yieldFrom: "stated_cap",
      rentCommencement: "Substantial completion",
      developer: "Ridgeline Logistics Partners",
    });
    expect(r.delivery).toEqual({ iso: "2027-09-30", text: "Q3 2027", precision: "quarter" });
    expect(r.outside).toEqual({ iso: "2028-03-31", text: "March 31, 2028", precision: "day" });
    expect(r.deposit).toEqual({ text: "$2,400,000 at signing", amount: 2_400_000, sharePct: 5 });
    expect(r.deliveryNoi).toEqual({ value: 2_880_000, label: "NOI (Year 1)" });
    expect(r.headline).toBe(
      "A build-to-suit bought at delivery: the buyer pays $48.0M at delivery, Q3 2027 (read as Sep 30, 2027), and the developer funds the works — the price is the buyer's whole cost, never the price plus the developer's budget. " +
        "It is struck at a 6.00% cap at delivery, as stated. " +
        "The outside date is Mar 31, 2028, 6 months after delivery. " +
        "The deposit as stated: $2,400,000 at signing (5% of the price) — the buyer's exposure before delivery. " +
        "Rent commences as stated: Substantial completion.",
    );
    expect(forwardTag(r)).toBe("Build-to-suit, 6.00% at delivery");
    expect(forwardShortLine(r)).toBe(
      "Build-to-suit: $48.0M paid at delivery (Q3 2027), the works the developer's; 6.00% at delivery; outside date Mar 31, 2028; deposit $2.40M",
    );
  });

  it("reads a community's yield as its stated NOI at delivery over the price, and its deposit as a share", () => {
    const r = readForwardPurchase(btr, TODAY)!;
    expect(r).toMatchObject({ kind: "btr", price: 72_000_000, yieldFrom: "noi_over_price", outside: null, slackMonths: null });
    expect(r.deliveryYieldPct).toBeCloseTo(5.5, 6);
    expect(r.delivery).toEqual({ iso: "2028-06-30", text: "June 2028", precision: "month" });
    expect(r.deposit).toEqual({ text: "10% at signing, non-refundable after due diligence", amount: null, sharePct: 10 });
    expect(r.headline).toContain("The NOI the memorandum states at delivery, $3.96M, is 5.50% of the price.");
    // A share the memorandum states is not said twice.
    expect(r.headline).toContain("The deposit as stated: 10% at signing, non-refundable after due diligence — the buyer's exposure before delivery.");
    expect(forwardTag(r)).toBe("Forward, 5.50% at delivery");
  });

  it("says the model's year-one NOI beside the memorandum's at delivery, and changes nothing", () => {
    const r = readForwardPurchase(btr, TODAY)!;
    expect(forwardModelLine(r, { noi1: 4_320_000, noiAssumed: true, price: 72_000_000 })).toBe(
      "The model runs the price as paid at closing with income from its first year: on a forward purchase that day is delivery, June 2028, and the deposit sits outside its cash flows. " +
        "Its year-one NOI is an assumed 6.00% of the price, $4.32M, above the $3.96M the memorandum states at delivery.",
    );
    // When the deposit is paid is the row's to say, never "at signing" for
    // every deposit (the audit of 2026-10-05).
    const goHard = readForwardPurchase(deal("Forward purchase at completion", [row("Purchase price", "$30,000,000"), row("Deposit", "$1,500,000 due at go-hard")]), TODAY);
    expect(forwardModelLine(goHard, null)).not.toContain("paid at signing");
    expect(forwardModelLine(r, { noi1: 3_960_000, noiAssumed: false, price: 72_000_000 })).toContain(
      "Its year-one NOI is $3.96M, the same as the $3.96M the memorandum states at delivery.",
    );
    expect(forwardModelLine(r, null)).not.toContain("year-one NOI");
    expect(forwardModelLine(null, null)).toBeNull();
  });

  it("reads a delivery stated as a quarter, a month or a year on its last day — the later delivery", () => {
    expect(readDeliveryDate("Q4 2027", TODAY)).toEqual({ iso: "2027-12-31", text: "Q4 2027", precision: "quarter" });
    expect(readDeliveryDate("2Q 2028", TODAY)?.iso).toBe("2028-06-30");
    expect(readDeliveryDate("Second quarter of 2028", TODAY)?.iso).toBe("2028-06-30");
    expect(readDeliveryDate("Q1-2028", TODAY)?.iso).toBe("2028-03-31");
    expect(readDeliveryDate("February 2028", TODAY)).toEqual({ iso: "2028-02-29", text: "February 2028", precision: "month" });
    expect(readDeliveryDate("2028", TODAY)).toEqual({ iso: "2028-12-31", text: "2028", precision: "year" });
    expect(readDeliveryDate("Year-end 2027", TODAY)?.iso).toBe("2027-12-31");
    expect(readDeliveryDate("July 15, 2027", TODAY)).toEqual({ iso: "2027-07-15", text: "July 15, 2027", precision: "day" });
    // Words with no date in them are no date.
    expect(readDeliveryDate("Upon completion", TODAY)).toBeNull();
    expect(readDeliveryDate("TBD", TODAY)).toBeNull();
    expect(readDeliveryDate("", TODAY)).toBeNull();
    // A year the clock cannot mean is no year.
    expect(readDeliveryDate("Q2 1985", TODAY)).toBeNull();
    expect(deliveryText({ iso: "2027-09-30", text: "Q3 2027", precision: "quarter" })).toBe("Q3 2027 (read as Sep 30, 2027)");
    expect(deliveryText({ iso: "2027-07-15", text: "July 15, 2027", precision: "day" })).toBe("Jul 15, 2027");
  });

  it("keeps a delivery stated in words as the words, with no clock", () => {
    const r = readForwardPurchase(
      deal("Forward sale of a Class A office building upon substantial completion", [
        row("Purchase price", "$90,000,000"),
        row("Delivery date", "Upon completion"),
      ]),
      TODAY,
    )!;
    expect(r).toMatchObject({ kind: "forward", delivery: null, deliveryWords: "Upon completion", monthsToDelivery: null });
    expect(r.headline).toContain("the buyer pays $90.0M at delivery (Upon completion), and the developer funds the works");
    expect(forwardTag(r)).toBe("Forward purchase");
  });

  it("says an outside date before the delivery cannot both hold, never a negative slack", () => {
    const r = readForwardPurchase(
      deal("Forward purchase at completion", [
        row("Purchase price", "$30,000,000"),
        row("Delivery date", "December 2028"),
        row("Outside date", "June 30, 2028"),
      ]),
      TODAY,
    )!;
    expect(r.slackMonths).toBeLessThan(0);
    expect(r.headline).toContain(
      "The outside date, Jun 30, 2028, is before the stated delivery: the two cannot both hold, and which governs is the contract's.",
    );
  });

  it("says a delivery that has passed is the memorandum's to confirm, and stops counting down", () => {
    const later = new Date("2027-11-01T12:00:00Z");
    const r = readForwardPurchase(bts, later)!;
    expect(r).toMatchObject({ deliveryPassed: true, monthsToDelivery: null });
    expect(r.headline).toContain(
      "The stated delivery, Q3 2027 (read as Sep 30, 2027), has passed; whether the building was delivered is the memorandum's to say.",
    );
    // A delivery not yet passed is read on its last day: Sep 30 itself is not past.
    expect(readForwardPurchase(bts, new Date("2027-09-30T12:00:00Z"))!.deliveryPassed).toBe(false);
    // Without a yield, the tag counts down only while delivery is ahead.
    const noYield = deal("Forward purchase at completion", [row("Purchase price", "$30,000,000"), row("Delivery date", "Q3 2027")]);
    expect(forwardTag(readForwardPurchase(noYield, TODAY))).toBe("Forward, delivers Q3 2027");
    expect(forwardTag(readForwardPurchase(noYield, later))).toBe("Forward purchase");
  });

  it("is no forward purchase where the buyer builds, or where the building already stands", () => {
    // A build-to-suit SITE: the price is the land's, and the works are the buyer's.
    const site = deal("Build-to-suit site for a regional distributor", [row("Land price", "$6,000,000"), row("Acres", "24")]);
    expect(isForwardPurchase(site)).toBe(false);
    expect(readForwardPurchase(site, TODAY)).toBeNull();
    // A build-to-suit priced as the finished building is one, with no forward words.
    const btsWhole = deal("Build-to-suit headquarters for a regional bank", [row("Purchase price", "$40,000,000")], "Office");
    expect(isForwardPurchase(btsWhole)).toBe(true);
    // A development with no purchase at completion is the buyer's own.
    const own = deal("Ground-up 240-unit apartment community", [row("Land cost", "$9,000,000"), row("Total project cost", "$70,000,000")]);
    expect(readForwardPurchase(own, TODAY)).toBeNull();
    // A building that stands, whatever its deck says of its history.
    const standing = {
      ...bts,
      strategy: { kind: "stabilized", summary: "Acquired by forward purchase in 2019; fully leased", capitalBudget: "", timeline: "" },
    } as unknown as ExtractionResult;
    expect(readForwardPurchase(standing, TODAY)).toBeNull();
    expect(readForwardPurchase(null, TODAY)).toBeNull();
  });

  // The audit of 2026-10-05: a deposit that steps up was said at its first
  // figure — "(2.1% of the price)", a 2.1% bar and "deposit $1.00M" on the
  // memo, where the exposure at go-hard is $4.8M (10%).
  it("reads no amount and no share off a deposit that steps up, and says its row as stated", () => {
    const stepped = deal("Forward purchase of a 240-unit community, purchased upon completion", [
      row("Purchase price", "$48,000,000"),
      row("Deposit", "$1,000,000 at signing, increasing to $4,800,000 at the start of construction"),
    ]);
    const r = readForwardPurchase(stepped, TODAY)!;
    expect(r.deposit).toEqual({ text: "$1,000,000 at signing, increasing to $4,800,000 at the start of construction", amount: null, sharePct: null });
    expect(r.headline).toContain(
      "The deposit as stated: $1,000,000 at signing, increasing to $4,800,000 at the start of construction — the buyer's exposure before delivery.",
    );
    expect(r.headline).not.toContain("% of the price");
    expect(forwardShortLine(r)).toContain("deposit $1,000,000 at signing, increasing to $4,800,000 at the start of construction");
    const html = renderToStaticMarkup(React.createElement(ForwardPanel, { forward: r, today: "2026-10-05" }));
    expect(html).not.toContain('data-bar="fwd-deposit"');
    expect(visibleText(html)).toContain("Deposit, at risk before delivery. As stated: $1,000,000 at signing, increasing to $4,800,000 at the start of construction");
    // Two shares, a step in words, or a dollar figure and a share that are
    // not one deposit: the same.
    for (const words of ["5% at signing, 10% at go-hard", "$1,000,000 at signing, rising to 10% of the price", "$1,000,000 at signing; 10% at go-hard"]) {
      const d = readForwardPurchase(deal("Forward purchase at completion", [row("Purchase price", "$48,000,000"), row("Deposit", words)]), TODAY)!;
      expect(d.deposit, words).toEqual({ text: words, amount: null, sharePct: null });
    }
    // One figure, or a dollar figure and its own share, read as before.
    expect(readForwardPurchase(deal("Forward purchase at completion", [row("Purchase price", "$48,000,000"), row("Deposit", "$2,400,000 (5%) at signing")]), TODAY)!.deposit).toEqual({
      text: "$2,400,000 (5%) at signing",
      amount: 2_400_000,
      sharePct: 5,
    });
  });

  it("reads a deposit with a hyphenated word beside the figure (research pass 37)", () => {
    const words = "$2,400,000 at signing, non-refundable after the 60-day due-diligence period";
    expect(readForwardPurchase(deal("Forward purchase at completion", [row("Purchase price", "$48,000,000"), row("Deposit", words)]), TODAY)!.deposit).toEqual({
      text: words,
      amount: 2_400_000,
      sharePct: 5,
    });
  });

  it("never reads a tenant's security deposit as the buyer's", () => {
    const r = readForwardPurchase(
      deal("Forward purchase at completion", [
        row("Purchase price", "$30,000,000"),
        row("Security deposits", "$250,000"),
      ]),
      TODAY,
    )!;
    expect(r.deposit).toBeNull();
    expect(forwardTermRows([row("Security deposits", "$250,000"), row("Deposit", "$1,500,000")]).map((m) => m.label)).toEqual(["Deposit"]);
  });

  it("orders the key terms the way the purchase is read, each only where stated", () => {
    const rows = forwardTermRows(bts.metrics as ReturnType<typeof row>[]);
    expect(rows.map((m) => m.label)).toEqual(["Delivery date", "Outside date", "Deposit", "Rent commencement"]);
    expect(forwardTermRows([row("Delivery cap rate", "5.75%"), row("Estimated delivery", "2028")]).map((m) => m.label)).toEqual([
      "Estimated delivery",
      "Delivery cap rate",
    ]);
    expect(forwardTermRows([row("Construction start", "Q1 2026")])).toEqual([]);
  });

  it("reads a stated delivery cap ahead of the plain cap, and refuses a figure no cap can be", () => {
    const both = deal("Forward purchase at completion", [
      row("Purchase price", "$30,000,000"),
      row("Delivery cap rate", "5.75%"),
      row("Cap rate", "6.25%"),
    ]);
    expect(readForwardPurchase(both, TODAY)!.deliveryYieldPct).toBe(5.75);
    const wild = deal("Forward purchase at completion", [row("Purchase price", "$30,000,000"), row("Delivery cap rate", "57.5%")]);
    expect(readForwardPurchase(wild, TODAY)).toMatchObject({ deliveryYieldPct: null, yieldFrom: null });
    // A community's first year is its lease-up, not its yield at delivery.
    const lease = deal("Forward purchase of a build-to-rent community at completion", [
      row("Purchase price", "$72,000,000"),
      row("NOI (Year 1)", "$2,100,000"),
    ]);
    expect(readForwardPurchase(lease, TODAY)!.deliveryYieldPct).toBeNull();
  });

  it("hands the challenger the facts, then the traps by name", () => {
    const r = readForwardPurchase(bts, TODAY)!;
    expect(forwardContextLine(r)).toMatch(/^Forward purchase: A build-to-suit bought at delivery/);
    expect(forwardContextLine(r)).toContain("Developer as stated: Ridgeline Logistics Partners.");
    const note = forwardNote(r);
    for (const trap of ["(a) COMPLETION", "(b) THE OUTSIDE DATE AND THE DEPOSIT", "(c) THE PRICE MECHANISM", "(d) THE LEASE AT DELIVERY", "(e) THE DEVELOPER", "(f) THE BUYER'S FINANCING"])
      expect(note).toContain(trap);
  });

  it("writes every sentence without a glued word", () => {
    for (const d of [bts, btr]) {
      const r = readForwardPurchase(d, TODAY)!;
      for (const text of [r.headline, forwardShortLine(r), forwardContextLine(r), forwardModelLine(r, { noi1: 4_320_000, noiAssumed: true, price: 72_000_000 }) ?? ""])
        expect(gluedWords(text)).toEqual([]);
    }
  });
});

describe("the prompt asks for what the reader reads", () => {
  it("names each forward-purchase row by a label the reader's own pattern takes", () => {
    const prompt = extractionInstruction("industrial");
    const labels: [string, RegExp][] = [
      ["Delivery date", DELIVERY_ROW],
      ["Outside date", OUTSIDE_ROW],
      ["Deposit", DEPOSIT_ROW],
      ["Delivery cap rate", DELIVERY_CAP_ROW],
      ["Rent commencement", RENT_COMMENCEMENT_ROW],
      ["Price adjustment", PRICE_ADJUSTMENT_ROW],
      ["Developer", DEVELOPER_ROW],
      ["Completion guaranty", GUARANTY_ROW],
    ];
    for (const [label, re] of labels) {
      expect(prompt).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    // The cap at delivery is never filed as the going-in cap, and no budget
    // row is asked for the developer's cost.
    expect(prompt).toContain('"Delivery cap rate" (a cap the price is struck at on the rent at delivery — never filed as "Going-in cap rate"');
    expect(prompt).toContain("never a budget row for the developer's cost of the works");
    expect(findGoingInCap([row("Delivery cap rate", "5.75%")])).toBeNull();
    // Each label, as the extraction writes it, is read.
    const r = readForwardPurchase(
      deal("Forward purchase at completion", [
        row("Purchase price", "$30,000,000"),
        row("Delivery date", "June 30, 2028"),
        row("Outside date", "December 31, 2028"),
        row("Deposit", "$1,500,000, hard after 60 days"),
        row("Delivery cap rate", "5.75%"),
        row("Rent commencement", "Certificate of occupancy"),
        row("Price adjustment", "Repriced at a 5.75% cap on the rent at delivery"),
        row("Developer", "Ridgeline Logistics Partners"),
        row("Completion guaranty", "Parent guaranty of completion"),
      ]),
      TODAY,
    )!;
    expect([r.delivery?.iso, r.outside?.iso, r.deposit?.amount, r.deliveryYieldPct, r.rentCommencement, r.priceAdjustment, r.developer, r.guaranty]).toEqual([
      "2028-06-30",
      "2028-12-31",
      1_500_000,
      5.75,
      "Certificate of occupancy",
      "Repriced at a 5.75% cap on the rent at delivery",
      "Ridgeline Logistics Partners",
      "Parent guaranty of completion",
    ]);
  });
});
