// The operator's Cost per screen card, rendered on fixtures the way every
// other signed-in surface is: the number, the bar, the legend and the
// meters line read back, and the visible text and markup linted. The page
// that hosts it reads a database no test can reach; the card itself is pure.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CostCard, stepWord, type UsageRow } from "@/app/(app)/data-health/cost-card";
import { PRICES } from "@/lib/anthropic/models";
import type { CallUsage, UsageSummary } from "@/lib/anthropic/usage";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

const flagship = PRICES[0].prefix;

const call = (what: string, over: Partial<CallUsage> = {}): CallUsage => ({
  what,
  model: flagship,
  input: 1_500,
  cacheWrite: 0,
  cacheRead: 300_000,
  output: 4_000,
  ms: 30_000,
  ...over,
});

/** A screen's ledger as the job row carries it; `usd` as the run priced it. */
function summary(calls: CallUsage[], usd: number | null, unpriced: string[] = []): UsageSummary {
  const totals = calls.reduce(
    (t, c) => ({ input: t.input + c.input, cacheWrite: t.cacheWrite + c.cacheWrite, cacheRead: t.cacheRead + c.cacheRead, output: t.output + c.output }),
    { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
  );
  return { calls, totals, usd, unpriced, ms: calls.reduce((a, c) => a + c.ms, 0), at: "2026-09-14T17:00:00.000Z" };
}

const SCREEN: CallUsage[] = [
  call("The first signal", { cacheWrite: 300_000, cacheRead: 0, output: 400, ms: 8_000 }),
  call("Extraction", { output: 6_000, ms: 40_000 }),
  call("The challenger"),
  call("Broker-comp scrutiny"),
  call("The market check"),
  call("The verdict", { cacheRead: 0, input: 20_000, output: 3_000, ms: 20_000 }),
];

const row = (id: string, usage: UsageSummary | null): UsageRow => ({ id, usage, updated_at: "2026-09-14T17:00:00Z" });

const render = (screens: UsageRow[], usageColumn = true) =>
  renderToStaticMarkup(React.createElement(CostCard, { screens, usageColumn }));

describe("CostCard — what the last screens cost, drawn", () => {
  it("the median as the number, the latest screen's split as a bar with a legend, the meters on one line", () => {
    const html = render([
      row("j3", summary(SCREEN, 3.02)),
      row("j2", summary(SCREEN, 2.4)),
      row("j1", summary(SCREEN, 3.9)),
      row("j0", null),
    ]);
    dumpView("cost-card", html);
    expect(a11yIssues(html), "a11y cost-card").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // three ledgers, the row without one ignored
    expect(text).toContain("$3.02");
    expect(text).toContain("median of the last 3 screens, at list price");
    // one bar, six segments in pipeline order, the widest the cache write
    expect((html.match(/data-cost-bar/g) ?? []).length).toBe(1);
    const widths = [...html.matchAll(/class="bg-[a-z0-9/]+ h-full" style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(6);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(Math.round(widths.reduce((a, b) => a + b, 0))).toBe(100);
    expect(html).toMatch(/aria-label="Latest screen, \$3\.02: First signal \$[\d.]+, Extraction \$[\d.]+, Challenger \$[\d.]+, Broker-comp scrutiny \$[\d.]+, Market check \$[\d.]+, Verdict \$[\d.]+"/);
    // 8 + 40 + 30 × 3 + 20 seconds across the six calls
    expect(text).toMatch(/latest screen · 6 calls · in 27,500 · cache write 300,000 · cache read 1,200,000 · out 21,400 · 158s/);
    expect(text).not.toContain("unpriced");
  });

  it("an unpriced step leaves its dollars blank, names the model, and the median counts only the screens that priced", () => {
    const mystery = [...SCREEN.slice(0, 5), call("The verdict", { model: "mystery-model" })];
    const html = render([row("j2", summary(mystery, null, ["mystery-model"])), row("j1", summary(SCREEN, 2.5))]);
    expect(a11yIssues(html), "a11y cost-card-unpriced").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("$2.50");
    expect(text).toContain("median of the 1 screen that priced, of the last 2, at list price");
    expect(html).toMatch(/aria-label="Latest screen, unpriced: .*Verdict unpriced"/);
    expect(text).toContain("unpriced: mystery-model");

    // No screen priced: no median to show, and the sentence says why.
    const none = visibleText(render([row("j2", summary(mystery, null, ["mystery-model"]))]));
    expect(gluedWords(none)).toEqual([]);
    expect(none).toContain("none of the last 1 screen priced — an unpriced model");
    expect(none).not.toContain("median of");
  });

  it("says plainly when no screen has recorded a ledger, and when the column is not there yet", () => {
    const none = render([]);
    expect(visibleText(none)).toContain("No screen has recorded what it spent yet");
    expect(none).not.toContain("data-cost-bar");
    const noColumn = render([], false);
    expect(visibleText(noColumn)).toContain("run migration 0035");
    expect(a11yIssues(none + noColumn)).toEqual([]);
  });

  it("names a step as a legend word", () => {
    expect(stepWord("The first signal")).toBe("First signal");
    expect(stepWord("Extraction")).toBe("Extraction");
    expect(stepWord("Broker-comp scrutiny")).toBe("Broker-comp scrutiny");
  });
});
