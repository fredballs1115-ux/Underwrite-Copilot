// Research pass 33's accessibility fixes, held at the markup a static render
// gives: what a keyboard reaches, what a screen reader is told, and what
// each control is called. The behaviour a render cannot run (a key, a
// timer, focus moving) is held where it can be — a handler's own effect on
// the markup it returns — and every render goes through the lint's
// accessibility floor (`a11yIssues`).
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

// The app shell's two server-side imports — never called in a render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/login/actions", () => ({ signOut: async () => {} }));
import { CompName, CompsMap, type MapComp } from "@/app/(app)/deals/[id]/comps-map";
import { ScrollRegion } from "@/app/scroll-region";
import { ToastProvider, toastLifetime } from "@/app/(app)/toaster";
import { ScreenRunStrip } from "@/app/screen-run-strip";
import { FileField } from "@/app/(app)/file-field";
import { StageFunnel, timelineName } from "@/app/(app)/analytics/charts";
import { AppShell } from "@/app/(app)/app-shell";
import { a11yIssues } from "./render-lint";

const h = React.createElement;

const comp = (over: Partial<MapComp> & Pick<MapComp, "id" | "name">): MapComp => ({
  kind: "om",
  detail: "Sold 2024, 212 units",
  sourceLabel: "OM p. 14",
  sourceHref: null,
  queries: [],
  ...over,
});

