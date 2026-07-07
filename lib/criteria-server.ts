import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEmptyBuyBox, type BuyBox } from "@/lib/criteria";

export interface ActiveBuyBox {
  box: BuyBox | null;
  /** where it lives — a team shares one buy box; solo users have their own */
  scope: "team" | "personal";
  /** whether the CALLER may edit it (owners edit team boxes) */
  editable: boolean;
  teamName: string | null;
  teamId: string | null;
}

/** The buy box that applies to this user's screens right now. */
export async function getActiveBuyBox(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveBuyBox> {
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
    const box = (team?.criteria as BuyBox) ?? null;
    return {
      box: isEmptyBuyBox(box) ? null : box,
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
  const box = (profile?.criteria as BuyBox) ?? null;
  return {
    box: isEmptyBuyBox(box) ? null : box,
    scope: "personal",
    editable: true,
    teamName: null,
    teamId: null,
  };
}

/** The buy box for a specific deal (used by the background verdict step —
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
    const box = (data?.criteria as BuyBox) ?? null;
    return isEmptyBuyBox(box) ? null : box;
  }
  const { data } = await admin
    .from("profiles")
    .select("criteria")
    .eq("id", dealUserId)
    .maybeSingle();
  const box = (data?.criteria as BuyBox) ?? null;
  return isEmptyBuyBox(box) ? null : box;
}
