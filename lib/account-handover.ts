// What an account has in a team's pipeline goes to that team's owner when the
// account is deleted, instead of cascading away with the user (deals.user_id
// and every work table's user_id are ON DELETE CASCADE):
//   - the deals the user added to a team's pipeline, read by each deal's OWN
//     team_id — the team the user is on now, or one they have left or been
//     removed from, since removeMember and leaveTeam leave a departing
//     member's deals in that team's pipeline;
//   - the user's own work on any team's deal: saved versions, valuations and
//     rent roll imports (TEAM_WORK_TABLES).
// Each goes to the owner of the team its deal is in. The privacy page and the
// account page promise it; the first cut handed over only the deals of the
// team the user was on when they deleted the account, so a member who had
// left first took the team's deals, and the teammates' work on them, down
// with the account. A deal whose team is gone is the user's own: deleting a
// team sets its deals' team_id null, and such a deal goes with the account.
//
// Every list is read a page at a time and every write names its rows a chunk
// of ids at a time: a Supabase project answers a read with at most its max
// rows — 1,000 by Supabase's own default, where PostgREST's is no limit
// (lib/read-all) — and a filter of a few hundred ids makes a URL tens of KB
// long. The caller stops
// the deletion on any failure (`ok: false`), with the counts of what had
// already moved, so the page can say so.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ID_CHUNK, READ_PAGE, chunks, readAll } from "@/lib/read-all";

// The paging and chunking live in lib/read-all, shared with every reader
// that counts, totals or lists a whole table (research pass 42).
export { READ_PAGE, chunks, readAll };

/** The deal-scoped tables whose rows are a member's own work on a deal, each
 *  keyed by deal_id and user_id. */
export const TEAM_WORK_TABLES = ["deal_versions", "valuations", "rent_roll_imports"] as const;

/** Ids an `in` filter carries per request (lib/read-all `ID_CHUNK`). */
export const HANDOVER_CHUNK = ID_CHUNK;

/** What a handover did. */
export interface Handover {
  /** every read and write went through */
  ok: boolean;
  /** a team the user's deals or work sit in is the user's own: deleting the
   *  account would take the team down with it (the owner refusal) */
  ownsTeam: boolean;
  /** deals handed to their team's owner */
  deals: number;
  /** rows of the user's own work on team deals handed to the team's owner */
  work: number;
}

/** Ids grouped by the owner each is handed to; an id with no owner is left. */
function byOwner<T>(rows: readonly T[], ownerOf: (row: T) => string | undefined, idOf: (row: T) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const owner = ownerOf(row);
    if (!owner) continue;
    const ids = out.get(owner) ?? [];
    ids.push(idOf(row));
    out.set(owner, ids);
  }
  return out;
}

/**
 * Hand the user's deals in a team's pipeline, and the user's own work on any
 * team's deal, to the owner of the team each deal is in. Reads first and
 * writes only once every read has answered; stops at the first failure with
 * the counts of what had already moved. Run with the service role: the rows
 * are read across teams the user may no longer belong to.
 */
export async function handOverTeamWork(admin: SupabaseClient, userId: string): Promise<Handover> {
  const done: Handover = { ok: false, ownsTeam: false, deals: 0, work: 0 };

  // The user's deals in a team's pipeline, each with its own team.
  const teamDeals = await readAll<{ id: string; team_id: string }>((from, to) =>
    admin.from("deals").select("id, team_id").eq("user_id", userId).not("team_id", "is", null).order("id").range(from, to),
  );
  if (!teamDeals) return done;

  // The user's own work, every row, with the deal it is on.
  const work: Record<string, { id: string; deal_id: string }[]> = {};
  for (const table of TEAM_WORK_TABLES) {
    const rows = await readAll<{ id: string; deal_id: string }>((from, to) =>
      admin.from(table).select("id, deal_id").eq("user_id", userId).order("id").range(from, to),
    );
    if (!rows) return done;
    work[table] = rows;
  }

  // Which of the deals that work is on sit in a team's pipeline, and whose:
  // the user's own team deals are known; the rest are read by id.
  const teamOfDeal = new Map(teamDeals.map((d) => [d.id, d.team_id]));
  const unread = [...new Set(Object.values(work).flat().map((r) => r.deal_id))].filter((id) => !teamOfDeal.has(id));
  for (const ids of chunks(unread)) {
    const { data, error } = await admin.from("deals").select("id, team_id").in("id", ids).not("team_id", "is", null);
    if (error) return done;
    for (const d of (data ?? []) as { id: string; team_id: string }[]) teamOfDeal.set(d.id, d.team_id);
  }

  // Each of those teams' owners. A team no longer there has no owner to hand
  // to, and what sits in it stays the user's.
  const ownerOfTeam = new Map<string, string>();
  for (const ids of chunks([...new Set(teamOfDeal.values())])) {
    const { data, error } = await admin.from("teams").select("id, owner_id").in("id", ids);
    if (error) return done;
    for (const t of (data ?? []) as { id: string; owner_id: string | null }[]) {
      if (t.owner_id) ownerOfTeam.set(t.id, t.owner_id);
    }
  }
  // A team the user owns would cascade away with the account — the owner
  // refusal, before anything moves.
  if ([...ownerOfTeam.values()].includes(userId)) return { ...done, ownsTeam: true };
  const ownerOfDeal = (dealId: string) => {
    const team = teamOfDeal.get(dealId);
    return team ? ownerOfTeam.get(team) : undefined;
  };

  // The deals first, then the work, a chunk of ids a request. Each write
  // re-checks the row is still the user's, so a retry after a partial
  // handover moves only what is left.
  for (const [owner, ids] of byOwner(teamDeals, (d) => ownerOfDeal(d.id), (d) => d.id)) {
    for (const chunk of chunks(ids)) {
      const { count, error } = await admin.from("deals").update({ user_id: owner }, { count: "exact" }).in("id", chunk).eq("user_id", userId);
      if (error) return done;
      done.deals += count ?? chunk.length;
    }
  }
  for (const table of TEAM_WORK_TABLES) {
    for (const [owner, ids] of byOwner(work[table], (r) => ownerOfDeal(r.deal_id), (r) => r.id)) {
      for (const chunk of chunks(ids)) {
        const { count, error } = await admin.from(table).update({ user_id: owner }, { count: "exact" }).in("id", chunk).eq("user_id", userId);
        if (error) return done;
        done.work += count ?? chunk.length;
      }
    }
  }
  done.ok = true;
  return done;
}
