// What /how-we-test says the stress test does NOT check (lib/not-tested),
// held to the code: no item is a row the test strikes, and each "beside it"
// names what that row, or the headline, really shows.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_TESTED } from "./not-tested";
import { HEADLINE_METHOD, STRESS_KEYS, STRESS_METHODS } from "./stress-test-types";
import { CHALLENGE_KEYWORDS, ROSTER_UNTESTED_PCT, challengeKey } from "./stress-test";
import { HOLD_MONTHS } from "./underwrite/inputs";
import { sampleDerivedInputs } from "./sample-derive";
import type { Challenge } from "./anthropic/types";

const item = (id: string) => {
  const found = NOT_TESTED.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};
const challenge = (assumption: string) => ({ assumption }) as unknown as Challenge;

describe("what the test does not check yet", () => {
  it("lists distinct items, none of them a row the stress test strikes", () => {
    const ids = NOT_TESTED.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect((STRESS_KEYS as readonly string[]).includes(id), id).toBe(false);
    const titles = new Set(STRESS_METHODS.map((m) => m.title.toLowerCase()));
    for (const i of NOT_TESTED) {
      expect(titles.has(i.title.toLowerCase()), i.title).toBe(false);
      expect(i.why.length, i.id).toBeLessThanOrEqual(200);
      if (i.beside) expect(i.beside.line.length, i.id).toBeLessThanOrEqual(200);
    }
  });

  it("points each 'beside it' at a row the methods describe, or at the headline", () => {
    const keys = new Set<string>(STRESS_METHODS.map((m) => m.key));
    for (const i of NOT_TESTED) {
      if (!i.beside) continue;
      expect(i.beside.key === "headline" || keys.has(i.beside.key), i.id).toBe(true);
    }
  });

  it("no row reads an expense line, other income, leasing capital or the hold: the model carries one opex line and none of the rest", () => {
    // No key names them.
    for (const k of STRESS_KEYS) expect(k).not.toMatch(/mgmt|management|payroll|repair|utilit|income|reserve|leasing|commission|\bti\b|hold|sale|concession/);
    // A challenge naming one files on no row the engine re-runs.
    expect(challengeKey(challenge("Management fee of 2.5% is light"))).toBe("other");
    expect(challengeKey(challenge("Payroll per unit"))).toBe("other");
    expect(challengeKey(challenge("RUBS and parking upside"))).toBe("other");
    const { inputs, sources } = sampleDerivedInputs();
    expect(inputs.expenseLines).toHaveLength(1);
    expect(inputs.otherRevenueAnnual).toBe(0);
    expect(inputs.expenseRecoveriesAnnual).toBe(0);
    expect(inputs.tiPsf).toBe(0);
    expect(inputs.lcPct).toBe(0);
    expect(inputs.holdMonths).toBe(HOLD_MONTHS);
    expect(item("hold_and_sale").why).toContain(`${HOLD_MONTHS / 12}-year hold`);
    // The reserve is the class's default, an assumption, its note naming the OM's.
    expect(sources.reservesPsf?.provenance).toBe("assumption");
    expect(sources.reservesPsf?.note).toMatch(/the OM states /);
  });

  it("says loss-to-lease is filed on the rent growth row, and the NOI row shows the rent roll's rent in words", () => {
    expect(challengeKey(challenge("Loss-to-lease burn-off"))).toBe("rent_growth");
    expect(challengeKey(challenge("Market rent on turnover"))).toBe("rent_growth");
    expect(CHALLENGE_KEYWORDS.find((k) => k.key === "rent_growth")!.re.test("loss to lease")).toBe(true);
    const noi = STRESS_METHODS.find((m) => m.key === "noi")!;
    expect(noi.against.join(" ")).toContain("The rent roll's in-place rent against the pro forma's, in words beside it");
    expect(item("market_rent").beside).toEqual({ key: "noi", line: expect.stringContaining("in-place rent against the pro forma's") });
  });

  it("says the headline names a rolling roster, at the stress test's own share", () => {
    expect(HEADLINE_METHOD.limits.join(" ")).toContain(`a tenant roster rolls ${ROSTER_UNTESTED_PCT}% or more of its listed rent in one year before the model's sale`);
    expect(item("leasing_capital").beside?.line).toContain(`${ROSTER_UNTESTED_PCT}% or more`);
  });

  it("says the debt row is unchecked with no stated rate, its lender tests beside it, and prices no floating loan against SOFR", () => {
    const src = readFileSync("lib/stress-test.ts", "utf8");
    expect(src).toContain('if (!om) return unchecked("debt", omSays, evidence, NO_FIGURE("loan rate"));');
    expect(src).toContain('label: "Lender tests at screening defaults, the binding one named"');
    // The debt row's decider is the Treasury-tenor seed plus the class's spread.
    const debt = STRESS_METHODS.find((m) => m.key === "debt")!;
    expect(debt.against[0]).toMatch(/^Today's index \(the Treasury tenor nearest the hold/);
    expect(src).not.toMatch(/termSofr|sofrSpread|floatingRate/);
  });

  it("says the concessions an economic T-12 nets in are read on the vacancy row", () => {
    const vacancy = STRESS_METHODS.find((m) => m.key === "vacancy")!;
    expect(vacancy.against.join(" ")).toContain("The deal's T-12: its vacancy and credit loss over gross potential rent, an economic figure");
    expect(readFileSync("lib/stress-test.ts", "utf8")).toMatch(/const ECONOMIC_WORDS = .*concession/);
  });

  it("names no stated return the engine re-runs: the stress test reads no IRR row of the OM's", () => {
    const src = readFileSync("lib/stress-test.ts", "utf8");
    expect(src).not.toMatch(/(?:stated|projected|target|quoted)\s*irr/i);
  });
});
