import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Research pass 33 measured a keyboard user's way through the site and found
// the ring missing where the cascade, not the markup, decided it: the global
// :focus-visible rule is unlayered, so it beats every Tailwind utility, and
// the white rings asked for over photographs never applied. These hold the
// unlayered rules that put each ring back, and the hooks they key on.

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const css = src("app/globals.css");

/** The body of the first rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string | null {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the focus ring, wherever a keyboard reaches", () => {
  it("is teal on a white card inside a dark band (the sign-in card), white elsewhere on the band", () => {
    expect(ruleBody(".bg-sidebar :focus-visible,\n.band-dark :focus-visible")).toMatch(/outline-color: rgba\(255, 255, 255, 0\.85\)/);
    expect(ruleBody(".band-dark .bg-surface :focus-visible")).toMatch(/outline-color: var\(--color-brand\)/);
    // The sign-in page is that case: its card sits in the dark band.
    const login = src("app/login/page.tsx");
    expect(login).toMatch(/band-dark/);
    expect(login).toMatch(/bg-surface/);
  });

  it("is white with a dark halo on a control over a photograph, and in the full-screen viewer", () => {
    const body = ruleBody(".focus-on-photo:focus-visible,\n[data-photo-viewer] :focus-visible") ?? "";
    expect(body).toMatch(/outline-color: #fff/);
    expect(body).toMatch(/box-shadow: 0 0 0 6px rgb\(0 0 0 \/ 0\.6\)/);
    const visual = src("app/(app)/deals/[id]/property-visual.tsx");
    expect(visual.match(/focus-on-photo/g)?.length).toBe(2);
    expect(src("app/(app)/deals/[id]/replace-picture.tsx")).toMatch(/overlay: "[^"]*focus-on-photo/);
    expect(src("app/(app)/deals/[id]/photo-viewer.tsx")).toMatch(/data-photo-viewer/);
  });

  it("is drawn inside a mosaic tile, which clips whatever is drawn outside it", () => {
    expect(ruleBody("[data-mosaic-tile]:focus-visible")).toMatch(/outline: none/);
    const ring = ruleBody("[data-mosaic-tile]:focus-visible::after") ?? "";
    expect(ring).toMatch(/content: ""/);
    expect(ring).toMatch(/inset 0 0 0 3px #fff/);
    expect(src("app/(app)/deals/[id]/property-visual.tsx")).toMatch(/data-mosaic-tile=\{g\.i\}/);
  });

  it("never sits in the base layer, where `outline-none` would take it off some sixty controls", () => {
    const base = css.slice(css.indexOf("@layer base"));
    expect(base.slice(0, base.indexOf("}\n}") + 3)).not.toMatch(/:focus-visible/);
    expect(css).toMatch(/^:focus-visible \{\n  outline: 2px solid var\(--color-brand\);/m);
  });
});

describe("a focused control is never under a bar that stays on screen (WCAG 2.4.11)", () => {
  it("scrolls clear of the homepage's header, and on a phone of the app's top bar and the deal's foot bar", () => {
    expect(ruleBody("html:has([data-home-bar])")).toMatch(/scroll-padding-top: 4rem/);
    const phone = css.slice(css.indexOf("@media (max-width: 47.99rem)"));
    expect(phone).toMatch(/html:has\(\[data-app-topbar\]\) \{\s*scroll-padding-top: 7\.5rem;/);
    expect(phone).toMatch(/html:has\(\[data-deal-sticky\]:not\(\[inert\]\)\) \{\s*scroll-padding-bottom: 4\.5rem;/);
    expect(src("app/page.tsx")).toMatch(/<header data-home-bar className="sticky top-0/);
    expect(src("app/(app)/app-shell.tsx")).toMatch(/<header data-app-topbar className="sticky top-0/);
    const bar = src("app/(app)/deals/[id]/deal-sticky-bar.tsx");
    expect(bar).toMatch(/data-deal-sticky/);
    expect(bar).toMatch(/inert=\{!shown\}/);
  });

  it("lands an in-page jump under the homepage's header without a second offset", () => {
    // The sections' own scroll margin would add to the padding.
    expect(src("app/page.tsx")).not.toMatch(/scroll-mt-16/);
  });

  it("scrolls smoothly only for a reader who has not asked for less motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n  html \{\n    scroll-behavior: smooth;/);
    expect(css).not.toMatch(/^html \{\n  scroll-behavior: smooth;/m);
  });
});

describe("a forced-colours setting", () => {
  it("keeps the bars' own colours and outlines what is selected", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toMatch(/\[data-bar\] \{\s*forced-color-adjust: none;/);
    expect(fc).toMatch(/\[aria-selected="true"\],\s*\[aria-pressed="true"\],\s*\[aria-current="page"\] \{\s*outline: 2px solid Highlight;/);
  });
});

describe("a placeholder", () => {
  it("reads at the muted text's contrast, and an input's own placeholder colour still wins", () => {
    expect(css).toMatch(/@layer base \{\n  ::placeholder \{\n    color: var\(--color-muted\);/);
  });
});
