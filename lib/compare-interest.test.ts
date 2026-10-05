import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { compareInterest, goingInCapFigure, modelReturnsRead, noteCapSlot, withheldWord } from "@/lib/compare-interest";

const row = (label: string, value: string, page = "p. 5") => ({ label, value, flagged: false, page });
const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
const deal = (interest: NonNullable<ExtractionResult["interest"]> | undefined, metrics: ExtractionResult["metrics"]) =>
  ({
    dealName: "Harbor View Apartments",
    assetClass: "multifamily",
    totalPages: 40,
    interest,
    metrics: [row("Asking price", "$20,000,000", "p. 2"), ...metrics],
  }) as ExtractionResult;
// The document-generated model runs at the documents' price: $20M, with
// the whole building's $1.9M NOI — a 9.5% "cap" that is nobody's.
const MODEL = { purchasePrice: 20_000_000, year1Noi: 1_900_000, goingInCapPct: 9.5 };

describe("compareInterest — the compare table's model figures, read for what the price buys", () => {
  it("a fee simple stands as the model runs it, and says nothing beside the price", () => {
    expect(compareInterest(deal(undefined, []), MODEL)).toEqual({ tag: null, cap: 9.5, noteYtmPct: null, withheld: null });
  });

  it("a note has no cap: its yield to maturity where the cap would sit, and the collateral's returns withheld", () => {
    const AS_OF = new Date(Date.UTC(2025, 8, 30));
    const terms = [
      row("Unpaid principal balance", "$24,400,000"),
      row("Note rate", "5.25%"),
      row("Maturity date", "March 31, 2028"),
      row("Amortization", "Interest-only"),
      row("Payment status", "Performing"),
    ];
    const r = compareInterest(deal({ ...blank, kind: "note" }, terms), MODEL, AS_OF);
    expect(r.tag).toBe("Note");
    expect(r.cap).toBeNull();
    expect(r.withheld).toBe("note");
    expect(r.noteYtmPct).not.toBeNull();
    expect(r.noteYtmPct!).toBeGreaterThan(5.25);
    // A note that is not paying: a contract yield nobody earns is no figure
    // to set beside the others.
    const npl = compareInterest(
      deal({ ...blank, kind: "note" }, [...terms.slice(0, 4), row("Payment status", "Non-performing; in foreclosure")]),
      MODEL,
      AS_OF,
    );
    expect(npl.noteYtmPct).toBeNull();
    expect(npl.withheld).toBe("note");
  });

  it("a share's cap is struck on the whole its price implies, and returns run at the share's price are withheld", () => {
    const share = deal({ ...blank, kind: "partial_interest", share: "49% limited partnership interest" }, []);
    const r = compareInterest(share, MODEL);
    expect(r.tag).toBe("49% share");
    // $1.9M over the $40.8M whole, not the $20M share.
    expect(r.cap).toBeCloseTo((1_900_000 / (20_000_000 / 0.49)) * 100, 6);
    expect(r.withheld).toBe("share");
    // A model already run at the whole's price: its returns are the whole
    // asset's and stand.
    const atWhole = compareInterest(share, { ...MODEL, purchasePrice: 20_000_000 / 0.49 });
    expect(atWhole.withheld).toBeNull();
    // No stated percentage: no whole to strike a cap on.
    const unstated = compareInterest(deal({ ...blank, kind: "partial_interest", share: "a majority interest" }, []), MODEL);
    expect(unstated.cap).toBeNull();
    expect(unstated.withheld).toBe("share");
  });

  it("a leasehold and a leased fee stand as the model runs them, with what the price buys beside it", () => {
    const AS_OF = new Date(Date.UTC(2026, 8, 25));
    const lease = [row("Ground lease expiration", "December 31, 2071")];
    const lh = compareInterest(deal({ ...blank, kind: "leasehold" }, lease), MODEL, AS_OF);
    expect(lh).toEqual({ tag: "Leasehold, 45 yrs left", cap: 9.5, noteYtmPct: null, withheld: null });
    const lf = compareInterest(deal({ ...blank, kind: "leased_fee" }, lease), MODEL, AS_OF);
    expect(lf.tag).toBe("Leased fee, reverts in 45 yrs");
    expect(lf.withheld).toBeNull();
  });

  it("with no extraction or no model, nothing is invented", () => {
    expect(compareInterest(null, MODEL)).toEqual({ tag: null, cap: 9.5, noteYtmPct: null, withheld: null });
    expect(compareInterest(deal(undefined, []), null)).toEqual({ tag: null, cap: null, noteYtmPct: null, withheld: null });
  });
});

