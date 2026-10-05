// The free-deal guard in migration 0036 counts with two literals — the team
// trial's deals and a free account's — that the app counts with constants
// (lib/marketing-constants FREE_DEALS, read by lib/billing; lib/teams
// TEAM_TRIAL_DEALS). Changed in one place and not the other, the pages would
// promise one number and the database refuse at another (research pass 42,
// L5). The lock itself is the owner's; this holds the numbers together.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FREE_DEALS } from "./marketing-constants";
import { FREE_DEAL_LIMIT } from "./billing";
import { TEAM_TRIAL_DEALS } from "./teams";

/** The count each refusal in the guard is raised at, by the refusal's name:
 *  the `deal_count >= N` that stands before each `raise exception`. */
function capsIn(sql: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of sql.matchAll(/if deal_count >= (\d+) then\s+raise exception '([a-z_]+)'/g)) out[m[2]] = Number(m[1]);
  return out;
}

const migration = readFileSync("supabase/migrations/0036_security_hardening.sql", "utf8");

describe("migration 0036's free-deal guard", () => {
  it("refuses at the counts the app states", () => {
    const caps = capsIn(migration);
    expect(caps.team_plan_required).toBe(TEAM_TRIAL_DEALS);
    expect(caps.free_deal_limit_reached).toBe(FREE_DEALS);
    expect(FREE_DEAL_LIMIT).toBe(FREE_DEALS);
  });

  it("would catch a count changed on one side only", () => {
    const moved = migration.replace(/if deal_count >= \d+ then(\s+raise exception 'free_deal_limit_reached')/, "if deal_count >= 4 then$1");
    expect(capsIn(moved).free_deal_limit_reached).not.toBe(FREE_DEALS);
    expect(capsIn(moved).team_plan_required).toBe(TEAM_TRIAL_DEALS);
  });
});
