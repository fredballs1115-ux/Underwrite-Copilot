import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro";

export const FREE_DEAL_LIMIT = 3;
export const PRO_PRICE_LABEL = "$79/mo";

/** Pro-only features (everything else is available on Free). */
export type ProFeature = "model" | "memo" | "comps";

export interface Billing {
  plan: Plan;
  isPro: boolean;
  status: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  dealCount: number;
  dealLimit: number; // free cap; meaningless when Pro
  canCreateDeal: boolean;
}

/** Read a user's plan + usage. The source of truth for all gating. */
export async function getBilling(
  supabase: SupabaseClient,
  userId: string,
): Promise<Billing> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, subscription_status, stripe_customer_id, current_period_end")
    .eq("id", userId)
    .maybeSingle();

  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const plan = (profile?.plan as Plan) === "pro" ? "pro" : "free";
  const isPro = plan === "pro";
  const dealCount = count ?? 0;

  return {
    plan,
    isPro,
    status: (profile?.subscription_status as string) ?? null,
    stripeCustomerId: (profile?.stripe_customer_id as string) ?? null,
    currentPeriodEnd: (profile?.current_period_end as string) ?? null,
    dealCount,
    dealLimit: FREE_DEAL_LIMIT,
    canCreateDeal: isPro || dealCount < FREE_DEAL_LIMIT,
  };
}

/** Lightweight Pro check for gating a single feature in a server action. */
export async function isPro(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  return (data?.plan as string) === "pro";
}
