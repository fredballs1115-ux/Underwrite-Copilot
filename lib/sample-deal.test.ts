// The sample's sentences quote its own first-draft model (lib/sample-deal).
// Research pass 40, L8: its exit was said to be "held flat to going-in" while
// the model exits at 5.50% against a 5.45% going-in cap — a 5 bps expansion,
// not flat. The exit's rationale and the model's summary say the exit and its
// 5 bps over the going-in cap now, read off the model itself (the going-in
// figure stays on the tab's own tile); the pinned figures are unchanged.
import { describe, expect, it } from "vitest";
import { SAMPLE_AUTHOR, SAMPLE_DEAL, sampleWork } from "@/lib/sample-deal";
import { parseDealNotes, parseDealQa } from "@/lib/deals";
import { unimportedVerdictSteps } from "@/lib/deal-tasks";
import { parsePageNumber } from "@/lib/facts";

describe("the sample's exit against its going-in cap (research pass 40, L8)", () => {
  it("says the exit as the model's figures, never as flat to going-in", () => {
    const model = SAMPLE_DEAL.model;
    expect(model.inputs.exitCapPct).toBe(5.5);
    expect(model.returns.goingInCapPct.toFixed(2)).toBe("5.45");
    const exit = model.metrics.find((m) => m.key === "exitCap")!;
    expect(exit.chosenValue).toBe("5.50%");
    expect(exit.rationale).toBe("5.50%, 5 bps over the going-in cap — no compression thesis.");
    expect(model.summary).toContain("the exit is 5.50%, 5 bps over the going-in cap, with no compression assumed.");
    expect(`${exit.rationale} ${model.summary}`).not.toMatch(/flat to going-in/i);
  });
});

// The sample's lower half (signed-in gaps, H7): three Ask answers, the
// verdict's next steps as tasks and one note, seeded beside the row. An
// answer the fictional memorandum does not support would be the site
// inventing a document's words, so every page and figure is held here.
describe("the sample's Ask answers, tasks and note", () => {
  const AT = "2026-10-16T12:00:00.000Z";
  const work = sampleWork(AT);
  const ex = SAMPLE_DEAL.extraction;
  const metric = (label: string) => ex.metrics.find((m) => m.label === label)!;

  it("cites only pages the fixture's facts carry, inside its page count", () => {
    const factPages = new Set<string>([
      ...ex.metrics.map((m) => m.page ?? ""),
      ...SAMPLE_DEAL.comps.saleComps.map((c) => c.page ?? ""),
    ]);
    expect(work.qa.length).toBeGreaterThanOrEqual(2);
    for (const e of work.qa) {
      expect(e.cites.length).toBeGreaterThan(0);
      for (const c of e.cites) {
        expect(factPages.has(c.page), c.page).toBe(true);
        const n = parsePageNumber(c.page)!;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(ex.totalPages!);
        // The answer names the page it cites.
        expect(e.answer).toContain(`(${c.page})`);
      }
      // A page the answer names in words is one it cites.
      for (const p of e.answer.match(/p\. \d+/g) ?? []) expect(e.cites.map((c) => c.page)).toContain(p);
    }
  });

  it("states the fixture's own figures, and works out the rest from them", () => {
    const [exit, rents, compsAnswer] = work.qa.map((e) => e.answer);
    expect(exit).toBe(
      `The sample's fictional memorandum sells at a ${metric("Exit cap").value} exit cap (p. 41) and buys at a ` +
        `${metric("Going-in cap").value} going-in cap (p. 8): it sells 20 bps tighter than it buys, and states no reason for the compression.`,
    );
    expect(metric("Exit cap").value).toBe("5.25%");
    expect(metric("Going-in cap").value).toBe("5.45%");
    expect(rents).toBe(
      "The sample's fictional memorandum states an average in-place rent of $2,400/mo and a pro forma rent of $2,600/mo (p. 12): " +
        "a $200 premium a month, 8.3% over in-place. It then grows rents 4.0%/yr (p. 40).",
    );
    expect([metric("Avg in-place rent").value, metric("Pro forma rent").value, metric("Rent growth").value]).toEqual([
      "$2,400/mo",
      "$2,600/mo",
      "4.0%/yr",
    ]);
    // 200 over 2,400 is 8.33%; 68,000,000 over 248 is $274,194.
    expect(((2600 - 2400) / 2400) * 100).toBeCloseTo(8.33, 2);
    expect(compsAnswer).toBe(
      "The sample's fictional memorandum cites three sale comps (p. 14): The Brixton at $252k/unit and a 5.6% cap (Q3'25), " +
        "Vue at Girard at $298k/unit and a 4.9% cap (Q1'25), and Parkside at $261k/unit and a 5.4% cap (Q4'25). " +
        "Its $68,000,000 ask for 248 units (p. 3) is $274k a unit.",
    );
    expect(SAMPLE_DEAL.comps.saleComps.map((c) => c.detail)).toEqual([
      "$252k/unit · 5.6% cap · Q3'25",
      "$298k/unit · 4.9% cap · Q1'25",
      "$261k/unit · 5.4% cap · Q4'25",
    ]);
    expect([metric("Asking price").value, metric("Units").value]).toEqual(["$68,000,000", "248"]);
    expect(Math.round(68_000_000 / 248)).toBe(274_194);
    // Every answer says whose memorandum it is.
    for (const e of work.qa) expect(e.answer.startsWith("The sample's fictional memorandum ")).toBe(true);
  });

  it("is the sample's: no asker, no author id, no memorandum stamp, and read as current", () => {
    for (const e of work.qa) {
      expect(e.at).toBe(AT);
      expect(e).not.toHaveProperty("by");
      expect(e).not.toHaveProperty("om");
    }
    const read = parseDealQa(work.qa);
    expect(read).toHaveLength(work.qa.length);
    expect(read.every((e) => !e.earlier)).toBe(true);
    expect(work.notes).toEqual([{ at: AT, by: SAMPLE_AUTHOR, text: `Held at Caution. ${SAMPLE_DEAL.verdict.reason}` }]);
    expect(parseDealNotes(work.notes)).toEqual(work.notes);
    expect(work.notes[0].text.length).toBeLessThanOrEqual(500);
  });

  it("files the verdict's next steps as its tasks, so none is offered again", () => {
    expect(work.tasks.map((t) => t.title)).toEqual(SAMPLE_DEAL.verdict.nextSteps);
    expect(work.tasks.every((t) => t.source === "verdict")).toBe(true);
    expect(unimportedVerdictSteps(SAMPLE_DEAL.verdict.nextSteps, work.tasks)).toEqual([]);
  });
});
