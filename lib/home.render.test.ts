// The homepage, rendered as a server would send it, for what a screen
// reader hears. It holds an async part (the footer's steward heartbeat),
// which renderToStaticMarkup cannot wait for, so this renders through
// React's static prerender; the database that part reads is stubbed, so
// the test never reaches for a network.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { a11yIssues } from "./render-lint";
import { buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "./sample-deal";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("no database in a test");
  },
}));

async function renderHome(): Promise<string> {
  const { default: Home } = await import("@/app/page");
  const { prelude } = await prerenderToNodeStream(React.createElement(Home));
  let html = "";
  for await (const chunk of prelude) html += chunk.toString();
  return html;
}

describe("the homepage, as a screen reader hears it", () => {
  it("renders with no nameless control, unlabelled image or duplicate id", async () => {
    const html = await renderHome();
    expect(a11yIssues(html)).toEqual([]);
  }, 60_000);

  it("names the hero card's two chips: the call, and the buy-box fit", async () => {
    const html = await renderHome();
    const card = html.slice(html.indexOf("The Maddox at Brewerytown"));
    // "Caution" and "WATCH" sat side by side with nothing saying which was
    // the verdict and which the fit against the buy box.
    expect(card).toMatch(/<span class="sr-only">Verdict: <\/span>(Go|Caution|No-go)<\/span>/);
    expect(card).toMatch(/<span class="sr-only">Buy-box <\/span>Fit \d+ · (Pursue|Watch|Pass|Outside box)<\/span>/);
    // And it is the deal header's own chip for the same deal and box, never
    // a call only the homepage makes.
    const chip = buyBoxRead(
      SAMPLE_DEAL.asset_class,
      dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address),
      SAMPLE_DEMO_BOX,
    ).chip.label;
    expect(card).toContain(`<span class="sr-only">Buy-box </span>${chip}</span>`);
  }, 60_000);

  it("reads each stat once, its label as the term and its figure as the value", async () => {
    const html = await renderHome();
    const start = html.indexOf('<dl class="mt-16');
    expect(start).toBeGreaterThan(-1);
    const strip = html.slice(start, html.indexOf("</dl>", start));
    // A hidden term over a second, visible copy of the label had a screen
    // reader say every label twice.
    expect(strip).not.toContain("sr-only");
    const terms = [...strip.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1]);
    const values = strip.match(/<dd\b/g) ?? [];
    expect(terms.length).toBeGreaterThan(0);
    expect(values.length).toBe(terms.length);
    for (const t of terms) expect(strip.split(t).length - 1, t).toBe(1);
  }, 60_000);
});
