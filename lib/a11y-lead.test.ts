import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { a11yIssues } from "@/lib/render-lint";

vi.mock("@/app/login/actions", () => {
  const none = async () => null;
  return { authenticate: none, requestPasswordReset: none, resendConfirmation: none };
});
import { LoginForm } from "@/app/login/login-form";

// Research pass 33's items the lead fixed, held where a render can see them.

const playground = (): string => {
  const ex = SAMPLE_DEAL.extraction;
  const data: PlaygroundData = {
    inputs: sampleDerivedInputs().inputs,
    dealAssetClass: SAMPLE_DEAL.asset_class,
    checkSource: { assetClass: ex.assetClass, market: ex.market, metrics: ex.metrics },
    box: SAMPLE_DEMO_BOX,
  };
  return renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
};

describe("the deal page's sensitivity sliders (research pass 33, item 10)", () => {
  it("say the figure each stop sets, never the stop's index", () => {
    const html = playground();
    const sliders = html.match(/<input type="range"[^>]*>/g) ?? [];
    expect(sliders.length).toBeGreaterThan(2);
    for (const s of sliders) expect(s).toMatch(/aria-valuetext="[^"]*\d[^"]*%?[^"]*"/);
    // The exit cap opens on the base, said as the base.
    expect(html).toMatch(/aria-label="Exit cap scenario"[^>]*aria-valuetext="5\.45%, the base"|aria-valuetext="5\.45%, the base"[^>]*aria-label="Exit cap scenario"/);
  });

  it("say the headline return to a screen reader as a lever moves, and nothing else", () => {
    const html = playground();
    const status = /<p role="status" class="sr-only">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    expect(status).toMatch(/^Levered IRR \d+\.\d%, the base case$/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("keep a word apart from the figure before it", () => {
    // "5.45%base 5.45%" was one word to a screen reader: the margin spaced
    // it on screen only.
    const html = playground();
    expect(html).not.toMatch(/%<span class="ml-/);
  });
});

describe("the sign-in page's mode toggle (research pass 33, item 14)", () => {
  it("is two pressed-or-not buttons, never tabs the arrow keys do not move", () => {
    const html = renderToStaticMarkup(React.createElement(LoginForm, { initialMode: "signin" }));
    expect(html).toMatch(/role="group" aria-label="Sign in or create account"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sign in</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Create account</);
    expect(html).not.toMatch(/role="tab"/);
    expect(a11yIssues(html)).toEqual([]);
  });
});

describe("the ⌘K palette (research pass 33, item 11)", () => {
  // No render reaches it (it opens on a key), so its source is held: the
  // search field is the dialog's one stop, and Tab stays on it.
  const palette = readFileSync(join(process.cwd(), "app/(app)/command-palette.tsx"), "utf8");
  it("keeps Tab inside the dialog, the arrows moving through the results", () => {
    expect(palette).toMatch(/\} else if \(e\.key === "Tab"\) \{[\s\S]{0,400}?e\.preventDefault\(\);/);
    expect(palette).toMatch(/aria-label="Close command palette"/);
    expect(palette).toMatch(/tabIndex=\{-1\}\s*aria-label="Close command palette"/);
    expect(palette).toMatch(/type="button"\s*tabIndex=\{-1\}\s*onClick=\{\(\) => go\(item\)\}/);
  });
});

describe("the sample deal's guide at 320px (research pass 33, item 12)", () => {
  it("lets each card shrink, so the hint truncates rather than spill past the column", () => {
    const guide = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/sample-guide.tsx"), "utf8");
    expect(guide).toMatch(/<li key=\{s\.title\} className="min-w-0">/);
  });
});

describe("the call chips and a range's base read at 4.5:1 (research pass 33, item 6)", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
    });
  it("never sets a call's words on its own colour at 15% (4.3:1), only at 10% (4.6:1)", () => {
    const offenders = walk(join(process.cwd(), "app")).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => (/bg-pass\/15/.test(l) && /text-pass/.test(l)) || (/bg-caution\/15/.test(l) && /text-caution/.test(l)))
        .map((l) => `${f}: ${l.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("draws a range's base on an opaque tint, so the grid's line colour never shows through", () => {
    const opaque = /bg-\[color-mix\(in_oklab,var\(--color-brand\)_(?:5|10)%,var\(--color-surface\)\)\]/;
    expect(readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-sections.tsx"), "utf8")).toMatch(opaque);
    expect(readFileSync(join(process.cwd(), "app/share/[token]/share-view.tsx"), "utf8")).toMatch(opaque);
    expect(readFileSync(join(process.cwd(), "app/landing-interactive.tsx"), "utf8")).toMatch(opaque);
  });
});
