import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunks, readAll, readByIds } from "@/lib/read-all";

export type TeamRole = "owner" | "member";

/** Team deals included before the Team plan is required. */
export const TEAM_TRIAL_DEALS = 3;

/** Days an unused invite link lives: team_invites.expires_at defaults to
 *  now() + 14 days (migration 0007). A link lets one person join, once
 *  (0012: the join claims it), and its owner can revoke it before then. */
export const INVITE_DAYS = 14;

export interface TeamMemberInfo {
  userId: string;
  role: TeamRole;
  email: string | null;
  fullName: string | null;
  joinedAt: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  /** the current user's role on this team */
  role: TeamRole;
  planActive: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  members: TeamMemberInfo[];
  seatCount: number;
  /** non-sample deals in the shared pipeline */
  dealCount: number;
}

/** The caller's team, with roster and billing state — null if not on one. */
export async function getTeam(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamInfo | null> {
  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem) return null;

  const teamId = mem.team_id as string;
  const [{ data: team }, { data: memberRows }, { count }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, plan, subscription_status, current_period_end")
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("is_sample", false),
  ]);
  if (!team) return null;

  const rows = (memberRows ?? []) as {
    user_id: string;
    role: TeamRole;
    created_at: string;
  }[];
  // Teammate profiles are readable under the "teammates read profiles" policy.
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ids)
    : { data: [] };
  const profileById = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  return {
    id: team.id as string,
    name: team.name as string,
    role: mem.role as TeamRole,
    planActive: (team.plan as string) === "active",
    subscriptionStatus: (team.subscription_status as string) ?? null,
    currentPeriodEnd: (team.current_period_end as string) ?? null,
    members: rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      email: profileById.get(r.user_id)?.email ?? null,
      fullName: profileById.get(r.user_id)?.full_name ?? null,
      joinedAt: r.created_at,
    })),
    seatCount: rows.length,
    dealCount: count ?? 0,
  };
}

/**
 * Kill the share links a departing member minted for the team's OTHER deals
 * — the ones they lose access to by leaving. Their own deals stay theirs, so
 * links on those stay live. Run BEFORE the membership row is deleted: the
 * share policy follows deal access, and the leaver's own client loses it the
 * moment the row is gone.
 *
 * It reads the leaver's live links first, every one a page at a time, then
 * keeps those on the team's other deals, a hundred ids a request, and revokes
 * them by id (lib/read-all). The first version read the team's other deals
 * and put every id in one URL: past one response's rows, or past what a
 * request line carries, links were missed or none revoked, and a failed read
 * was read as no deals (research pass 42).
 *
 * True where every link it should revoke is revoked; false where a read or a
 * write failed, which the caller says and keeps the membership until it can:
 * the shared page re-checks the creator's access on every render, so a link
 * the sweep missed still dies there, but the deal page would go on listing it
 * as a live link.
 */
export async function revokeSharesOfDepartingMember(
  supabase: SupabaseClient,
  teamId: string,
  memberId: string,
): Promise<boolean> {
  const failed = (what: string) => (err: unknown) =>
    console.error(`[teams] ${what} for ${memberId}'s share links on team ${teamId} failed:`, err);
  try {
    const links = await readAll<{ id: string; deal_id: string }>(
      (from, to) =>
        supabase
          .from("deal_shares")
          .select("id, deal_id")
          .eq("created_by", memberId)
          .eq("revoked", false)
          .order("id")
          .range(from, to),
      failed("reading"),
    );
    if (!links) return false;
    if (links.length === 0) return true;
    const others = await readByIds<{ id: string }>(
      [...new Set(links.map((l) => l.deal_id))],
      (chunk) => supabase.from("deals").select("id").eq("team_id", teamId).neq("user_id", memberId).in("id", chunk),
      failed("reading the team's deals"),
    );
    if (!others) return false;
    const onOthers = new Set(others.map((d) => d.id));
    for (const run of chunks(links.filter((l) => onOthers.has(l.deal_id)).map((l) => l.id))) {
      const { error } = await supabase
        .from("deal_shares")
        .update({ revoked: true })
        .eq("created_by", memberId)
        .in("id", run);
      if (error) {
        failed("revoking")(error);
        return false;
      }
    }
    return true;
  } catch (err) {
    failed("revoking")(err);
    return false;
  }
}

/** Display name for a member: full name, else the email's local part. */
export function memberLabel(m: {
  fullName: string | null;
  email: string | null;
}): string {
  if (m.fullName) return m.fullName;
  if (m.email) return m.email;
  return "Teammate";
}
