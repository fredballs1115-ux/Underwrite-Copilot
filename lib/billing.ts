import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import {
  FREE_DEALS,
  PRICE_PRO_MONTHLY,
  PRICE_TEAM_BASE_MONTHLY,
  PRICE_TEAM_BASE_MONTHLY_USD,
  PRICE_TEAM_MEMBER_MONTHLY,
  PRICE_TEAM_MEMBER_MONTHLY_USD,
} from "@/lib/marketing-constants";

export type Plan = "free" | "pro";

// Canonical numbers live in lib/marketing-constants (importable from client
// components, unlike this server-only module) — everything here derives, so
// the billing page and the homepage can never quote different prices.
export const FREE_DEAL_LIMIT = FREE_DEALS;
export const PRO_PRICE_LABEL = `${PRICE_PRO_MONTHLY}/mo`;
// Team pricing: a base that INCLUDES the account owner, each ADDED member at
// the per-seat price. In Stripe this is ONE subscription with TWO items — the
// base (STRIPE_TEAM_PRICE_ID, quantity 1) plus the per-seat price
// (STRIPE_TEAM_SEAT_PRICE_ID, quantity = added members). Transitions update
// the existing subscription in place so billing history stays continuous;
// see lib/stripe/team-billing.ts. Teams subscribed before this structure
// carry a single graduated-tier item, which seat syncing still supports.
export const TEAM_BASE_PRICE = PRICE_TEAM_BASE_MONTHLY_USD;
export const TEAM_MEMBER_PRICE = PRICE_TEAM_MEMBER_MONTHLY_USD;
export const TEAM_PRICE_LABEL = `${PRICE_TEAM_BASE_MONTHLY}/mo + ${PRICE_TEAM_MEMBER_MONTHLY}/mo per added member`;

/** Monthly team total for a given member count (owner included). */
export function teamMonthlyTotal(seatCount: number): number {
  if (seatCount <= 0) return 0;
  return TEAM_BASE_PRICE + (seatCount - 1) * TEAM_MEMBER_PRICE;
}

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

/** Paid features (everything else is available on Free). Unlocked by a
 *  personal Pro subscription OR an active Team plan. */
export type ProFeature = "model" | "memo" | "comps";

export interface BillingTeam {
  id: string;
  name: string;
  active: boolean;
  dealCount: number;
}

export interface Billing {
  plan: Plan;
  /** paid features unlocked — personal Pro or active team plan */
  isPro: boolean;
  status: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  dealCount: number;
  dealLimit: number; // free cap; meaningless when Pro
  canCreateDeal: boolean;
  team: BillingTeam | null;
}

/** The caller's team plan state, if they're on a team. */
async function getTeamState(
  supabase: SupabaseClient,
  userId: string,
): Promise<BillingTeam | null> {
  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem) return null;

  const [{ data: team }, { count }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, plan")
      .eq("id", mem.team_id)
      .maybeSingle(),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("team_id", mem.team_id)
      .eq("is_sample", false),
  ]);
  if (!team) return null;
  return {
    id: team.id as string,
    name: team.name as string,
    active: (team.plan as string) === "active",
    dealCount: count ?? 0,
  };
}

/** Read a user's plan + usage. The source of truth for all gating. */
export async function getBilling(
  supabase: SupabaseClient,
  userId: string,
): Promise<Billing> {
  // Billing columns are hidden from user-context reads (migration 0008
  // column grants) — this server-only helper reads them with the service role.
  const admin = createSupabaseAdminClient();
  const [{ data: profile }, countRes, team] = await Promise.all([
    admin
      .from("profiles")
      .select("plan, subscription_status, stripe_customer_id, current_period_end")
      .eq("id", userId)
      .maybeSingle(),
    // Personal (non-team) deals; samples never count toward the cap.
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_sample", false)
      .is("team_id", null),
    getTeamState(supabase, userId),
  ]);

  let dealCount = countRes.count ?? 0;
  if (countRes.error) {
    // Pre-migration-0007 the team_id column doesn't exist — fall back to a
    // plain count so the usage numbers stay honest.
    const retry = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_sample", false);
    dealCount = retry.count ?? 0;
  }

  const plan = (profile?.plan as Plan) === "pro" ? "pro" : "free";
  const personalPro = plan === "pro";

  // New deals land in the team pipeline while the team plan/trial allows it;
  // otherwise they fall back to the personal pipeline under the personal cap —
  // a Pro subscriber is never locked out by their team's spent trial.
  const personalAllowed = personalPro || dealCount < FREE_DEAL_LIMIT;
  const teamAllowed =
    !!team && (team.active || team.dealCount < TEAM_TRIAL_DEALS);
  const canCreateDeal = teamAllowed || personalAllowed;

  return {
    plan,
    isPro: personalPro || (team?.active ?? false),
    status: (profile?.subscription_status as string) ?? null,
    stripeCustomerId: (profile?.stripe_customer_id as string) ?? null,
    currentPeriodEnd: (profile?.current_period_end as string) ?? null,
    dealCount,
    dealLimit: FREE_DEAL_LIMIT,
    canCreateDeal,
    team,
  };
}

/** Lightweight paid-features check for gating in a server action or route.
 *  True for a personal Pro subscription or an active Team plan. */
export async function isPro(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if ((data?.plan as string) === "pro") return true;

  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem) return false;
  const { data: team } = await supabase
    .from("teams")
    .select("plan")
    .eq("id", mem.team_id)
    .maybeSingle();
  return (team?.plan as string) === "active";
}
