"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getStripe } from "@/lib/stripe/client";
import { classifyStripeError, isStaleCustomer } from "@/lib/stripe/diagnose";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Start a Stripe Checkout for the Pro subscription, then redirect to Stripe. */
export async function startCheckout() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) redirect("/billing?error=config");

  // A missing STRIPE_SECRET_KEY must read as "not set up" (email us), never a
  // raw error page — getStripe() throws when the key is absent.
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error("checkout: Stripe client init failed (STRIPE_SECRET_KEY set?):", err);
    redirect("/billing?error=config");
  }

  // Reuse or create the Stripe customer for this user. Billing columns are
  // service-role-only reads (migration 0008).
  const { createSupabaseAdminClient: adminReader } = await import(
    "@/lib/supabase/admin"
  );
  const { data: profile } = await adminReader()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  let customerId: string | null = (profile?.stripe_customer_id as string | null) ?? null;
  // A saved customer minted under TEST keys doesn't exist for the LIVE key
  // ("No such customer") — verify and self-heal instead of failing checkout
  // forever. The stale subscription mirror goes with it.
  if (customerId) {
    try {
      if (await isStaleCustomer(stripe, customerId)) {
        console.warn(`checkout: stale stripe customer ${customerId} for ${user.id} — resetting billing mirror`);
        await adminReader()
          .from("profiles")
          .update({ stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null })
          .eq("id", user.id);
        customerId = null;
      }
    } catch (err) {
      console.error(`checkout: customer verification failed for ${user.id}:`, err);
      redirect(`/billing?error=${classifyStripeError(err) ?? "checkout"}`);
    }
  }
  if (!customerId) {
    // Idempotency key prevents two-tab races from minting duplicate customers.
    let customer;
    try {
      customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { user_id: user.id },
        },
        { idempotencyKey: `uc-customer-${user.id}` },
      );
    } catch (err) {
      // Log the real Stripe error (invalid key, etc.) so the failure is
      // diagnosable in the server logs, not just a generic "try again".
      console.error(`checkout: stripe.customers.create failed for ${user.id}:`, err);
      redirect(`/billing?error=${classifyStripeError(err) ?? "checkout"}`);
    }
    customerId = customer.id;
    // Billing columns are service-role-only (migration 0006), so persist the
    // customer id with the admin client — and fail loudly if it doesn't land,
    // or every future checkout mints a duplicate Stripe customer.
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { error: saveErr } = await createSupabaseAdminClient()
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
    if (saveErr) redirect("/billing?error=save");
  }

  // A live subscription already on file means the webhook just hasn't landed
  // yet (or the user double-clicked) — never sell a second one. A Stripe
  // outage lands on the mapped "try again" copy instead of the error boundary.
  let session;
  try {
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    if (
      existing.data.some((sub) =>
        ["active", "trialing", "past_due", "incomplete"].includes(sub.status),
      )
    ) {
      redirect("/billing?error=exists");
    }

    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl()}/billing?status=success`,
      cancel_url: `${appUrl()}/billing?status=cancelled`,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    // Surface the real reason (invalid price ID, bad key, outage) in the logs.
    console.error(`checkout: create session failed for ${user.id} (price ${priceId}):`, err);
    redirect(`/billing?error=${classifyStripeError(err) ?? "checkout"}`);
  }

  if (session.url) redirect(session.url);
  redirect("/billing?error=checkout");
}

/** Open the Stripe customer portal to manage/cancel the subscription. */
export async function openPortal() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { createSupabaseAdminClient: adminReader2 } = await import(
    "@/lib/supabase/admin"
  );
  const { data: profile } = await adminReader2()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerId = (profile?.stripe_customer_id as string) ?? null;
  if (!customerId) redirect("/billing?error=nocustomer");

  const stripe = getStripe();
  try {
    if (await isStaleCustomer(stripe, customerId)) {
      console.warn(`portal: stale stripe customer ${customerId} for ${user.id} — resetting billing mirror`);
      await adminReader2()
        .from("profiles")
        .update({ stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null })
        .eq("id", user.id);
      redirect("/billing?error=nocustomer");
    }
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error(`portal: customer verification failed for ${user.id}:`, err);
    redirect(`/billing?error=${classifyStripeError(err) ?? "checkout"}`);
  }
  let session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl()}/billing`,
    });
  } catch (err) {
    console.error(`portal: create session failed for ${user.id}:`, err);
    redirect(`/billing?error=${classifyStripeError(err) ?? "checkout"}`);
  }
  redirect(session.url);
}
