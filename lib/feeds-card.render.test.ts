// The operator's Feeds card, rendered on the runner's own rates table the
// way the cost card is: every feed's row, the stale ones named and tinted,
// the visible text and markup linted. The page that hosts it reads a
// database no test can reach; the card itself is pure.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedsCard } from "@/app/(app)/data-health/feeds-card";
import { SAMPLE_METRO, feedHealth } from "@/lib/feed-health";
import { readMetroRates, readRates, type RateRow } from "@/lib/live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "@/lib/live-rates.fixture";
import type { ZoriRead } from "@/lib/zori";
import type { RealtorRead } from "@/lib/realtor";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

const DC_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
  { series_id: "CUURS35ASEHA", obs_date: "2026-08-01", value: 340.1 },
  { series_id: "CUURS35ASEHA", obs_date: "2025-08-01", value: 330.2 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
];

function render(now: Date, zori: ZoriRead | null, realtor: RealtorRead | null): string {
  const feeds = feedHealth({
    rates: readRates(REAL_ROWS, now),
    metro: readMetroRates(SAMPLE_METRO.id, DC_ROWS, now),
    zori,
    realtor,
    now,
  });
  return renderToStaticMarkup(React.createElement(FeedsCard, { feeds, sample: SAMPLE_METRO.name }));
}

describe("FeedsCard — every feed's row, current or named stale", () => {
  it("on the fixture's day every feed is current, and the sample metro is named", () => {
    const html = render(FIXTURE_NOW, { asOf: "2026-08-31" } as ZoriRead, { asOf: "2026-09-01" } as RealtorRead);
    dumpView("feeds-current", html);
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/Every feed is current for its own cadence/);
    expect(text).toMatch(/judged on Washington DC/);
    expect(text).toMatch(/Rates — daily series/);
    expect(text).toMatch(/2026-09-21 · today/);
    expect(text).toMatch(/Asking rents and home values/);
    expect(text).toMatch(/2026-08-31 · 21 days old/);
    expect(text).not.toMatch(/stale/);
  });

  it("a fortnight with no pull tints the daily row, names its series, and leaves the monthly rows current", () => {
    const html = render(new Date("2026-10-05T12:00:00Z"), null, null);
    dumpView("feeds-stale", html);
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/feeds are not current/);
    expect(text).toMatch(/10-yr Treasury/);
    expect(text).toMatch(/no rows/);
    expect(html).toContain("bg-amber-500/10");
  });

  it("nothing readable is said plainly", () => {
    const html = renderToStaticMarkup(React.createElement(FeedsCard, { feeds: [], sample: SAMPLE_METRO.name }));
    expect(visibleText(html)).toMatch(/could not be read just now/);
    expect(a11yIssues(html)).toEqual([]);
  });
});
