// What /how-we-test says the stress test does NOT check (lib/not-tested),
// held to the code: no item is a row the test strikes, and each "beside it"
// names what that row, or the headline, really shows.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_TESTED } from "./not-tested";
import { HEADLINE_METHOD, STRESS_KEYS, STRESS_METHODS } from "./stress-test-types";
import { CHALLENGE_KEYWORDS, ROSTER_UNTESTED_PCT, VACANCY_UNSUPPORTED_PTS, challengeKey, leaseUpNotModelled } from "./stress-test";
import { BUDGET_STOPS, yieldOnCost } from "./plan-sensitivity";
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
    expect(debt.rules.join(" ")).toContain("A floating quote on file is shown as stated and priced on nothing too, but the OM's own fixed rate is still tested");
    expect(src).not.toMatch(/termSofr|sofrSpread/);
  });

  it("says the concessions an economic T-12 nets in are read on the vacancy row", () => {
    const vacancy = STRESS_METHODS.find((m) => m.key === "vacancy")!;
    expect(vacancy.against.join(" ")).toContain("The deal's T-12: its vacancy and credit loss over gross potential rent, an economic figure");
    expect(readFileSync("lib/stress-test.ts", "utf8")).toMatch(/const ECONOMIC_WORDS = .*concession/);
  });

  it("says the comps' grades are the AI's and no expansion is added to the exit, each beside the row that shows it (the review of 2026-10-23)", () => {
    const basis = STRESS_METHODS.find((m) => m.key === "basis")!;
    expect(basis.rules.join(" ")).toContain("The grades are the comps step's reading of each comp's comparability, the AI's");
    expect(item("comp_grades").beside?.key).toBe("basis");
    expect(readFileSync("lib/anthropic/prompts.ts", "utf8")).toContain("rate it by its COMPARABILITY to the subject");
    const exit = STRESS_METHODS.find((m) => m.key === "exit_cap")!;
    expect(exit.rules.join(" ")).toContain("No expansion over the hold is added to the going-in cap");
    expect(item("cap_expansion").beside?.key).toBe("exit_cap");
    expect(readFileSync("lib/stress-test.ts", "utf8")).toContain("adding some expansion over a hold is a common rule of thumb, which the screen does not hold it to");
  });

  it("says the screening model carries no transfer or recordation tax unless entered, and states no jurisdiction's rate", () => {
    for (const k of STRESS_KEYS) expect(k).not.toMatch(/transfer|recordation/);
    const { inputs } = sampleDerivedInputs();
    expect(inputs.transferTaxPct).toBe(0);
    expect(inputs.recordationTaxPct).toBe(0);
    const src = readFileSync("lib/underwrite/inputs.ts", "utf8");
    expect(src).toMatch(/transferTaxPct: 0,\s+recordationTaxPct: 0,/);
    const why = item("transfer_taxes").why;
    expect(why).toContain("carries none on the purchase or in the cost of sale unless you enter them");
    // No rate, no figure: the item names no jurisdiction's tax.
    expect(why).not.toMatch(/\d/);
    expect(item("transfer_taxes").beside).toBeUndefined();
  });

  it("says a plan's budget and contingency are a sensitivity grid, never a row, and its all-in cost is the price row's on a plan (the review of 2026-10-28)", () => {
    for (const k of STRESS_KEYS) expect(k).not.toMatch(/budget|contingency|absorption|lease_up|schedule|construction/);
    // The plan's grid stresses the budget, both ways, and holds no verdict.
    expect(BUDGET_STOPS.some((b) => b > 0) && BUDGET_STOPS.some((b) => b < 0)).toBe(true);
    expect(item("plan_budget").why).toContain("a grid of savings and overruns, never a verdict");
    const basis = STRESS_METHODS.find((m) => m.key === "basis")!;
    expect(basis.rules.join(" ")).toContain("judged on its all-in cost (the price plus the plan's budget)");
    expect(item("plan_budget").beside).toEqual({ key: "basis", line: expect.stringContaining("the price plus the budget") });
  });

  it("says the lease-up's pace is not modelled, the model's vacancy flat from year one, and where the vacancy row says so", () => {
    expect(leaseUpNotModelled(9.3, 6)).toContain("each runs its vacancy from year one");
    expect(readFileSync("lib/stress-test.ts", "utf8")).toContain("!ctx.plan && doc.e.value! - om.pct > VACANCY_UNSUPPORTED_PTS ? ` ${leaseUpNotModelled(doc.e.value!, om.pct)}`");
    expect(item("lease_up_pace").why).toContain("one vacancy, flat from year one");
    expect(item("lease_up_pace").beside?.line).toContain(`more than ${VACANCY_UNSUPPORTED_PTS} points over a stabilized assumption`);
    const { inputs } = sampleDerivedInputs();
    expect(typeof inputs.vacancyPct).toBe("number");
  });

  it("says no row tests the construction schedule: the yield on cost has no clock", () => {
    expect(yieldOnCost(1_000_000, 20_000_000)).toBe(0.05);
    expect(yieldOnCost.length).toBe(2);
    expect(item("construction_schedule").why).toContain("the yield on cost has no clock");
    expect(item("construction_schedule").beside).toBeUndefined();
  });

  it("says the OM's stated IRR is shown as the OM's and never re-run: it rides beside the two cases, never in them", () => {
    const src = readFileSync("lib/stress-test.ts", "utf8");
    // The reader's figure goes onto the headline as `statedIrr` and nowhere else.
    expect(src.match(/statedIrrOf\(/g)?.length).toBe(2);
    expect(src).toMatch(/statedIrr: statedIrrOf\(ctx\.rows, ex\)/);
    expect(item("om_return").why).toContain("never re-run");
    expect(item("om_return").why).toContain("only where its words call it levered");
  });
});
