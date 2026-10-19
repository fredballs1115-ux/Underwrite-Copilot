// The buy box, drawn (lib/box-bands, app/(app)/criteria/box-bands): each band
// the box sets as a track, the reader's live deals on it at the figure their
// own check judged, in that check's call, and the deals the box cannot judge
// on a band counted rather than drawn.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { BAND_MAX_LANES, boxBands, boxLinesBeyondBands, notJudgedText, type BandDeal } from "@/lib/box-bands";
import { BoxBands, ReadOnlyBox, bandsCountLine } from "@/app/(app)/criteria/box-bands";
import { dealCheckSource } from "@/lib/buy-box-chip";
import { boxFigures, buyBoxLines, evaluateBuyBox, type BuyBox } from "@/lib/criteria";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;

function deal(id: string, rows: [string, string][], over: Partial<ExtractionResult> = {}): BandDeal {
  const ex = {
    ...SAMPLE_DEAL.extraction,
    metrics: rows.map(([label, value]) => ({ label, value, page: "" })),
    ...over,
  } as unknown as ExtractionResult;
  return { id, name: `Deal ${id}`, assetClass: "multifamily", source: dealCheckSource(ex, null, null) };
}

const BOX: BuyBox = {
  priceMinM: 10,
  priceMaxM: 50,
  minCapPct: 5.5,
  sfMin: 100_000,
  sfMax: 300_000,
  unitsMin: 100,
  unitsMax: 400,
  maxPerUnitK: 250,
  dealbreakers: { maxPriceM: 70, minCapPct: 4.5 },
};

