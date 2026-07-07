import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncTeamSeats } from "@/lib/stripe/seats";
import { assertKnownPrices } from "@/lib/stripe/prices";

export const runtime = "nodejs";

/**
 * Price-ID assertion failed: log loudly and alert (email via Resend when
 * configured), then SKIP processing — never silently sync a subscription
 * carrying prices this app doesn't sell. Read-and-verify only: no Stripe
 * object is ever written here.
 */
async function alertUnknownPrices(
  event: Stripe.Event,
  sub: Stripe.Subscription,
  unknown: string[],
  seen: string[],
): Promise<void> {
  const line =
    `[stripe] ALERT unknown price id(s) [${unknown.join(", ")}] on subscription ` +
    `${sub.id} (customer ${typeof sub.customer === "string" ? sub.customer : sub.customer.id}, ` +
    `event ${event.id} ${event.type}); saw [${seen.join(", ")}]; ` +
    `expected the ids in STRIPE_PRICE_ID / STRIPE_TEAM_PRICE_ID / STRIPE_TEAM_SEAT_PRICE_ID. ` +
    `Event NOT processed.`;
  console.error(line);
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch(`${process.env.RESEND_BASE_URL ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Underwrite Copilot <onboarding@resend.dev>",
        to: [process.env.BILLING_ALERT_EMAIL ?? "underwritecopilot.support@gmail.com"],
        subject: `Stripe webhook: unknown price on ${sub.id}`,
        text: line,
      }),
    });
  } catch {
    // The console.error above is the fallback alert channel.
  }
}

/**
 * Stripe webhook — keeps profiles (personal Pro) and teams (per-seat plan) in
 * sync with their subscriptions. Verifies the signature, then on
 * subscription/checkout events writes plan, status, and renewal date via the
 * service-role client (bypasses RLS).
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) {
    return new Response("Missing webhook secret or signature", { status: 400 });
  }

  // getStripe() throws if STRIPE_SECRET_KEY is unset — keep it inside the guard
  // so a misconfig returns a clean 500 (Stripe retries) instead of an uncaught
  // exception. Signature verification stays first: nothing is trusted until it
  // passes.
  let stripe: ReturnType<typeof getStripe>;
  let event: Stripe.Event;
  const body = await req.text();
  try {
    stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    // A signature/parse failure is the client's fault (400); a missing key is
    // ours (500, so Stripe retries once it's configured).
    const isConfig = err instanceof Error && /secret key/i.test(err.message);
    return new Response(isConfig ? "Stripe not configured" : "Invalid signature", {
      status: isConfig ? 500 : 400,
    });
  }

  const admin = createSupabaseAdminClient();

  async function sync(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id ?? null;
    const teamId = sub.metadata?.team_id ?? null;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    // past_due counts as active: Stripe is still dunning the card, which
    // usually recovers — don't strand a paying customer mid-retry.
    const active = ["active", "trialing", "past_due"].includes(sub.status);
    // The subscription is gone for good — treat "nothing matched" as a no-op
    // below, so terminal events for deleted rows don't retry forever.
    const terminal = sub.status === "canceled";
    // `current_period_end` sits on the subscription in older API versions and on
    // the subscription item in newer ones — check both so the renewal date shows.
    const periodEndUnix =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      (sub.items?.data?.[0] as unknown as { current_period_end?: number })
        ?.current_period_end;
    const periodEnd = periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : null;

    async function syncTeam(matchTeamId: string | null): Promise<boolean> {
      const teamUpdate = {
        plan: active ? "active" : "inactive",
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        current_period_end: periodEnd,
      };
      if (matchTeamId) {
        const { error, count } = await admin
          .from("teams")
          .update(teamUpdate, { count: "exact" })
          .eq("id", matchTeamId);
        if (error) throw new Error(`teams update failed: ${error.message}`);
        if ((count ?? 0) > 0) return true;
      }
      const { error: e2, count: c2 } = await admin
        .from("teams")
        .update(teamUpdate, { count: "exact" })
        .eq("stripe_customer_id", customerId);
      if (e2) throw new Error(`teams update failed: ${e2.message}`);
      return (c2 ?? 0) > 0;
    }

    async function syncProfile(): Promise<boolean> {
      const update = {
        plan: active ? "pro" : "free",
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        current_period_end: periodEnd,
      };
      if (userId) {
        const { error, count } = await admin
          .from("profiles")
          .update(update, { count: "exact" })
          .eq("id", userId);
        if (error) throw new Error(`profiles update failed: ${error.message}`);
        if ((count ?? 0) > 0) return true;
      }
      // Fall back to the customer id if the metadata user is gone/wrong.
      const { error: e2, count: c2 } = await admin
        .from("profiles")
        .update(update, { count: "exact" })
        .eq("stripe_customer_id", customerId);
      if (e2) throw new Error(`profiles update failed: ${e2.message}`);
      return (c2 ?? 0) > 0;
    }

    // Route by metadata, but never let a metadata gap strand a subscription:
    // each path falls back to matching the other table by customer id.
    let matched: boolean;
    let matchedTeam = false;
    if (teamId) {
      matched = await syncTeam(teamId);
      matchedTeam = matched;
      if (!matched) matched = await syncProfile();
    } else {
      matched = await syncProfile();
      if (!matched) {
        matched = await syncTeam(null);
        matchedTeam = matched;
      }
    }

    // A failed or zero-row write would strand a paying customer on Free —
    // throw so Stripe retries. Exception: terminal events for rows that no
    // longer exist (deleted account/team) are a no-op, not an error loop.
    if (!matched && !terminal) {
      throw new Error(`no profile or team matched ${customerId}`);
    }

    // Seats may have changed while the plan was still syncing (member joined
    // between checkout and this event) — reconcile once the plan is live.
    if (matchedTeam && active) {
      const t = teamId ?? null;
      if (t) await syncTeamSeats(t);
      else {
        const { data } = await admin
          .from("teams")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (data?.id) await syncTeamSeats(data.id as string);
      }
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            s.subscription as string,
          );
          const priceCheck = assertKnownPrices(sub);
          if (!priceCheck.ok) {
            await alertUnknownPrices(event, sub, priceCheck.unknown, priceCheck.seen);
            // 200: the event is understood and deliberately not processed —
            // retrying wouldn't change the verdict, the alert is the signal.
            return new Response("skipped: unknown price id", { status: 200 });
          }
          await sync(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Events can arrive out of order (and our 500-to-retry design makes
        // stale redelivery likelier) — sync from Stripe's CURRENT state, not
        // the event payload, so a late "updated" can't resurrect a canceled
        // subscription.
        const evSub = event.data.object as Stripe.Subscription;
        const sub = await stripe.subscriptions.retrieve(evSub.id);
        const priceCheck = assertKnownPrices(sub);
        if (!priceCheck.ok) {
          await alertUnknownPrices(event, sub, priceCheck.unknown, priceCheck.seen);
          return new Response("skipped: unknown price id", { status: 200 });
        }
        await sync(sub);
        break;
      }
    }
  } catch {
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
