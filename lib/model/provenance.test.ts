// The first-draft model's sourcing, said as counted: which rows a document
// states, when the model was built and from what, and what the deal's
// documents gained or lost since (lib/model/provenance).
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ReconciledMetric } from "./types";
import {
  builtSentence,
  changedSinceSentence,
  documentLabel,
  modelProvenance,
  shownDocument,
  sourcingSentence,
  statedByDocument,
} from "./provenance";

const row = (authority: string, sources: ReconciledMetric["sources"] = []): ReconciledMetric => ({
  key: "k",
  label: "L",
  chosenValue: "1",
  unit: "",
  sources,
  authority,
  rationale: "",
  confidence: "medium",
  isConflict: false,
});
const src = (doc: string, basis = "", value = "1") => ({ doc, value, locator: "", basis });

describe("statedByDocument — a row is a document's only where a document won it", () => {
  it("reads the sample's rows: the rent roll, the T-12, the OM and the loan's terms state theirs; the market norms are assumed", () => {
    const m = SAMPLE_DEAL.model.metrics;
    const assumed = m.filter((x) => !statedByDocument(x, SAMPLE_DEAL.model.generatedFrom)).map((x) => x.key);
    expect(assumed).toEqual(["exitCap", "rentGrowth", "expenseGrowth", "capexReserve", "sellingCost"]);
    expect(m.length - assumed.length).toBe(8);
  });

  it("names a document positively: a term sheet, a lender's quote, an appraisal, a budget, the model's own file", () => {
    expect(statedByDocument(row("Term sheet", [src("Term sheet", "term sheet")]))).toBe(true);
    expect(statedByDocument(row("Lender quote"))).toBe(true);
    expect(statedByDocument(row("Appraisal"))).toBe(true);
    expect(statedByDocument(row("Seller's capital budget"))).toBe(true);
    expect(statedByDocument(row("Maddox-RentRoll.xlsx"), ["Rent roll: Maddox-RentRoll.xlsx"])).toBe(true);
    // A file the model was built from, cited by its name alone.
    expect(statedByDocument(row("Harbor-Q3-statement"), ["Other document: Harbor-Q3-statement.xlsx"])).toBe(true);
    // An OM pro forma is still the memorandum's statement.
    expect(statedByDocument(row("OM", [src("OM", "pro forma")]))).toBe(true);
  });

  it("calls anything else assumed: a market norm, a feed, a rule of thumb, a derivation, an unnamed source, nothing at all", () => {
    expect(statedByDocument(row("Market", [src("Market", "market norm")]))).toBe(false);
    expect(statedByDocument(row("FRED", [src("FRED", "", "5-yr Treasury 4.78% + 200 bps")]))).toBe(false);
    expect(statedByDocument(row("Lender norm"))).toBe(false);
    expect(statedByDocument(row("Industry rule of thumb"))).toBe(false);
    expect(statedByDocument(row("Derived from the OM's NOI and cap"))).toBe(false);
    expect(statedByDocument(row("Underwriter judgment"))).toBe(false);
    // A source the reconciliation filed as a document's, on a norm's basis.
    expect(statedByDocument(row("OM", [src("OM", "market norm")]))).toBe(false);
    expect(statedByDocument(row("CBRE"))).toBe(false);
    expect(statedByDocument(row(""))).toBe(false);
  });
});

describe("modelProvenance — when, from what, and what changed since", () => {
  const docs = [
    { id: "d1", kind: "om", filename: "Harbor-OM.pdf" },
    { id: "d2", kind: "rent_roll", filename: "rr.xlsx" },
  ];
  const built = {
    metrics: [row("Rent roll"), row("Market")],
    generatedFrom: docs.map(documentLabel),
    generatedAt: "2026-09-30T18:00:00.000Z",
    generatedFromIds: ["d1", "d2"],
  };

  it("says the build's day and its documents, and nothing changed while the set is the same", () => {
    const p = modelProvenance(built, docs);
    expect(builtSentence(p)).toBe("Built Sep 30, 2026 from Harbor-OM.pdf (Offering memorandum), rr.xlsx (Rent roll).");
    expect(changedSinceSentence(p)).toBe("");
    expect(sourcingSentence(p)).toBe(
      "Built from your documents where they state a figure: 1 of the 2 assumptions below comes from them, and the other one, which no document states, is the model's own, marked “assumed”. Conflicts are listed below.",
    );
    expect(sourcingSentence({ stated: 8, assumed: 5 })).toBe(
      "Built from your documents where they state a figure: 8 of the 13 assumptions below come from them, and the other 5, which no document states, are the model's own, marked “assumed”. Conflicts are listed below.",
    );
    expect(sourcingSentence({ stated: 0, assumed: 3 })).toBe(
      "No document states the 3 assumptions below: each is the model's own, marked “assumed”. Conflicts are listed below.",
    );
  });

  it("names what was added and removed since, by the ids it kept — a reissued OM reads as one of each", () => {
    const now = [
      { id: "d2", kind: "rent_roll", filename: "rr.xlsx" },
      { id: "d3", kind: "om", filename: "Harbor-OM.pdf" },
      { id: "d4", kind: "t12", filename: "t12.pdf" },
    ];
    const p = modelProvenance(built, now);
    expect(p.added).toEqual(["Offering memorandum: Harbor-OM.pdf", "T-12 / operating statement: t12.pdf"]);
    expect(p.removed).toEqual(["Offering memorandum: Harbor-OM.pdf"]);
    expect(changedSinceSentence(p)).toBe(
      "Since it was built, Harbor-OM.pdf (Offering memorandum), t12.pdf (T-12 / operating statement) were added and Harbor-OM.pdf (Offering memorandum) was removed — these figures do not reflect that.",
    );
  });

  it("an undated model stored before it kept ids: says undated, and compares by label", () => {
    const old = { metrics: [row("T-12")], generatedFrom: ["Offering memorandum: Harbor-OM.pdf", "Rent roll: rr.xlsx"] };
    const p = modelProvenance(old, [{ id: "x", kind: "om", filename: "Harbor-OM.pdf" }]);
    expect(p.builtOn).toBeNull();
    expect(builtSentence(p)).toBe("Undated — built from Harbor-OM.pdf (Offering memorandum), rr.xlsx (Rent roll).");
    expect(p.added).toEqual([]);
    expect(p.removed).toEqual(["Rent roll: rr.xlsx"]);
    expect(sourcingSentence(p)).toBe("Built from your documents: every assumption below names the document it came from, and conflicts are listed below.");
  });

  it("shows a document as its file, then its kind", () => {
    expect(shownDocument("Rent roll: rr.xlsx")).toBe("rr.xlsx (Rent roll)");
    expect(shownDocument("plain.pdf")).toBe("plain.pdf");
  });
});
