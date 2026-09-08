// The text and accessibility lint the render tests and the public-page lint
// share (lib/render-lint.ts): what it must catch, and what it must let
// through — a unit suffix, a hyphenated "to-do", and a git sha, which is
// digits and letters by nature. live-verify once went red on its own build
// stamp ("543ebdb").
import { describe, expect, it } from "vitest";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

describe("gluedWords", () => {
  it("flags a digit run into a word, a doubled word and a doubled article", () => {
    expect(gluedWords("9real scenarios, aboutabout half a minute, the the number")).toEqual([
      "9real",
      "aboutabout",
      "the the",
    ]);
    expect(gluedWords("29machine-evaluable rules")).toEqual(["29machine"]);
  });

  it("lets a unit suffix, a hyphenated to-do and a git sha through", () => {
    expect(gluedWords("5yr hold, 30bps wider, 250sf, 2BR/1BA, 3rd floor")).toEqual([]);
    expect(gluedWords("From verdict to to-do list")).toEqual([]);
    expect(gluedWords("build 543ebdb · commit 6e0f0f9 · a7c2c4f")).toEqual([]);
    // A short hex-looking word is still a glued word: "2decade" is not a sha
    // shape below seven characters, and "5fee" is not either.
    expect(gluedWords("5fee")).toEqual(["5fee"]);
  });
});

describe("visibleText + a11yIssues", () => {
  it("reads the visible text with block boundaries and entities resolved", () => {
    expect(visibleText("<p>29<!-- --> <span>machine-evaluable</span> rules &amp; more</p>")).toBe(
      "29 machine-evaluable\n rules & more\n",
    );
  });

  it("names each accessibility fault once, and passes labelled markup", () => {
    const faulty =
      `<img src="/a.png"><button class="x"></button><a href="/x"></a>` +
      `<input id="q"><select></select><div id="dup"></div><div id="dup"></div>`;
    expect(a11yIssues(faulty).map((f) => f.split(":")[0])).toEqual([
      "img without alt",
      "button with no accessible name",
      "link with no accessible name",
      "input with no label",
      "select with no label",
      'duplicate id "dup" ×2',
    ]);
    const clean =
      `<img src="/a.png" alt="A building"><button aria-label="Close"></button>` +
      `<a href="/x" title="Open"></a><label for="q">Search</label><input id="q">` +
      `<label>Kind <select><option>a</option></select></label><input type="hidden">`;
    expect(a11yIssues(clean)).toEqual([]);
  });

  it("an in-page link must have its target: a skip link to a <main> with no id is a dead first tab stop", () => {
    expect(a11yIssues(`<a href="#main">Skip to content</a><main>…</main>`)).toEqual([
      'in-page link to a missing id "#main"',
    ]);
    expect(a11yIssues(`<a href="#main">Skip to content</a><main id="main">…</main>`)).toEqual([]);
    expect(a11yIssues(`<a href="#faq">FAQ</a><section id="faq"></section>`)).toEqual([]);
  });
});
