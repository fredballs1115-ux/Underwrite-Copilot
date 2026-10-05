import { describe, expect, it } from "vitest";
import { revealScrollLeft } from "./tab-strip";

// A 390px phone: the page's 20px gutters leave the strip 350px, its last
// 28px faded (1.75rem), and the five tabs scroll 640px wide.
const phone = { left: 20, clientWidth: 350, scrollWidth: 640, scrollLeft: 0 };
const FADE = 28;

describe("revealScrollLeft — the strip, never the page, brings the selected tab into view", () => {
  it("brings a tab sitting off the strip's end into the middle of what shows", () => {
    // The research pass's Analyses tab, at x 369–497 with the strip at rest.
    const left = revealScrollLeft(phone, { left: 369, right: 497 }, FADE);
    expect(left).toBe(252);
    // Scrolled there, the tab sits wholly inside the unfaded strip.
    const shifted = { left: 369 - left!, right: 497 - left! };
    expect(shifted.left).toBeGreaterThanOrEqual(phone.left);
    expect(shifted.right).toBeLessThanOrEqual(phone.left + phone.clientWidth - FADE);
    expect(revealScrollLeft({ ...phone, scrollLeft: left! }, shifted, FADE)).toBeNull();
  });

  it("leaves a tab that already shows where it is — a tap on it never moves the strip", () => {
    expect(revealScrollLeft(phone, { left: 24, right: 132 }, FADE)).toBeNull();
  });

  it("counts a tab under the faded edge as not yet in view", () => {
    // In the strip's box, but its right end under the fade.
    expect(revealScrollLeft(phone, { left: 260, right: 360 }, 0)).toBeNull();
    expect(revealScrollLeft(phone, { left: 260, right: 360 }, FADE)).not.toBeNull();
  });

  it("stops at either end of what the strip can scroll", () => {
    // The last tab cannot be centred: the strip scrolls only so far.
    expect(revealScrollLeft(phone, { left: 520, right: 630 }, FADE)).toBe(290);
    // Scrolled right, the first tab comes back to the start.
    expect(revealScrollLeft({ ...phone, scrollLeft: 290 }, { left: -266, right: -158 }, FADE)).toBe(0);
  });

  it("does nothing on a strip with room for every tab", () => {
    const desktop = { left: 160, clientWidth: 960, scrollWidth: 960, scrollLeft: 0 };
    expect(revealScrollLeft(desktop, { left: 517, right: 630 })).toBeNull();
  });
});
