import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Stripe webhook — keeps each profile's plan in sync with its subscription.
 * Verifies the signature, then on subscription/checkout events writes plan,
 * status, and renewal date via the service-role client (bypasses RLS).
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) {
    return new Response("Missing webhook secret or signature", { status: 400 });
  }

  const stripe = getStripe();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  async function sync(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id ?? null;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const active = sub.status === "active" || sub.status === "trialing";
    // `current_period_end` sits on the subscription in older API versions and on
    // the subscription item in newer ones — check both so the renewal date shows.
    const periodEndUnix =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      (sub.items?.data?.[0] as unknown as { current_period_end?: number })
        ?.current_period_end;
    const update = {
      plan: active ? "pro" : "free",
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      current_period_end: periodEndUnix
        ? new Date(periodEndUnix * 1000).toISOString()
        : null,
    };
    // A failed or zero-row write here would strand a paying customer on Free.
    // Throw so the handler 500s and Stripe retries the event with backoff.
    if (userId) {
      const { error, count } = await admin
        .from("profiles")
        .update(update, { count: "exact" })
        .eq("id", userId);
      if (error) throw new Error(`profiles update failed: ${error.message}`);
      if (count === 0) {
        // Fall back to the customer id if the metadata user is gone/wrong.
        const { error: e2, count: c2 } = await admin
          .from("profiles")
          .update(update, { count: "exact" })
          .eq("stripe_customer_id", customerId);
        if (e2 || c2 === 0)
          throw new Error(`no profile matched user ${userId} / ${customerId}`);
      }
    } else {
      const { error, count } = await admin
        .from("profiles")
        .update(update, { count: "exact" })
        .eq("stripe_customer_id", customerId);
      if (error) throw new Error(`profiles update failed: ${error.message}`);
      if (count === 0) throw new Error(`no profile for customer ${customerId}`);
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
          await sync(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await sync(event.data.object as Stripe.Subscription);
        break;
    }
  } catch {
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
