// A short day says its year wherever it is not the reader's current year
// (the audit of 2026-10-19): the offers-due bit, the what's-new card and the
// digest's dates had printed a month and a day alone, read as this year's.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shortDay } from "./short-day";
import { WhatsNewCard } from "@/app/(app)/deals/whats-new";
import { changelogEntries } from "./changelog";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

describe("shortDay", () => {
  it("leaves the year off inside the reader's year, and says it outside", () => {
    expect(shortDay("2026-10-22", "2026-10-19")).toBe("Oct 22");
    expect(shortDay("2027-01-04", "2026-12-29")).toBe("Jan 4, 2027");
    expect(shortDay("2025-03-03", "2026-10-19")).toBe("Mar 3, 2025");
    expect(shortDay("2026-10-22", "2026-10-19", { weekday: true })).toBe("Thu, Oct 22");
    expect(shortDay("2027-01-04", "2026-12-29", { weekday: true })).toBe("Mon, Jan 4, 2027");
    // A timestamp is read by its day.
    expect(shortDay("2025-03-03T23:00:00Z", "2026-10-19")).toBe("Mar 3, 2025");
  });
});

describe("the pipeline's what's-new card", () => {
  it("says an entry's year where it is not the reader's", () => {
    const [first] = changelogEntries(1);
    const sameYear = `${first.date.slice(0, 4)}-12-31`;
    const nextYear = `${Number(first.date.slice(0, 4)) + 1}-01-02`;
    const html = renderToStaticMarkup(React.createElement(WhatsNewCard, { limit: 1, today: sameYear }));
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(visibleText(html)).toContain(shortDay(first.date, sameYear));
    expect(visibleText(html)).not.toContain(first.date.slice(0, 4));
    const later = visibleText(renderToStaticMarkup(React.createElement(WhatsNewCard, { limit: 1, today: nextYear })));
    expect(later).toContain(`, ${first.date.slice(0, 4)}`);
  });
});
