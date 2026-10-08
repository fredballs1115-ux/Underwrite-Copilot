import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { a11yIssues } from "@/lib/render-lint";
import { askAnsweredLine } from "@/lib/deals";

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

  // The pre-merge audit (C1, L11): a levered IRR that does not solve was
  // read aloud as "Levered IRR —".
  it("say a levered IRR that does not solve in words, never a dash", () => {
    const ex = SAMPLE_DEAL.extraction;
    const data: PlaygroundData = {
      inputs: { ...sampleDerivedInputs().inputs, inPlaceRentAnnual: 0, expenseRecoveriesAnnual: 0, otherRevenueAnnual: 0 },
      dealAssetClass: SAMPLE_DEAL.asset_class,
      checkSource: { assetClass: ex.assetClass, market: ex.market, metrics: ex.metrics },
      box: SAMPLE_DEMO_BOX,
    };
    const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
    const status = /<p role="status" class="sr-only">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    // With its reason (lib/underwrite/no-irr): no rent, so the sale repays
    // nothing of the loan.
    expect(status).toBe("No levered IRR solves at these levers: the sale does not repay the loan");
    expect(status).not.toContain("—");
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

describe("focus never drops to the page, and a status is said (research pass 33, items 8 and 9)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("moves focus to the section a jump link opens", () => {
    expect(src("app/(app)/deals/[id]/deal-view.tsx")).toMatch(
      /function navigateLegacy[\s\S]{0,400}requestAnimationFrame\(\(\) => document\.getElementById\(`tab-\$\{target\.section\}`\)\?\.focus\(\)\)/,
    );
  });

  it("names the delete question and lands on its Cancel; the actions button promises no menu", () => {
    const actions = src("app/(app)/deals/[id]/deal-actions.tsx");
    expect(actions).not.toMatch(/aria-haspopup="menu"/);
    expect(actions).toMatch(/role="group" aria-labelledby=\{`\$\{dealId\}-delete-q`\}/);
    expect(actions).toMatch(/onClick=\{close\}\s*autoFocus[\s\S]{0,200}Cancel/);
  });

  it("sends 'Back to the top' to the deal's title, out of the bar that hides", () => {
    expect(src("app/(app)/deals/[id]/deal-sticky-bar.tsx")).toMatch(/document\.getElementById\("deal-title"\)\?\.focus\(\{ preventScroll: true \}\)/);
    expect(src("app/(app)/deals/[id]/deal-hero.tsx")).toMatch(/<h1 id="deal-title" tabIndex=\{-1\}/);
  });

  it("keeps a saving button focusable and says its pending words once", () => {
    for (const f of ["app/(app)/pending-button.tsx", "app/(app)/deals/[id]/ask-panel.tsx"]) {
      const b = src(f);
      expect(b, f).toMatch(/aria-disabled=\{pending \|\| undefined\}/);
      expect(b, f).toMatch(/onClick=\{pending \? \(e\) => e\.preventDefault\(\) : undefined\}/);
      expect(b, f).toMatch(/role="status" className="sr-only"/);
      expect(b, f).not.toMatch(/disabled=\{(?:disabled \|\| )?pending\}/);
    }
    // The answer's line is keyed to the answer (the pre-merge audit, C1
    // L12): the same words again were never heard, so a second answer went
    // unsaid.
    expect(src("app/(app)/deals/[id]/ask-panel.tsx")).toContain("const answered = state?.ok ? askAnsweredLine(qa.length) : \"\";");
    expect(askAnsweredLine(1)).toBe("Answer 1 is in the thread above.");
    expect(askAnsweredLine(2)).not.toBe(askAnsweredLine(1));
  });

  it("says the screen's step as it changes, never a fixed 'Working', and an error that arrives by the address bar", () => {
    const view = src("app/(app)/deals/[id]/deal-view.tsx");
    expect(view).not.toMatch(/aria-label="Working"/);
    expect((view.match(/<span role="status" className="text-sm">/g) ?? []).length).toBe(2);
    expect(view).toMatch(/<p role="alert" className="flex-1 text-sm font-medium text-kill">/);
    const pipeline = src("app/(app)/deals/pipeline.tsx");
    expect(pipeline).toMatch(/<p role="alert" className="mt-3 rounded-lg bg-kill\/10/);
  });
});

describe("tabs that are tabs, and states said in words (research pass 33, items 14 and 25)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("gives the Analyses tabs and the demo's model views arrow keys, one tab stop and a panel each", () => {
    const view = src("app/(app)/deals/[id]/deal-view.tsx");
    expect(view).toMatch(/aria-label="Analyses"\s*onKeyDown=/);
    expect(view).toMatch(/id=\{`analysis-tab-\$\{a\.key\}`\}[\s\S]{0,200}aria-controls="analysis-tabpanel"\s*tabIndex=\{on \? 0 : -1\}/);
    expect(view).toMatch(/id="analysis-tabpanel"\s*role="tabpanel"\s*aria-labelledby=\{`analysis-tab-\$\{analysis\}`\}/);
    const demo = src("app/demo/model-slideshow.tsx");
    expect(demo).toMatch(/aria-label="Model views"\s*onKeyDown=/);
    expect(demo).toMatch(/tabIndex=\{i === index \? 0 : -1\}/);
    expect(demo).toMatch(/role="tabpanel"\s*aria-labelledby=\{`model-tab-\$\{s\.key\}`\}/);
  });

  it("says what a badge counts, a section that is running, and whether a list or the new-deal form is open", () => {
    const view = src("app/(app)/deals/[id]/deal-view.tsx");
    expect((view.match(/<span className="sr-only">\{` finding\$\{/g) ?? []).length).toBe(2);
    expect(view).toContain('state === "running" ? <span className="sr-only">, running</span> : null');
    expect(src("app/(app)/deals/[id]/deal-sections.tsx")).toMatch(/onClick=\{\(\) => setOpen\(!open\)\}\s*aria-expanded=\{open\}/);
    expect(src("app/(app)/deals/pipeline.tsx")).toMatch(/onClick=\{\(\) => setShowForm\(\(s\) => !s\)\}\s*aria-expanded=\{showForm\}/);
  });
});
