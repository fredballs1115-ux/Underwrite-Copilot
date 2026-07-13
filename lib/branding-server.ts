import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadDealFile } from "@/lib/storage";
import { sanitizeBranding, type Branding } from "@/lib/branding";

export interface ActiveBranding {
  branding: Branding | null;
  /** where it lives — a team shares one branding; solo users have their own */
  scope: "team" | "personal";
  /** whether the CALLER may edit it (owners edit team branding) */
  editable: boolean;
  teamId: string | null;
}

/** The branding that applies to this user's exports (settings page). Mirrors
 *  the buy-box resolution: team branding when they're on a team, else their
 *  own profile's. */
export async function getActiveBranding(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveBranding> {
  const admin = createSupabaseAdminClient();

  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (mem) {
    const { data: team } = await admin
      .from("teams")
      .select("branding")
      .eq("id", mem.team_id)
      .maybeSingle();
    return {
      branding: sanitizeBranding(team?.branding ?? null),
      scope: "team",
      editable: mem.role === "owner",
      teamId: mem.team_id as string,
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("branding")
    .eq("id", userId)
    .maybeSingle();
  return {
    branding: sanitizeBranding(profile?.branding ?? null),
    scope: "personal",
    editable: true,
    teamId: null,
  };
}

/** The branding for a specific deal's exports — team deals carry the team's
 *  identity, personal deals the creator's (mirrors getBuyBoxForDeal). */
export async function getBrandingForDeal(
  dealUserId: string,
  dealTeamId: string | null,
): Promise<Branding | null> {
  const admin = createSupabaseAdminClient();
  if (dealTeamId) {
    const { data } = await admin
      .from("teams")
      .select("branding")
      .eq("id", dealTeamId)
      .maybeSingle();
    return sanitizeBranding(data?.branding ?? null);
  }
  const { data } = await admin
    .from("profiles")
    .select("branding")
    .eq("id", dealUserId)
    .maybeSingle();
  return sanitizeBranding(data?.branding ?? null);
}

/** Persist branding to wherever this user's identity lives. Team writes go
 *  through the service role (owner-only); personal through the user client
 *  under its column grant + RLS. */
export async function saveBrandingValue(
  supabase: SupabaseClient,
  userId: string,
  branding: Branding | null,
): Promise<{ ok: boolean; error?: "owner" | "save" }> {
  const active = await getActiveBranding(supabase, userId);
  if (active.scope === "team") {
    if (!active.editable) return { ok: false, error: "owner" };
    const { error } = await createSupabaseAdminClient()
      .from("teams")
      .update({ branding })
      .eq("id", active.teamId!);
    return error ? { ok: false, error: "save" } : { ok: true };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ branding })
    .eq("id", userId);
  return error ? { ok: false, error: "save" } : { ok: true };
}

/** The logo as a data URI for the PDF renderer — react-pdf takes it directly.
 *  Best-effort: any failure (missing file, pre-0021 schema) returns null and
 *  the export renders text-only branding. */
export async function brandingLogoDataUri(
  branding: Branding | null,
): Promise<string | null> {
  if (!branding?.logoPath) return null;
  try {
    const buf = await downloadDealFile(branding.logoPath);
    const mime = branding.logoPath.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
