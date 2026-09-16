import { describe, expect, it } from "vitest";
import { readProration, type ProrationTerms } from "./proration";

/** A 15 April close on a calendar-year tax bill. */
const SEED: ProrationTerms = {
  closing: "2026-04-15",
  taxPeriodStart: "2026-01-01",
  taxPeriodEnd: "2026-12-31",
  taxAmount: 240_000,
  taxTiming: "arrears",
  closingDayTo: "seller",
  rentCollected: 150_000,
  securityDeposits: 92_000,
  price: 20_000_000,
  deposit: 500_000,
};

const BLANK: ProrationTerms = {
  closing: null,
  taxPeriodStart: null,
  taxPeriodEnd: null,
  taxAmount: null,
  taxTiming: "arrears",
  closingDayTo: "seller",
  rentCollected: null,
  securityDeposits: null,
  price: null,
  deposit: null,
};

const find = (r: ReturnType<typeof readProration>, label: string) =>
  r.lines.find((l) => l.label.startsWith(label));

describe("readProration — the days", () => {
  it("counts the tax period inclusive of both ends", () => {
    // 2026 is not a leap year: 365 days, not 364.
    expect(readProration(SEED).taxPeriodDays).toBe(365);
  });

  it("counts a leap year as 366", () => {
    const r = readProration({
      ...SEED,
      closing: "2028-04-15",
      taxPeriodStart: "2028-01-01",
      taxPeriodEnd: "2028-12-31",
    });
    expect(r.taxPeriodDays).toBe(366);
  });

  it("charges the day of closing to the side the contract names", () => {
    // 1 Jan to 15 Apr inclusive is 105 days. To the seller: 105. To the
    // buyer: 104, and the buyer picks the day up.
    const toSeller = readProration(SEED);
    const toBuyer = readProration({ ...SEED, closingDayTo: "buyer" });
    expect(toSeller.sellerDays).toBe(105);
    expect(toBuyer.sellerDays).toBe(104);
    expect(toSeller.sellerDays! + toSeller.buyerDays!).toBe(365);
    expect(toBuyer.sellerDays! + toBuyer.buyerDays!).toBe(365);
  });

  it("the day is worth real money, so it is never assumed silently", () => {
    const a = readProration(SEED).taxLine!.amount;
    const b = readProration({ ...SEED, closingDayTo: "buyer" }).taxLine!.amount;
    expect(a).not.toBe(b);
    // One day of a $240,000 bill is $657.53. The gap between the two
    // statements is $657.54 — each line is rounded to the cent on its own,
    // as a settlement statement's lines are, so the difference of two
    // rounded figures is not the rounded difference. Within a cent is the
    // true claim; asserting equality would be asserting a rounding bug.
    const perDay = 240_000 / 365;
    expect(Math.abs(a - b - perDay)).toBeLessThanOrEqual(0.01);
  });
});

const round2 = (n: number) => Math.round(n * 100) / 100;

describe("readProration — arrears and advance run in OPPOSITE directions", () => {
  it("in arrears the SELLER credits the BUYER", () => {
    // The bill is not paid yet; the buyer will pay the whole year and needs
    // the seller's 105 days handed over.
    const r = readProration(SEED);
    expect(r.taxLine!.to).toBe("buyer");
    expect(r.taxLine!.amount).toBe(round2((240_000 * 105) / 365));
    expect(r.taxLine!.label).toContain("unpaid");
  });

  it("in advance the BUYER credits the SELLER", () => {
    // The seller already paid the whole year, so the buyer owes them the
    // 260 days after closing.
    const r = readProration({ ...SEED, taxTiming: "advance" });
    expect(r.taxLine!.to).toBe("seller");
    expect(r.taxLine!.amount).toBe(round2((240_000 * 260) / 365));
    expect(r.taxLine!.label).toContain("prepaid");
  });

  it("the two sum to the whole bill, and never to each other", () => {
    // The error this exists to prevent: reading arrears as advance does not
    // just change a number, it moves the money the other way, so the miss
    // is the SUM of the two, not the difference.
    const arrears = readProration(SEED).taxLine!;
    const advance = readProration({ ...SEED, taxTiming: "advance" }).taxLine!;
    expect(arrears.to).not.toBe(advance.to);
    expect(round2(arrears.amount + advance.amount)).toBe(240_000);
  });
});

describe("readProration — the tenants' money", () => {
  it("credits security deposits to the buyer in full", () => {
    const line = find(readProration(SEED), "Security deposits")!;
    expect(line.to).toBe("buyer");
    expect(line.amount).toBe(92_000);
    expect(line.note).toContain("tenants' money");
  });

  it("never prorates them — they are a liability, not income", () => {
    // A deposit is owed back whole whenever the tenant leaves, so no part
    // of it belongs to the seller for the days they owned the building.
    const early = readProration({ ...SEED, closing: "2026-01-02" });
    const late = readProration({ ...SEED, closing: "2026-12-30" });
    expect(find(early, "Security deposits")!.amount).toBe(92_000);
    expect(find(late, "Security deposits")!.amount).toBe(92_000);
  });
});

