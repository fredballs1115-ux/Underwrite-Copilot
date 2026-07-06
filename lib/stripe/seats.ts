import "server-only";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Keep the team subscription's seat quantity in step with the roster.
 * Called after a member joins or is removed. Best-effort: billing drift is
 * corrected on the next call (or manually in the Stripe portal), so a Stripe
 * hiccup here must never break the join/remove action itself.
 */
export async function syncTeamSeats(teamId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const [{ data: team }, { count }] = await Promise.all([
      admin
        .from("teams")
        .select("stripe_subscription_id, plan")
        .eq("id", teamId)
        .maybeSingle(),
      admin
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", teamId),
    ]);
    const subId = (team?.stripe_subscription_id as string) ?? null;
    const seats = count ?? 0;
    if (!subId || seats < 1) return;

    // Gate on Stripe's own view of the subscription, not the local mirror —
    // the mirror lags the webhook and would strand seat counts during the
    // checkout→webhook window or a past_due dunning period.
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    if (["canceled", "incomplete_expired"].includes(sub.status)) return;
    const item = sub.items?.data?.[0];
    if (!item || item.quantity === seats) return;
    await stripe.subscriptionItems.update(item.id, { quantity: seats });
  } catch {
    // Best-effort by design — see above.
  }
}
