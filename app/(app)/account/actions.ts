"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  removeStorageFiles,
  modelTmpPath,
  omStoragePath,
  brandingLogoPath,
  uploadSupplement,
  removeSupplementFile,
  signatureMismatch,
} from "@/lib/storage";
import { getTeam } from "@/lib/teams";
import { chunks, handOverTeamWork, readAll } from "@/lib/account-handover";
import {
  accountHref,
  deletedHref,
  deletionStopHref,
  doneFromForm,
  mergeMoved,
  movedOf,
  type DeletionDone,
} from "@/lib/account-deletion";
import { SIGNED_OUT, authErrorCopy } from "@/lib/auth-flow";
import { getStripe } from "@/lib/stripe/client";
import { syncTeamSeats } from "@/lib/stripe/seats";
import { isPro } from "@/lib/billing";
import { getActiveBranding, saveBrandingValue } from "@/lib/branding-server";
import { sanitizeBranding, LOGO_MAX_BYTES } from "@/lib/branding";
import type { DealVisualCache } from "@/lib/deal-location";
import { picturePaths } from "@/lib/deal-picture";
import { floodFramePaths } from "@/lib/flood-frame-core";

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
  // Tracked so a failed ROW save can sweep the file it just uploaded —
  // neither the old live logo nor a fresh orphan may be left dangling.
  let uploadedPath: string | null = null;

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
    // a unique suffix per upload (ms timestamp + random) so a replaced logo
    // never aliases the new one, even across simultaneous saves.
    const scopeId = active.teamId ?? user.id;
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const newPath = brandingLogoPath(scopeId, suffix, ext);
    let uploadFailed = false;
    try {
      await uploadSupplement(
        newPath,
        buf,
        ext === "png" ? "image/png" : "image/jpeg",
        { kind: "branding", userId: user.id, teamId: active.teamId },
      );
    } catch {
      uploadFailed = true;
    }
    if (uploadFailed) redirect("/account?error=brandsave");
    logoPath = newPath;
    uploadedPath = newPath;
  }

  const branding = sanitizeBranding({ firmName, footerText, logoPath });
  const res = await saveBrandingValue(supabase, user.id, branding);
  if (!res.ok) {
    // The row never pointed at the fresh upload — don't strand it.
    if (uploadedPath) {
      await removeSupplementFile(uploadedPath, {
        kind: "branding",
        userId: user.id,
        teamId: active.teamId,
      });
    }
    redirect(
      `/account?error=${res.error === "owner" ? "brandowner" : "brandsave"}`,
    );
  }

  // Save committed — now sweep the file the branding no longer points at.
  const keptPath = branding?.logoPath ?? null;
  if (oldLogoPath && oldLogoPath !== keptPath) {
    await removeSupplementFile(oldLogoPath, {
      kind: "branding",
      userId: user.id,
      teamId: active.teamId,
    });
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
  if (!user) return { error: SIGNED_OUT };

  const { error } = await supabase.auth.updateUser({ password });
  // One sentence by the error's code (lib/auth-flow), never the auth
  // service's developer text.
  if (error) return { error: authErrorCopy(error, "password") };

  return { ok: true };
}

/** A personal subscription that is still billing, or may yet. */
const LIVE_SUBSCRIPTION = ["active", "trialing", "past_due", "incomplete"];

/** Cancel a personal subscription — true once Stripe has it cancelled. A
 *  deletion tried again after one that stopped later can find the
 *  subscription it cancelled still live in the profile's mirror, until
 *  Stripe's webhook lands; should Stripe refuse the second cancel, the
 *  subscription is read back, and one that has ended counts as cancelled. */
async function cancelSubscription(subId: string): Promise<boolean> {
  try {
    await getStripe().subscriptions.cancel(subId);
    return true;
  } catch {
    try {
      const sub = await getStripe().subscriptions.retrieve(subId);
      return sub.status === "canceled" || sub.status === "incomplete_expired";
    } catch {
      return false;
    }
  }
}

/**
 * Self-serve account deletion — the privacy policy promises it, so it exists.
 * Order matters: the team's work is handed over first — it is what teammates
 * would lose, and a retry finishes it — the subscription is cancelled next,
 * and the user is deleted last, since nothing brings an account back.
 *   1. refuse if they own a team (transfer isn't supported yet),
 *   2. hand the deals they added to a team's pipeline, and their work on any
 *      team's deals, to that team's owner — by each deal's own team, so a
 *      team they have left keeps its deals too (deleting the auth user
 *      cascades deals.user_id, and teammates must not lose shared work),
 *   3. cancel any live personal subscription (never delete a paying account
 *      and keep charging it),
 *   4. collect the personal deals' files,
 *   5. delete the auth user — every remaining row cascades in the database,
 *      the team membership with it — then sweep the files and resync the
 *      team's seats.
 * A step that fails stops the deletion, and the account page says what the
 * steps before it had already done (lib/account-deletion).
 */
