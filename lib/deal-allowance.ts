// The deals a reader can still add before a plan is needed, counted by the
// create actions' own rule (app/(app)/deals/actions.ts `teamAllowed`, and
// lib/billing's `canCreateDeal`): on a team whose plan or trial allows it,
// the next deal lands in the team's pipeline and comes out of the team's
// trial deals; otherwise it lands in the reader's own pipeline under the
// free cap; a personal Pro plan and an active team plan have no cap. The
// pipeline's meter counted the reader's own deals only, so a member on a
// team trial read "3 free deals left" through every deal the trial took.
// One rule behind every meter — the pipeline's and the account page's —
// so each says what the action will do. Pure: the caller hands in the
// Billing it read (lib/billing `getBilling`); the result is plain data a
// client component can take as a prop.
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { FREE_DEALS } from "@/lib/marketing-constants";

/**
 * The database's own refusal of a deal over its plan's cap (the deals
 * insert trigger, migration 0036, which raises `free_deal_limit_reached` or
 * `team_plan_required`): the app's own read lets a double-submit or a second
 * tab through, and the trigger then refuses the insert. It had read as
 * "Couldn't save the deal. Please try again.", a retry that hits the same
 * cap (research pass 30). Which limit, or null for any other failure.
 */
export function capRefusalOf(err: { message?: string | null } | null | undefined): "limit" | "teamlimit" | null {
  const m = err?.message ?? "";
  if (/\bteam_plan_required\b/.test(m)) return "teamlimit";
  if (/\bfree_deal_limit_reached\b/.test(m)) return "limit";
  return null;
}

/** What the count reads — `Billing` (lib/billing) is one. */
export interface AllowanceFacts {
  /** the reader's own plan: "pro" puts no cap on their own deals */
  plan: "free" | "pro";
  /** the reader's own deals, samples and team deals left out */
  dealCount: number;
  /** the reader's team: whether its plan is active, and its shared deals
   *  (samples left out) — the trial is the team's, whoever added them */
  team: { active: boolean; dealCount: number } | null;
}

/** A pool of free deals: how many are used, of how many. */
export interface AllowancePool {
  used: number;
  of: number;
}

export interface DealAllowance {
  /** where the create action puts the next deal: the team's pipeline, the
   *  reader's own, or nowhere until a plan */
  next: "team" | "personal" | null;
  /** the free deals left before a plan is needed — the team's trial first,
   *  then the reader's own; null where nothing caps the next deal (a
   *  personal Pro plan, an active team plan) */
  left: number | null;
  /** the team's trial, while the team is on one; null otherwise */
  teamTrial: AllowancePool | null;
  /** the reader's own free deals, where a cap applies; null otherwise */
  personal: AllowancePool | null;
  /** the count in words — "1 of 3 free deals used", or the team's trial
   *  then the reader's own — for a tooltip or the account page; null where
   *  nothing caps the next deal */
  line: string | null;
}

const pool = (count: number, of: number): AllowancePool => ({ used: Math.min(Math.max(0, count), of), of });

export function dealAllowance(facts: AllowanceFacts): DealAllowance {
  const personalPro = facts.plan === "pro";
  const team = facts.team;
  // The action's rule, word for word: the team's while its plan or trial
  // allows it, else the reader's own under the free cap.
  const teamAllowed = !!team && (team.active || team.dealCount < TEAM_TRIAL_DEALS);
  const personalAllowed = personalPro || facts.dealCount < FREE_DEALS;
  const next = teamAllowed ? "team" : personalAllowed ? "personal" : null;
  // Nothing caps the next deal: it goes to an active team plan, or falls
  // back to a personal Pro plan once the team's trial is spent.
  if (personalPro || team?.active) return { next, left: null, teamTrial: null, personal: null, line: null };
  const teamTrial = team ? pool(team.dealCount, TEAM_TRIAL_DEALS) : null;
  const personal = pool(facts.dealCount, FREE_DEALS);
  const left = (teamTrial ? teamTrial.of - teamTrial.used : 0) + (personal.of - personal.used);
  const own = `${personal.used} of ${personal.of} free deals used`;
  return {
    next,
    left,
    teamTrial,
    personal,
    // The team's trial first: it is where the next deal comes from.
    line: teamTrial ? `Team trial: ${teamTrial.used} of ${teamTrial.of} deals used · Your own: ${own}` : own,
  };
}
