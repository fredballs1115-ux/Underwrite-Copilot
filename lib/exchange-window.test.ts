import { describe, expect, it } from "vitest";
import { exchangeFit, exchangeShortLine, exchangeWindow, EXCHANGE_FILERS } from "./exchange-window";
import { gluedWords } from "./render-lint";

const TODAY = new Date(Date.UTC(2026, 9, 5, 12));
const w = (relinquishedTransferOn: string, more: { filer?: (typeof EXCHANGE_FILERS)[number]["id"] | null; returnExtended?: boolean } = {}) =>
  exchangeWindow({ relinquishedTransferOn, ...more }, TODAY)!;

describe("the buyer's 1031 clock (pass 28, round 4)", () => {
  it("runs both deadlines from the transfer: the 45th day to identify, the 180th to close", () => {
    const x = w("2026-09-15", { filer: "partnership" });
    expect(x).toMatchObject({ identifyBy: "2026-10-30", fullCloseBy: "2027-03-14", returnDueBy: "2027-03-15", closeBy: "2027-03-14", cutShort: false, phase: "identify", daysToIdentify: 25 });
    expect(x.sentence).toBe("Identify your replacement property by Oct 30, 2026 (in 25 days), the 45th day from the Sep 15, 2026 transfer; close by Mar 14, 2027.");
  });

  it("ends the window at the filer's return due date unless extended, and says an unset filer is read as an individual", () => {
    // Pass 28's example: begun Oct 1, an individual's window runs the full
    // 180 days to Mar 30; a partnership's return, due Mar 15, ends it first.
    const unset = w("2026-10-01");
    expect(unset).toMatchObject({ closeBy: "2027-03-30", returnDueBy: "2027-04-15", cutShort: false, filer: null, form: "Form 1040" });
    expect(unset.sentence).toBe(
      "Identify your replacement property by Nov 15, 2026 (in 41 days), the 45th day from the Oct 1, 2026 transfer; close by Mar 30, 2027. A partnership's or an S corporation's calendar-year return would end it sooner, read to Mar 15, 2027; set who files in the buy box.",
    );
    const partnership = w("2026-10-01", { filer: "partnership" });
    expect(partnership).toMatchObject({ closeBy: "2027-03-15", cutShort: true });
    expect(partnership.sentence).toContain(
      "close by Mar 15, 2027 — the due date for a calendar-year Form 1065 return ends it before the 180th day unless the return is extended, and the window is read to Mar 15, 2027.",
    );
    expect(w("2026-10-01", { filer: "s_corporation" }).closeBy).toBe("2027-03-15");
    expect(w("2026-12-20", { filer: "c_corporation" })).toMatchObject({ returnDueBy: "2027-04-15", closeBy: "2027-04-15", cutShort: true });
    expect(w("2026-12-20", { filer: "trust" }).form).toBe("Form 1041");
    const extended = w("2026-10-01", { filer: "partnership", returnExtended: true });
    expect(extended).toMatchObject({ closeBy: "2027-03-30", cutShort: false, extended: true });
    expect(extended.sentence).toContain("— the return is extended, so the full 180 days.");
    // An early transfer's 180 days end long before any return is due: no
    // partnership aside.
    expect(w("2026-09-15").sentence).not.toContain("partnership");
  });

  // The pre-merge audit (C1, L6): Apr 15, 2028 is a Saturday, and the
  // sentence said an individual's return "is due Apr 15, 2028".
  it("reads the window to the 15th and never says the return is due on it", () => {
    const x = exchangeWindow({ relinquishedTransferOn: "2027-11-01" }, new Date(Date.UTC(2027, 10, 2, 12)))!;
    expect(x).toMatchObject({ closeBy: "2028-04-15", cutShort: true, filer: null });
    expect(x.sentence).toBe(
      "Identify your replacement property by Dec 16, 2027 (in 44 days), the 45th day from the Nov 1, 2027 transfer; close by Apr 15, 2028 — the due date for an individual's Form 1040 return ends it before the 180th day unless the return is extended, and the window is read to Apr 15, 2028. A partnership's or an S corporation's calendar-year return would end it sooner, read to Mar 15, 2028; set who files in the buy box.",
    );
    expect(x.sentence).not.toMatch(/is due/);
  });

  it("says where the clock stands: a planned sale, closing, over", () => {
    expect(w("2026-12-01").phase).toBe("ahead");
    expect(w("2026-12-01").sentence).toMatch(/^Your exchange's clock starts at the Dec 1, 2026 transfer: identify by Jan 15, 2027, close by/);
    const closing = w("2026-08-01");
    expect(closing).toMatchObject({ phase: "close", identifyBy: "2026-09-15", closeBy: "2027-01-28", daysToClose: 115 });
    expect(closing.sentence).toBe("Your identification period ended Sep 15, 2026; the exchange must close by Jan 28, 2027 (in 115 days).");
    expect(w("2026-01-02").phase).toBe("over");
    expect(w("2026-08-21").sentence).toContain("(today)");
    expect(exchangeWindow({ relinquishedTransferOn: "2026-02-31" }, TODAY)).toBeNull();
    expect(exchangeWindow(null, TODAY)).toBeNull();
    expect(exchangeWindow({ relinquishedTransferOn: null }, TODAY)).toBeNull();
  });

  it("sets the offers-due day against the deadlines as a date fact", () => {
    const x = w("2026-09-15", { filer: "partnership" });
    const late = exchangeFit(x, { offersDueIso: "2026-11-02", interestKind: "fee_simple" })!;
    expect(late.flags.map((f) => f.kind)).toEqual(["after_identify"]);
    expect(late.flags[0].text).toBe(
      "Offers are due Nov 2, 2026, after your identification deadline, Oct 30, 2026: to keep it in your exchange it must be identified by Oct 30, 2026, before it is bid on.",
    );
    expect(late.tag).toBe("1031: offers due after ID");
    expect(exchangeFit(x, { offersDueIso: "2026-10-20", interestKind: "fee_simple" })).toEqual({ flags: [], tag: "1031: identify by Oct 30" });
    expect(exchangeFit(x, { offersDueIso: "2027-04-01", interestKind: null })!.flags[0]).toMatchObject({ kind: "after_close" });
    // An offers-due date that is no whole day is not compared.
    expect(exchangeFit(x, { offersDueIso: "October 2026", interestKind: null })!.flags).toEqual([]);
    // In the closing period only an identified property can be in it.
    const closing = exchangeFit(w("2026-08-01"), { offersDueIso: null, interestKind: null })!;
    expect(closing.flags[0]).toMatchObject({ kind: "id_period_over" });
    expect(closing.tag).toBe("1031: ID period over");
    expect(exchangeFit(w("2026-01-02"), { offersDueIso: null, interestKind: null })).toBeNull();
  });

  it("asks exchange counsel about what the price buys, never decides it", () => {
    const x = w("2026-09-15", { filer: "partnership" });
    const note = exchangeFit(x, { offersDueIso: null, interestKind: "note" })!;
    expect(note.flags[0].text).toBe(
      "The price buys a loan secured by the building, not the building. Section 1031 reaches only real property exchanged for real property of like kind; whether a note counts is a question for your exchange counsel.",
    );
    expect(note.tag).toBe("1031: note — ask counsel");
    expect(exchangeFit(x, { offersDueIso: null, interestKind: "partial_interest" })!.tag).toBe("1031: share — ask counsel");
    // A preferred equity position is an interest in the entity, as a share is.
    const position = exchangeFit(x, { offersDueIso: null, interestKind: "preferred_equity" })!;
    expect(position.flags).toEqual([
      {
        kind: "position",
        text: "The price buys a preferred equity position in the owning entity, not the building. Section 1031 reaches only real property exchanged for real property of like kind; whether this position counts is a question for your exchange counsel.",
      },
    ]);
    expect(position.tag).toBe("1031: position — ask counsel");
    expect(gluedWords(position.flags[0].text)).toEqual([]);
    const lease = exchangeFit(x, { offersDueIso: null, interestKind: "leasehold", leaseYearsLeft: 22.6, leaseOptionYears: 20 })!;
    expect(lease.flags[0].text).toBe(
      'The price buys a leasehold with 22 years left, 20 more in its options as stated. The regulation\'s example of a leasehold like kind to real estate is "a leasehold of a fee with 30 years or more to run"; whether this one counts, its options included or not, is a question for your exchange counsel.',
    );
    expect(exchangeFit(x, { offersDueIso: null, interestKind: "leasehold", leaseYearsLeft: 45 })!.flags).toEqual([]);
    // Under a year left is said as that, never "0 years" (the batch-2 audit).
    expect(exchangeFit(x, { offersDueIso: null, interestKind: "leasehold", leaseYearsLeft: 0.6 })!.flags[0].text).toMatch(
      /^The price buys a leasehold with under a year left\./,
    );
    expect(exchangeShortLine(x, note)).toBe(
      "1031 exchange: identify by Oct 30, 2026, close by Mar 14, 2027; the price buys a loan secured by the building, not the building. Section 1031 reaches only real property exchanged for real property of like kind; whether a note counts is a question for your exchange counsel",
    );
    for (const t of [x.sentence, note.flags[0].text, lease.flags[0].text]) expect(gluedWords(t)).toEqual([]);
  });
});
