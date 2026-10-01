import { describe, expect, it } from "vitest";
import {
  diffValuationForm,
  extractedFields,
  fieldRefusalSentence,
  fieldText,
  readField,
  readValuationForm,
  type ReadField,
} from "./form";
import { scoreAggressiveness, tallySentence, type NamedValuation } from "./reconcile";
import {
  VALUATION_FIELDS,
  citationsAfterEdit,
  parseValuationRow,
  type ValuationFacts,
  type ValuationField,
} from "./types";

const STORED: ValuationFacts = {
  headlineValue: 65_800_000,
  year1Noi: 3_619_000,
  goingInCap: 0.0576923, // derived by the reader: more places than the form shows
  exitCap: 0.06,
  holdYears: 10,
  rentGrowth: 0.03,
  vacancyAssumption: 0.05,
  capexDeduction: 1_200_000,
  discountRate: null,
};

/** What the browser posts: every field's prefilled text, `typed` over it. */
const post =
  (typed: Partial<Record<ValuationField, string>> = {}) =>
  (field: ValuationField): string | null =>
    typed[field] ?? fieldText(field, STORED[field]);

describe("a typed figure is read as typed, or refused with a sentence", () => {
  it("reads the shorthand people type", () => {
    expect(readField("headlineValue", "$65.8M")).toEqual({ ok: true, value: 65_800_000 });
    expect(readField("year1Noi", "3,619,000")).toEqual({ ok: true, value: 3_619_000 });
    expect(readField("exitCap", "6.5%")).toEqual({ ok: true, value: 0.065 });
    expect(readField("holdYears", "10")).toEqual({ ok: true, value: 10 });
    expect(readField("rentGrowth", "")).toBeNull();
  });

  it("refuses a hold that is not whole years, rather than failing the write", () => {
    expect(readField("holdYears", "5.5")).toEqual({ ok: false, refusal: "whole_years" });
    expect(fieldRefusalSentence("holdYears", "whole_years")).toBe(
      "Hold period is whole years — 5 or 6, not 5.5. Nothing was saved.",
    );
  });

  it("refuses what it cannot read, and a figure the field cannot be", () => {
    expect(readField("headlineValue", "about 65 million")).toEqual({ ok: false, refusal: "unreadable" });
    expect(readField("goingInCap", "0")).toEqual({ ok: false, refusal: "range" });
    expect(readField("headlineValue", "-5")).toEqual({ ok: false, refusal: "range" });
    expect(fieldRefusalSentence("goingInCap", "range")).toContain("above 0%");
    const form = readValuationForm((f) => (f === "holdYears" ? "7.5" : null));
    expect(form.refused).toEqual({ field: "holdYears", refusal: "whole_years" });
  });
});

describe("a correction changes only what the user changed, and makes it theirs", () => {
  it("re-posting every prefilled field edits nothing — a derived cap keeps its places", () => {
    const edit = diffValuationForm(STORED, post());
    expect(edit.refused).toBeNull();
    expect(edit.edited).toEqual([]);
  });

  it("names the field the user changed, and a field emptied as cleared", () => {
    const edit = diffValuationForm(STORED, post({ year1Noi: "$3.7M", discountRate: "", capexDeduction: "" }));
    expect(edit.edited).toEqual(["year1Noi", "capexDeduction"]);
    expect(edit.changes.year1Noi).toBe(3_700_000);
    expect(edit.changes.capexDeduction).toBeNull();
  });

  it("an edited field loses its page citation and its derived mark, and says it was edited", () => {
    const now = "2026-10-01T00:00:00.000Z";
    const citations = citationsAfterEdit(
      { goingInCap: { page: "p. 12", snippet: "5.77% cap" }, year1Noi: { page: "p. 9", snippet: "NOI" } },
      ["goingInCap"],
      now,
    );
    expect(citations).toEqual({ goingInCap: { edited: true, at: now }, year1Noi: { page: "p. 9", snippet: "NOI" } });
    const v = parseValuationRow({
      id: "v",
      deal_id: "d",
      source_label: "Eastdil",
      extracted: true,
      citations,
      // an older row may still list it as derived
      derived_fields: ["goingInCap"],
      going_in_cap: 0.058,
    });
    expect(v.editedFields).toEqual(["goingInCap"]);
    expect(v.citations.goingInCap).toBeUndefined();
    expect(v.citations.year1Noi?.page).toBe("p. 9");
    expect(v.derivedFields).toEqual([]);
  });
});

describe("a document's hold is kept only in whole years", () => {
  const read = (hold: number | null): Record<ValuationField, ReadField> =>
    Object.fromEntries(
      VALUATION_FIELDS.map((f) => [
        f,
        { value: f === "holdYears" ? hold : null, page: f === "holdYears" ? "p. 4" : "", snippet: "", derived: false },
      ]),
    ) as Record<ValuationField, ReadField>;

  it("leaves a 5.5-year hold blank, uncited, and says why", () => {
    const out = extractedFields(read(5.5));
    expect(out.values.holdYears).toBeNull();
    expect(out.citations.holdYears).toBeUndefined();
    expect(out.note).toContain("5.5-year hold");
  });

  it("keeps a whole-year hold with its page", () => {
    const out = extractedFields(read(10));
    expect(out.values.holdYears).toBe(10);
    expect(out.citations.holdYears?.page).toBe("p. 4");
    expect(out.note).toBeNull();
  });
});

describe("the tally reads a tie as a tie", () => {
  const A: NamedValuation = {
    sourceLabel: "A",
    headlineValue: 10e6,
    year1Noi: 6e5,
    goingInCap: 0.06,
    exitCap: 0.065,
    holdYears: 10,
    rentGrowth: 0.03,
    vacancyAssumption: 0.05,
    capexDeduction: null,
    discountRate: null,
  };

  it("2–2 of 5 is a tie, never \"Neither is more aggressive on 2 of 5\"", () => {
    const B: NamedValuation = { ...A, sourceLabel: "B", goingInCap: 0.0575, exitCap: 0.0675, rentGrowth: 0.035, vacancyAssumption: 0.06 };
    const t = scoreAggressiveness(A, B);
    expect([t.aCount, t.bCount, t.comparable]).toEqual([2, 2, 5]);
    expect(tallySentence(t, "A", "B")).toBe("A tie: each is more aggressive on 2 of the 5 comparable inputs.");
  });

  it("says agreement, a winner, or that nothing is comparable", () => {
    expect(tallySentence(scoreAggressiveness(A, { ...A, sourceLabel: "B" }), "A", "B")).toBe(
      "The two agree on all 5 comparable inputs.",
    );
    expect(tallySentence(scoreAggressiveness(A, { ...A, sourceLabel: "B", exitCap: 0.06 }), "A", "B")).toBe(
      "B is more aggressive on 1 of 5 comparable inputs.",
    );
    const blank = Object.fromEntries(VALUATION_FIELDS.map((f) => [f, null])) as unknown as ValuationFacts;
    expect(tallySentence(scoreAggressiveness(A, { ...blank, sourceLabel: "B" }), "A", "B")).toContain(
      "No input is stated by both",
    );
  });
});
