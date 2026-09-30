// The free-deal meter counts what the create action counts: a member on a
// team trial adds the next deal to the team's pipeline, out of the team's
// trial deals, and only then to their own under the free cap.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dealAllowance } from "./deal-allowance";
import { TEAM_TRIAL_DEALS } from "./teams";
import { FREE_DEALS } from "./marketing-constants";

const free = (dealCount: number, team: { active: boolean; dealCount: number } | null = null) =>
  dealAllowance({ plan: "free", dealCount, team });

describe("dealAllowance — the deals left before a plan, counted by the create action's rule", () => {
  it("off a team, the reader's own free deals", () => {
    expect(free(0)).toEqual({
      next: "personal",
      left: FREE_DEALS,
      teamTrial: null,
      personal: { used: 0, of: FREE_DEALS },
      line: `0 of ${FREE_DEALS} free deals used`,
    });
    expect(free(1)).toMatchObject({ next: "personal", left: FREE_DEALS - 1 });
    // At the cap the action refuses the next deal, and the meter says none.
    expect(free(FREE_DEALS)).toMatchObject({ next: null, left: 0 });
    // A count past the cap (a plan that lapsed) never reads as negative.
    expect(free(FREE_DEALS + 4)).toMatchObject({ next: null, left: 0, personal: { used: FREE_DEALS, of: FREE_DEALS } });
  });

  it("on a team trial, the next deal is the team's, and the reader's own come after", () => {
    // The meter said "3 free deals left" here, and kept saying it through
    // every deal the team's trial took.
    const a = free(0, { active: false, dealCount: 1 });
    expect(a.next).toBe("team");
    expect(a.left).toBe(TEAM_TRIAL_DEALS - 1 + FREE_DEALS);
    expect(a.teamTrial).toEqual({ used: 1, of: TEAM_TRIAL_DEALS });
    expect(a.personal).toEqual({ used: 0, of: FREE_DEALS });
    expect(a.line).toBe(`Team trial: 1 of ${TEAM_TRIAL_DEALS} deals used · Your own: 0 of ${FREE_DEALS} free deals used`);
    // The trial spent: the next deal is the reader's own.
    expect(free(1, { active: false, dealCount: TEAM_TRIAL_DEALS })).toMatchObject({ next: "personal", left: FREE_DEALS - 1 });
    // Both spent: the action refuses, and the meter says none.
    expect(free(FREE_DEALS, { active: false, dealCount: TEAM_TRIAL_DEALS })).toMatchObject({ next: null, left: 0 });
    // A team that had a plan and lost it keeps its deals: the trial reads spent.
    expect(free(0, { active: false, dealCount: 12 }).teamTrial).toEqual({ used: TEAM_TRIAL_DEALS, of: TEAM_TRIAL_DEALS });
  });

  it("nothing caps the next deal on an active team plan or a personal Pro plan — no count at all", () => {
    const uncapped = { left: null, teamTrial: null, personal: null, line: null };
    expect(free(FREE_DEALS, { active: true, dealCount: 40 })).toEqual({ next: "team", ...uncapped });
    expect(dealAllowance({ plan: "pro", dealCount: 40, team: null })).toEqual({ next: "personal", ...uncapped });
    // A Pro member of a team on trial adds to the team while the trial
    // lasts, then to their own pipeline — never refused.
    expect(dealAllowance({ plan: "pro", dealCount: 40, team: { active: false, dealCount: 1 } })).toEqual({ next: "team", ...uncapped });
    expect(dealAllowance({ plan: "pro", dealCount: 40, team: { active: false, dealCount: TEAM_TRIAL_DEALS } })).toEqual({
      next: "personal",
      ...uncapped,
    });
  });

  it("restates the create action's rule and the billing gate's, so a change to either fails here first", () => {
    // The action and lib/billing carry the rule inline; the meters read it
    // from lib/deal-allowance. Held at their source, as the compare page's
    // class is (lib/pipeline-slots.test.ts).
    const actions = readFileSync("app/(app)/deals/actions.ts", "utf8");
    expect(actions.match(/billing\.team\.active \|\| billing\.team\.dealCount < TEAM_TRIAL_DEALS/g) ?? []).toHaveLength(2);
    const billing = readFileSync("lib/billing.ts", "utf8");
    expect(billing).toMatch(/const personalAllowed = personalPro \|\| dealCount < FREE_DEAL_LIMIT;/);
    expect(billing).toMatch(/!!team && \(team\.active \|\| team\.dealCount < TEAM_TRIAL_DEALS\)/);
    expect(billing).toMatch(/const canCreateDeal = teamAllowed \|\| personalAllowed;/);
    expect(billing).toMatch(/export const FREE_DEAL_LIMIT = FREE_DEALS;/);
  });

  it("the pipeline's limit messages read the constants the gates count by, never a typed figure", () => {
    // The page said "the 3-deal limit" and "Your team’s 3 trial deals" in
    // typed words: a changed allowance would have left both saying three.
    const src = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(src).toMatch(/limit: `You’ve reached the \$\{FREE_DEAL_LIMIT\}-deal limit/);
    expect(src).toMatch(/teamlimit: `Your team’s \$\{TEAM_TRIAL_DEALS\} trial deals/);
    expect(src).not.toMatch(/\b\d+(?:-deal limit| free deals?| trial deals?)\b/);
  });
});