// The audit of 2026-09-30: the deal header, the pipeline card and the
// meeting workbook printed a note's collateral cap as its going-in cap.
describe("a note's going-in cap slot, wherever the deal is summarized", () => {
  const AS_OF = new Date(Date.UTC(2025, 8, 30));
  const terms = [
    row("Going-in cap rate", "9.50%"),
    row("Unpaid principal balance", "$24,400,000"),
    row("Note rate", "5.25%"),
    row("Maturity date", "March 31, 2028"),
    row("Amortization", "Interest-only"),
    row("Payment status", "Performing"),
  ];
  const note = deal({ ...blank, kind: "note" }, terms);
  const npl = deal({ ...blank, kind: "note" }, [...terms.slice(0, 5), row("Payment status", "Non-performing; in foreclosure")]);

  it("withholds the collateral's cap, with the table's own yield to maturity in its place where the note pays", () => {
    const slot = noteCapSlot(note, AS_OF);
    expect(slot?.ytmPct).toBe(compareInterest(note, null, AS_OF).noteYtmPct);
    expect(slot?.ytmPct).not.toBeNull();
    expect(noteCapSlot(npl, AS_OF)).toEqual({ ytmPct: null, of: "note" });
    // Anything but a note keeps its cap slot.
    expect(noteCapSlot(deal(undefined, terms), AS_OF)).toBeNull();
    expect(noteCapSlot(deal({ ...blank, kind: "leasehold" }, terms), AS_OF)).toBeNull();
    expect(noteCapSlot(null, AS_OF)).toBeNull();
  });

  it("the header's slot: the stated cap on a building, the note's yield or the cap withheld on a note", () => {
    expect(goingInCapFigure(deal(undefined, terms), "9.50%", AS_OF)).toEqual({ label: "Going-in cap", value: "9.50%" });
    expect(goingInCapFigure(note, "9.50%", AS_OF)).toEqual({
      label: "Yield to maturity",
      value: `${compareInterest(note, null, AS_OF).noteYtmPct!.toFixed(1)}%`,
    });
    expect(goingInCapFigure(npl, "9.50%", AS_OF)).toEqual({ label: "Going-in cap", value: "n/a — note" });
  });

  it("the deal page's header reads the slot, and its leverage read never runs on a note's collateral cap", () => {
    // The page is a loader over the Supabase row, so its wiring is held at
    // its source (as lib/memo/documents-review.test.ts holds the routes').
    const src = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(src).toMatch(/\{ \.\.\.goingInCapFigure\(extraction, summaryCap \?\? null\), figure: true \}/);
    expect(src).not.toMatch(/\{ label: "Going-in cap", value: summaryCap \?\? null, figure: true \}/);
    // The slot's own kind, read by the one rule every surface reads
    // (`capSlotWithheld`): a note's, a preferred equity position's, or a
    // share's beside the loan its entity carries.
    expect(src).toMatch(/const capWithheld = capSlotWithheld\(extraction\);/);
    expect(src).toMatch(/capText=\{capWithheld \? null : summaryCap\}/);
    expect(src).toMatch(/capWithheld=\{capWithheld\}/);
    const panel = readFileSync("app/(app)/deals/[id]/research-panel.tsx", "utf8");
    expect(panel).toMatch(/capWithheld === "note"/);
    expect(panel).toMatch(/capWithheld === "position"/);
    expect(panel).toMatch(/capWithheld === "share"/);
  });
});

// A preferred equity position's price buys a rate and a redemption, never a
// slice of the building (lib/position): the same slot as a note's, in its
// own words — wherever the deal is summarized.
describe("a preferred equity position's going-in cap slot, and its model returns", () => {
  const AS_OF = new Date("2026-10-05T12:00:00Z");
  // At par: the $20,000,000 asking price for a $20,000,000 position.
  const terms = [
    row("Going-in cap rate", "5.50%"),
    row("Preferred equity amount", "$20,000,000"),
    row("Preferred return", "12% preferred return, 8% current pay"),
    row("Current pay rate", "8.0%"),
    row("Mandatory redemption date", "June 2029"),
  ];
  const position = deal({ ...blank, kind: "preferred_equity" }, terms);

  it("withholds the building's cap, with the position's yield to redemption in its place until the date goes by", () => {
    const slot = noteCapSlot(position, AS_OF);
    expect(slot?.of).toBe("position");
    expect(slot?.ytmPct).not.toBeNull();
    expect(goingInCapFigure(position, "5.50%", AS_OF)).toEqual({ label: "Yield to redemption", value: `${slot!.ytmPct!.toFixed(1)}%` });
    // Past its redemption date there is no yield to state.
    const late = new Date("2029-08-01T12:00:00Z");
    expect(noteCapSlot(position, late)).toEqual({ ytmPct: null, of: "position" });
    expect(goingInCapFigure(position, "5.50%", late)).toEqual({ label: "Going-in cap", value: "n/a — position" });
  });

  it("withholds the model's returns as the building's, and says why", () => {
    const r = modelReturnsRead(position, MODEL, AS_OF);
    expect(r).toMatchObject({ cap: null, withheld: "position", share: false });
    expect(r.line).toMatch(/^A preferred equity position's price is a position's: this model runs the whole building as if bought outright at it/);
  });
});

