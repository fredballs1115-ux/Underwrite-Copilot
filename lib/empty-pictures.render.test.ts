/**
 * Sentence-only empty states get a picture (app/empty-pictures,
 * app/stage-icons). Each picture is plainly a placeholder: hidden from a
 * screen reader, dashed or muted, and carrying no figure a reader could take
 * for data. The stage icons the homepage's rail draws moved to a module of
 * their own, and their markup is held here to what the homepage drew before.
 */
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { SCREEN_STAGES } from "./screen-stages";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/deals/[id]/submarket-actions", () => ({
  linkSubmarket: async () => {},
  dismissSubmarketWarning: async () => {},
  restoreSubmarketWarning: async () => {},
}));
vi.mock("@/app/(app)/submarkets/actions", () => ({
  createSubmarket: async () => {},
}));

import { STAGE_ICON, StageIcon } from "@/app/stage-icons";
import { EMPTY_GLYPH, EmptyCard, EmptyNote, GhostTrend, StageRailGhost } from "@/app/empty-pictures";
import { EmptyState, OverviewView } from "@/app/(app)/deals/[id]/deal-sections-base";
import { DecisionLog } from "@/app/(app)/deals/[id]/decision-log";
import { DealTasks } from "@/app/(app)/deals/[id]/deal-tasks";
import { DualAxisTrend } from "@/app/(app)/submarkets/[id]/trend-chart";
import { SubmarketsPanel } from "@/app/market/submarkets-panel";
import { SubmarketCard } from "@/app/(app)/deals/[id]/submarket-card";

const h = React.createElement;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

function lint(markup: string) {
  expect(a11yIssues(markup)).toEqual([]);
  expect(gluedWords(visibleText(markup))).toEqual([]);
}

/** Every placeholder picture in the markup: hidden from a screen reader and
 *  carrying no words or figures of its own. */
function placeholders(markup: string): string[] {
  const found = [...markup.matchAll(/<(\w+)[^>]*data-empty-picture="([\w-]+)"[^>]*>/g)];
  for (const m of found) {
    expect(m[0], `${m[2]} is aria-hidden`).toMatch(/aria-hidden="true"/);
  }
  // A placeholder draws no text: no <text> node in its SVGs.
  expect(markup).not.toMatch(/data-empty-picture[^]*?<text/);
  return found.map((m) => m[2]);
}

// What the homepage's rail drew before the icons moved (app/page.tsx's own
// Icon wrapper, copied here as it stood).
const oldIcon = (...children: ReactNode[]) =>
  h(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: "h-5 w-5",
      "aria-hidden": true,
    },
    ...children,
  );
const p = (d: string) => h("path", { d });
const c = (cx: string, cy: string, r: string) => h("circle", { cx, cy, r });
const OLD: Record<string, ReactNode> = {
  signal: oldIcon(p("M13 2 4 14h7l-1 8 9-12h-7z")),
  extract: oldIcon(p("M6 2h9l5 5v15H6z"), p("M14 2v6h6"), p("M9 13h6M9 17h6")),
  challenge: oldIcon(c("12", "12", "9"), c("12", "12", "4"), p("M12 3v2M12 19v2M3 12h2M19 12h2")),
  comps: oldIcon(p("M4 20v-9M10 20V5M16 20v-6M2 20h20")),
  market: oldIcon(p("M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"), c("12", "10", "2.5")),
  verdict: oldIcon(c("12", "12", "9"), p("m8.5 12 2.5 2.5 4.5-5")),
};
const frag = (n: ReactNode) => h(React.Fragment, null, n);

describe("the stage icons (app/stage-icons)", () => {
  it("draw exactly what the homepage's rail drew before they moved", () => {
    for (const s of SCREEN_STAGES) {
      expect(html(frag(STAGE_ICON[s.key])), s.key).toBe(html(frag(OLD[s.key])));
    }
  });

  it("take a size, and stay decorative", () => {
    const small = html(h(StageIcon, { stage: "market", className: "h-4 w-4" }));
    expect(small).toContain('class="h-4 w-4"');
    expect(small).toContain('aria-hidden="true"');
  });
});

