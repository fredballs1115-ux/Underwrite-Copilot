// The homepage, rendered as a server would send it, for what a screen
// reader hears. It holds an async part (the footer's steward heartbeat),
// which renderToStaticMarkup cannot wait for, so this renders through
// React's static prerender; the database that part reads is stubbed, so
// the test never reaches for a network.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { renderToStaticMarkup } from "react-dom/server";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { ScreenRunStrip, STRIP_STAGES, STRIP_WORDS, screenRunLines } from "@/app/screen-run-strip";
import { COMP_RATING, LEVER_META, SCENARIO_META, TONE } from "@/app/(app)/deals/[id]/deal-sections";
import { ReturnsHeadline } from "@/app/(app)/deals/[id]/model-view";
import { sampleBaseReturns, sampleDerivedInputs, sampleWorkbookPreview } from "./sample-derive";
import { fmtEm, fmtPct } from "./underwrite/playground";
import { DemoPanel, loadWalkthrough } from "@/app/landing-interactive";
import { StressBench } from "@/app/landing-stress";
import { BUY_BOX_CHIP_CLS, boxCriteria, buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { buyBoxCoverage } from "./criteria";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "./sample-deal";
import { sampleHeader } from "./sample-header";
import { sampleMemoData } from "./sample-memo";
import { SAMPLE_DOWNLOAD_NOTE, SampleHeroTools } from "@/app/sample-hero";
import { compRating, inCompOrder } from "./comp-rating";
import { SKYLINES, commonsPage } from "./skyline";
import { METRO_VIEWS } from "./metro-imagery";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("no database in a test");
  },
}));

