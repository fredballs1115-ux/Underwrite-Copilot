import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveBuyBoxStore,
  activeBox,
  serializeBuyBoxStore,
  type BuyBox,
  type BuyBoxStore,
  type NamedBuyBox,
} from "@/lib/criteria";

export interface ActiveBuyBox {
  box: BuyBox | null;
  /** all named boxes and which is active (for the settings page switcher) */
  boxes: NamedBuyBox[];
  activeId: string;
  /** where it lives — a team shares one buy box; solo users have their own */
  scope: "team" | "personal";
  /** whether the CALLER may edit it (owners edit team boxes) */
  editable: boolean;
  teamName: string | null;
  teamId: string | null;
}

interface CriteriaLocation {
  raw: unknown;
  scope: "team" | "personal";
  editable: boolean;
  teamName: string | null;
  teamId: string | null;
}

/** Where this user's criteria live (team box if they're on a team, else their
 *  own profile) and the raw stored value. One read, shared by the getters and
 *  the writer so "which box applies" is decided in exactly one place. */
async function readCriteriaLocation(
  supabase: SupabaseClient,
  userId: string,
): Promise<CriteriaLocation> {
  const admin = createSupabaseAdminClient();

  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (mem) {
    const { data: team } = await admin
      .from("teams")
      .select("name, criteria")
      .eq("id", mem.team_id)
      .maybeSingle();
    return {
      raw: team?.criteria ?? null,
      scope: "team",
      editable: mem.role === "owner",
      teamName: (team?.name as string) ?? null,
      teamId: mem.team_id as string,
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("criteria")
    .eq("id", userId)
    .maybeSingle();
  return {
    raw: profile?.criteria ?? null,
    scope: "personal",
    editable: true,
    teamName: null,
    teamId: null,
  };
}

/** The buy box that applies to this user's screens right now, plus the full
 *  set of named boxes for the settings page. */
export async function getActiveBuyBox(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveBuyBox> {
  const loc = await readCriteriaLocation(supabase, userId);
  const store = resolveBuyBoxStore(loc.raw);
  return {
    box: activeBox(store),
    boxes: store.boxes,
    activeId: store.activeId,
    scope: loc.scope,
    editable: loc.editable,
    teamName: loc.teamName,
    teamId: loc.teamId,
  };
}

/** The active box for a specific deal (used by the background verdict step —
 *  team deals judge against the team box, personal deals the creator's). */
export async function getBuyBoxForDeal(
  dealUserId: string,
  dealTeamId: string | null,
): Promise<BuyBox | null> {
  const admin = createSupabaseAdminClient();
  if (dealTeamId) {
    const { data } = await admin
      .from("teams")
      .select("criteria")
      .eq("id", dealTeamId)
      .maybeSingle();
    return activeBox(resolveBuyBoxStore(data?.criteria ?? null));
  }
  const { data } = await admin
    .from("profiles")
    .select("criteria")
    .eq("id", dealUserId)
    .maybeSingle();
  return activeBox(resolveBuyBoxStore(data?.criteria ?? null));
}

/**
 * Persist a whole store back to wherever this user's criteria live. Team
 * writes go through the service role (the teams table is user-write-locked);
 * personal writes go through the user client under its column grant + RLS.
 * Returns an error code the caller can redirect on; never throws.
 */
export async function saveBuyBoxStore(
  supabase: SupabaseClient,
  userId: string,
  store: BuyBoxStore,
): Promise<{ ok: boolean; error?: "owner" | "save" }> {
  const loc = await readCriteriaLocation(supabase, userId);
  const value = serializeBuyBoxStore(store);

  if (loc.scope === "team") {
    if (!loc.editable) return { ok: false, error: "owner" };
    const { error } = await createSupabaseAdminClient()
      .from("teams")
      .update({ criteria: value })
      .eq("id", loc.teamId!);
    return error ? { ok: false, error: "save" } : { ok: true };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ criteria: value })
    .eq("id", userId);
  return error ? { ok: false, error: "save" } : { ok: true };
}