describe("the placeholder pictures (app/empty-pictures)", () => {
  it("the idle rail draws the six stages, none lit", () => {
    const m = html(h(StageRailGhost));
    expect(placeholders(m)).toEqual(["stage-rail"]);
    expect([...m.matchAll(/data-stage="(\w+)"/g)].map((x) => x[1])).toEqual(SCREEN_STAGES.map((s) => s.key));
    expect(m).toContain("border-dashed");
    expect(m).not.toMatch(/bg-brand|text-brand/);
  });

  it("the ghost trend is dashed, with no axis label or figure", () => {
    const m = html(h(GhostTrend));
    expect(placeholders(m)).toEqual(["trend"]);
    expect(m).toContain("stroke-dasharray");
    expect(visibleText(m).trim()).toBe("");
  });

  it("an empty note and an empty card put the glyph beside the words", () => {
    const note = html(h(EmptyNote, { icon: EMPTY_GLYPH.tasks, children: "Nothing yet." }));
    expect(placeholders(note)).toEqual(["icon"]);
    expect(visibleText(note).trim()).toBe("Nothing yet.");
    lint(note);
    const card = html(h(EmptyCard, { icon: EMPTY_GLYPH.scales, title: "No valuations yet", children: "Add one below." }));
    expect(placeholders(card)).toEqual(["icon"]);
    expect(card).toContain("<h2");
    lint(card);
  });
});

describe("the empty states that wear them", () => {
  it("EmptyState takes an icon above its words, and draws none where none is given", () => {
    const withIcon = html(h(EmptyState, { title: "The screen hasn’t run for this deal yet.", icon: STAGE_ICON.extract }));
    expect(placeholders(withIcon)).toEqual(["icon"]);
    lint(withIcon);
    expect(html(h(EmptyState, { title: "No OM uploaded for this deal." }))).not.toContain("data-empty-picture");
  });

  it("the Overview's 'No verdict yet' draws the six-stage rail idle, and none while a screen runs", () => {
    const idle = html(h(OverviewView, { results: {} as never, active: false, onNavigate: () => {} }));
    expect(visibleText(idle)).toContain("No verdict yet");
    expect(placeholders(idle)).toContain("stage-rail");
    lint(idle);
    const running = html(h(OverviewView, { results: {} as never, active: true, onNavigate: () => {} }));
    expect(running).not.toContain('data-empty-picture="stage-rail"');
  });

  it("the decision log and the tasks wear their glyphs when empty", () => {
    const log = html(
      h(DecisionLog, { dealId: "d1", notes: [], stageHistory: [], userEmail: null, userId: null }),
    );
    expect(visibleText(log)).toContain("Nothing logged yet.");
    expect(placeholders(log)).toEqual(["icon"]);
    lint(log);
    const tasks = html(h(DealTasks, { dealId: "d1", tasks: [], assignees: [], todayIso: "2026-10-19" }));
    expect(visibleText(tasks)).toContain("No tasks yet");
    expect(placeholders(tasks)).toEqual(["icon"]);
    lint(tasks);
  });

  it("a submarket's trend, the submarkets panel and the deal's unlinked card draw a placeholder", () => {
    const trend = html(
      h(DualAxisTrend, { bars: [], barLabel: "Vacancy", segments: [], lineLabel: "Asking rent", formatBar: String, formatLine: String }),
    );
    expect(visibleText(trend)).toContain("No periods loaded yet.");
    expect(placeholders(trend)).toEqual(["trend"]);
    lint(trend);

    const panel = html(h(SubmarketsPanel, { submarkets: [] }));
    expect(visibleText(panel)).toContain("No submarkets yet.");
    expect(placeholders(panel)).toEqual(["trend"]);
    lint(panel);

    const sub = {
      id: "s1",
      userId: "u1",
      name: "Navy Yard office",
      metro: null,
      assetClass: "office",
      exclusionRules: { subtypes: [], namePatterns: [], minSf: null, maxSf: null, excludeOwnerOccupied: false },
      supplyWarningMonths: 24,
      notes: null,
      createdAt: "2026-01-02T00:00:00Z",
    };
    const card = html(h(SubmarketCard, { dealId: "d1", view: null, warnings: [], submarkets: [sub] }));
    expect(visibleText(card)).toContain("Link a submarket");
    expect(placeholders(card)).toEqual(["icon"]);
    lint(card);
  });
});
