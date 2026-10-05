import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  allInFor,
  ceilingBidLine,
  hammerFor,
  readPremium,
  readSale,
  saleContextLine,
  saleNote,
  saleShortLine,
  saleTag,
  statesStalkingHorse,
} from "./sale-terms";
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

  it("reads the bid, the reserve and the stalking horse with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no figure.
    const r = readSale(
      ex(
        [
          row("Starting bid", "$2,500,000 (non-binding opening bid)"),
          row("Reserve price", "$3,000,000 (court-approved)"),
          row("Stalking horse bid", "$3,100,000 (break-up fee 3%)"),
        ],
        { method: "auction" },
      ),
      TODAY,
    )!;
    expect(r.startingBid).toBe(2_500_000);
    expect(r.reserve).toEqual({ kind: "amount", amount: 3_000_000, stated: "$3,000,000 (court-approved)" });
    expect(r.stalkingHorse).toBe(3_100_000);
    // A bid stated as a range is still no one bid.
    expect(readSale(ex([row("Starting bid", "$2.5M - $3M")], { method: "auction" }), TODAY)!.startingBid).toBeNull();
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

  it("a stalking horse the memorandum states without a price is still one (audit c66)", () => {
    const unpriced = ex([row("Stalking horse bid", "In place — terms in the data room")], { method: "unknown" });
    expect(statesStalkingHorse(unpriced)).toBe(true);
    const r = readSale(unpriced, TODAY)!;
    expect(r.stalkingHorse).toBeNull();
    expect(r.stalkingHorseStated).toBe("In place — terms in the data room");
    expect(r.headline).toContain("A stalking-horse bid is stated (In place — terms in the data room): it sets the floor every other bid starts over.");
    expect(saleShortLine(r)).toBe("Sold on the terms stated: a stalking-horse bid");
    // A priced one is said with its figure, as before.
    expect(statesStalkingHorse(ex([row("Stalking horse bid", "$3,100,000")], { method: "bankruptcy" }))).toBe(true);
    // Whatever method the extraction named.
    expect(statesStalkingHorse(ex([row("Stalking horse bid", "$3,100,000")], { method: "negotiated" }))).toBe(true);
  });

  it("a stalking-horse row that says there is none is no stalking horse", () => {
    for (const none of ["None", "None at this time", "N/A", "n/a", "Not applicable", "Not stated", "No stalking horse", "—", ""]) {
      const e = ex([row("Stalking horse bid", none)], { method: "unknown" });
      expect(statesStalkingHorse(e), none).toBe(false);
      expect(readSale(e, TODAY), none).toBeNull();
    }
    // An amount withheld is a stalking horse whose price is not given.
    expect(statesStalkingHorse(ex([row("Stalking horse bid", "Not disclosed")], { method: "unknown" }))).toBe(true);
    expect(statesStalkingHorse(null)).toBe(false);
  });

  // A row reading "TBD" is a stalking-horse process whose bid is not yet set:
  // still one — higher bids can reopen the sale, and the letter of intent
  // is refused on it — never read as "none" (the pass of 2026-10-04 asked).
  it("a stalking horse to be determined is still one, its bid unpriced", () => {
    for (const tbd of ["TBD", "tbd", "To be determined", "TBD — pending court approval"]) {
      const e = ex([row("Stalking horse bid", tbd)], { method: "bankruptcy" });
      expect(statesStalkingHorse(e), tbd).toBe(true);
      const r = readSale(e, TODAY)!;
      expect(r.stalkingHorse, tbd).toBeNull();
      expect(r.stalkingHorseStated, tbd).toBe(tbd);
    }
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
    expect(receiver).not.toContain("HOW THE LENDER TOOK TITLE");
    expect(gluedWords(note)).toEqual([]);
  });
});

// Research pass 23: a short sale was no sale method, so the lender's
// consent went unsaid; and the bank-owned traps never asked how the lender
// came to own the building.
describe("a short sale, and how a lender took title", () => {
  it("a short sale says the lender must approve it, the price and the timing being the lender's", () => {
    const r = readSale(ex([], { method: "short_sale", terms: "Subject to lender approval; 60-day close after approval" }), TODAY)!;
    expect(r.method).toBe("short_sale");
    expect(r.label).toBe("A short sale");
    expect(r.headline).toBe(
      "It is a short sale: the owner is selling for less than its loan's balance, so its lender must approve the sale — the price the lender will take, and when it decides, are the lender's, and the seller cannot promise to close.",
    );
    expect(saleTag(ex([], { method: "short_sale" }), TODAY)).toBe("Short sale");
    expect(saleShortLine(r)).toBe("A short sale, subject to the lender's approval");
    expect(saleContextLine(r)).toContain("The sale's terms as stated: Subject to lender approval; 60-day close after approval.");
    const note = saleNote(r);
    expect(note).toContain("(a) THE LENDER'S CONSENT AND ITS TIMING — ask whether the lender has approved this sale in writing");
    expect(note).toContain("(b) THE PRICE THE LENDER APPROVES — the lender, not the seller, decides what it will take");
    expect(note).toContain("(c) THE SELLER CANNOT PROMISE TO CLOSE");
    // The owner ran the building: the receiver's and the lender's traps are not this sale's.
    expect(note).not.toContain("THE SELLER NEVER RAN IT");
    expect(gluedWords(`${r.headline} ${note}`)).toEqual([]);
  });

  it("a bank-owned sale asks how the lender took title, as a question to check", () => {
    const note = saleNote(readSale(ex([], { method: "reo" }), TODAY)!);
    expect(note).toContain(
      "(d) HOW THE LENDER TOOK TITLE — ask whether it came by a foreclosure or by a deed in lieu: a deed in lieu typically leaves junior liens in place, so check the title commitment for what survives",
    );
    expect(note).toContain("(c) THE LENDER'S TERMS");
  });

  it("the extraction's enum, the type and the reader are one list, and the prompt names every method", async () => {
    const { SALE_METHODS } = await import("./sale-terms");
    const { extractionInstruction } = await import("./anthropic/prompts");
    const { readFileSync } = await import("node:fs");
    expect(SALE_METHODS).toEqual(["negotiated", "auction", "receivership", "bankruptcy", "reo", "short_sale", "unknown"]);
    // The schema reads the reader's own list, never a copy of it.
    expect(readFileSync("lib/anthropic/extract.ts", "utf8")).toContain("method: z.enum(SALE_METHODS)");
    const prompt = extractionInstruction("multifamily" as never);
    for (const m of SALE_METHODS) expect(prompt, m).toContain(`"${m}"`);
    // Every method the extraction may write is read: none but a negotiated
    // sale (and an unknown one with no auction figures) reads as nothing.
    for (const m of SALE_METHODS) {
      const read = readSale(ex([], { method: m }), TODAY);
      expect(read === null, m).toBe(m === "negotiated" || m === "unknown");
    }
  });
});
