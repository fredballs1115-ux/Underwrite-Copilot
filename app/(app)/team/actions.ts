"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getTeam } from "@/lib/teams";
import { syncTeamSeats } from "@/lib/stripe/seats";
import {
  teamCheckoutLineItems,
  proToTeamItems,
  teamToProItems,
} from "@/lib/stripe/team-billing";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Create a team and make the caller its owner (atomic, via the DB RPC). */
export async function createTeam(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/team?error=name");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_team", { team_name: name });
  if (error) {
    const code = error.message.includes("already_in_team")
      ? "already"
      : "create";
    redirect(`/team?error=${code}`);
  }
  revalidatePath("/team");
  redirect("/team?created=1");
}

/** Mint an invite link (owner only — RLS enforces it). */
export async function createInvite() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const { error } = await supabase
    .from("team_invites")
    .insert({ team_id: team.id, created_by: user.id });
  if (error) redirect("/team?error=invite");
  revalidatePath("/team");
  redirect("/team");
}

/** Revoke an invite link (owner only — RLS enforces it). */
export async function revokeInvite(formData: FormData) {
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) redirect("/team");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("team_invites").delete().eq("id", inviteId);
  revalidatePath("/team");
  redirect("/team");
}

/** Join a team from an invite link. */
export async function joinTeam(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/team/join/${token}`)}`);
  }

  const { data: teamId, error } = await supabase.rpc("join_team_with_token", {
    tok: token,
  });
  if (error || !teamId) {
    const code = error?.message.includes("already_in_team")
      ? "already"
      : "invalid";
    redirect(`/team/join/${token}?error=${code}`);
  }

  after(() => syncTeamSeats(teamId as string));
  revalidatePath("/team");
  revalidatePath("/deals");
  redirect("/deals?joined=1");
}

/** Owner removes a member. Their deals stay in the team pipeline. */
export async function removeMember(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) redirect("/team");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team.id)
    .eq("user_id", memberId);
  if (error) redirect("/team?error=remove");

  after(() => syncTeamSeats(team.id));
  revalidatePath("/team");
  redirect("/team");
}

/** A member leaves the team. The owner can't leave their own team. */
export async function leaveTeam() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team) redirect("/team");
  if (team.role === "owner") redirect("/team?error=ownerleave");

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team.id)
    .eq("user_id", user.id);
  if (error) redirect("/team?error=leave");

  after(() => syncTeamSeats(team.id));
  revalidatePath("/team");
  revalidatePath("/deals");
  redirect("/deals");
}

/**
 * Start the Team plan (owner only). Two paths:
 *
 *  · The owner already pays for personal Pro → UPDATE that subscription in
 *    place: drop the Pro item, add the Team base + per-seat items, Stripe
 *    prorates. Never cancel-and-recreate — that breaks billing history and
 *    risks double-charging. No second checkout.
 *  · Otherwise → Stripe Checkout for ONE subscription with two items: the
 *    Team base (covers the owner) and the per-seat price with quantity =
 *    added members.
 */
