// The public changelog folds a long note behind its opening; the opening
// must be whole sentences, never a mid-word cut, and a short note must come
// back untouched.
import { describe, expect, it } from "vitest";
import { LONG_NOTE, blurbExcerpt, changelogEntries } from "./changelog";

describe("blurbExcerpt — a note's opening, in whole sentences", () => {
  it("returns a short note whole", () => {
    const s = "Analytics counts a plan deal's yield on cost, never a cap.";
    expect(blurbExcerpt(s)).toBe(s);
    expect(blurbExcerpt("  padded  ")).toBe("padded");
  });

  it("ends a long note at a sentence boundary inside the window, with an ellipsis", () => {
    const first = "The deal page had learned to read a conversion as a plan rather than a stabilized building.";
    const second = " Three surfaces that add deals up or hand them to someone else had not.";
    const rest = " Analytics counted a conversion's stabilized cap as a going-in cap, so one plan deal could drag the portfolio's median, and the export followed it.";
    const out = blurbExcerpt(first + second + rest, 200);
    expect(out).toBe(first + second + " …");
    expect(out.length).toBeLessThanOrEqual(205);
  });

  it("breaks at a word when no sentence ends in the back half of the window", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const out = blurbExcerpt(words, 100);
    expect(out.endsWith(" …")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(103);
    expect(/word\d+ …$/.test(out)).toBe(true);
  });

  it("never leaves a dangling comma or dash before the ellipsis", () => {
    const s = "Alpha beta gamma delta epsilon zeta, eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma";
    const out = blurbExcerpt(s, 40);
    expect(/[,;:—–-] …$/.test(out)).toBe(false);
  });

  it("the shipped log's longest note folds and its opening reads", () => {
    const longest = changelogEntries(100).reduce((a, b) => (b.blurb.length > a.blurb.length ? b : a));
    expect(longest.blurb.length).toBeGreaterThan(LONG_NOTE);
    const out = blurbExcerpt(longest.blurb);
    expect(out.length).toBeLessThan(longest.blurb.length);
    expect(out.endsWith("…")).toBe(true);
    expect(longest.blurb.startsWith(out.slice(0, 40))).toBe(true);
  });
});
