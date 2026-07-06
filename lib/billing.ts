import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";

export type Plan = "free" | "pro";

export const FREE_DEAL_LIMIT = 3;
export const PRO_PRICE_LABEL = "$39/mo";
export const TEAM_PRICE_LABEL = "$29/seat/mo";

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
  const [{ data: profile }, { count }, team] = await Promise.all([
    supabase
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

  const plan = (profile?.plan as Plan) === "pro" ? "pro" : "free";
  const personalPro = plan === "pro";
  const dealCount = count ?? 0;

  // New deals land in the team pipeline when the user is on a team, so the
  // create gate follows the team's plan/trial there — the personal cap
  // otherwise.
  const canCreateDeal = team
    ? team.active || team.dealCount < TEAM_TRIAL_DEALS
    : personalPro || dealCount < FREE_DEAL_LIMIT;

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
  const { data } = await supabase
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
