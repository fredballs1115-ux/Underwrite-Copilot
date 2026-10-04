import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { allInFor, ceilingBidLine, hammerFor, readPremium, readSale, saleContextLine, saleNote, saleShortLine, saleTag } from "./sale-terms";
import { gluedWords } from "./render-lint";

// Every read is on one day, so every "days from today" is fixed.
const TODAY = new Date(Date.UTC(2026, 8, 30));

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 3"): Row => ({ label, value, flagged: false, page, basis: "na" });

const ex = (metrics: Row[], sale?: { method: string; terms?: string; condition?: string; page?: string }): ExtractionResult =>
  ({
    dealName: "Midtown Office Tower",
    assetClass: "office",
    totalPages: 30,
    ...(sale ? { sale: { terms: "", condition: "", page: "", ...sale } } : {}),
    metrics: [row("NOI (in-place)", "$480,000"), row("Total SF", "62,000 SF"), ...metrics],
  }) as unknown as ExtractionResult;

/** The auction fixture: an online auction with a starting bid, a premium
 *  and an undisclosed reserve. */
const AUCTION = ex(
  [
    row("Starting bid", "$2,500,000"),
    row("Buyer's premium", "5% of the winning bid"),
    row("Reserve price", "Undisclosed"),
    row("Bid deadline", "October 15, 2026"),
  ],
  { method: "auction", terms: "Online auction; 10% non-refundable deposit; 30-day close; no financing contingency", condition: "As-is, where-is", page: "p. 3" },
);

describe("readPremium, allInFor and hammerFor — the premium on top of the hammer, and backed out of it", () => {
  it("reads a percentage and its minimum, and never a percentage over 25", () => {
    expect(readPremium("5% of the winning bid")).toEqual({ pct: 5, min: null });
    expect(readPremium("6% (minimum $50,000)")).toEqual({ pct: 6, min: 50_000 });
    expect(readPremium("5%, not less than $25k")).toEqual({ pct: 5, min: 25_000 });
    expect(readPremium("50%")).toBeNull();
    expect(readPremium("Included")).toBeNull();
  });

  it("the all-in price and the hammer that allows it are inverses, the minimum binding where it must", () => {
    const five = { pct: 5, min: null };
    expect(allInFor(10_000_000, five)).toBe(10_500_000);
    expect(hammerFor(10_500_000, five)).toBeCloseTo(10_000_000, 6);
    const floor = { pct: 5, min: 50_000 };
    expect(allInFor(500_000, floor)).toBe(550_000);
    expect(hammerFor(550_000, floor)).toBe(500_000);
    expect(hammerFor(allInFor(3_000_000, floor), floor)).toBeCloseTo(3_000_000, 6);
    expect(allInFor(1_000_000, null)).toBe(1_000_000);
  });
});