// The deal page's Model tab draws the model this table reads, and printed a
// note's or a share's cap and returns as figures (the research pass of
// 2026-10-01): the same rule, and its reason in a sentence.
describe("modelReturnsRead — the Model tab under the table's rule", () => {
  const AS_OF = new Date(Date.UTC(2025, 8, 30));
  const note = deal({ ...blank, kind: "note" }, [
    row("Unpaid principal balance", "$24,400,000"),
    row("Note rate", "5.25%"),
    row("Maturity date", "March 31, 2028"),
    row("Amortization", "Interest-only"),
    row("Payment status", "Performing"),
  ]);
  const share = deal({ ...blank, kind: "partial_interest", share: "49% limited partnership interest" }, []);

  it("a note: the table's figures, and why its returns are withheld", () => {
    const r = modelReturnsRead(note, MODEL, AS_OF);
    expect(r).toMatchObject({ ...compareInterest(note, MODEL, AS_OF), share: false });
    expect(r.line).toMatch(/^A note's price is a loan's: this model runs the collateral as if bought outright at it/);
  });

  it("a share: its cap on the whole; its returns withheld at the share's price and standing at the whole's", () => {
    const r = modelReturnsRead(share, MODEL);
    expect(r).toMatchObject({ withheld: "share", share: true });
    expect(r.line).toMatch(/so its returns are withheld, and the cap is struck on that whole\.$/);
    const atWhole = modelReturnsRead(share, { ...MODEL, purchasePrice: 20_000_000 / 0.49 });
    expect(atWhole).toMatchObject({ withheld: null, share: true, line: null });
    const unstated = modelReturnsRead(deal({ ...blank, kind: "partial_interest" }, []), MODEL);
    expect(unstated.line).toMatch(/states no percentage to gross it up by/);
  });

  it("a fee simple says nothing and stands", () => {
    expect(modelReturnsRead(deal(undefined, []), MODEL)).toEqual({ tag: null, cap: 9.5, noteYtmPct: null, withheld: null, share: false, word: null, line: null });
  });
});

// Research pass 38: a retail leasehold whose ground lease ends December 31,
// 2028 printed "Levered IRR 17.7%" and a max bid on a year-5 sale of a
// building that reverted in year 3, beside the leasehold card's own
// sentence saying so.
describe("a leasehold whose lease ends inside the model's hold has no sale to return on", () => {
  const AS_OF = new Date(Date.UTC(2026, 9, 5, 12));
  const HELD = { ...MODEL, holdYears: 5 };
  const lease2 = deal({ ...blank, kind: "leasehold", groundLease: "Ground lease expires December 31, 2028; no extension options" }, [
    row("Ground lease expiration", "December 31, 2028"),
  ]);
  const SENTENCE =
    "The ground lease ends Dec 2028, in year 3 of the model's 5-year hold: the building reverts to the landowner before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.";

  it("withholds the returns over the leasehold card's own sentence, said by when; the cap stands", () => {
    const r = modelReturnsRead(lease2, HELD, AS_OF);
    expect(r).toMatchObject({ tag: "Leasehold, 2 yrs left", cap: 9.5, withheld: "lease", word: "lease ends in year 3", line: SENTENCE, share: false });
    expect(withheldWord(r)).toBe("lease ends in year 3");
    // A sandwich position's master lease ending inside the hold: the
    // position ends with it.
    const sandwich = deal({ ...blank, kind: "leasehold", summary: "A master lease of the building, sublet to its tenants", groundLease: "Master lease from the owner through December 31, 2028" }, [
      row("Master lease expiration", "December 31, 2028"),
      row("Master lease rent", "$2,400,000"),
      row("Sublease income", "$2,900,000"),
    ]);
    const s = modelReturnsRead(sandwich, HELD, AS_OF);
    expect(s).toMatchObject({ withheld: "lease", word: "master lease ends in year 3" });
    expect(s.line).toBe(
      "The master lease ends Dec 2028, in year 3 of the model's 5-year hold: the position ends with it before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.",
    );
  });

  it("stands where the lease outlasts the hold, where the model names no hold, and on a fee simple", () => {
    const long = deal({ ...blank, kind: "leasehold" }, [row("Ground lease expiration", "December 31, 2071")]);
    expect(modelReturnsRead(long, HELD, AS_OF)).toMatchObject({ withheld: null, word: null, line: null });
    expect(compareInterest(lease2, MODEL, AS_OF).withheld).toBeNull();
    expect(compareInterest(deal(undefined, [row("Ground lease expiration", "December 31, 2028")]), HELD, AS_OF).withheld).toBeNull();
    // A ten-year hold reaches a lease ending in 2033; a five-year one does not.
    const ten = deal({ ...blank, kind: "leasehold" }, [row("Ground lease expiration", "December 31, 2033")]);
    expect(compareInterest(ten, HELD, AS_OF).withheld).toBeNull();
    expect(withheldWord(compareInterest(ten, { ...MODEL, holdYears: 10 }, AS_OF))).toBe("lease ends in year 8");
  });
});
