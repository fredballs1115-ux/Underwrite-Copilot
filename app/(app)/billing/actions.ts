"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe/client";
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

  const stripe = getStripe();

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
  let customerId = (profile?.stripe_customer_id as string) ?? null;
  if (!customerId) {
    // Idempotency key prevents two-tab races from minting duplicate customers.
    const customer = await stripe.customers.create(
      {
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      },
      { idempotencyKey: `uc-customer-${user.id}` },
    );
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
  // yet (or the user double-clicked) — never sell a second one.
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl()}/billing?status=success`,
    cancel_url: `${appUrl()}/billing?status=cancelled`,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
  });

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
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/billing`,
  });
  redirect(session.url);
}