export async function startTeamCheckout() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const basePriceId = process.env.STRIPE_TEAM_PRICE_ID;
  if (!basePriceId) redirect("/team?error=config");
  const seatPriceId = process.env.STRIPE_TEAM_SEAT_PRICE_ID ?? null;

  const stripe = getStripe();

  // Stripe identifiers are hidden from user-client reads (column grants) —
  // the owner-only actions fetch them with the service role.
  const { createSupabaseAdminClient: adminFactory } = await import(
    "@/lib/supabase/admin"
  );
  const admin = adminFactory();

  // Pro → Team, in place. Verify against Stripe's CURRENT state, not the
  // local mirror, before touching anything.
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();
  const proSubId = (profile?.stripe_subscription_id as string) ?? null;
  if (proSubId) {
    let proSub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null =
      null;
    try {
      proSub = await stripe.subscriptions.retrieve(proSubId);
    } catch {
      proSub = null; // stale mirror — fall through to checkout
    }
    if (proSub && ["active", "trialing", "past_due"].includes(proSub.status)) {
      const customerId =
        typeof proSub.customer === "string" ? proSub.customer : proSub.customer.id;
      // Persist the team's customer FIRST so the webhook that follows the
      // update can match this team even by customer-id fallback.
      const { error: custErr } = await admin
        .from("teams")
        .update({ stripe_customer_id: customerId })
        .eq("id", team.id);
      if (custErr) redirect("/team?error=save");

      try {
        await stripe.subscriptions.update(proSubId, {
          items: proToTeamItems(proSub, basePriceId, seatPriceId, team.seatCount),
          metadata: { team_id: team.id, user_id: "" },
          proration_behavior: "create_prorations",
        });
      } catch {
        redirect("/team?error=upgrade");
      }

      // Mirror the handover locally so no window shows both plans active;
      // the subscription.updated webhook re-confirms from Stripe's state.
      await admin
        .from("teams")
        .update({
          stripe_subscription_id: proSubId,
          subscription_status: proSub.status,
          plan: "active",
        })
        .eq("id", team.id);
      await admin
        .from("profiles")
        .update({
          plan: "free",
          stripe_subscription_id: null,
          subscription_status: null,
          current_period_end: null,
        })
        .eq("id", user.id);

      revalidatePath("/team");
      revalidatePath("/billing");
      redirect("/team?status=upgraded");
    }
  }

  const { data: trow } = await admin
    .from("teams")
    .select("stripe_customer_id")
    .eq("id", team.id)
    .maybeSingle();

  let customerId = (trow?.stripe_customer_id as string) ?? null;
  if (!customerId) {
    // Idempotency key prevents two-tab races from minting duplicate customers.
    const customer = await stripe.customers.create(
      {
        email: user.email ?? undefined,
        name: team.name,
        metadata: { team_id: team.id },
      },
      { idempotencyKey: `uc-team-customer-${team.id}` },
    );
    customerId = customer.id;
    // Billing columns on teams are service-role-only — persist via admin, and
    // fail loudly so we never mint duplicate customers on retries.
    const { error: saveErr } = await admin
      .from("teams")
      .update({ stripe_customer_id: customerId })
      .eq("id", team.id);
    if (saveErr) redirect("/team?error=save");
  }

  // A live subscription already on file means the webhook just hasn't landed
  // yet (or the owner double-clicked) — never sell a second one.
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
    redirect("/team?error=exists");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: teamCheckoutLineItems(basePriceId, seatPriceId, team.seatCount),
    success_url: `${appUrl()}/team?status=success`,
    cancel_url: `${appUrl()}/team?status=cancelled`,
    metadata: { team_id: team.id },
    subscription_data: { metadata: { team_id: team.id } },
    allow_promotion_codes: true,
  });

  if (session.url) redirect(session.url);
  redirect("/team?error=checkout");
}

/**
 * Delete the team (owner only, typed confirmation). The reverse of the
 * Pro → Team upgrade, on the SAME subscription: drop the Team base + seat
 * items, add the Pro item, let Stripe prorate — the owner keeps one
 * continuous billing history and lands on a personal Pro plan they can
 * manage from Billing. Shared deals return to whoever uploaded them
 * (deals.team_id is ON DELETE SET NULL); members and invites cascade away.
 */
export async function deleteTeam(formData: FormData) {
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") redirect("/team?error=confirmdelete");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data: trow } = await admin
    .from("teams")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("id", team.id)
    .maybeSingle();
  const subId = (trow?.stripe_subscription_id as string) ?? null;

  if (subId) {
    const stripe = getStripe();
    let sub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null =
      null;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch {
      sub = null; // already gone on Stripe's side — nothing to convert
    }
    if (
      sub &&
      ["active", "trialing", "past_due", "incomplete"].includes(sub.status)
    ) {
      const proPriceId = process.env.STRIPE_PRICE_ID;
      if (!proPriceId) redirect("/team?error=config");
      try {
        await stripe.subscriptions.update(subId, {
          items: teamToProItems(sub, proPriceId!),
          metadata: { team_id: "", user_id: user.id },
          proration_behavior: "create_prorations",
        });
      } catch {
        // Stop BEFORE deleting anything — never leave a live team
        // subscription billing for a team that no longer exists.
        redirect("/team?error=deletesub");
      }
      // The subscription is the owner's personal Pro now. The customer id
      // must follow the subscription so the Billing portal finds it.
      await admin
        .from("profiles")
        .update({
          plan: "pro",
          stripe_subscription_id: subId,
          stripe_customer_id:
            typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          subscription_status: sub.status,
        })
        .eq("id", user.id);
    }
  }

  const { error: delErr } = await admin
    .from("teams")
    .delete()
    .eq("id", team.id);
  if (delErr) redirect("/team?error=delete");

  revalidatePath("/team");
  revalidatePath("/deals");
  revalidatePath("/billing");
  redirect("/team?status=teamdeleted");
}

/** Open the Stripe portal for the team subscription (owner only). */
export async function openTeamPortal() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const { data: trow } = await createSupabaseAdminClient()
    .from("teams")
    .select("stripe_customer_id")
    .eq("id", team.id)
    .maybeSingle();
  const customerId = (trow?.stripe_customer_id as string) ?? null;
  if (!customerId) redirect("/team?error=nocustomer");

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/team`,
  });
  redirect(session.url);
}
