import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A share link is only as good as its sender's own access. The public page
 * resolves the token with the service role, so it re-applies the same test
 * `can_access_deal()` would for the sender: the deal's creator, or a current
 * member of the deal's team. A teammate who has since left or been removed
 * must not keep reading the deal through a link they minted while they were
 * on the team.
 */
export async function senderStillHasAccess(
  admin: SupabaseClient,
  createdBy: string | null,
  deal: { user_id: string | null; team_id: string | null },
): Promise<boolean> {
  if (!createdBy) return false;
  if (deal.user_id === createdBy) return true;
  if (!deal.team_id) return false;
  const { data: member } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", deal.team_id)
    .eq("user_id", createdBy)
    .maybeSingle();
  return !!member;
}
