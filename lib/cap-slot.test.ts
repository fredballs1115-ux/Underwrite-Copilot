// The cap slot's words for the pipeline's client module (lib/cap-slot): the
// CSV's one cell, and the words held to the server's copy in
// lib/compare-interest, so the card, the CSV and the meeting workbook say a
// withheld cap one way.
import { describe, expect, it } from "vitest";
import { CAP_WITHHELD, OWN_YIELD, PLAN_CAP_NA, capCellText, ownYieldOf } from "./cap-slot";
import { OWN_YIELD_WORDS, SHARE_CAP_WORDS } from "./compare-interest";

describe("capCellText — the pipeline CSV's cap cell", () => {
  it("the cap where there is one", () => {
    expect(capCellText({ cap: "5.45%", noteYield: null, capWithheld: null })).toBe("5.45%");
  });

  it("a note's or a position's own yield, as the card shows it — never 'n/a' beside the card's figure (research pass 34)", () => {
    expect(capCellText({ cap: null, noteYield: "17.0%", capWithheld: "note" })).toBe("17.0% to maturity");
    expect(capCellText({ cap: null, noteYield: "12.4%", capWithheld: "position" })).toBe("12.4% to redemption");
  });

  it("the cap withheld, said so, where no yield can be stated", () => {
    expect(capCellText({ cap: null, noteYield: null, capWithheld: "note" })).toBe("n/a — note");
    expect(capCellText({ cap: null, noteYield: null, capWithheld: "position" })).toBe("n/a — position");
    expect(capCellText({ cap: null, noteYield: null, capWithheld: "share" })).toBe("n/a — share");
  });

  it("a plan deal judged on its yield on cost, in the meeting workbook's words — never a blank that reads as a cap not stated (research pass 35)", () => {
    expect(capCellText({ cap: null, plan: true })).toBe("n/a — plan");
    expect(capCellText({ cap: null, plan: true })).toBe(PLAN_CAP_NA);
  });

  it("blank where nothing is stated", () => {
    expect(capCellText({ cap: null })).toBe("");
    expect(capCellText({ cap: null, plan: false })).toBe("");
  });
});

describe("the client's words are the server's", () => {
  it("what each yield runs to, and the withheld slot", () => {
    for (const k of ["note", "position"] as const) {
      expect(OWN_YIELD[k].to).toBe(OWN_YIELD_WORDS[k].to);
      expect(OWN_YIELD[k].na).toBe(OWN_YIELD_WORDS[k].na);
      expect(CAP_WITHHELD[k].na).toBe(OWN_YIELD_WORDS[k].na);
    }
    expect(CAP_WITHHELD.share).toEqual({ na: SHARE_CAP_WORDS.na, title: SHARE_CAP_WORDS.title });
    expect(ownYieldOf("position")).toBe(OWN_YIELD.position);
    expect(ownYieldOf(null)).toBe(OWN_YIELD.note);
  });
});
