import { describe, expect, it } from "vitest";
import { competitionRanks, ordinal, rankLabel, rankWords } from "./rank";

describe("a place said with what is ranked (first-hour review)", () => {
  it("says the end place 1 is, and the other end, never a bare #1 of 5", () => {
    expect(rankWords({ rank: 1, tied: false }, 5)).toBe("lowest of 5 ranked");
    expect(rankWords({ rank: 5, tied: false }, 5)).toBe("highest of 5 ranked");
    expect(rankWords({ rank: 2, tied: false }, 5)).toBe("2nd lowest of 5 ranked");
    expect(rankWords({ rank: 1, tied: false }, 1)).toBe("the only figure ranked");
  });

  it("gives equal figures one shared place, as competitionRanks does", () => {
    const places = competitionRanks([5, 6, 7, 7, 9], (a, b) => a === b);
    expect(places.map((p) => rankLabel(p))).toEqual(["#1", "#2", "=3", "=3", "#5"]);
    expect(places.map((p) => rankWords(p, 5))).toEqual([
      "lowest of 5 ranked",
      "2nd lowest of 5 ranked",
      "=3rd lowest of 5 ranked",
      "=3rd lowest of 5 ranked",
      "highest of 5 ranked",
    ]);
    // A shared first place, and a shared last place, are shared.
    expect(rankWords({ rank: 1, tied: true }, 4)).toBe("joint lowest of 4 ranked");
    expect(rankWords({ rank: 3, tied: true }, 4)).toBe("=3rd lowest of 4 ranked");
  });

  it("writes ordinals, the teens included", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});