describe("the comps table (research pass 33, item 17)", () => {
  it("names a placed comp's 'Show on the map' as a real button, for the comp, and leaves an unplaced one as text", () => {
    let shown = 0;
    const placed = renderToStaticMarkup(h(CompName, { name: "Riverbend & Co", placed: true, onShow: () => shown++ }));
    expect(placed).toMatch(/^<button type="button" title="Show on the map"[^>]*>Riverbend &amp; Co<\/button>$/);
    expect(a11yIssues(placed)).toEqual([]);
    // The cut is on the button, never the cell, so the cell cannot clip its ring.
    expect(placed).toContain("truncate");
    const unplaced = renderToStaticMarkup(h(CompName, { name: "Mill Lofts", placed: false, onShow: () => shown++ }));
    expect(unplaced).not.toContain("<button");
    expect(unplaced).toContain("Mill Lofts");
    expect(shown).toBe(0);
  });

  it("tells a screen reader which column the table is sorted by, and no other", () => {
    const html = renderToStaticMarkup(
      h(CompsMap, {
        subjectLabel: "1 Main St, Philadelphia, PA",
        market: "Philadelphia",
        comps: [comp({ id: "a", name: "Riverbend" }), comp({ id: "b", name: "Mill Lofts", kind: "web" })],
      }),
    );
    // The table opens sorted nearest first.
    const sorted = [...html.matchAll(/<th\b[^>]*aria-sort="([^"]+)"[^>]*>([\s\S]*?)<\/th>/g)];
    expect(sorted.map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").replace(/\s*↓\s*$/, "")])).toEqual([["ascending", "Distance"]]);
    expect(html.match(/aria-sort=/g)?.length).toBe(1);
    // The column header buttons are still the sort controls.
    expect(html).toMatch(/<th\b[^>]*><button type="button"[^>]*>Comp<\/button><\/th>/);
    expect(a11yIssues(html)).toEqual([]);
  });
});

describe("a wide table a keyboard can scroll (research pass 33, item 18)", () => {
  it("is a named region and a Tab stop, keeping the box's own classes and attributes", () => {
    // A data attribute rides through, as the plan grid's `data-qa` does.
    const props = { label: "Rollover schedule", className: "mt-3 rounded-xl", "data-qa": "grid", children: h("table", null) };
    const html = renderToStaticMarkup(h(ScrollRegion, props));
    expect(html).toBe('<div data-qa="grid" role="region" aria-label="Rollover schedule" tabindex="0" class="overflow-x-auto mt-3 rounded-xl"><table></table></div>');
  });

  // The containers the pass flagged (axe's scrollable-region-focusable), each
  // named for its table — and no other overflow container changed.
  const FLAGGED: [string, string[]][] = [
    ["app/(app)/deals/[id]/model-view.tsx", ["Return sensitivity grid", "Assumptions", "Operating cash flow"]],
    ["app/(app)/deals/[id]/rent-roll/dashboard.tsx", ["Rollover schedule"]],
    ["app/(app)/deals/[id]/valuations/valuations-view.tsx", ["Valuations compared", "Value gap by driver"]],
    ["app/(app)/deals/[id]/bridge/bridge-view.tsx", ["IRR change by assumption"]],
    ["app/(app)/deals/[id]/debt-sizer.tsx", ["If rates move", "Amortization preview"]],
    ["app/(app)/deals/[id]/plan-sensitivity.tsx", ["Yield on cost by NOI and budget"]],
  ];
  it.each(FLAGGED)("%s scrolls each flagged table in a named region", (file, labels) => {
    const src = readFileSync(file, "utf8");
    expect([...src.matchAll(/<ScrollRegion label="([^"]+)"/g)].map((m) => m[1])).toEqual(labels);
  });
});

/** Every .tsx source under a directory. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("a copy that says so (research pass 33, items 9 and 25)", () => {
  it("announces every button label that turns to 'Copied', as the market page's citation button does", () => {
    // A label that changes is heard only inside a live region; the button
    // that copies is that region (app/market/copy-cite.tsx's pattern).
    const found: string[] = [];
    const silent: string[] = [];
    for (const file of sources("app")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\?\s*"[Cc]opied/g)) {
        const open = src.lastIndexOf("<button", m.index);
        if (open === -1 || src.lastIndexOf("</button>", m.index) > open) continue;
        found.push(file);
        if (!src.slice(open, m.index).includes('aria-live="polite"')) silent.push(file);
      }
    }
    expect(found.sort()).toEqual(
      [
        "app/(app)/deals/[id]/bridge/bridge-view.tsx",
        "app/(app)/deals/[id]/share-control.tsx",
        "app/(app)/deals/[id]/valuations/valuations-view.tsx",
        "app/market/copy-cite.tsx",
        "app/tools/deal-math-tools.tsx",
      ].sort(),
    );
    expect(silent).toEqual([]);
  });

  it("closes the share panel on Escape and hands focus back to the Share button, as the deal menu does", () => {
    // The key itself is a browser's to press (checked in Chromium by hand);
    // the handler and the hand-back are held here.
    const src = readFileSync("app/(app)/deals/[id]/share-control.tsx", "utf8");
    expect(src).toMatch(/if \(e\.key !== "Escape"\) return;\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/);
    expect(src).toMatch(/<button\s+ref=\{triggerRef\}[^>]*\n\s*type="button"\n\s*onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/);
  });
});

describe("a placeholder that can be read (research pass 33, item 19)", () => {
  // Muted at 70% read 2.97:1 on the field; the muted token itself reads 5.5:1.
  it.each([
    "app/(app)/deals/[id]/deal-tasks.tsx",
    "app/(app)/deals/[id]/decision-log.tsx",
    "app/(app)/deals/[id]/loi-panel.tsx",
  ])("%s writes its placeholder in the muted token, never a faded one", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("placeholder:text-muted ");
    expect(src).not.toMatch(/placeholder:text-muted\/\d+/);
  });
});

describe("a toast that waits for its reader (research pass 33, item 20)", () => {
  it("keeps an error until it is dismissed, and gives any other toast 4.5 seconds", () => {
    expect(toastLifetime("error")).toBeNull();
    expect(toastLifetime("success")).toBe(4500);
    expect(toastLifetime("info")).toBe(4500);
  });

  it("counts a toast's time on the card, paused while it is hovered or holds focus", () => {
    // The timers run in a browser (checked in Chromium: hovered or focused,
    // a toast stays; let go, it goes in what was left; an error stays).
    const src = readFileSync("app/(app)/toaster.tsx", "utf8");
    const push = src.slice(src.indexOf("const push = useCallback"), src.indexOf("return (", src.indexOf("const push = useCallback")));
    expect(push).not.toContain("setTimeout");
    expect(src).toContain("const paused = hovered || focused;");
    expect(src).toMatch(/if \(ms == null \|\| paused\) return;/);
    for (const handler of ["onMouseEnter", "onMouseLeave", "onFocus", "onBlur"]) expect(src).toContain(`${handler}=`);
  });

  it("keeps the toasts' live region as it was", () => {
    const html = renderToStaticMarkup(h(ToastProvider, null, h("p", null, "page")));
    expect(html).toMatch(/<div aria-live="polite" class="pointer-events-none fixed /);
  });
});

describe("the homepage's running trace can be stopped (research pass 33, item 21)", () => {
  it("carries the tickers' pause button, outside the hidden trace, and every moving part reads its state", () => {
    const html = renderToStaticMarkup(h(ScreenRunStrip));
    // The shared button (app/pausable-ticker), named for what it stops.
    expect(html).toContain('aria-label="Pause the trace"');
    const wrapper = html.match(/<div class="relative mt-4 ([^"]*)">/);
    expect(wrapper?.[1]).toBe("data-[ticker-paused]:[--screenrun-play:paused]");
    // The button is the wrapper's first child, before the aria-hidden block.
    expect(html.indexOf('aria-label="Pause the trace"')).toBeLessThan(html.indexOf('aria-hidden="true"', html.indexOf("relative mt-4")));
    // Six lines and the caret, each following the button's state inline.
    const lines = html.match(/class="screenrun-line[^"]*"/g) ?? [];
    expect(lines).toHaveLength(6);
    expect(html.match(/animation-play-state:var\(--screenrun-play, running\)/g)).toHaveLength(7);
    expect(a11yIssues(html)).toEqual([]);
  });
});

// ── Contrast, by arithmetic on the palette's own tokens (item 23) ──────────
type RGB = [number, number, number];
const CSS = readFileSync("app/globals.css", "utf8");
/** A token's colour as globals.css states it, or white. */
function token(name: string): RGB {
  if (name === "white") return [255, 255, 255];
  const hex = new RegExp(`--color-${name}:\\s*#([0-9a-f]{6})`, "i").exec(CSS)?.[1];
  if (!hex) throw new Error(`no --color-${name} in globals.css`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
/** "kill/10" over the layers beneath it, composited in sRGB as a browser
 *  does; the last layer is opaque. */
function layered(spec: string, under: RGB): RGB {
  const [name, pct] = spec.split("/");
  const a = pct == null ? 1 : Number(pct) / 100;
  const c = token(name);
  return c.map((v, i) => v * a + under[i] * (1 - a)) as RGB;
}
function ratio(fg: string, ...backdrop: string[]): number {
  let bg = token(backdrop[backdrop.length - 1]);
  for (const layer of backdrop.slice(0, -1).reverse()) bg = layered(layer, bg);
  const lum = (rgb: RGB) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(layered(fg, bg)), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("text that reads at 4.5:1 where the pass measured it under (research pass 33, item 23)", () => {
  const src = (f: string) => readFileSync(f, "utf8");

  it("the news sources that did not answer: muted, not faded, on the canvas", () => {
    expect(ratio("muted/70", "canvas")).toBeLessThan(4.5);
    expect(ratio("muted", "canvas")).toBeGreaterThanOrEqual(4.5);
    expect(src("app/(app)/news/live-headlines.tsx")).toContain('state === "off" ? "text-muted" : "text-ink"');
  });

  it("the research panel's and the law feed's red is the palette's kill", () => {
    expect(ratio("kill", "kill/10", "surface")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("kill", "kill/5", "canvas")).toBeGreaterThanOrEqual(4.5);
    for (const f of ["app/(app)/deals/[id]/research-panel.tsx", "app/(app)/news/scored-feed.tsx"]) {
      expect(src(f)).not.toMatch(/\b(?:bg|text|border)-red-\d{3}\b/);
    }
    expect(src("app/(app)/deals/[id]/research-panel.tsx")).toContain('applies: { label: "Applies", cls: "bg-kill/10 text-kill" }');
    expect(src("app/(app)/news/scored-feed.tsx")).toContain('<h2 className="text-xs font-semibold uppercase tracking-wide text-kill">');
  });

  it("a deal-type panel's tile label is its tone, never 80% of it", () => {
    for (const tone of ["pass", "caution", "kill"]) {
      // The worst case: a tinted tile on a panel flagged caution, on white.
      expect(ratio(`${tone}/80`, `${tone}/5`, "caution/5", "surface")).toBeLessThan(4.5);
      expect(ratio(tone, `${tone}/5`, "caution/5", "surface")).toBeGreaterThanOrEqual(4.5);
    }
    for (const f of ["site-reports-panel", "student-housing-panel", "regulation-panel", "self-storage-panel", "manufactured-housing-panel"]) {
      expect(src(`app/${f}.tsx`)).toContain('className="block text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>');
      expect(src(`app/${f}.tsx`)).not.toContain("opacity-80");
    }
  });

  it("the actuals card's In line and Material chips, on its faint comparison box", () => {
    for (const tone of ["pass", "caution"]) {
      expect(ratio(tone, `${tone}/10`, "faint/60", "surface")).toBeLessThan(4.5);
      expect(ratio(tone, `${tone}/5`, "faint/60", "surface")).toBeGreaterThanOrEqual(4.5);
    }
    const s = src("app/(app)/deals/[id]/property-actuals.tsx");
    expect(s).toContain('in_line: { label: "In line", cls: "bg-pass/5 text-pass" }');
    expect(s).toContain('material: { label: "Material", cls: "bg-caution/5 text-caution" }');
  });

  it("the homepage's tool groups on the dark band and its FAQ numbers, the row and its hover", () => {
    expect(ratio("white/45", "sidebar")).toBeLessThan(4.5);
    expect(ratio("white/55", "sidebar")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("brand/80", "surface")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("brand/80", "faint")).toBeGreaterThanOrEqual(4.5);
    const s = src("app/page.tsx");
    expect(s).toMatch(/tracking-widest text-white\/55">\s*\{group\}/);
    expect(s).toContain('<span className="font-mono text-xs tabular-nums text-brand/80">');
  });

  it("the market page's dash for a figure the research does not state", () => {
    expect(ratio("line", "surface")).toBeLessThan(3);
    expect(ratio("muted", "surface")).toBeGreaterThanOrEqual(4.5);
    expect(src("app/market/page.tsx")).toContain('{value ?? <span className="text-muted">—</span>}');
  });

  it("the news page's source and kicker links are 24px tall without moving their line (WCAG 2.5.8)", () => {
    // Measured by the pass's own method in Chromium at 390 and 1280: every
    // target passes, none overlaps another, and no link's text moves; on a
    // phone, the wrapped source line's rows sit 4px further apart.
    const s = src("app/(app)/news/live-headlines.tsx");
    expect(s).toContain('aria-label="Sources" className="flex flex-wrap items-center gap-x-3.5 gap-y-2');
    expect(s).toContain('className="-my-1 inline-flex items-center gap-1.5 py-1 hover:text-brand"');
    expect(s).toContain('className="-my-1 inline-flex py-1 hover:text-brand"');
    expect(s).toContain('className="-mt-2.5 inline-block pt-2.5 text-ink hover:text-brand"');
  });
});

describe("smaller semantics (research pass 33, item 25)", () => {
  it("a file field is one Tab stop, its button, while the hidden input keeps its name", () => {
    const html = renderToStaticMarkup(h(FileField, { name: "doc", accept: "application/pdf" }));
    const input = html.match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('tabindex="-1"');
    expect(input).toContain('aria-label="Choose file"');
    expect(input).toContain("required");
    expect(html).toMatch(/<button type="button"[^>]*>Choose file<\/button>/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("the stage funnel's bars stay out of the accessibility tree, the label and count beside each read as text", () => {
    const html = renderToStaticMarkup(
      h(StageFunnel, { rows: [{ label: "Screening", count: 4 }, { label: "Underwriting", count: 2 }, { label: "LOI", count: 1 }] }),
    );
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    // The hover readout stays, and the figures are text.
    expect(html).toContain("<title>Screening: 4</title>");
    expect(html).toMatch(/>Screening<\/span>[\s\S]*?>4<\/span>/);
  });

  it("names the scatter by its span and range where the points give them, and by its count and median always", () => {
    const pct = (v: number) => `${v.toFixed(1)}%`;
    const p = (at: string, value: number) => ({ at, value });
    expect(timelineName([p("2026-01-12T12:00:00Z", 5.7), p("2026-04-02T12:00:00Z", 8.1), p("2026-09-20T12:00:00Z", 5.9)], pct)).toBe(
      "3 deals over time, from Jan 2026 to Sep 2026; median 5.9%, lowest 5.7%, highest 8.1%",
    );
    // One month is no span; one value is no range.
    expect(timelineName([p("2026-08-11T12:00:00Z", 6), p("2026-08-12T12:00:00Z", 6), p("2026-08-13T12:00:00Z", 6)], pct)).toBe(
      "3 deals over time, in Aug 2026; median 6.0%",
    );
  });

  it("names the sidebar's links the primary navigation, inside the aside that also holds the account", () => {
    const html = renderToStaticMarkup(h(AppShell, { userEmail: "analyst@example.com", children: h("p", null, "page") }));
    const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(aside).toMatch(/<nav aria-label="Primary"[^>]*>[\s\S]*?href="\/deals"[\s\S]*?<\/nav>/);
    expect(aside).toContain("Sign out");
    // The phone's header carries the same links under the same name; the
    // two are never displayed at once (hidden md:flex / md:hidden).
    expect(html.match(/<nav aria-label="Primary"/g)).toHaveLength(2);
    expect(html).toContain('<nav aria-label="Terms and policies"');
    expect(html.match(/<nav(?![^>]*aria-label)/g)).toBeNull();
  });
});
