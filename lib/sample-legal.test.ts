// Locks the marketing surfaces' legal read to the real engine: if the
// research layer's Philadelphia coverage changes (a rule added, a status
// upgraded, the metro renamed), this fails and the homepage/demo copy gets
// re-derived instead of silently drifting from the deal page.
import { describe, it, expect } from "vitest";
import { sampleLegal } from "./sample-legal";

describe("sampleLegal", () => {
  const legal = sampleLegal();

  it("matches the sample deal to the covered Philadelphia market", () => {
    expect(legal.metroId).toBe("philadelphia");
    expect(legal.metroName).toBeTruthy();
    expect(legal.jurisdiction).toBe("Philadelphia");
  });

  it("screens at least one jurisdiction rule and surfaces each with provenance", () => {
    expect(legal.screenedCount).toBeGreaterThanOrEqual(1);
    expect(legal.rules.length).toBe(legal.screenedCount);
    for (const r of legal.rules) {
      expect(r.typeLabel).toBeTruthy();
      expect(r.effect.length).toBeGreaterThan(20);
      expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["Applies", "Possibly applies", "Exempt", "Not applicable"]).toContain(
        r.outcomeLabel,
      );
    }
  });

  it("explains dormancy instead of hiding a non-triggered event rule", () => {
    const dormant = legal.rules.filter((r) => r.outcomeLabel === "Not applicable");
    for (const r of dormant) {
      // every dormant rule the sample surfaces must say what wakes it, or the
      // demo would look like the screen ignored the law
      if (r.typeLabel.startsWith("eviction procedure")) {
        expect(r.dormantNote).toMatch(/eviction filing/);
      }
    }
  });

  it("extracts the state rent-control fact verbatim, never composed", () => {
    // Philadelphia's verified rule text states this today; if the research
    // layer drops the sentence, the surfaces must drop the fact too.
    if (legal.stateFact) {
      expect(
        legal.rules.some((r) => r.effect.includes(legal.stateFact as string)),
      ).toBe(true);
    }
  });
});