const INSIDE = deal("in", [
  ["Asking price", "$42,000,000"],
  ["Going-in cap rate", "6.10%"],
  ["Rentable SF", "210,000"],
  ["Units", "248"],
  ["Price per unit", "$169,355"],
]);
const NEAR = deal("near", [
  ["Asking price", "$53,000,000"],
  ["Going-in cap rate", "5.40%"],
  ["Units", "420"],
]);
const OUTSIDE = deal("out", [
  ["Asking price", "$120,000,000"],
  ["Going-in cap rate", "4.00%"],
  ["Price per unit", "$410,000"],
]);
// A note: its price is a loan's, so its cap and basis are the collateral's
// and the box judges neither.
const NOTE = deal(
  "note",
  [
    ["Asking price", "$12,000,000"],
    ["Going-in cap rate", "7.00%"],
    ["Price per unit", "$90,000"],
  ],
  { interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" } } as never,
);
const RANGE = deal("range", [["Asking price", "$40,000,000 – $42,000,000"]]);
const DEALS = [INSIDE, NEAR, OUTSIDE, NOTE, RANGE];

describe("the buy box, drawn: each band a track, the reader's deals on it", () => {
  const bands = boxBands(BOX, DEALS);
  const of = (key: string) => bands.find((b) => b.key === key)!;
  const dot = (key: string, id: string) => of(key).dots.find((d) => d.id === id);

  it("draws every band the box sets, in the form's order, with the band and its red line", () => {
    expect(bands.map((b) => b.key)).toEqual(["price", "cap", "sf", "units", "basis"]);
    expect(of("price").bandText).toBe("$10M – $50M · red line ≤ $70M");
    expect(of("units").bandText).toBe("100 units – 400 units");
    expect(of("sf").bandText).toBe("100k SF – 300k SF");
    expect(of("cap").bandText).toBe("≥ 5.50% · red line ≥ 4.50%");
    expect(of("basis").bandText).toBe("≤ $250k / unit");
    for (const b of bands) {
      expect(b.fill).not.toBeNull();
      expect(b.fill!.from).toBeLessThan(b.fill!.to);
    }
    expect(of("price").redLine?.at).toBeGreaterThan(of("price").fill!.to);
    expect(of("cap").redLine?.at).toBeLessThan(of("cap").fill!.from);
    expect(of("sf").redLine).toBeNull();
  });

  it("puts each deal at the figure its check judged, in that check's call", () => {
    // The call is the deal's own check's, every one.
    for (const b of bands) {
      for (const d of b.dots) {
        const src = DEALS.find((x) => x.id === d.id)!.source;
        const checks = evaluateBuyBox("multifamily", src, BOX);
        const label = { price: "Price", cap: "Going-in cap", sf: "Size", units: "Units", basis: "Basis / unit" }[b.key];
        const status = checks.find((c) => c.label === label)?.status;
        expect({ band: b.key, id: d.id, tone: d.tone }).toEqual({ band: b.key, id: d.id, tone: status });
      }
    }
    expect(dot("price", "in")).toMatchObject({ tone: "pass", text: "$42.0M" });
    expect(dot("price", "near")?.tone).toBe("near");
    expect(dot("price", "out")?.tone).toBe("miss");
    expect(dot("cap", "out")).toMatchObject({ tone: "miss", text: "4.00%" });
    expect(dot("units", "in")?.text).toBe("248 units");
    // The figure is the one the box reads (lib/criteria `boxFigures`).
    expect(boxFigures("multifamily", INSIDE.source, BOX).price?.value).toBe(42_000_000);
  });

  it("draws a stated range from end to end, the dot at the end the band tests", () => {
    const r = dot("price", "range")!;
    expect(r.text).toBe("$40.0M–$42.0M");
    expect(r.range!.from).toBeLessThan(r.range!.to);
    expect(r.at).toBeCloseTo(r.range!.to, 5);
  });

  it("never draws a deal the box cannot judge, and counts it", () => {
    // The note's cap and basis are withheld; four of five deals state no SF.
    expect(dot("cap", "note")).toBeUndefined();
    expect(dot("basis", "note")).toBeUndefined();
    expect(of("cap").notJudged).toBe(2); // the note, the range deal
    expect(of("sf").notJudged).toBe(4);
    expect(of("sf").dots.map((d) => d.id)).toEqual(["in"]);
    expect(notJudgedText(0)).toBeNull();
    expect(notJudgedText(3)).toBe("3 not judged");
  });

  it("holds an outlier at the track's end rather than shrinking the band to a sliver", () => {
    // $410k a unit against a $250k ceiling: past the track's drawn end.
    const basis = of("basis");
    expect(dot("basis", "out")).toMatchObject({ off: "high", at: 100, tone: "miss" });
    expect(basis.fill!.to - basis.fill!.from).toBeGreaterThan(25);
    // $120M against a $10–50M band and a $70M red line is inside the track.
    expect(dot("price", "out")).toMatchObject({ off: null, tone: "miss" });
    for (const b of bands) {
      for (const d of b.dots) {
        expect(d.at).toBeGreaterThanOrEqual(0);
        expect(d.at).toBeLessThanOrEqual(100);
      }
    }
  });

  it("lifts close figures to rows of their own, never past its last", () => {
    const many = Array.from({ length: 12 }, (_, i) => deal(`m${i}`, [["Asking price", `$${30 + i * 0.01}M`]]));
    const crowd = boxBands({ priceMinM: 10, priceMaxM: 50 }, many)[0];
    expect(crowd.lanes).toBe(BAND_MAX_LANES);
    expect(Math.max(...crowd.dots.map((d) => d.lane))).toBe(BAND_MAX_LANES - 1);
  });

  it("draws a red line alone where the box sets no band on the figure, its deals untoned", () => {
    const [b] = boxBands({ dealbreakers: { maxPriceM: 60 } }, [INSIDE, OUTSIDE]);
    expect(b).toMatchObject({ key: "price", fill: null, bandText: "red line ≤ $60M" });
    expect(b.dots.map((d) => d.tone)).toEqual(["line", "line"]);
    // An empty box draws nothing.
    expect(boxBands({}, DEALS)).toEqual([]);
  });

  it("renders the tracks, each deal a named link to its page, with nothing to lint", () => {
    const html = renderToStaticMarkup(h(BoxBands, { bands, deals: DEALS.length }));
    expect(html).toContain('data-qa="box-bands"');
    expect((html.match(/data-bar="buybox-track"/g) ?? []).length).toBe(5);
    expect((html.match(/data-bar="buybox-fill"/g) ?? []).length).toBe(5);
    expect((html.match(/data-bar="buybox-redline"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="buybox-range"/g) ?? []).length).toBe(1);
    const dots = bands.reduce((n, b) => n + b.dots.length, 0);
    expect((html.match(/data-bar="buybox-deal"/g) ?? []).length).toBe(dots);
    expect(html).toContain('href="/deals/in"');
    expect(html).toContain('title="Deal in: price $42.0M, inside the box"');
    expect(html).toContain('title="Deal out: price $120.0M, outside the box"');
    expect(html).toContain('title="Deal out: basis $410k / unit, outside the box, past the track&#x27;s end"');
    // The audit of #466: every dot was a tab stop, up to a thousand of them.
    // A dot is a pointer's way in; each band lists its deals as links for the
    // keyboard and the screen reader.
    const dotTags = html.match(/<a[^>]*data-bar="buybox-deal"[^>]*>/g) ?? [];
    expect(dotTags.length).toBe(dots);
    for (const t of dotTags) {
      expect(t).toContain('tabindex="-1"');
      expect(t).toContain('aria-hidden="true"');
    }
    const lists = html.match(/<details[^>]*data-qa="band-deals"[\s\S]*?<\/details>/g) ?? [];
    expect(lists.length).toBe(bands.filter((b) => b.dots.length > 0).length);
    const listed = lists.flatMap((l) => l.match(/<a href="\/deals\/[^"]+"/g) ?? []);
    expect(listed.length).toBe(dots);
    const listText = visibleText(lists.join("")).replace(/\s*\n\s*:/g, ":");
    expect(listText).toContain("Deal in: price $42.0M, inside the box");
    expect(listText).toMatch(/The \d+ deals on it|The one deal on it/);
    const text = visibleText(html);
    expect(text).toContain("Your box, drawn");
    expect(text).toContain("Your 5 live deals on each band, as saved.");
    expect(text).toContain("4 not judged");
    expect(text).toContain("Red line");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    expect(renderToStaticMarkup(h(BoxBands, { bands: [], deals: 3 }))).toBe("");
    expect(bandsCountLine(0)).toBe("No live deals to place on it yet.");
    expect(bandsCountLine(1)).toBe("Your one live deal on each band, as saved.");
  });

  // The audit of #466: a teammate's view said "Your N live deals", a read
  // past its limit counted only what it drew, and a failed read said "No
  // live deals".
  it("says whose deals they are, the newest of how many past the limit, and nothing on a failed read", () => {
    expect(bandsCountLine(5, { team: true })).toBe("The team’s 5 live deals on each band, as saved.");
    expect(bandsCountLine(0, { team: true })).toBe("No live team deals to place on it yet.");
    expect(bandsCountLine(200, { total: 340 })).toBe("Your newest 200 of 340 live deals on each band, as saved.");
    expect(bandsCountLine(200, { team: true, total: 340 })).toBe("The team’s newest 200 of 340 live deals on each band, as saved.");
    expect(bandsCountLine(200, { total: 200 })).toBe("Your 200 live deals on each band, as saved.");
    expect(bandsCountLine(null)).toBeNull();
    const failed = renderToStaticMarkup(h(BoxBands, { bands, deals: null }));
    expect(failed).toContain('data-bar="buybox-track"');
    expect(visibleText(failed)).not.toMatch(/live deal/);
    const team = renderToStaticMarkup(
      h(ReadOnlyBox, { teamName: "Ridgeline", mandate: null, bands, deals: DEALS.length, lines: [] }),
    );
    expect(visibleText(team)).toContain("The team’s 5 live deals on each band, as saved.");
    const page = readFileSync("app/(app)/criteria/page.tsx", "utf8");
    expect(page).toContain('{ count: "exact" }');
    expect(page).toContain("const bandsCount = bandsRead.failed ? null : bandDeals.length;");
  });

  it("is built on the page from the live deals, the sample left out, through the deal page's own source", () => {
    const page = readFileSync("app/(app)/criteria/page.tsx", "utf8");
    expect(page).toContain(".limit(BAND_DEALS_MAX)");
    expect(page).toMatch(/!d\.is_sample && isOpenStage\(normalizeStage\(d\.stage\)\)/);
    expect(page).toMatch(/source: dealCheckSource\(/);
    expect(page).toContain("<BoxBands bands={bands} deals={bandsCount}");
  });

  it("owns its data-bar markers: no other file in the repo draws them", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        if (n === "node_modules" || n.startsWith(".")) return [];
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
      });
    const files = [...walk(join(process.cwd(), "app")), ...walk(join(process.cwd(), "lib"))];
    for (const marker of ["buybox-track", "buybox-fill", "buybox-redline", "buybox-range", "buybox-deal"]) {
      const holders = files.filter((f) => readFileSync(f, "utf8").includes(`"${marker}"`)).map((f) => f.slice(process.cwd().length + 1));
      expect(holders, marker).toEqual(["app/(app)/criteria/box-bands.tsx"]);
    }
  });
});

