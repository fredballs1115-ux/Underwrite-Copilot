import { describe, expect, it } from "vitest";
import { focusPosition, focusStyle, isFocus, thumbFocus } from "./photo-focus";

describe("isFocus — only a point this site kept, since it lands in a style attribute", () => {
  it("takes two shares from 0 to 1 and nothing else", () => {
    expect(isFocus({ x: 0.203, y: 0.719 })).toBe(true);
    expect(isFocus({ x: 0, y: 1 })).toBe(true);
    expect(isFocus({ x: 1.2, y: 0.5 })).toBe(false);
    expect(isFocus({ x: -0.1, y: 0.5 })).toBe(false);
    expect(isFocus({ x: Number.NaN, y: 0.5 })).toBe(false);
    expect(isFocus({ x: "20%", y: 0.5 })).toBe(false);
    expect(isFocus({ x: 0.5 })).toBe(false);
    expect(isFocus(null)).toBe(false);
    expect(isFocus(undefined)).toBe(false);
    expect(isFocus("50% 50%")).toBe(false);
  });
});

describe("focusPosition / focusStyle — the point in CSS, the centre where there is none", () => {
  it("says the point in percent, to a tenth", () => {
    expect(focusPosition({ x: 0.203, y: 0.719 })).toBe("20.3% 71.9%");
    expect(focusPosition({ x: 0, y: 1 })).toBe("0% 100%");
    expect(focusPosition({ x: 1 / 3, y: 0.5 })).toBe("33.3% 50%");
    expect(focusStyle({ x: 0.203, y: 0.719 })).toEqual({ objectPosition: "20.3% 71.9%" });
  });

  it("says nothing where there is no point, so the frame keeps the centre", () => {
    expect(focusPosition(null)).toBeUndefined();
    expect(focusPosition({ x: 2, y: 0 })).toBeUndefined();
    expect(focusStyle(undefined)).toBeUndefined();
    expect(focusStyle({ x: "calc(1px)", y: 0 })).toBeUndefined();
  });
});

describe("thumbFocus — the point inside the square sharp cut around it", () => {
  it("keeps the short side's share and centres the long side's window on the point", () => {
    // 3:2: the square is two thirds of the frame across, centred on the point.
    expect(thumbFocus({ x: 0.5, y: 0.3 }, { width: 1500, height: 1000 })).toEqual({ x: 0.5, y: 0.3 });
    // 2:3: two thirds of the frame down, the same.
    expect(thumbFocus({ x: 0.3, y: 0.5 }, { width: 1000, height: 1500 })).toEqual({ x: 0.3, y: 0.5 });
  });

  it("stops the window at the frame's edges, so a point near one sits off the square's middle", () => {
    // 3:2 with the subject at the far right: the window is the right two
    // thirds, and the subject 85% of the way across it.
    expect(thumbFocus({ x: 0.9, y: 0.4 }, { width: 1500, height: 1000 })).toEqual({ x: 0.85, y: 0.4 });
    expect(thumbFocus({ x: 0.1, y: 0.4 }, { width: 1500, height: 1000 })).toEqual({ x: 0.15, y: 0.4 });
    // A tall photograph whose subject is near its top.
    expect(thumbFocus({ x: 0.6, y: 0.1 }, { width: 1000, height: 2000 })).toEqual({ x: 0.6, y: 0.2 });
  });

  it("is the point itself on a square photograph, and nothing without a point or a size", () => {
    expect(thumbFocus({ x: 0.2, y: 0.8 }, { width: 1200, height: 1200 })).toEqual({ x: 0.2, y: 0.8 });
    expect(thumbFocus(null, { width: 1500, height: 1000 })).toBeUndefined();
    expect(thumbFocus({ x: 0.5, y: 0.5 }, { width: 0, height: 1000 })).toBeUndefined();
    expect(thumbFocus({ x: 0.5, y: 0.5 }, null)).toBeUndefined();
  });
});