describe("readProration — rent for the closing month", () => {
  it("gives the buyer the days it owns the building", () => {
    // April has 30 days; closing on the 15th with the day to the seller
    // leaves the buyer 15.
    const line = find(readProration(SEED), "Rent collected")!;
    expect(line.to).toBe("buyer");
    expect(line.amount).toBe(round2((150_000 * 15) / 30));
    expect(line.note).toContain("15 of 30 days");
  });

  it("follows the same closing-day rule as the taxes", () => {
    const line = find(readProration({ ...SEED, closingDayTo: "buyer" }), "Rent collected")!;
    expect(line.note).toContain("16 of 30 days");
  });

  it("reads the closing month's own length", () => {
    // February 2026 has 28 days, not 30.
    const feb = readProration({ ...SEED, closing: "2026-02-15" });
    expect(find(feb, "Rent collected")!.note).toContain("of 28 days");
  });

  it("gives the buyer nothing when the seller closes on the last day", () => {
    const last = readProration({ ...SEED, closing: "2026-04-30" });
    expect(find(last, "Rent collected")).toBeUndefined();
  });
});

describe("readProration — the statement and the wire", () => {
  it("nets the credits by direction, not by size", () => {
    const r = readProration(SEED);
    const byHand = r.lines.reduce(
      (s, l) => s + (l.to === "buyer" ? l.amount : -l.amount),
      0,
    );
    expect(r.netToBuyer).toBe(round2(byHand));
    expect(r.netToBuyer!).toBeGreaterThan(0);
  });

  it("takes the buyer's credits off the price to get the wire", () => {
    const r = readProration(SEED);
    expect(r.cashToClose).toBe(round2(20_000_000 - r.netToBuyer!));
  });

  it("the wire moves the other way when the taxes are prepaid", () => {
    // Prepaid taxes are a credit to the SELLER, so the buyer wires more.
    const arrears = readProration(SEED);
    const advance = readProration({ ...SEED, taxTiming: "advance" });
    expect(advance.cashToClose!).toBeGreaterThan(arrears.cashToClose!);
  });

  it("every line says which way it moves", () => {
    for (const l of readProration(SEED).lines) {
      expect(["buyer", "seller"]).toContain(l.to);
      expect(l.amount).toBeGreaterThan(0);
      expect(l.note.length).toBeGreaterThan(0);
    }
  });

  it("counts the escrow deposit once, against the wire", () => {
    const withEscrow = readProration(SEED);
    const without = readProration({ ...SEED, deposit: null });
    expect(find(withEscrow, "Earnest money")!.amount).toBe(500_000);
    expect(round2(without.cashToClose! - withEscrow.cashToClose!)).toBe(500_000);
  });
});

describe("readProration — what it refuses", () => {
  it("asks for the closing date first", () => {
    expect(readProration(BLANK).note).toContain("closing date");
    expect(readProration({ ...BLANK, closing: "not-a-date" }).note).toContain("yyyy-mm-dd");
  });

  it("refuses a date that is not on the calendar", () => {
    // Date.parse takes 2026-02-31 and quietly rolls it to 3 March.
    expect(readProration({ ...BLANK, closing: "2026-02-31" }).note).toContain("yyyy-mm-dd");
  });

  it("refuses a tax period that ends before it starts", () => {
    const r = readProration({ ...SEED, taxPeriodStart: "2026-12-31", taxPeriodEnd: "2026-01-01" });
    expect(r.note).toContain("ends before it starts");
  });

  it("refuses a closing outside the period it is asked to prorate", () => {
    const r = readProration({ ...SEED, closing: "2027-04-15", taxPeriodEnd: "2026-12-31" });
    expect(r.note).toContain("outside the tax period");
    expect(r.taxLine).toBeNull();
  });

  it("says when there is nothing to prorate at all", () => {
    const r = readProration({ ...BLANK, closing: "2026-04-15" });
    expect(r.note).toContain("Nothing to prorate yet");
    expect(r.lines).toEqual([]);
  });

  it("answers on the taxes alone, or the deposits alone", () => {
    const taxOnly = readProration({
      ...BLANK,
      closing: "2026-04-15",
      taxPeriodStart: "2026-01-01",
      taxPeriodEnd: "2026-12-31",
      taxAmount: 240_000,
    });
    expect(taxOnly.lines.length).toBe(1);
    expect(taxOnly.netToBuyer!).toBeGreaterThan(0);
    expect(taxOnly.cashToClose).toBeNull();

    const depositsOnly = readProration({
      ...BLANK,
      closing: "2026-04-15",
      securityDeposits: 92_000,
    });
    expect(depositsOnly.lines.length).toBe(1);
    expect(depositsOnly.netToBuyer).toBe(92_000);
  });

  it("a blank is null, never zero", () => {
    const r = readProration(BLANK);
    expect(r.taxPeriodDays).toBeNull();
    expect(r.netToBuyer).toBeNull();
    expect(r.cashToClose).toBeNull();
    expect(r.taxLine).toBeNull();
  });
});
