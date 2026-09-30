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
import { SKYLINES, commonsPage } from "./skyline";

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

  it("reads the hero's words before its photograph's credit, so Tab reaches Get started free first", async () => {
    const html = await renderHome();
    const start = html.indexOf('<section class="band-dark relative overflow-hidden text-white">');
    expect(start).toBeGreaterThan(-1);
    const hero = html.slice(start, html.indexOf("</section>", start));
    // The credit is drawn at the band's foot; it sat first in the markup.
    const credits = [...hero.matchAll(/<a\b[^>]*href="https:\/\/(?:commons\.wikimedia\.org|creativecommons\.org)\/[^"]*"/g)].map((m) => m.index!);
    if (hero.includes("/api/imagery/skyline/")) expect(credits.length, "a market's photograph owes its credit").toBeGreaterThan(0);
    const controls = [...hero.matchAll(/<(?:a|button)\b[^>]*>/g)].map((m) => m.index!).filter((i) => !credits.includes(i));
    expect(hero.indexOf(">Get started free<")).toBeGreaterThan(-1);
    expect(controls.length).toBeGreaterThan(1);
    if (credits.length) expect(Math.max(...controls)).toBeLessThan(Math.min(...credits));
  }, 60_000);

  it("links every photograph the coverage gallery shows to its own page, not only each photographer's first", async () => {
    const html = await renderHome();
    const start = html.indexOf(">Coverage<");
    expect(start).toBeGreaterThan(-1);
    const gallery = html.slice(start, html.indexOf("</section>", start));
    const tiles = [...gallery.matchAll(/href="\/market\?metro=([^"]+)"/g)].map((m) => m[1]);
    const pictured = tiles.filter((id) => SKYLINES[id]);
    expect(pictured.length).toBeGreaterThan(1);
    for (const id of pictured) expect(gallery, id).toContain(`href="${commonsPage(SKYLINES[id].file)}"`);
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
