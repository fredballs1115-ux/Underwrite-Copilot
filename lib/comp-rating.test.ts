import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMP_RATING, inCompOrder } from "./comp-rating";

const SECTIONS = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "deal-sections.tsx"), "utf8");

describe("a comp's grade", () => {
  it("is the deal page's, word for word and tone for tone", () => {
    const literal = /const COMP_RATING = \{([\s\S]*?)\} as const;/.exec(SECTIONS)?.[1];
    expect(literal, "deal-sections' COMP_RATING").toBeTruthy();
    const page = [...literal!.matchAll(/(\w+): \{ label: "([^"]+)", badge: "([^"]+)", rank: (\d+) \}/g)].map((m) => [m[1], m[2], m[3], Number(m[4])]);
    expect(page).toEqual(Object.entries(COMP_RATING).map(([k, r]) => [k, r.label, r.badge, r.rank]));
  });

  it("orders the comps as the deal page does: the weakest support first, each keeping its place among equals", () => {
    const comps = [
      { name: "a", support: "supports" },
      { name: "b", support: "stretched" },
      { name: "c", support: "favorable" },
      { name: "d", support: "stretched" },
    ];
    expect(inCompOrder(comps).map((c) => c.name)).toEqual(["b", "d", "c", "a"]);
  });
});