describe("a teammate's read-only view of the team's box: the same tracks, never a list of ticks", () => {
  const TEAM_BOX: BuyBox = {
    ...BOX,
    assetClasses: ["multifamily"],
    geos: [{ label: "Philadelphia PA" }],
    minIrrPct: 14,
    dealbreakers: { ...BOX.dealbreakers, requireAssetClass: true },
    notes: "Value-add only.",
  };

  it("lists only the criteria no track draws, in the box's own words", () => {
    const lines = boxLinesBeyondBands(TEAM_BOX);
    expect(lines).toEqual([
      "Asset classes: multifamily",
      "Geography: Philadelphia PA",
      "Target base-case IRR: 14%+",
      "Dealbreakers: asset class must be in the mandate",
      "Priorities: Value-add only.",
    ]);
    // Each is a line the full list says, word for word — the red lines'
    // line less the figures the tracks draw as red lines.
    for (const l of lines.filter((x) => !x.startsWith("Dealbreakers:"))) expect(buyBoxLines(TEAM_BOX)).toContain(l);
    // A box of bands alone leaves nothing to list.
    expect(boxLinesBeyondBands(BOX)).toEqual([]);
  });

  it("draws the team's box as the owner's page draws it, with nothing to lint", () => {
    const bands = boxBands(TEAM_BOX, DEALS);
    const html = renderToStaticMarkup(
      h(ReadOnlyBox, { teamName: "Ridgeline", mandate: { name: "Core-plus", of: 2 }, bands, deals: DEALS.length, lines: boxLinesBeyondBands(TEAM_BOX) }),
    );
    expect(html).toContain('data-qa="team-box"');
    // The same tracks as the owner's card: the bands' body is one component.
    // (the owner of a team's box sees the team's deals too)
    const owner = renderToStaticMarkup(h(BoxBands, { bands, deals: DEALS.length, of: { team: true } }));
    const body = (s: string) => s.slice(s.indexOf('<div data-qa="box-bands-body">'), s.indexOf("</ul></div>", s.indexOf('<div data-qa="box-bands-body">')));
    expect(body(html)).toBe(body(owner));
    expect((html.match(/data-bar="buybox-track"/g) ?? []).length).toBe(5);
    expect(html).not.toContain("✓");
    const text = visibleText(html);
    expect(text).toContain("Ridgeline’s criteria");
    expect(text.replace(/\s+/g, " ")).toContain("Active mandate: Core-plus (of 2).");
    expect(text).toContain("Asset classes: multifamily");
    expect(text).not.toContain("Min going-in cap");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says the owner has set nothing where the team has no box", () => {
    const html = renderToStaticMarkup(h(ReadOnlyBox, { teamName: "Ridgeline", mandate: null, bands: [], deals: 0, lines: null }));
    expect(visibleText(html)).toContain("No criteria set yet — ask the team owner to define them here.");
    expect(html).not.toContain('data-bar="buybox-track"');
    expect(a11yIssues(html)).toEqual([]);
  });

  it("is what the page draws for a teammate who cannot edit", () => {
    const page = readFileSync("app/(app)/criteria/page.tsx", "utf8");
    expect(page).toMatch(/!active\.editable \? \([\s\S]{0,200}<ReadOnlyBox/);
    expect(page).toContain("lines={active.box ? boxLinesBeyondBands(active.box) : null}");
    expect(page).not.toContain("buyBoxLines(active.box)");
  });
});
