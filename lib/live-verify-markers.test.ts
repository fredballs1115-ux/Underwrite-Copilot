import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { DealMathTools } from "@/app/tools/deal-math-tools";

/**
 * Every live-verify marker that greps `/tools` must grep text that is
 * actually in the served HTML.
 *
 * This exists because of a specific false negative. `#319 the clock loses
 * days to the return's due date` grepped
 *
 *     "An extension restores the full 180 days"
 *
 * and read NOT DEPLOYED on run 35164496034 while the card was live and
 * correct. The sentence in the source is
 *
 *     restores the full {EXCHANGE_DAYS} days
 *
 * and React's server renderer puts `<!-- -->` between adjacent text nodes
 * so the client can find the boundary when it hydrates. The literal
 * sentence is therefore not in the bytes, however right the page is.
 *
 * The render tests could never have caught it: they use
 * `renderToStaticMarkup`, which omits those comments, and they read
 * through `visibleText`, which strips them. So this one asserts against
 * `renderToString` — the markup a browser and a `curl` actually receive —
 * and the first test below pins the difference between the two renderers
 * rather than trusting it.
 *
 * A marker is a claim about the live site. A marker that cannot fail, and
 * a marker that fails on a page that is fine, are the same kind of broken.
 *
 * SCOPE: this covers the markers that grep `p_tools2.html` only. The ones
 * against `body.html` (the homepage) are not checked here, because the
 * homepage is a server component that fetches its own data and cannot be
 * rendered from a test the way `DealMathTools` can. Those markers carry
 * the same risk — `#314` greps "more, with no deal behind them", which is
 * safe only because the interpolated `{TOOL_COUNT}` sits just BEFORE the
 * phrase rather than inside it. Keep homepage markers to prose with no
 * `{expression}` in the middle of it, by hand, until there is a way to
 * render that page in a test.
 */

const YML = readFileSync(".github/workflows/live-verify.yml", "utf8");

/** Every `grep -q|-o <pattern> p_tools2.html` the markers run, unescaped. */
function toolsPatterns(): string[] {
  const out: string[] = [];
  // `-q` for a plain presence marker, `-o` where a helper counts the
  // matches because the phrase alone appears more than once. Both are
  // claims about the served bytes and both can go stale the same way.
  // Both quote styles appear: double for prose, single where the pattern
  // itself contains a double quote (`value="$20M"`).
  for (const m of YML.matchAll(/grep -[qo] "((?:[^"\\]|\\.)*)" p_tools2\.html/g)) {
    out.push(m[1].replace(/\\\$/g, "$").replace(/\\"/g, '"'));
  }
  for (const m of YML.matchAll(/grep -[qo] '([^']*)' p_tools2\.html/g)) {
    out.push(m[1].replace(/\\\$/g, "$"));
  }
  return out;
}

describe("the /tools round markers", () => {
  const hydration = renderToString(React.createElement(DealMathTools));
  const staticMarkup = renderToStaticMarkup(React.createElement(DealMathTools));

  it("reads the markers out of the workflow rather than listing them here", () => {
    const patterns = toolsPatterns();
    expect(patterns.length, "no markers found — has the grep shape changed?")
      .toBeGreaterThan(10);
    expect(patterns).toContain("Roll it into the next deal");
  });

  it("is checked against the markup a curl receives, not the static one", () => {
    // The whole point of this file. If React ever stops emitting the
    // separators, this fails and the file can be simplified — but it must
    // not be simplified on an assumption.
    expect(hydration).toContain("<!-- -->");
    expect(staticMarkup).not.toContain("<!-- -->");
  });

  it("greps text that is really in the served HTML", () => {
    for (const p of toolsPatterns()) {
      expect(
        hydration.includes(p),
        `the marker grepping ${JSON.stringify(p)} would read NOT DEPLOYED — ` +
          `the phrase is not in the served HTML, most likely because it ` +
          `spans an interpolated value. Grep prose with no {expression} in it.`,
      ).toBe(true);
    }
  });

  it("would have caught the marker that went wrong", () => {
    // The exact string #319 shipped with, kept as the regression case: it
    // is on the page to a reader and absent from the bytes.
    const broken = "An extension restores the full 180 days";
    expect(hydration.includes(broken)).toBe(false);
    // And it IS there once the separators are taken out, which is what
    // makes this a false negative rather than a missing feature.
    expect(hydration.replace(/<!-- -->/g, "").includes(broken)).toBe(true);
  });
});
