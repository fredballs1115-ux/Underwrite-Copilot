import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { exchangeForDeal } from "./exchange-deal";
import { gluedWords } from "./render-lint";

const TODAY = new Date(Date.UTC(2026, 9, 5, 12));
// Begun Sep 15, a partnership's: identify by Oct 30, close by Mar 14.
const BLOCK = { relinquishedTransferOn: "2026-09-15", filer: "partnership" as const };
const row = (label: string, value: string) => ({ label, value, flagged: false, page: "", basis: "na" as const });
const deal = (metrics: ReturnType<typeof row>[] = [], interest?: Record<string, string>): ExtractionResult =>
  ({ dealName: "Harbor View", assetClass: "multifamily", totalPages: 40, metrics: [row("Asking price", "$20,000,000"), ...metrics], ...(interest ? { interest } : {}) }) as unknown as ExtractionResult;
const lease = (summary: string, groundLease: string) => ({ kind: "leasehold", summary, share: "", groundLease, loan: "", page: "" });

describe("the buy box's 1031 exchange against a deal (lib/exchange-window)", () => {
  it("says the identification deadline in the brand's tone, and offers due after it as a date fact in the caution tone", () => {
    const clock = exchangeForDeal(BLOCK, deal(), "2026-10-20", TODAY)!;
    expect(clock).toMatchObject({ tag: "1031: identify by Oct 30", tone: "brand", line: "1031 exchange: identify by Oct 30, 2026, close by Mar 14, 2027" });
    const late = exchangeForDeal(BLOCK, deal(), "2026-11-02", TODAY)!;
    expect(late).toMatchObject({ tag: "1031: offers due after ID", tone: "caution" });
    expect(late.line).toBe(
      "1031 exchange: identify by Oct 30, 2026, close by Mar 14, 2027; offers are due Nov 2, 2026, after your identification deadline, Oct 30, 2026: to keep it in your exchange it must be identified by Oct 30, 2026, before it is bid on",
    );
    expect(gluedWords(late.line)).toEqual([]);
    // Offers due after the exchange must close, and an identification
    // period already over, are date facts too.
    expect(exchangeForDeal(BLOCK, deal(), "2027-04-01", TODAY)).toMatchObject({ tag: "1031: offers due after close", tone: "caution" });
    expect(exchangeForDeal({ relinquishedTransferOn: "2026-08-01" }, deal(), null, TODAY)).toMatchObject({ tag: "1031: ID period over", tone: "caution" });
  });

  it("reads the memorandum's own call for offers where the deal carries no deadline, and the deal's own over it", () => {
    const stated = deal([row("Offers due", "November 2, 2026")]);
    expect(exchangeForDeal(BLOCK, stated, null, TODAY)?.tag).toBe("1031: offers due after ID");
    expect(exchangeForDeal(BLOCK, stated, "2026-10-20", TODAY)?.tag).toBe("1031: identify by Oct 30");
  });

  it("asks exchange counsel about a note, a share or a short leasehold in the muted tone, never decides it", () => {
    const note = exchangeForDeal(BLOCK, deal([], { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" }), null, TODAY)!;
    expect(note).toMatchObject({ tag: "1031: note — ask counsel", tone: "muted" });
    const share = exchangeForDeal(BLOCK, deal([], { kind: "partial_interest", summary: "", share: "49% LP interest", groundLease: "", loan: "", page: "" }), null, TODAY)!;
    expect(share).toMatchObject({ tag: "1031: share — ask counsel", tone: "muted" });
    // An undivided interest held as a tenant in common, read off the
    // interest's own words (research pass 37): the real estate's, asked as
    // such, never "a share of the owning entity".
    const tic = exchangeForDeal(
      BLOCK,
      deal([], { kind: "partial_interest", summary: "An undivided 30% tenant-in-common interest in the fee simple", share: "30% tenant-in-common interest", groundLease: "", loan: "", page: "" }),
      null,
      TODAY,
    )!;
    expect(tic).toMatchObject({ tag: "1031: TIC — ask counsel", tone: "muted" });
    expect(tic.line).toBe(
      "1031 exchange: identify by Oct 30, 2026, close by Mar 14, 2027; the price buys an undivided interest in the real estate, held as a tenant in common; whether the co-ownership counts as real property or as a partnership interest is a question for your exchange counsel",
    );
    expect(tic.line).not.toContain("owning entity");
    // A preferred equity position, its own kind or a share filed before the
    // kind was asked whose rows say one (lib/interest `interestOf`).
    const position = exchangeForDeal(BLOCK, deal([], { kind: "preferred_equity", summary: "", share: "", groundLease: "", loan: "", page: "" }), null, TODAY)!;
    expect(position).toMatchObject({ tag: "1031: position — ask counsel", tone: "muted" });
    expect(position.line).toBe(
      "1031 exchange: identify by Oct 30, 2026, close by Mar 14, 2027; the price buys a preferred equity position in the owning entity, not the building. Section 1031 reaches only real property exchanged for real property of like kind; whether this position counts is a question for your exchange counsel",
    );
    const filedAsShare = exchangeForDeal(
      BLOCK,
      deal([row("Preferred equity amount", "$15,000,000"), row("Current pay rate", "8.0%")], { kind: "partial_interest", summary: "", share: "", groundLease: "", loan: "", page: "" }),
      null,
      TODAY,
    )!;
    expect(filedAsShare.tag).toBe("1031: position — ask counsel");
    // A leasehold's years are read on the day, its options apart.
    const short = exchangeForDeal(
      BLOCK,
      deal([row("Ground lease expiration", "June 30, 2049"), row("Ground lease extension options", "Two 10-year options")], lease("Leasehold under a ground lease", "Ground lease to 2049")),
      null,
      TODAY,
    )!;
    expect(short).toMatchObject({ tag: "1031: lease under 30 yrs", tone: "muted" });
    expect(short.fit.flags[0].text).toContain("The price buys a leasehold with 22 years left, 20 more in its options as stated.");
    expect(exchangeForDeal(BLOCK, deal([row("Ground lease expiration", "December 31, 2090")], lease("Leasehold under a ground lease", "Ground lease to 2090")), null, TODAY)?.tag).toBe(
      "1031: identify by Oct 30",
    );
    // A term that already counts its options is a ceiling: the thirty years
    // are asked, its options included or not, and so they are where the
    // memorandum states no end (the pre-merge audit, C1 L5: "1031: identify
    // by Nov 4", no question raised).
    const ceiling = exchangeForDeal(
      { relinquishedTransferOn: "2026-09-20" },
      deal([row("Ground lease expiration", "December 31, 2061, including all extension options")], lease("Leasehold interest under a ground lease", "Ground lease to 2061 including options")),
      null,
      TODAY,
    )!;
    expect(ceiling).toMatchObject({ tag: "1031: lease term — ask counsel", tone: "muted" });
    expect(ceiling.fit.flags[0].text).toContain("The price buys a leasehold with up to 35 years left, its options included.");
    const unread = exchangeForDeal(BLOCK, deal([], lease("Leasehold under a ground lease", "")), null, TODAY)!;
    expect(unread).toMatchObject({ tag: "1031: lease term — ask counsel", tone: "muted" });
    expect(unread.fit.flags[0].text).toContain("The price buys a leasehold whose years left are not read from the memorandum.");
    // A sandwich position's years are its master lease's.
    const master = exchangeForDeal(
      BLOCK,
      deal([row("Master lease expiration", "December 31, 2041"), row("Ground lease expiration", "December 31, 2090")], lease("A master lease of the building, sublet to its tenants", "Master lease through 2041")),
      null,
      TODAY,
    )!;
    expect(master.fit.flags[0].text).toContain("The price buys a leasehold with 15 years left.");
    // A date fact leads the tag over a question, and both are said.
    const both = exchangeForDeal(BLOCK, deal([], { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" }), "2026-11-02", TODAY)!;
    expect(both).toMatchObject({ tag: "1031: offers due after ID", tone: "caution" });
    expect(both.fit.flags.map((f) => f.kind)).toEqual(["after_identify", "note"]);
  });

  it("says nothing with no exchange in the box, or once its period is over", () => {
    expect(exchangeForDeal(null, deal(), "2026-11-02", TODAY)).toBeNull();
    expect(exchangeForDeal({ relinquishedTransferOn: null }, deal(), null, TODAY)).toBeNull();
    expect(exchangeForDeal({ relinquishedTransferOn: "2026-01-02" }, deal(), null, TODAY)).toBeNull();
  });

  it("reads a box written by hand through the save's own rule: a filer not on the list is no filer, never a throw", () => {
    // The criteria column is its owner's to write; the window reader looks
    // a filer up on its list and would throw on one it does not know.
    const hand = exchangeForDeal({ relinquishedTransferOn: "2026-10-01", filer: "llc" as never }, deal(), null, TODAY)!;
    expect(hand.window).toMatchObject({ filer: null, form: "Form 1040", closeBy: "2027-03-30" });
    expect(exchangeForDeal({ relinquishedTransferOn: "not a day" }, deal(), null, TODAY)).toBeNull();
  });
});
