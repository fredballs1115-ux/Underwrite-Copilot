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

  it("holds the expense lines to the operating-expense row's total, each line beside it; no row reads other income, leasing capital or the hold: the model carries one opex line and none of the rest", () => {
    // No key names a line, other income, the reserves, leasing or the hold.
    for (const k of STRESS_KEYS) expect(k).not.toMatch(/mgmt|management|payroll|repair|utilit|income|reserve|leasing|commission|\bti\b|hold|sale|concession/);
    // An expense line's level files on the operating-expense row, which
    // holds the lines' total to the T-12 and shows each line beside it.
    expect(challengeKey(challenge("Management fee of 2.5% is light"))).toBe("opex");
    expect(challengeKey(challenge("Payroll per unit"))).toBe("opex");
    expect(challengeKey(challenge("RUBS and parking upside"))).toBe("other");
    const opex = STRESS_METHODS.find((m) => m.key === "opex")!;
    expect(opex.against[1]).toMatch(/^Each T-12 expense line a unit .*shown beside it, never deciding$/);
    expect(item("expense_lines").beside?.key).toBe("opex");
    const src = readFileSync("lib/stress-test.ts", "utf8");
    expect(src).toMatch(/label: T12_OPEX_LINES_LABEL,\s+text: [^\n]+\n\s+value: null,/);
    // Other income is shown beside the NOI, never a row of its own.
    expect(STRESS_METHODS.find((m) => m.key === "noi")!.against.join(" ")).toContain("The OM's other income against the T-12's, where both state one, in words beside it and never deciding");
    expect(item("other_income").beside?.line).toContain("other income against the T-12's");
    const { inputs, sources } = sampleDerivedInputs();
    expect(inputs.expenseLines).toHaveLength(1);
    expect(inputs.otherRevenueAnnual).toBe(0);
    expect(inputs.expenseRecoveriesAnnual).toBe(0);
    expect(inputs.tiPsf).toBe(0);
    expect(inputs.lcPct).toBe(0);
    expect(inputs.holdMonths).toBe(HOLD_MONTHS);
    expect(item("hold_and_sale").why).toContain(`${HOLD_MONTHS / 12}-year hold`);
    // The reserve is the higher of the OM's stated figure and the class's
    // default; on the sample the OM's is the higher, and the note says so.
    expect(sources.reservesPsf?.note).toMatch(/^The OM's stated .* above the multifamily default of .* the model never runs more optimistic than the OM$/);
    expect(item("reserves").why).toContain("the higher of the OM's stated replacement reserve and the class's default");
  });

  it("files loss-to-lease and a market rent on the market-rent row, and says how fast the gap closes is not tested", () => {
    expect(challengeKey(challenge("Loss-to-lease burn-off"))).toBe("market_rent");
    expect(challengeKey(challenge("Market rent on turnover"))).toBe("market_rent");
    expect(CHALLENGE_KEYWORDS.find((k) => k.key === "market_rent")!.re.test("loss to lease")).toBe(true);
    const rent = STRESS_METHODS.find((m) => m.key === "market_rent")!;
    expect(rent.against[1]).toContain("The deal's rent roll: its in-place rent on the same yardstick, the gap the OM claims to close");
    expect(rent.limits).toContain("How fast the in-place rent reaches the market rent is not tested.");
    expect(item("loss_to_lease_burn_off").beside).toEqual({ key: "market_rent", line: expect.stringContaining("the gap the OM claims to close") });
  });

  it("says the headline names a rolling roster, at the stress test's own share", () => {
    expect(HEADLINE_METHOD.limits.join(" ")).toContain(`a tenant roster rolls ${ROSTER_UNTESTED_PCT}% or more of its listed rent in one year before the model's sale`);
    expect(item("leasing_capital").beside?.line).toContain(`${ROSTER_UNTESTED_PCT}% or more`);
  });

  it("says the debt row is unchecked with no stated rate or a floating one, its lender tests beside it, and prices no floating loan against SOFR", () => {
    const src = readFileSync("lib/stress-test.ts", "utf8");
    expect(src).toContain('if (!om) return unchecked("debt", omSays, evidence, NO_FIGURE("loan rate"));');
    expect(src).toContain('if (rateRow && floating) return unchecked("debt", omSays, evidence, floatingRateWhy(rateRow.value.trim(), floating));');
    expect(src).toContain('label: "Lender tests at screening defaults, the binding one named"');
    const debt = STRESS_METHODS.find((m) => m.key === "debt")!;
    // A lender's quote on file decides first; else today's index plus the
    // class's spread, the Treasury tenor nearest the OM's stated loan term.
    expect(debt.against[0]).toMatch(/^The lender's quote on file/);
    expect(debt.against.some((a) => /today's index \(the Treasury tenor nearest the OM's stated loan term where read, else the hold's/.test(a))).toBe(true);
    // A floating rate is recognised and priced on nothing: no SOFR pricing.
    expect(src).toContain("floatingRateOf");
    expect(debt.limits.join(" ")).toContain("priced on nothing: the row stands unchecked");
    expect(item("floating_rate").why).toContain("priced on nothing: the debt row stands unchecked");
    // A floating quote on file is not the OM's floating rate: the quote is
    // shown as stated, and the OM's fixed rate is held to the screening default.
    expect(item("floating_rate").why).toContain("A floating quote on file is shown as stated; the OM's rate meets the screening default.");
    expect(debt.limits.join(" ")).toContain("A floating quote on file is shown as stated and priced on nothing too, but the OM's own fixed rate is still tested");
    expect(src).not.toMatch(/termSofr|sofrSpread/);
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
