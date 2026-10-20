/**
 * The screen-complete email carries the stress test the call was reached on
 * — its counts in the deal header's chip words, and the headline's short
 * line — right after the call, and leaves the buy-box line out where the
 * account has no box (the first-run audit of 2026-10-20).
 */
import { describe, expect, it } from "vitest";
import { emailStress } from "./email";
import { analysisReadyEmail } from "./email-template";
import { sampleStressTest } from "./sample-stress";
import { headlineShort, verdictCounts } from "./stress-test-words";
import { stressChipLine } from "@/app/(app)/deals/[id]/stress-chip";
import { visibleText } from "./render-lint";

const test = sampleStressTest({ today: "2026-10-20" });

const ready = {
  dealName: "Oakwood Flats",
  verdictLabel: "Caution",
  verdictColor: "#a05a1c",
  buyBoxLabel: "Fit 82 · Pursue" as string | null,
  reason: "The exit cap is under the going-in.",
  dealUrl: "https://underwrite.example/deals/d1",
  settingsUrl: "https://underwrite.example/account",
};

describe("emailStress", () => {
  it("says the counts in the header chip's words and the headline's short line", () => {
    const s = emailStress(test)!;
    expect(s).not.toBeNull();
    expect(`Stress test: ${s.counts}`).toBe(stressChipLine(verdictCounts(test)));
    expect(s.headline).toBe(headlineShort(test));
  });

  it("says nothing with no test, or one with no rows — never an invented count", () => {
    expect(emailStress(null)).toBeNull();
    expect(emailStress(undefined)).toBeNull();
    expect(emailStress({ ...test, rows: [] })).toBeNull();
  });

  it("leaves the headline out where the test has none", () => {
    expect(emailStress({ ...test, headline: null })?.headline ?? null).toBeNull();
  });
});

describe("the screen-complete email", () => {
  it("draws the stress test right after the call, before the reason, in the HTML and the text", () => {
    const stress = emailStress(test)!;
    const { html, text } = analysisReadyEmail({ ...ready, stress });
    expect(visibleText(html)).toContain(`The stress test, struck in code: ${stress.counts}`);
    // In the card (past the preview text): the call's pill, then the test,
    // then why.
    const card = html.slice(html.indexOf("Screen complete</p>"));
    expect(card.indexOf(">Caution</span>")).toBeGreaterThan(0);
    expect(card.indexOf(">Caution</span>")).toBeLessThan(card.indexOf("email-stress"));
    expect(card.indexOf("email-stress")).toBeLessThan(card.indexOf(ready.reason));
    if (stress.headline) expect(visibleText(html)).toContain(stress.headline);
    expect(text).toContain(`Stress test: ${stress.counts}`);
    expect(text.indexOf("Verdict: Caution")).toBeLessThan(text.indexOf("Stress test:"));
  });

  it("without a test reads as before", () => {
    const { html, text } = analysisReadyEmail(ready);
    expect(html).not.toContain("email-stress");
    expect(text).not.toContain("Stress test");
  });

  it("with no buy box, leaves the line out of the HTML, the text and the preview", () => {
    const { html, text } = analysisReadyEmail({ ...ready, buyBoxLabel: null });
    expect(html).not.toMatch(/Buy box/);
    expect(text).not.toMatch(/Buy box/);
    // with a box, the line is there as before
    expect(analysisReadyEmail(ready).text).toContain("Buy box: Fit 82 · Pursue");
  });
});