describe("readSale — how the property is sold", () => {
  it("reads the auction's bid, premium, reserve and deadline, and the floor all-in", () => {
    const r = readSale(AUCTION, TODAY)!;
    expect(r.method).toBe("auction");
    expect(r.startingBid).toBe(2_500_000);
    expect(r.premium).toEqual({ pct: 5, min: null });
    expect(r.floorAllIn).toBe(2_625_000);
    expect(r.reserve?.kind).toBe("undisclosed");
    expect(r.deadline).toEqual({ ends: "2026-10-15", stated: "October 15, 2026", daysLeft: 15 });
    expect(r.page).toBe("p. 3");
  });

  it("a deadline stated as a month alone is no day: never counted down, never printed as the month's last (the audit of 2026-10-04)", () => {
    for (const stated of ["October 2026", "10/2026"]) {
      const r = readSale(
        ex([row("Starting bid", "$2,500,000"), row("Bid deadline", stated)], { method: "auction" }),
        TODAY,
      )!;
      expect(r.deadline, stated).toBeNull();
      expect(r.headline, stated).not.toMatch(/Bids are due|Oct 31/);
      expect(saleShortLine(r), stated).not.toContain("bids due");
    }
  });

  it("says the starting bid is not the price, the premium on top, the reserve and the deadline", () => {
    const r = readSale(AUCTION, TODAY)!;
    expect(r.headline).toBe(
      "The property is sold at auction: bidding opens at $2.5M, which is where the price starts, not what it is — a cap struck on it is the ceiling of what the building yields. " +
        "The buyer pays a 5% premium on top of the winning bid: $2.5M at the hammer is $2.63M all-in. " +
        "The reserve is undisclosed: the seller may refuse any bid under it, so the starting bid need not buy the building. " +
        "Bids are due Oct 15, 2026, 15 days from today. " +
        "Sold as stated: As-is, where-is.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("an auction's figures say it is one even where the method was not named", () => {
    expect(readSale(ex([row("Starting bid", "$2,500,000")]), TODAY)?.method).toBe("auction");
  });

  it("a receiver's, a bankruptcy's and a lender's sale each say who is selling", () => {
    expect(readSale(ex([], { method: "receivership" }), TODAY)!.headline).toContain("A court-appointed receiver is selling it: the seller never ran the building");
    const bk = readSale(ex([row("Stalking horse bid", "$3,100,000")], { method: "bankruptcy" }), TODAY)!;
    expect(bk.headline).toContain("It is sold out of a bankruptcy");
    expect(bk.headline).toContain("A stalking-horse bid of $3.1M is stated");
    expect(saleTag(ex([], { method: "reo" }), TODAY)).toBe("Bank-owned (REO)");
  });

  it("no reserve, and a premium with a minimum", () => {
    const r = readSale(ex([row("Starting bid", "$500,000"), row("Buyer's premium", "6% (minimum $50,000)"), row("Reserve", "No reserve — absolute auction")], { method: "auction" }), TODAY)!;
    expect(r.floorAllIn).toBe(550_000);
    expect(r.headline).toContain("The buyer pays a 6% premium on top of the winning bid, at least $50,000: $500,000 at the hammer is $550,000 all-in.");
    expect(r.headline).toContain("It is sold without reserve, as stated: the highest bid buys it.");
  });

  it("nothing on a negotiated sale, an unknown one with no auction figures, or an extraction from before", () => {
    expect(readSale(ex([], { method: "negotiated" }), TODAY)).toBeNull();
    expect(readSale(ex([], { method: "unknown" }), TODAY)).toBeNull();
    expect(readSale(ex([]), TODAY)).toBeNull();
    expect(saleTag(ex([]), TODAY)).toBeNull();
    expect(saleTag(null, TODAY)).toBeNull();
  });

  it("the figure decides the article: an 8% premium, an 18% hurdle, an $80M stalking horse", () => {
    const r = readSale(ex([row("Starting bid", "$2,000,000"), row("Buyer's premium", "8%"), row("Stalking horse bid", "$80,000,000")], { method: "bankruptcy" }), TODAY)!;
    expect(r.headline).toContain("The buyer pays an 8% premium on top of the winning bid");
    expect(saleShortLine(r)).toContain("an 8% buyer's premium");
    expect(saleShortLine(r)).toContain("an $80M stalking-horse bid");
    expect(ceilingBidLine(r, 3_000_000, 18)).toMatch(/^At an 18% levered IRR/);
    expect(ceilingBidLine(r, 6_000_000, 18, true)).toContain("still clears an 18% levered IRR");
    expect(gluedWords(`${r.headline} ${saleShortLine(r)}`)).toEqual([]);
  });

  it("a reserve for replacements is not an auction's reserve", () => {
    const r = readSale(ex([row("Starting bid", "$2,500,000"), row("Replacement reserve", "$250/unit")], { method: "auction" }), TODAY)!;
    expect(r.reserve).toBeNull();
  });
});

describe("the sale on every summary", () => {
  it("the ceiling bid backs the premium out of the model's all-in ceiling", () => {
    const r = readSale(AUCTION, TODAY)!;
    expect(ceilingBidLine(r, 3_150_000, 15)).toBe(
      "At a 15% levered IRR the model pays at most $3.15M all-in — a hammer price of $3M with the 5% premium on top, $500,000 over the starting bid.",
    );
    expect(ceilingBidLine(r, 2_100_000, 15)).toContain("under the $2.5M starting bid, so the model does not bid at all");
    expect(ceilingBidLine(r, null, 15)).toBe("");
    expect(ceilingBidLine(r, 5_250_000, 15, true)).toBe(
      "The model still clears a 15% levered IRR at $5.25M all-in, twice the opening floor — at this hurdle the bidding, not the model, sets the ceiling.",
    );
  });

  it("the tag, the short line, the context and the traps", () => {
    expect(saleTag(AUCTION, TODAY)).toBe("Auction, 5% premium");
    const r = readSale(AUCTION, TODAY)!;
    expect(saleShortLine(r)).toBe(
      "Sold at auction: bidding opens at $2.5M; a 5% buyer's premium ($2.63M all-in at the opening bid); reserve undisclosed; bids due Oct 15, 2026",
    );
    const context = saleContextLine(r);
    expect(context.startsWith("How it is sold: The property is sold at auction")).toBe(true);
    expect(context).toContain("The sale's terms as stated: Online auction; 10% non-refundable deposit; 30-day close; no financing contingency.");
    expect(context.endsWith("(p. 3)")).toBe(true);
    const note = saleNote(r);
    expect(note).toContain("SALE TRAPS, checked by name");
    expect(note).toContain("(a) THE STARTING BID IS NOT THE PRICE");
    expect(note).toContain("(b) THE BUYER'S PREMIUM — 5% on top of the hammer");
    expect(note).toContain("(d) THE RESERVE — undisclosed");
    const receiver = saleNote(readSale(ex([], { method: "receivership" }), TODAY)!);
    expect(receiver).toContain("(a) THE SELLER NEVER RAN IT");
    expect(receiver).toContain("(c) THE COURT — the receiver's sale can need the court's approval");
    expect(gluedWords(note)).toEqual([]);
  });
});
