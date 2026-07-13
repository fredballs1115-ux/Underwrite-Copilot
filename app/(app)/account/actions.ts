"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  removeStorageFiles,
  modelTmpPath,
  uploadSupplement,
  removeSupplementFile,
  signatureMismatch,
} from "@/lib/storage";
import { getTeam } from "@/lib/teams";
import { getStripe } from "@/lib/stripe/client";
import { syncTeamSeats } from "@/lib/stripe/seats";
import { isPro } from "@/lib/billing";
import { getActiveBranding, saveBrandingValue } from "@/lib/branding-server";
import { sanitizeBranding, LOGO_MAX_BYTES } from "@/lib/branding";

export type PwState = { error?: string; ok?: boolean } | null;

/** Flip an email preference — the analysis-ready note (0014) or the weekly
 *  digest (0017). The columns are service-role-written like the billing
 *  fields, so authenticate first. */
export async function setEmailPrefs(formData: FormData) {
  const value = String(formData.get("value") ?? "") === "on";
  const field = String(formData.get("field") ?? "analysis");
  const column =
    field === "digest" ? "email_weekly_digest" : "email_on_analysis";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await createSupabaseAdminClient()
    .from("profiles")
    .update({ [column]: value })
    .eq("id", user.id);
  if (error) redirect("/account?error=emailpref");

  revalidatePath("/account");
  redirect("/account");
}

/**
 * Save custom report branding (Feature 6, Pro/Team). One form carries the
 * firm name, footer text, an optional logo file, and an optional remove-logo
 * flag. The replaced/removed logo file is swept only AFTER the row save
 * commits, so a failed save never orphans the branding's live logo.
 */
export async function saveBranding(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch {
    pro = false;
  }
  if (!pro) redirect("/billing?upsell=branding");

  const active = await getActiveBranding(supabase, user.id);
  if (active.scope === "team" && !active.editable) {
    redirect("/account?error=brandowner");
  }

  const firmName = String(formData.get("firmName") ?? "");
  const footerText = String(formData.get("footerText") ?? "");
  const removeLogo = String(formData.get("removeLogo") ?? "") === "1";
  const logo = formData.get("logo");

  const oldLogoPath = active.branding?.logoPath ?? null;
  let logoPath: string | undefined = oldLogoPath ?? undefined;

  if (removeLogo) {
    logoPath = undefined;
  } else if (logo instanceof File && logo.size > 0) {
    if (logo.size > LOGO_MAX_BYTES) redirect("/account?error=brandlogosize");
    const name = logo.name.toLowerCase();
    const ext = name.endsWith(".png")
      ? "png"
      : name.endsWith(".jpg") || name.endsWith(".jpeg")
        ? "jpg"
        : null;
    if (!ext) redirect("/account?error=brandlogotype");
    const buf = Buffer.from(await logo.arrayBuffer());
    // Magic-byte check: the file must BE the format its name claims.
    if (signatureMismatch(`logo.${ext}`, buf)) {
      redirect("/account?error=brandlogotype");
    }
    // Team branding stores under the team id, personal under the user id —
    // a random suffix per upload so a stale export URL never shows a logo
    // that was later replaced.
    const scopeId = active.teamId ?? user.id;
    const newPath = `${scopeId}/branding-logo-${Date.now().toString(36)}.${ext}`;
    let uploadFailed = false;
    try {
      await uploadSupplement(
        newPath,
        buf,
        ext === "png" ? "image/png" : "image/jpeg",
      );
    } catch {
      uploadFailed = true;
    }
    if (uploadFailed) redirect("/account?error=brandsave");
    logoPath = newPath;
  }

  const branding = sanitizeBranding({ firmName, footerText, logoPath });
  const res = await saveBrandingValue(supabase, user.id, branding);
  if (!res.ok) {
    redirect(
      `/account?error=${res.error === "owner" ? "brandowner" : "brandsave"}`,
    );
  }

  // Save committed — now sweep the file the branding no longer points at.
  const keptPath = branding?.logoPath ?? null;
  if (oldLogoPath && oldLogoPath !== keptPath) {
    await removeSupplementFile(oldLogoPath);
  }

  revalidatePath("/account");
  redirect("/account?branding=saved");
}

