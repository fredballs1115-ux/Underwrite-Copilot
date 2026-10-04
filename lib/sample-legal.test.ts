// Locks the marketing surfaces' legal read to the real engine: if the
// research layer's Philadelphia coverage changes (a rule added, a status
// upgraded, the metro renamed), this fails and the homepage/demo copy gets
// re-derived instead of silently drifting from the deal page.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleLegal } from "./sample-legal";
import { LegalPanel } from "@/app/demo/legal-panel";
import { researchAge } from "./research-age";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

describe("sampleLegal", () => {
  // Read on a pinned day: a rule's date is marked stale past the research
  // rule's limit (lib/research-age), so the read is the day's.
  const legal = sampleLegal("2026-10-04");

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

// The demo printed each rule's date beside "verified" with no stale badge,
// whatever its age (research pass 20). Each rule now carries the research
// rule's mark (lib/research-age): current through its 180th day, then the
// date keeps its place with its age and "stale" — never hidden.
describe("the sample's legal list ages by the research rule", () => {
  const dated = sampleLegal("2026-10-04").rules[0];
  const crossing = researchAge(dated.asOf, "2026-10-04").staleFrom!;
  const lastCurrent = new Date(Date.parse(`${crossing}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  it("carries no mark before the crossing and the date's age after it", () => {
    expect(sampleLegal(lastCurrent).rules[0].stale).toBeNull();
    expect(sampleLegal(crossing).rules[0].stale).toBe("181 days old, stale");
    // The date itself never moves.
    expect(sampleLegal(crossing).rules[0].asOf).toBe(dated.asOf);
  });

  it("the demo's legal panel shows the date with its age and the stale badge, and keeps the verified chip", () => {
    const before = visibleText(renderToStaticMarkup(React.createElement(LegalPanel, { legal: sampleLegal(lastCurrent) })));
    expect(before).toContain(`as of ${dated.asOf}`);
    expect(before).not.toContain("stale");
    const html = renderToStaticMarkup(React.createElement(LegalPanel, { legal: sampleLegal(crossing) }));
    const after = visibleText(html);
    expect(after).toContain(dated.status);
    expect(after).toContain(`as of ${dated.asOf} · 181 days old, stale`);
    expect(html).toContain('data-qa="research-stale"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(after)).toEqual([]);
  });
});
