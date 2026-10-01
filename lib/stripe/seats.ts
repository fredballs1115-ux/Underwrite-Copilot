import "server-only";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { planSeatSync } from "@/lib/stripe/team-billing";
import { knownPrices } from "@/lib/stripe/prices";
import { upstreamNote } from "@/lib/upstream-note";

/** A Stripe secret, restricted or publishable key, or a webhook secret, as
 *  an error message may echo one: Stripe masks most of a rejected key in
 *  its message, not all of it. */
const STRIPE_KEY = /\b(?:(?:sk|rk|pk)_(?:live|test)|whsec)_[^\s"'<>,;]*/g;

/** The one line a failed seat sync leaves in the server log: the team and
 *  Stripe's message, short, with anything key- or credential-shaped struck
 *  out (lib/upstream-note) — never the error object, which can carry the
 *  request it was sent with. */
export function seatSyncFailureLine(teamId: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `[seats] syncing team ${teamId}'s seats with Stripe failed: ${upstreamNote(message.replace(STRIPE_KEY, "[redacted]"), 300)}`;
}

/**
 * Keep the team subscription's seat item in step with the roster.
 * Called after a member joins or is removed. Handles both structures:
 * base + per-seat items (current) and the legacy single graduated item.
 * Best-effort: billing drift is corrected on the next call (or manually in
 * the Stripe portal), so a Stripe hiccup here must never break the
 * join/remove action itself — but it says so in the server log, one line
 * naming the team, or a seat count left wrong had no trace at all.
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

    const prices = knownPrices();
    const plan = planSeatSync(sub, prices.teamBase, prices.teamSeat, seats);
    switch (plan.action) {
      case "update":
        await stripe.subscriptionItems.update(plan.itemId, {
          quantity: plan.quantity,
        });
        break;
      case "create":
        await stripe.subscriptionItems.create({
          subscription: subId,
          price: plan.price,
          quantity: plan.quantity,
        });
        break;
      case "delete":
        await stripe.subscriptionItems.del(plan.itemId);
        break;
      case "none":
        break;
    }
  } catch (err) {
    // Best-effort by design — see above — and never silent.
    console.error(seatSyncFailureLine(teamId, err));
  }
}
