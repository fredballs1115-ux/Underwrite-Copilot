"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getTeam } from "@/lib/teams";
import { syncTeamSeats } from "@/lib/stripe/seats";

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

/** Start Stripe Checkout for the per-seat Team plan (owner only). */
export async function startTeamCheckout() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getTeam(supabase, user.id);
  if (!team || team.role !== "owner") redirect("/team?error=owner");

  const priceId = process.env.STRIPE_TEAM_PRICE_ID;
  if (!priceId) redirect("/team?error=config");

  const stripe = getStripe();

  // Stripe identifiers are hidden from user-client reads (column grants) —
  // the owner-only actions fetch them with the service role.
  const { createSupabaseAdminClient: adminFactory } = await import(
    "@/lib/supabase/admin"
  );
  const { data: trow } = await adminFactory()
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
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { error: saveErr } = await createSupabaseAdminClient()
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
    line_items: [{ price: priceId, quantity: Math.max(1, team.seatCount) }],
    success_url: `${appUrl()}/team?status=success`,
    cancel_url: `${appUrl()}/team?status=cancelled`,
    metadata: { team_id: team.id },
    subscription_data: { metadata: { team_id: team.id } },
    allow_promotion_codes: true,
  });

  if (session.url) redirect(session.url);
  redirect("/team?error=checkout");
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