/** Change the signed-in user's password. Returns a state for useActionState. */
export async function changePassword(
  _prev: PwState,
  formData: FormData,
): Promise<PwState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out — sign in again to continue." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Self-serve account deletion — the privacy policy promises it, so it exists.
 * Order matters:
 *   1. refuse if they own a team (transfer isn't supported yet),
 *   2. cancel any live personal subscription (never delete a paying account
 *      and keep charging it),
 *   3. hand their shared team deals to the team owner (deleting the auth user
 *      cascades deals.user_id, and teammates must not lose shared work),
 *   4. leave the team, sweep personal files from storage,
 *   5. delete the auth user — every remaining row cascades in the database.
 */
export async function deleteAccount(formData: FormData) {
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") redirect("/account?error=confirm");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient();
  const team = await getTeam(supabase, user.id);

  // 1. Team owners can't self-delete — the team (and its billing) would
  //    cascade away under their members.
  if (team?.role === "owner") redirect("/account?error=ownerdelete");

  // 2. Cancel a live personal subscription first. If Stripe fails, stop —
  //    deleting the account while a subscription keeps billing is worse than
  //    asking the user to try again.
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id, subscription_status")
    .eq("id", user.id)
    .maybeSingle();
  const subId = (profile?.stripe_subscription_id as string) ?? null;
  const subStatus = (profile?.subscription_status as string) ?? "";
  if (
    subId &&
    ["active", "trialing", "past_due", "incomplete"].includes(subStatus)
  ) {
    try {
      await getStripe().subscriptions.cancel(subId);
    } catch {
      redirect("/account?error=cancelsub");
    }
  }

  // 3. Shared team deals transfer to the team owner instead of vanishing.
  if (team) {
    const { data: owner } = await admin
      .from("teams")
      .select("owner_id")
      .eq("id", team.id)
      .maybeSingle();
    if (owner?.owner_id) {
      await admin
        .from("deals")
        .update({ user_id: owner.owner_id })
        .eq("team_id", team.id)
        .eq("user_id", user.id);
    }
    await admin
      .from("team_members")
      .delete()
      .eq("team_id", team.id)
      .eq("user_id", user.id);
  }

  // 4. Collect the personal deals' storage paths before the rows cascade.
  const { data: deals } = await admin
    .from("deals")
    .select("id, om_storage_path, supplements")
    .eq("user_id", user.id);
  const dealIds = ((deals ?? []) as { id: string }[]).map((d) => d.id);
  const paths: string[] = [];
  for (const d of (deals ?? []) as {
    om_storage_path: string | null;
    supplements: Record<string, { files?: { path: string }[] }> | null;
  }[]) {
    if (d.om_storage_path) {
      paths.push(d.om_storage_path);
      // Worker-mode reconciles park a model file next to the OM — sweep it
      // too (removing a nonexistent path is a no-op).
      paths.push(modelTmpPath(d.om_storage_path));
    }
    for (const tab of Object.values(d.supplements ?? {}))
      for (const f of tab.files ?? []) if (f.path) paths.push(f.path);
  }
  if (dealIds.length) {
    const { data: docs } = await admin
      .from("deal_documents")
      .select("storage_path")
      .in("deal_id", dealIds);
    for (const doc of (docs ?? []) as { storage_path: string }[])
      if (doc.storage_path) paths.push(doc.storage_path);
  }
  // Personal branding logo (0021) — pre-migration schemas just return an
  // error object, which reads as "no branding".
  try {
    const { data: bp } = await admin
      .from("profiles")
      .select("branding")
      .eq("id", user.id)
      .maybeSingle();
    const logoPath = (bp?.branding as { logoPath?: string } | null)?.logoPath;
    if (logoPath) paths.push(logoPath);
  } catch {
    // sweep is best-effort
  }

  // 5. Delete the auth user (cascades profiles, deals, jobs, documents),
  //    then sweep files. Storage leftovers are recoverable noise; a half-
  //    deleted account is not — so the user row goes first.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) redirect("/account?error=delete");
  await removeStorageFiles(paths);

  if (team) await syncTeamSeats(team.id);

  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
