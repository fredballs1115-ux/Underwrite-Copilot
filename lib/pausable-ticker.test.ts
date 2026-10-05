// WCAG 2.2.2: a band that moves on its own for more than five seconds needs
// a way to stop it. The covered-markets band on /why and /whats-new never
// stopped except under a mouse.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketsMarquee } from "@/app/markets-marquee";
import { a11yIssues } from "./render-lint";

const CSS = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8");

/** The declarations of the rule whose selector list names `selector`. */
function ruleFor(selector: string): { selectors: string; body: string } | null {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (selectors.split(",").map((s) => s.trim()).includes(selector)) return { selectors, body: m[2] };
  }
  return null;
}

describe("the markets band can be stopped", () => {
  it("carries a pause button, named, ahead of the links it stops", () => {
    const html = renderToStaticMarkup(React.createElement(MarketsMarquee));
    expect(a11yIssues(html)).toEqual([]);
    const button = /<button[^>]*aria-label="Pause the markets band"[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).not.toBe("");
    expect(html.indexOf(button)).toBeLessThan(html.indexOf("ticker-track-reverse"));
    // Nothing moves under reduced motion, and a button on paper is dead ink.
    expect(button).toContain("motion-reduce:hidden");
    expect(button).toContain("print:hidden");
    // It starts playing: the paused state is the button's to set.
    expect(html).not.toContain("data-ticker-paused");
  });

  it("stops under the pointer, under the keyboard's focus and at the button", () => {
    const paused = ruleFor(".ticker-track-reverse:hover");
    expect(paused?.body).toMatch(/animation-play-state:\s*paused/);
    expect(paused?.selectors).toContain(".ticker-track-reverse:focus-within");
    expect(paused?.selectors).toContain("[data-ticker-paused] .ticker-track-reverse");
  });

  it("does not move at all under reduced motion", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*\.ticker-track \{[^}]*\}\s*\.ticker-track-reverse \{([^}]*)\}/.exec(CSS);
    expect(reduced?.[1]).toMatch(/animation:\s*none/);
  });
});