export async function deleteAccount(formData: FormData) {
  // What a try that stopped had already done, carried in by the account
  // page's form from the query that stop landed on: a retry finds nothing
  // left to move, and the subscription it cancelled no longer live, so
  // without it the retry would say less than happened.
  const before = doneFromForm(formData);
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") redirect(accountHref("confirm", before));

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

  // 2. What the account has in a team's pipeline goes to that team's owner
  //    instead of cascading away with it (lib/account-handover): the deals
  //    it added to a team's pipeline, by each deal's own team — the team it
  //    is on now, or one it has left, whose pipeline removeMember and
  //    leaveTeam leave its deals in — and its own work on any team's deals
  //    (saved versions, valuations and rent roll imports). Counted, so the
  //    sign-in page can say they stayed. A share link the member minted is
  //    revoked with them (deal_shares cascades), so no one outside keeps
  //    access on the word of someone who has gone. First, because it keeps
  //    the team's work and a retry finishes it: a failed read or write stops
  //    here, before the subscription or the account is touched — deleting
  //    the account would cascade whatever had not moved.
  const handover = await handOverTeamWork(admin, user.id);
  if (handover.ownsTeam) redirect("/account?error=ownerdelete");
  const done: DeletionDone = {
    movedToTeam: mergeMoved(before.movedToTeam, movedOf(handover)),
    cancelled: before.cancelled,
  };
  if (!handover.ok) redirect(deletionStopHref("handover", done));

  // 3. Cancel a live personal subscription. If Stripe fails — or the
  //    subscription cannot be read — stop: deleting the account while a
  //    subscription keeps billing is worse than asking the user to try again.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("stripe_subscription_id, subscription_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) redirect(deletionStopHref("cancelsub", done));
  const subId = (profile?.stripe_subscription_id as string) ?? null;
  const subStatus = (profile?.subscription_status as string) ?? "";
  if (subId && LIVE_SUBSCRIPTION.includes(subStatus)) {
    if (!(await cancelSubscription(subId))) redirect(deletionStopHref("cancelsub", done));
    done.cancelled = true;
  }

  // 4. Collect the personal deals' storage paths before the rows cascade —
  //    per deal, so each path is checked against the deal it claims to belong
  //    to before the service role removes anything. Read in pages and looked
  //    up a chunk of deals at a time, as the handover reads: a long list
  //    stopped at PostgREST's row cap, and every deal's id in the documents'
  //    one URL ran it to tens of KB. Best-effort as before — a failed read
  //    leaves files to sweep, never a half-deleted account.
  const dealRows =
    (await readAll<{
      id: string;
      om_storage_path: string | null;
      supplements: Record<string, { files?: { path: string }[] }> | null;
      photo: DealVisualCache | null;
    }>((from, to) =>
      admin.from("deals").select("id, om_storage_path, supplements, photo").eq("user_id", user.id).order("id").range(from, to),
    )) ?? [];
  const byDeal = new Map<string, string[]>();
  for (const d of dealRows) {
    // Worker-mode reconciles park a model file next to the OM — sweep that
    // slot too (removing a nonexistent path is a no-op). The building's
    // photographs go with the deal — the cover and the memorandum's others,
    // every size of each — and so does its drawn flood map (#472): the
    // deal's own delete counts them the same way.
    const paths: string[] = [modelTmpPath(omStoragePath(user.id, d.id))];
    paths.push(...picturePaths(d.photo), ...floodFramePaths(d.photo));
    if (d.om_storage_path) {
      paths.push(d.om_storage_path);
      paths.push(modelTmpPath(d.om_storage_path));
    }
    for (const tab of Object.values(d.supplements ?? {}))
      for (const f of tab.files ?? []) if (f.path) paths.push(f.path);
    byDeal.set(d.id, paths);
  }
  for (const ids of chunks([...byDeal.keys()])) {
    const { data: docs } = await admin
      .from("deal_documents")
      .select("deal_id, storage_path")
      .in("deal_id", ids);
    for (const doc of (docs ?? []) as { deal_id: string; storage_path: string }[])
      if (doc.storage_path) byDeal.get(doc.deal_id)?.push(doc.storage_path);
  }
  // Personal branding logo (0021) — pre-migration schemas just return an
  // error object, which reads as "no branding".
  let logoPath: string | null = null;
  try {
    const { data: bp } = await admin
      .from("profiles")
      .select("branding")
      .eq("id", user.id)
      .maybeSingle();
    logoPath = (bp?.branding as { logoPath?: string } | null)?.logoPath ?? null;
  } catch {
    // sweep is best-effort
  }

  // 5. Delete the auth user (cascades profiles, deals, jobs, documents, and
  //    the team membership — the seat sync below counts the roster after
  //    it), then sweep files. Storage leftovers are recoverable noise; a
  //    half-deleted account is not — so the user row goes first. A failure
  //    here leaves the account, its membership and its own deals in place;
  //    the page says what steps 2 and 3 had already done.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) redirect(deletionStopHref("delete", done));
  for (const [dealId, paths] of byDeal) {
    await removeStorageFiles(paths, { kind: "deal", dealId });
  }
  if (logoPath) {
    await removeStorageFiles([logoPath], { kind: "branding", userId: user.id, teamId: null });
  }

  if (team) await syncTeamSeats(team.id);

  await supabase.auth.signOut();
  // The sign-in page says what happened: everything gone, or — where deals
  // or work went to a team's owner in step 2, this try or one before it —
  // what stayed and with whom.
  redirect(deletedHref(done.movedToTeam));
}