// The walkthrough's tabs past the Overview are a chunk of their own, which
// the page loads as the walkthrough nears the screen; the tests that draw
// every tab load it first, as the page has by the time a tab is opened.
beforeAll(() => loadWalkthrough());

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

  it("keeps each export tile's Pro mark a word of its own (the batch-2 audit)", async () => {
    // The text read "Excel model, live formulasPro": the flex gap spaced
    // the chip on screen and nothing spaced it for a screen reader.
    const html = await renderHome();
    const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");
    expect(text).toContain("Excel model, live formulas Pro");
    expect(text).toContain("One-page IC memo Pro");
    expect(text).not.toMatch(/formulasPro|memoPro/);
  }, 60_000);

  // Audit C7, L10: the sample header's tools read "IC memo Pro", "Full
  // report Pro" and "Underwrite model Pro", accessible names and all, on
  // downloads that are free.
  it("marks none of the sample's free downloads Pro, and says a deal of your own's are", () => {
    const html = renderToStaticMarkup(React.createElement(SampleHeroTools));
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("IC memo");
    expect(text).toContain("Underwrite model");
    expect(text).not.toMatch(/\bPro\b/);
    for (const href of ["/api/demo/memo", "/api/demo/report", "/api/demo/underwrite.xlsx"]) {
      const a = new RegExp(`<a href="${href.replace(/\./g, "\\.")}" title="([^"]*)"`).exec(html);
      expect(a?.[1], href).toContain(SAMPLE_DOWNLOAD_NOTE);
    }
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  // The homepage and /demo against the signed-in product, H1: the card
  // called itself "a faithful miniature" of the deal header and was not —
  // no picture, "$68M" for the stated $68,000,000, the name without
  // "Sample — ", a typed deal type and an invented "Deal-killer" box.
  it("draws the deal page's own header on the sample: its chips, its figures and its market's photograph", async () => {
    const html = await renderHome();
    const at = html.indexOf("<header data-deal-hero");
    expect(at).toBeGreaterThan(-1);
    const card = html.slice(at, html.indexOf("</header>", at));
    const h = sampleHeader();
    // The name under the hero's own h1, so the page keeps one.
    expect(card).toContain(`<h2 id="deal-title" tabindex="-1" title="${h.title}"`);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // The deal page's chips, class for class.
    expect(card).toContain(`<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold ${h.pill!.cls}">${h.pill!.label}</span>`);
    expect(card).toContain(`class="rounded-full px-2.5 py-0.5 text-xs font-semibold ${h.fit!.cls}"`);
    expect(card).toContain(`>${h.fit!.label}</span>`);
    const text = card.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const f of h.figures) expect(text, f.label).toContain(`${f.label} ${f.value}`);
    expect(text).toContain("$68,000,000");
    expect(text).not.toMatch(/Deal-killer/i);
    // The market's photograph as the deal page draws it, captioned and credited.
    expect(card).toContain("data-hero-picture");
    expect(card).toContain(`src="${h.market!.src.replace(/&/g, "&amp;")}"`);
    expect(card).toContain('data-picture="market"');
    expect(card).toContain(`href="${h.market!.author.url}"`);
    // The tool row: the sample's three public downloads, then the two tools
    // that work on a deal of your own.
    for (const href of ["/api/demo/memo", "/api/demo/report", "/api/demo/underwrite.xlsx"]) expect(card).toContain(`href="${href}"`);
    expect(text).toContain("Rent roll");
    expect(text).toContain("Valuations");
  }, 60_000);

  it("reads the hero's words before its photograph's credit, so Tab reaches Get started free first", async () => {
    const html = await renderHome();
    const start = html.indexOf('<section class="band-dark relative overflow-hidden text-white">');
    expect(start).toBeGreaterThan(-1);
    const section = html.slice(start, html.indexOf("</section>", start));
    // The sample's header carries its own picture's credit inside its card;
    // the band's credit is the one that must follow the band's words.
    const cardAt = section.indexOf("<header data-deal-hero");
    const hero = cardAt < 0 ? section : section.slice(0, cardAt) + section.slice(section.indexOf("</header>", cardAt));
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

  it("says what each coverage tile shows, and never calls an overhead a skyline", async () => {
    const html = await renderHome();
    const start = html.indexOf(">Coverage<");
    const gallery = html.slice(start, html.indexOf("</section>", start));
    const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    let overheads = 0;
    for (const li of gallery.split("<li").slice(1)) {
      const id = /href="\/market\?metro=([^"]+)"/.exec(li)?.[1] ?? "";
      const alt = decode(/<img\b[^>]*\balt="([^"]*)"/.exec(li)?.[1] ?? "");
      const shot = SKYLINES[id];
      if (!shot) overheads++;
      expect(alt, id).toBe(shot ? shot.place : `${METRO_VIEWS[id].place} from above`);
    }
    // Montgomery County is drawn from above: the table chose it no photograph.
    expect(overheads).toBeGreaterThan(0);
    // The line under the heading: why there are more tiles than markets,
    // and no "skyline" or "jurisdictions" (Northern Virginia is several).
    const line = decode(/<\/h2><p\b[^>]*>([^<]*)<\/p>/.exec(gallery)?.[1] ?? "");
    expect(line).toMatch(/\d+ briefs/);
    expect(line).not.toMatch(/skyline|jurisdiction/i);
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

// The homepage and /demo against the signed-in product, M10: "Also in the
// box" left out most of what the product does, and its tasks tile opened
// /demo, which shows no tasks.
describe("the homepage's toolkit says what the product has", () => {
  it("names each kind of deal as its panel on the deal page names it", async () => {
    const html = await renderHome();
    const at = html.indexOf('aria-label="The deal types the screen reads"');
    expect(at).toBeGreaterThan(-1);
    const kinds = [...html.slice(at, html.indexOf("</ul>", at)).matchAll(/<li[^>]*>([^<]+)<\/li>/g)].map((m) => m[1].replace(/&#x27;/g, "'"));
    expect(kinds.length).toBeGreaterThan(10);
    const panels = readdirSync(join(__dirname, "..", "app"))
      .filter((f) => f.endsWith("-panel.tsx"))
      .map((f) => readFileSync(join(__dirname, "..", "app", f), "utf8"))
      .filter((src) => src.includes("<PanelHead"));
    for (const k of kinds) {
      // The heading itself, or the words a panel hands its heading.
      expect(panels.some((src) => src.includes(`<PanelHead title="${k}"`) || src.includes(`"${k}"`)), k).toBe(true);
    }
  }, 60_000);

  it("links a tile only to a page that shows it working", async () => {
    const html = await renderHome();
    const at = html.indexOf('class="feature-grid');
    const grid = html.slice(at, html.indexOf("</ul>", at));
    const tasks = grid.split("<li").find((li) => li.includes("assigned tasks"));
    expect(tasks).toBeTruthy();
    expect(tasks).not.toContain("href=");
    for (const label of ["Ask this deal", "flood map", "Compare deals", "Share the screen", "LOI", "pipeline meeting"]) {
      expect(grid, label).toContain(label);
    }
  }, 60_000);
});

// Research pass 34: the homepage quoted the sample's two models without
// saying which — the Excel tile ran the first-draft model beside a link to
// a workbook that runs the screening model, and the miniature of the deal
// page printed "8.7%" where the page's own card says "8.72%".
// The sample's fit as the page builds it (app/page.tsx SAMPLE_FIT).
function sampleFit() {
  const read = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);
  return {
    label: read.chip.label,
    cls: BUY_BOX_CHIP_CLS[read.chip.tone],
    note: read.chip.note,
    criteria: boxCriteria(read.checks, read.mandate),
  };
}

// Research pass 43, L2: the walkthrough's Buy box tab printed a typed
// "WATCH" beside the hero card's "Fit 63 · Outside box · 3 of 5 checked",
// and both rows of chips drew four of the box's five criteria.
describe("the homepage's buy box is the deal header's read", () => {
  it("the Buy box tab prints the header's chip and every criterion its count counts", () => {
    const fit = sampleFit();
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Buy box", fit, returns: { irr: "", equityMultiple: "", cashOnCash: "", exitCap: "" } }));
    expect(html).not.toContain("WATCH");
    expect(html).toContain(`>${fit.label}</span>`);
    const read = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);
    const total = buyBoxCoverage(read.checks, read.mandate).total;
    expect(fit.label).toContain(`of ${total} checked`);
    for (const c of fit.criteria) expect(html).toContain(`<span class="text-ink">${c.label}</span>`);
    expect(html.match(/<span class="text-ink">/g)).toHaveLength(total);
    // L6 (2026-10-16): it claimed the box checks "return targets", the two
    // criteria the sample's chip says could not be checked. It says the
    // chip's own sentence now.
    expect(fit.note).toMatch(/could not be checked/);
    expect(html).toContain(`>${fit.note!.replace(/'/g, "&#x27;")}</p>`);
    expect(html).not.toContain("return targets");
  });

  it("the page's card of criteria draws the same five", async () => {
    const html = await renderHome();
    const at = html.indexOf("Your buy box, checked in code");
    expect(at).toBeGreaterThan(-1);
    const card = html.slice(at, html.indexOf("</div></div>", at));
    for (const c of sampleFit().criteria) expect(card).toContain(`<span class="text-ink">${c.label}</span>`);
  }, 60_000);
});

describe("the homepage's sample figures are the surfaces' own", () => {
  const words = (html: string) =>
    html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  it("the Excel tile prints the workbook it links: its base case and two cells of its Sensitivity tab", async () => {
    const html = await renderHome();
    const at = html.indexOf("Excel model, live formulas");
    expect(at).toBeGreaterThan(-1);
    const tile = words(html.slice(at, html.indexOf("/api/demo/underwrite.xlsx", at)));
    for (const [k, v, e] of sampleWorkbookPreview()) expect(tile).toContain(`${k} ${v} ${e}`);
    expect(tile).toContain("Exit cap 5.45% IRR 9.3%");
    expect(tile).not.toContain("Rent growth");
  }, 60_000);

  // The homepage and /demo against the signed-in product, M6: the memo tile
  // was grey bars and a typed "Caution", the comps tile three hand-typed
  // names and grades.
  it("the memo tile draws the memo it downloads, and the comps tile the sample's own comps", async () => {
    const html = await renderHome();
    const at = html.indexOf("One-page IC memo");
    expect(at).toBeGreaterThan(-1);
    const tile = words(html.slice(at, html.indexOf("/api/demo/memo", at)));
    const memo = sampleMemoData();
    expect(tile).toContain(memo.name);
    expect(tile).toContain(`${memo.verdictWord} ${memo.verdictSub}`);
    expect(memo.verdictWord).toBe(sampleHeader().pill!.label);
    for (const t of memo.keyTerms.slice(0, 4)) expect(tile, t.label).toContain(`${t.label} ${t.value}`);
    const cAt = html.indexOf("Comps, graded");
    const comps = words(html.slice(cAt, html.indexOf("Your buy box, checked in code", cAt))).replace(/&#x27;/g, "'");
    const ordered = inCompOrder(SAMPLE_DEAL.comps.saleComps);
    expect(ordered).toHaveLength(SAMPLE_DEAL.comps.saleComps.length);
    let from = 0;
    for (const c of ordered) {
      const line = `${c.name} ${compRating(c.support).label} ${c.detail}`;
      const i = comps.indexOf(line, from);
      expect(i, line).toBeGreaterThan(-1);
      from = i;
    }
  }, 60_000);

  // Research pass 40, M1: the stress bench ran the first-draft model
  // (lib/model/compute) at its reconciled case — 8.7% — under words naming it
  // the engine that "builds the Excel workbook", its dot "the broker's base",
  // while the Excel tile beside it printed the workbook's 9.3%. It runs the
  // screening engine from the workbook's own base case now, and says so.
  it("the stress bench runs the workbook's engine from the workbook's base case, and says which", async () => {
    const { inputs, meta } = sampleDerivedInputs();
    const bench = words(renderToStaticMarkup(React.createElement(StressBench, { base: inputs, units: meta.units }))).replace(/&#x27;/g, "'");
    const tileIrr = sampleWorkbookPreview()[1][2].replace("IRR ", "");
    expect(tileIrr).toBe("9.3%");
    expect(bench).toContain(`Levered IRR ${tileIrr}`);
    expect(bench).toContain("Equity multiple 1.53x");
    expect(bench).toContain("dot = the base case");
    expect(bench).toContain("the screening engine behind each deal page's returns and the Excel workbook, run from the workbook's own base case");
    expect(bench).not.toMatch(/computeModel|broker/i);
    // The page hands the bench that derivation: its section prints the tile's figure.
    const html = await renderHome();
    const at = html.indexOf('id="stress"');
    expect(at).toBeGreaterThan(-1);
    const section = words(html.slice(at, html.indexOf("</section>", at)));
    expect(section).toContain(`Levered IRR ${tileIrr}`);
  }, 60_000);

  // Research pass 43, L3 had the tab print the workbook's base case under
  // "Projected returns · the Excel workbook's base case" — figures the deal
  // page's Financials tab never prints, beside a hand-built exit-cap range
  // whose base (5.45%) the verdict's own card does not state (5.50%). The
  // pass of 2026-10-16 (H5) draws what the deal page's Financials tab draws
  // on the sample: its extracted terms and the first-draft model's returns,
  // the card's own component. The workbook's IRR, the tile's and the
  // bench's, is named beside them as the other model's, as the deal page and
  // /demo name it; which model the sample should run is the owner's call.
  it("the miniature's Financials tab is the deal page's: the terms and the first-draft model's returns, the workbook's IRR named apart", () => {
    const { inputs, meta } = sampleDerivedInputs();
    const bench = words(renderToStaticMarkup(React.createElement(StressBench, { base: inputs, units: meta.units })));
    const tileIrr = sampleWorkbookPreview()[1][2].replace("IRR ", "");
    const r = sampleBaseReturns();
    const returns = {
      irr: fmtPct(r.leveredIrrPct),
      equityMultiple: fmtEm(r.leveredEquityMultiple),
      cashOnCash: fmtPct(r.cocYr1Pct),
      exitCap: fmtPct(r.exitCapPct, 2),
    };
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Financials", fit: sampleFit(), returns }));
    const panel = words(html);
    // The card's own markup, figure for figure.
    expect(html).toContain(renderToStaticMarkup(React.createElement(ReturnsHeadline, { model: SAMPLE_DEAL.model })));
    expect(panel).toContain("Projected returns · first-draft model");
    expect(panel).toContain(`Levered IRR ${SAMPLE_DEAL.model.returns.leveredIrrPct!.toFixed(2)}%`);
    expect(panel).toContain("Extracted terms");
    for (const m of SAMPLE_DEAL.extraction.metrics.filter((x) => x.flagged)) expect(panel).toContain(m.value);
    // The other model's, said as another model's: the tile's and the bench's.
    expect(returns.irr).toBe(tileIrr);
    expect(bench).toContain(`Levered IRR ${tileIrr}`);
    expect(panel).toContain(`The Excel workbook is a separate model: its levered IRR is ${tileIrr}.`);
    expect(panel).not.toContain("the Excel workbook's base case");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });
});

// The trace credited the deal-killers to the challenger ("3 deal-killers
// stressed first" on its line); they are the verdict's (lib/anthropic/prompts
// `verdictInstruction`). Each line now says what its own stage writes, in the
// pipeline's order, in the product's own words.
describe("the screen-run trace credits each stage with what it writes", () => {
  const lines = () => Object.fromEntries(screenRunLines());

  it("runs in the pipeline's order, the reconciliation after it", () => {
    const view = readFileSync("app/(app)/deals/[id]/deal-view.tsx", "utf8");
    const pipeline = JSON.parse(/const PIPELINE = (\[[^\]]*\]);/.exec(view)![1]) as string[];
    expect(screenRunLines().map(([stage]) => stage)).toEqual([...pipeline, "reconcile"]);
    expect([...STRIP_STAGES]).toEqual([...pipeline, "reconcile"]);
  });

  it("puts the deal-killers on the verdict's line, in the order its cards draw them", () => {
    const l = lines();
    expect(l.challenge).not.toMatch(/deal-killer/);
    const levers = SAMPLE_DEAL.verdict.screen!.dealKillers.map((k) => k.lever);
    expect(l.verdict).toContain(`${levers.length} deal-killers stressed first: ${["basis", "exit", "debt"].filter((x) => levers.includes(x as never)).join(" · ")}`);
    expect(l.challenge).toContain(`${SAMPLE_DEAL.challenges.challenges.length} assumptions challenged`);
    expect(l.challenge).toContain("each with a question for the broker");
  });

  // Audit C7, L5: the signal's line printed the extraction's figures, and
  // the sample has no first signal; the challenger's line claimed a stress
  // test that on the sample is the first-draft model's run.
  it("credits no stage with output it did not write on the sample", () => {
    const l = lines();
    expect((SAMPLE_DEAL as { first_signal?: unknown }).first_signal ?? null).toBeNull();
    expect(l.signal).toBe("reads the headline figures first: the price, the size and the cap");
    expect(l.signal).not.toMatch(/\$|\d/);
    expect(l.challenge).not.toMatch(/stress test/);
  });

  it("speaks the product's own words for a lever, a comp's rating and a market read", () => {
    for (const [k, word] of Object.entries(STRIP_WORDS.lever)) expect(word).toBe(LEVER_META[k as keyof typeof LEVER_META].label.toLowerCase());
    for (const [k, word] of Object.entries(STRIP_WORDS.comp)) expect(word).toBe(COMP_RATING[k as keyof typeof COMP_RATING].label.toLowerCase());
    for (const [k, word] of Object.entries(STRIP_WORDS.market)) expect(word).toBe(TONE[k as keyof typeof TONE].label.toLowerCase());
    const html = renderToStaticMarkup(React.createElement(ScreenRunStrip));
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });
});

// Research pass of 2026-10-16 (H4, M2): the walkthrough drew its own
// versions of the deal page's tabs — a "Screening verdict" box the product
// does not have, deal-killer chips ("Deal-killer / Stress it") on cards that
// carry no severity, "Genuine support" for the product's "Supports", and
// "Base" / "Sponsor" for "Base case" / "Sponsor's case". It draws the deal
// page's own components on the sample now.
describe("the walkthrough's tabs are the sample deal's own", () => {
  const panel = (tab: string, analysis?: string) =>
    renderToStaticMarkup(
      React.createElement(DemoPanel, {
        tab: tab as never,
        analysis: analysis as never,
        fit: sampleFit(),
        returns: { irr: "", equityMultiple: "", cashOnCash: "", exitCap: "" },
      }),
    );
  const text = (html: string) => visibleText(html).replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  it("opens on the deal page's Overview: the verdict card, the screened count and the risk digest", () => {
    const html = panel("Overview");
    const t = text(html);
    expect(t).toContain("Verdict");
    expect(t).toContain("Caution");
    expect(t).toContain(SAMPLE_DEAL.verdict.reason);
    expect(t).toContain("Screened · 5/5 · model reconciled");
    expect(t).toContain("Risk digest");
    expect(t).not.toMatch(/Screening verdict|one rubric|Deal-killer|Stress it|Holds up/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("opens Analyses on the verdict, with the product's ranges, deal-killers and scenario words", () => {
    const t = text(panel("Analyses"));
    for (const name of ["Verdict", "Challenger", "Comps", "Market", "Reconciler"]) expect(t).toContain(name);
    for (const s of SAMPLE_DEAL.verdict.screen!.sensitivity) expect(t).toContain(SCENARIO_META[s.scenario]);
    expect(t).toContain("Stress the three deal-killers first");
    for (const k of SAMPLE_DEAL.verdict.screen!.dealKillers) expect(t).toContain(LEVER_META[k.lever].label);
    // The exit cap's range card, its base as the verdict states it.
    const exit = SAMPLE_DEAL.verdict.screen!.ranges.find((r) => r.label === "Exit cap")!;
    expect(t).toContain(`Base ${exit.base}`);
    expect(t).toContain(exit.source);
    expect(t).not.toMatch(/Genuine support|Deal-killer\b/);
  });

  // H3: the tab listed "offering-memorandum.pdf", "rent-roll.csv" and
  // "t12-operating.pdf", none of which the sample has; the deal page's tab
  // reads "Offering memorandum — none uploaded" on it.
  it("lists the documents the sample deal holds, and no file it does not", () => {
    const html = panel("Documents");
    const t = text(html);
    expect(t).toContain("Source documents");
    expect(t).toContain("Offering memorandum none uploaded");
    expect(html).toContain('href="/api/demo/memo"');
    expect(t).not.toMatch(/\.(pdf|csv|xlsx)\b/);
    expect(t).not.toMatch(/Reconciled|Screened/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("rates the comps and the challenges in the product's own words", () => {
    const comps = text(panel("Analyses", "comps"));
    for (const c of SAMPLE_DEAL.comps.saleComps) expect(comps).toContain(COMP_RATING[c.support].label);
    expect(comps).not.toContain("Genuine support");
    const challenger = text(panel("Analyses", "challenger"));
    for (const c of SAMPLE_DEAL.challenges.challenges) expect(challenger).toContain(c.assumption);
    expect(challenger).toContain("Ask the broker");
    for (const sub of ["verdict", "challenger", "comps", "market", "reconciler"]) {
      const html = panel("Analyses", sub);
      expect(a11yIssues(html), sub).toEqual([]);
      expect(gluedWords(visibleText(html)), sub).toEqual([]);
    }
  });
});
