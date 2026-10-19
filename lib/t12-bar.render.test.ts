// The T-12 drawn as one bar from the effective gross income down to the
// NOI: each expense line a segment, a missing line absent, a derived NOI said
// as derived, and no bar where the statement's figures do not tie.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { T12Summary } from "@/lib/actuals/types";
import { t12Bar } from "@/lib/actuals/t12-bar";
import { PropertyActuals } from "@/app/(app)/deals/[id]/property-actuals";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";

const line = (key: string, label: string, amount: number) => ({ key, label, amount, page: "p. 2" });
const T12: T12Summary = {
  collectedRent: 2_400_000,
  vacancyLoss: -120_000,
  otherIncome: 60_000,
  egi: 2_340_000,
  opex: [line("taxes", "Real estate taxes", 420_000), line("insurance", "Insurance", 150_000), line("payroll", "Payroll", 620_000)],
  totalOpex: 1_190_000,
  noi: 1_150_000,
  noiDerived: false,
};

const render = (summary: T12Summary) =>
  renderToStaticMarkup(
    React.createElement(PropertyActuals, {
      data: { rentRoll: null, t12: { periodEnd: "2026-06-30", summary }, noiComparison: null },
    }),
  );
const bars = (html: string, name: string) => (html.match(new RegExp(`data-bar="${name}"`, "g")) ?? []).length;

describe("t12Bar — the statement's own figures, tied", () => {
  it("draws each stated line and the NOI over the EGI", () => {
    const b = t12Bar(T12)!;
    expect(b.expenses.map((e) => e.label)).toEqual(["Real estate taxes", "Insurance", "Payroll"]);
    expect(b.totalOpex).toBe(1_190_000);
    expect(b.noi).toBe(1_150_000);
  });

  it("draws a stated total as one segment where no line is itemised", () => {
    const b = t12Bar({ ...T12, opex: [] })!;
    expect(b.expenses).toEqual([{ label: "Operating expenses", amount: 1_190_000 }]);
  });

  it("draws nothing where the figures do not tie, and never makes up a line to close a gap", () => {
    // EGI less the expenses is off the NOI by more than 1%.
    expect(t12Bar({ ...T12, noi: 1_100_000 })).toBeNull();
    // The lines do not add to the stated total.
    expect(t12Bar({ ...T12, opex: T12.opex.slice(0, 2) })).toBeNull();
    // Inside 1% they tie.
    expect(t12Bar({ ...T12, noi: 1_155_000 })).not.toBeNull();
    // No EGI, no NOI, a loss, a credit line: nothing.
    expect(t12Bar({ ...T12, egi: null })).toBeNull();
    expect(t12Bar({ ...T12, noi: null })).toBeNull();
    expect(t12Bar({ ...T12, egi: 1_000_000, opex: [], totalOpex: 1_200_000, noi: -200_000 })).toBeNull();
    expect(t12Bar({ ...T12, opex: [...T12.opex, line("credit", "Recovery credit", -10_000)] })).toBeNull();
    expect(t12Bar({ ...T12, opex: [], totalOpex: null })).toBeNull();
  });

  it("leaves a line stated as zero undrawn rather than a segment of nothing", () => {
    const b = t12Bar({ ...T12, opex: [...T12.opex, line("mgmt", "Management", 0)] })!;
    expect(b.expenses.map((e) => e.label)).not.toContain("Management");
  });
});

describe("PropertyActuals — the T-12 as a bar", () => {
  it("draws the bar above the table, every line named in the key", () => {
    const html = render(T12);
    expect(bars(html, "t12-expense")).toBe(3);
    expect(bars(html, "t12-noi")).toBe(1);
    const text = visibleText(html);
    expect(text).toContain("Real estate taxes $420k");
    expect(text).toContain("Payroll $620k");
    expect(text).toContain("Net operating income $1.15M");
    expect(text).toContain("The whole bar is the $2.34M effective gross income; the expenses take $1.19M of it.");
    // The table stays, beneath the picture.
    expect(html.indexOf('data-qa="t12-bar"')).toBeLessThan(html.indexOf("Effective gross income"));
    expect(text).toContain("Total operating expenses");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("keeps a derived NOI labelled derived", () => {
    const html = render({ ...T12, noiDerived: true });
    expect(visibleText(html)).toContain("Net operating income (derived) $1.15M");
  });

  it("draws no bar where the statement does not tie, and keeps its table", () => {
    const html = render({ ...T12, noi: 900_000 });
    expect(html).not.toContain('data-qa="t12-bar"');
    expect(bars(html, "t12-noi")).toBe(0);
    expect(visibleText(html)).toContain("Net operating income");
  });
});
