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
import { fmtPct } from "./underwrite/playground";
import { DemoPanel, DemoTabs, loadWalkthrough } from "@/app/landing-interactive";
import { AnalysisTabs, DealSectionTabs } from "@/app/(app)/deals/[id]/section-tabs";
import { PIPELINE, analysisCounts, sectionCounts, sectionStateOf } from "./deal-tabs";
import { DebtSizer } from "@/app/(app)/deals/[id]/debt-sizer";
import { SampleModelCard } from "@/app/sample-model-card";
import { modelReturnsRead } from "./compare-interest";
import { inferStrategy } from "./deal-strategy";
import { StressBench } from "@/app/landing-stress";
import { BUY_BOX_CHIP_CLS, boxCriteria, buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { buyBoxLines } from "./criteria";
import { BuyBoxPanel } from "@/app/(app)/deals/[id]/buy-box-panel";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "./sample-deal";
import { sampleHeader } from "./sample-header";
import { sampleMemoData } from "./sample-memo";
import { SAMPLE_DOWNLOAD_NOTE, SampleHeroTools } from "@/app/sample-hero";
import { DEAL_TOOL_TITLE, DealTool, type DealToolKind } from "@/app/(app)/deals/[id]/header-tools";
import { compRating, inCompOrder } from "./comp-rating";
import { SKYLINES, commonsPage, coverWidth, skylineSrcSet } from "./skyline";
import { skylineSrcSetOf } from "./skyline-srcset";
import { METRO_VIEWS } from "./metro-imagery";
import { sampleDealCard } from "./pipeline-card";
import { loadSampleTile } from "@/app/sample-pipeline-card-lazy";
import { SAMPLE_ACTUALS_WORDS, SAMPLE_OM_FILE_WORDS, SAMPLE_OM_WORDS, SourceDocumentsView } from "@/app/(app)/deals/[id]/source-documents";
import { SAMPLE_OM_HREF } from "./sample-om-link";
import { rentRollDateWords, t12DateWords } from "./actuals/actuals-read";
import { sampleStressTest } from "./sample-stress";

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
    expect(text).toContain("The model, included — Excel, live formulas Pro");
    expect(text).toContain("IC memo Pro");
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

  // The tool row had been a hand-drawn copy of the deal page's (its own
  // classes, icons and tooltips); both draw the deal page's DealTool now.
  it("draws the sample's tools with the deal page's own DealTool, in the signed-in sample's order", () => {
    const html = renderToStaticMarkup(React.createElement(SampleHeroTools));
    const tool = (kind: DealToolKind, href: string, title: string, page = false) =>
      renderToStaticMarkup(React.createElement(DealTool, { kind, href, title, page }));
    expect(html).toBe(
      [
        tool("memo", "/api/demo/memo", `${DEAL_TOOL_TITLE.memo}. ${SAMPLE_DOWNLOAD_NOTE}`),
        tool("report", "/api/demo/report", `${DEAL_TOOL_TITLE.report}. ${SAMPLE_DOWNLOAD_NOTE}`),
        tool("model", "/api/demo/underwrite.xlsx", `${DEAL_TOOL_TITLE.model}. ${SAMPLE_DOWNLOAD_NOTE}`),
        tool("rentRoll", "/login?mode=signup", `${DEAL_TOOL_TITLE.rentRoll} — on a deal of your own`, true),
        tool("valuations", "/login?mode=signup", `${DEAL_TOOL_TITLE.valuations} — on a deal of your own`, true),
      ].join(""),
    );
    // The deal page draws the same tools, and neither keeps a copy.
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    for (const kind of ["memo", "report", "model", "rentRoll", "valuations", "bridge"]) expect(page).toContain(`kind="${kind}"`);
    for (const src of [page, readFileSync("app/sample-hero.tsx", "utf8")]) {
      expect(src).not.toContain("py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm");
      expect(src).not.toContain('<path d="M15 2v5h5" />');
    }
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
// and both rows of chips drew four of the box's five criteria. Then it drew
// a "Mandate fit" card of its own; it draws the deal page's own panel now
// (the pass of 2026-10-16, H1), as /demo does, under a caption saying the
// box is the sample's example box, since the panel speaks to a signed-in
// reader's mandate.
function sampleBuyBox() {
  const read = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);
  return {
    panel: { checks: read.checks, mandate: read.mandate, scope: "personal" as const, provisional: false, hasBox: true },
    lines: buyBoxLines(SAMPLE_DEMO_BOX, { exchange: false }),
  };
}

describe("the homepage's buy box is the deal page's own panel", () => {
  it("the Buy box tab draws the deal page's BuyBoxPanel on the sample's read, captioned as the sample's example box", () => {
    const data = sampleBuyBox();
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Buy box", buyBox: data }));
    // The panel itself, markup for markup.
    expect(html).toContain(renderToStaticMarkup(React.createElement(BuyBoxPanel, { data: data.panel, publicDemo: true })));
    // A visitor has no criteria page: the link asks them to set their own box.
    expect(html).toContain('href="/login?mode=signup"');
    expect(html).not.toContain('href="/criteria"');
    const text = visibleText(html).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(text).toContain("The deal against your mandate");
    expect(text).toMatch(new RegExp(`\\b${data.panel.mandate!.score}\\s*/ 100`));
    for (const c of data.panel.checks) expect(text).toContain(c.label);
    // Whose box it is, in words a visitor sees, before the panel.
    expect(html).toContain('data-qa="sample-box-caption"');
    expect(text).toContain("The sample's example buy box — on a deal of your own, the box you set.");
    expect(html.indexOf('data-qa="sample-box-caption"')).toBeLessThan(html.indexOf("The deal against your mandate"));
    for (const line of data.lines) expect(text).toContain(line);
    // No drawn copy of its own.
    expect(text).not.toContain("Mandate fit ");
    expect(text).not.toContain("Your criteria, checked in code");
    expect(html).not.toContain("WATCH");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
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
    const at = html.indexOf("The model, included — Excel, live formulas");
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
    const at = html.indexOf("IC memo<");
    expect(at).toBeGreaterThan(-1);
    const tile = words(html.slice(at, html.indexOf("/api/demo/memo", at)));
    const memo = sampleMemoData();
    expect(tile).toContain(memo.name);
    expect(tile).toContain(`${memo.verdictWord} ${memo.verdictSub}`);
    expect(memo.verdictWord).toBe(sampleHeader().pill!.label);
    for (const t of memo.keyTerms.slice(0, 4)) expect(tile, t.label).toContain(`${t.label} ${t.value}`);
    const cAt = html.indexOf("The broker&#x27;s comps, graded");
    expect(cAt).toBeGreaterThan(-1);
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

  // Audit C7, L8: the homepage had a SLOT where the sample's pipeline card
  // was to go. It draws the pipeline's own card now (DealTilePreview on
  // lib/pipeline-card's `sampleDealCard`), opening /demo: the market's
  // photograph, the call on it, the price with its basis, the cap, the fit.
  it("the pipeline section draws the sample's own pipeline card, opening /demo, its picture asked lazily", async () => {
    // The card's chunk, which the page asks for as the section nears the
    // screen (lib/walkthrough-loading.render.test.ts draws its shape until
    // then), landed.
    await loadSampleTile();
    const html = await renderHome();
    expect(html).not.toContain("SLOT:");
    const at = html.indexOf('data-qa="home-pipeline-card"');
    expect(at).toBeGreaterThan(-1);
    const section = html.slice(at, html.indexOf("</section>", at));
    const card = sampleDealCard({ today: new Date().toISOString().slice(0, 10) });
    expect(section).toContain('data-deal-tile="sample"');
    expect(section).toMatch(/<a [^>]*href="\/demo"/);
    const text = words(section).replace(/&#x27;/g, "'");
    expect(text).toContain("Your pipeline");
    expect(text).toContain(SAMPLE_DEAL.name);
    expect(text).toContain(sampleHeader().pill!.label);
    for (const f of [card.slots.basis!, card.slots.cap!, String(card.score)]) expect(text).toContain(f);
    // The card's market photograph, at the route the pipeline asks, lazily:
    // the card is far down the page, so it is no first picture.
    const src = card.pictures![0].src.replace(/&/g, "&amp;");
    expect(section).toContain(src);
    expect(section).toMatch(/loading="lazy"/);
    expect(section).not.toMatch(/fetchPriority="high"|fetchpriority="high"/);
    // No stage control: the card's module draws none outside the pipeline.
    expect(section).not.toContain("<select");
    expect(a11yIssues(section)).toEqual([]);
    expect(gluedWords(visibleText(section))).toEqual([]);
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
  // pass of 2026-10-16 (H5) drew the terms and the card's returns headline
  // bare, with a sentence of the homepage's own naming the workbook's IRR.
  // It draws the deal page's Financials tab now (H, item 3): the terms, the
  // debt sizer on the derivation the stress bench and the Excel tile run,
  // and the first-draft model card's own body, whose own sentence says the
  // workbook is a separate model. Which model the sample should run is the
  // owner's call.
  it("the stress bench's levers are 24px tall, a phone's tap (the visual sweep of 2026-10-19 measured 6)", () => {
    const { inputs, meta } = sampleDerivedInputs();
    const html = renderToStaticMarkup(React.createElement(StressBench, { base: inputs, units: meta.units }));
    const levers = [...html.matchAll(/<input[^>]*type="range"[^>]*>/g)].map((m) => m[0]);
    expect(levers.length).toBe(3);
    for (const lever of levers) {
      expect(lever).toMatch(/class="[^"]*\bh-6\b/);
      expect(lever).not.toMatch(/\bh-1\.5\b/);
    }
  });

  it("the miniature's Financials tab is the deal page's: the terms, the debt sizer and the model card's own body", () => {
    const { inputs, meta, sources } = sampleDerivedInputs();
    const bench = words(renderToStaticMarkup(React.createElement(StressBench, { base: inputs, units: meta.units })));
    const tileIrr = sampleWorkbookPreview()[1][2].replace("IRR ", "");
    const r = sampleBaseReturns();
    const modelInterest = modelReturnsRead(SAMPLE_DEAL.extraction, { ...SAMPLE_DEAL.model.returns, holdYears: SAMPLE_DEAL.model.holdYears });
    const strategy = inferStrategy(SAMPLE_DEAL.extraction, null);
    const rateSeeds = { permanent: meta.rateSeed ?? null, construction: null };
    const financials = { underwrite: inputs, underwriteSources: sources, rateSeeds, strategy, modelInterest };
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Financials", financials }));
    const panel = words(html);
    // The deal page's own parts, markup for markup, in its order.
    const sizer = renderToStaticMarkup(
      React.createElement(DebtSizer, {
        model: SAMPLE_DEAL.model,
        extraction: SAMPLE_DEAL.extraction,
        underwrite: inputs,
        underwriteSources: sources,
        rateSeeds,
        strategy,
      }),
    );
    const card = renderToStaticMarkup(React.createElement(SampleModelCard, { model: SAMPLE_DEAL.model, interest: modelInterest, playground: false }));
    // Audit C10, L2: the walkthrough's Overview draws no sensitivity
    // playground, so the card's note names none; /demo's, which draws one,
    // names it.
    expect(visibleText(card)).toContain("The workbook is a separate model, built from the memorandum’s terms — its returns can differ from the ones above.");
    expect(card).not.toContain("sensitivity playground");
    expect(renderToStaticMarkup(React.createElement(SampleModelCard, { model: SAMPLE_DEAL.model, interest: modelInterest }))).toContain(
      "The Overview’s sensitivity playground runs the workbook’s model, not this one.",
    );
    expect(html).toContain(sizer);
    expect(html).toContain(card);
    expect(html.indexOf("Extracted terms")).toBeLessThan(html.indexOf(sizer));
    expect(html.indexOf(sizer)).toBeLessThan(html.indexOf(card));
    expect(card).toContain(renderToStaticMarkup(React.createElement(ReturnsHeadline, { model: SAMPLE_DEAL.model, interest: modelInterest })));
    expect(panel).toContain("First-draft model — ready");
    // Audit C10 (M1): the banner speaks of the sample deal's documents,
    // never a visitor's, and the documents it names are ticked as in.
    const said = visibleText(card);
    expect(said).toContain("The sample deal's model, built from Maddox-OM.pdf (Offering memorandum)");
    expect(said).toContain("Built from the sample deal's documents");
    expect(said).not.toMatch(/Undated|your documents/);
    const chips = card.match(/<li [^>]*title="[^"]*— (?:added|optional)"[^>]*>[\s\S]*?<\/li>/g) ?? [];
    const added = chips.filter((c) => c.includes("— added\"")).map((c) => visibleText(c).replace(/[✓]|— added/g, "").trim());
    expect(added).toEqual(["Offering memorandum", "Rent roll", "T-12 / operating statement"]);
    expect(panel).toContain("Projected returns · first-draft model");
    expect(panel).toContain(`Levered IRR ${SAMPLE_DEAL.model.returns.leveredIrrPct!.toFixed(2)}%`);
    for (const m of SAMPLE_DEAL.extraction.metrics.filter((x) => x.flagged)) expect(panel).toContain(m.value);
    // The two models said as the product says them, never in a sentence of
    // the homepage's own.
    expect(html).toContain('data-qa="workbook-note"');
    expect(html).not.toContain('data-qa="home-two-models"');
    expect(panel).not.toContain("The Excel workbook is a separate model: its levered IRR is");
    expect(html).toContain('href="/api/demo/underwrite.xlsx"');
    expect(html).not.toContain("<form");
    // The bench and the Excel tile still read one base case.
    expect(fmtPct(r.leveredIrrPct)).toBe(tileIrr);
    expect(bench).toContain(`Levered IRR ${tileIrr}`);
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
    // The deal page's own order (lib/deal-tabs, which deal-view reads).
    const pipeline = PIPELINE;
    expect(screenRunLines().map(([stage]) => stage)).toEqual([...pipeline, "reconcile"]);
    expect([...STRIP_STAGES]).toEqual([...pipeline, "reconcile"]);
  });

  it("puts the deal-killers on the verdict's line, in the order its cards draw them", () => {
    const l = lines();
    expect(l.challenge).not.toMatch(/deal-killer/);
    const levers = SAMPLE_DEAL.verdict.screen!.dealKillers.map((k) => k.lever);
    expect(l.verdict).toContain(`${levers.length} deal-killers named first: ${["basis", "exit", "debt"].filter((x) => levers.includes(x as never)).join(" · ")}`);
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

  it("leads the Overview with the OM's assumptions tested on the sample, after the call and before the risk digest (2026-10-19)", () => {
    const stressTest = sampleStressTest({ today: "2026-09-21" });
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Overview" as never, stressTest }));
    const t = text(html);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    const panel = html.indexOf('data-qa="stress-test-panel"');
    expect(panel).toBeGreaterThan(0);
    expect(html.indexOf(SAMPLE_DEAL.verdict.reason)).toBeLessThan(panel);
    expect(html.indexOf("Risk digest")).toBeGreaterThan(panel);
    expect(t).toContain("The OM's assumptions, tested");
    // The sample's 6% vacancy against its rent roll and T-12: a document
    // row with an impact, drawn on the homepage from the same build /demo
    // draws (lib/sample-stress), with no figure read today.
    const from = html.indexOf('data-qa="stress-row-vacancy"');
    const row = html.slice(from, html.indexOf('data-qa="stress-row-', from + 10));
    expect(row).toContain('data-verdict="unsupported"');
    expect(row).toContain('data-evidence="document"');
    expect(visibleText(row)).toContain("the deal's T-12");
    expect(row).toContain('data-qa="stress-impact"');
    expect(t).not.toContain("Published figures read");
    // The whole method, one link right under the panel (2026-10-20).
    const link = html.indexOf('data-qa="how-we-test-link"');
    expect(link).toBeGreaterThan(panel);
    expect(link).toBeLessThan(html.indexOf("Risk digest"));
    expect(html.slice(link, link + 300)).toMatch(/href="\/how-we-test"[^>]*>How each assumption is tested</);
    // The page hands the walkthrough the same build.
    expect(readFileSync("app/page.tsx", "utf8")).toContain("stressTest={sampleStressTest(");
  });

  it("draws the deal page's own section bar and Analyses pills (section-tabs), counted by its own readers", () => {
    const buyBox = sampleBuyBox();
    const { inputs, meta, sources } = sampleDerivedInputs();
    const financials = {
      underwrite: inputs,
      underwriteSources: sources,
      rateSeeds: { permanent: meta.rateSeed ?? null, construction: null },
      strategy: inferStrategy(SAMPLE_DEAL.extraction, null),
      modelInterest: null,
    };
    const html = renderToStaticMarkup(React.createElement(DemoTabs, { buyBox, financials }));
    const results = {
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      reconciliation: SAMPLE_DEAL.reconciliation,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const counts = analysisCounts(results);
    expect(html).toContain(
      renderToStaticMarkup(
        React.createElement(DealSectionTabs, {
          active: "overview",
          stateOf: (k) => sectionStateOf(k, { results, live: false, step: null, buyBox: buyBox.panel }),
          counts: sectionCounts(counts, buyBox.panel.checks),
          onSelect: () => {},
          label: "Sample deal sections",
          fadeAlways: true,
        }),
      ),
    );
    expect(html).toContain('id="deal-tabpanel" role="tabpanel" aria-labelledby="tab-overview"');
    expect(panel("Analyses", "market")).toContain(
      renderToStaticMarkup(React.createElement(AnalysisTabs, { active: "market", counts, has: () => true, onSelect: () => {} })),
    );
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
  // Audit C10, M4: it still said "Offering memorandum — none uploaded" and
  // listed no rent roll or T-12 beside an Overview (on /demo) that draws
  // both. It is the signed-in sample's card now (SourceDocumentsView), on
  // the sample's actuals as the public report reads them.
  it("lists the documents the sample deal holds, and no file it does not", async () => {
    const html = panel("Documents");
    const t = text(html);
    expect(t).toContain("Source documents");
    // The memorandum's row opens the sample's fictional memorandum, the file
    // every page chip opens, and says it is fictional.
    expect(visibleText(html)).toContain(SAMPLE_OM_FILE_WORDS);
    expect(visibleText(html)).not.toContain(SAMPLE_OM_WORDS);
    expect(html).toContain(`href="${SAMPLE_OM_HREF}"`);
    expect(t).not.toContain("none uploaded");
    for (const row of ["om", "rent_roll", "t12"]) expect(html).toContain(`data-doc-row="${row}"`);
    const { sampleActuals } = await import("@/lib/sample-cover");
    const read = sampleActuals()!;
    expect(t).toContain(rentRollDateWords(read.rentRoll!)!);
    expect(t).toContain(t12DateWords(read.t12!)!);
    expect(html.match(new RegExp(SAMPLE_ACTUALS_WORDS.replace(/[—]/g, "."), "g"))?.length).toBe(2);
    // The card is the signed-in sample's, markup for markup.
    expect(html).toContain(
      renderToStaticMarkup(
        React.createElement(SourceDocumentsView, {
          data: {
            dealId: "sample",
            hasOm: false,
            omUrl: SAMPLE_OM_HREF,
            sample: true,
            typedFacts: false,
            documents: [],
            sampleActuals: read,
            memo: { href: "/api/demo/memo" },
          },
        }),
      ),
    );
    expect(html).toContain('href="/api/demo/memo"');
    expect(html).not.toMatch(/<form|<button/);
    expect(t).not.toMatch(/\.(pdf|csv|xlsx)\b/);
    expect(t).not.toMatch(/Reconciled|Screened/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("opens the sample's fictional memorandum from every page chip, at its page", () => {
    const financials = panel("Financials");
    // The terms the tab shows before "show all": the flagged first, eight.
    const ms = SAMPLE_DEAL.extraction.metrics;
    const terms = [...ms.filter((m) => m.flagged), ...ms.filter((m) => !m.flagged)].slice(0, 8).filter((m) => m.page);
    expect(terms.length).toBeGreaterThan(5);
    expect([...financials.matchAll(/data-qa="term-page"/g)].length).toBe(terms.length);
    for (const m of terms) {
      const n = String(m.page).replace(/\D/g, "");
      expect(financials, m.label).toContain(`href="${SAMPLE_OM_HREF}#page=${n}"`);
    }
    const comps = panel("Analyses", "comps");
    for (const c of SAMPLE_DEAL.comps.saleComps) {
      expect(comps, c.name).toContain(`href="${SAMPLE_OM_HREF}#page=${String(c.page).replace(/\D/g, "")}"`);
    }
    expect(a11yIssues(financials)).toEqual([]);
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

// Audit C7, L14: the hero band drew Philadelphia through its srcset and the
// sample's header picture in it at a fixed ?w=1600, two URLs wherever the
// band took another width (a dense laptop, a 2x phone), so the first screen
// downloaded the photograph twice. The header's picture is offered the
// band's own srcset at the band's own sizes now, so the browser takes one
// file for both.
describe("the hero's photograph is downloaded once", () => {
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;

  it("offers the header's picture the band's srcset at the band's sizes", async () => {
    const html = await renderHome();
    const imgs = (html.match(/<img\b[^>]*>/g) ?? []).filter((t) => t.includes("/api/imagery/skyline/philadelphia"));
    const band = imgs.find((t) => attr(t, "srcSet") && !t.includes("No photograph of the building yet"));
    const header = imgs.find((t) => t.includes("No photograph of the building yet") && !t.includes('loading="lazy"'));
    expect(band, "the band").toBeTruthy();
    expect(header, "the header's picture").toBeTruthy();
    expect(attr(header!, "srcSet")).toBe(attr(band!, "srcSet"));
    expect(attr(header!, "sizes")).toBe(attr(band!, "sizes"));
    expect(attr(band!, "srcSet")!.replace(/&amp;/g, "&")).toBe(skylineSrcSet("philadelphia"));
  }, 60_000);

  it("is never soft: the header's frame is wider than the photograph, so the band's file covers it by width", () => {
    // The frame is 16:9 at its squarest; a photograph no wider than that
    // covers it by its width, so a file the window's width (the band's
    // sizes) is at least the frame's, which is never wider than the window.
    for (const w of [390, 768, 1280]) expect(coverWidth(SKYLINES.philadelphia, (w * 9) / 16)!).toBeLessThanOrEqual(w);
  });

  it("reads a skyline route's srcset off its URL, and nothing off another URL", () => {
    const tag = skylineSrcSet("philadelphia").match(/v=([^ ]+) /)![1];
    expect(skylineSrcSetOf(`/api/imagery/skyline/philadelphia?w=1600&v=${tag}`)).toBe(skylineSrcSet("philadelphia"));
    expect(skylineSrcSetOf("/api/deals/abc/picture?size=card")).toBeNull();
    expect(skylineSrcSetOf("https://example.com/api/imagery/skyline/philadelphia?w=1600&v=x")).toBeNull();
  });
});

describe("the homepage footer's steward line", () => {
  // The steward's run is stamped in UTC (lib/utc-day): both the verified line
  // and the overdue one say so; the overdue one had printed a bare day.
  it("says UTC after every day it prints of the steward's last run", () => {
    const src = readFileSync("app/page.tsx", "utf8");
    const days = [...src.matchAll(/\{fmt\(verifiedAt\)\}(.{0,4})/g)].map((m) => m[1]);
    expect(days.length).toBe(2);
    for (const after of days) expect(after.startsWith(" UTC")).toBe(true);
  });
});
