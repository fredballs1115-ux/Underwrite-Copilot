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
// of ids at a time: PostgREST answers a read with at most its max-rows, and a
// filter of a few hundred ids makes a URL tens of KB long. The caller stops
// the deletion on any failure (`ok: false`), with the counts of what had
// already moved, so the page can say so.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The deal-scoped tables whose rows are a member's own work on a deal, each
 *  keyed by deal_id and user_id. */
export const TEAM_WORK_TABLES = ["deal_versions", "valuations", "rent_roll_imports"] as const;

/** Ids an `in` filter carries per request. A UUID takes 39 characters of the
 *  URL once the comma after it is encoded, so a hundred keep the request line
 *  near 4 KB, inside the 8 KB a proxy commonly allows. */
export const HANDOVER_CHUNK = 100;

/** Rows a read asks for per page — PostgREST's default max-rows. A server
 *  set to answer fewer is read correctly too: the next page starts after
 *  the rows that came back, and the read ends at an empty page. */
export const READ_PAGE = 1000;

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

type Result<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row a read matches, a page at a time — null if any page fails. The
 *  read must be ordered, so the pages do not overlap. */
export async function readAll<T>(page: (from: number, to: number) => Result<T>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + READ_PAGE - 1);
    if (error) return null;
    const got = data ?? [];
    if (got.length === 0) return rows;
    rows.push(...got);
    from += got.length;
  }
}

/** A list in runs of at most `size`. */
export function chunks<T>(list: readonly T[], size = HANDOVER_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
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
