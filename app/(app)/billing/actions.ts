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

  // Reuse or create the Stripe customer for this user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  let customerId = (profile?.stripe_customer_id as string) ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerId = (profile?.stripe_customer_id as string) ?? null;
  if (!customerId) redirect("/billing");

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/billing`,
  });
  redirect(session.url);
}
