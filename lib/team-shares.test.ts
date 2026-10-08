/**
 * A departing member's share links on the team's other deals are revoked;
 * the links on their own deals (which stay theirs) are left alone. And the
 * shared page's sender check: the creator, or a current team member.
 *
 * The sweep reads the leaver's live links first, every one a page at a
 * time, keeps those on the team's other deals a hundred ids a request, and
 * says when a read or a write failed (research pass 42): the first version
 * put every one of the team's deals in one URL, read at most one response's
 * rows, and read a failed read as no deals.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeSharesOfDepartingMember } from "./teams";
import { senderStillHasAccess } from "./share-access";

type Row = Record<string, unknown>;
type Filter = { op: string; col: string; v: unknown };

/** A database that filters as PostgREST does and answers at most `maxRows`
 *  a response; `fail` names a table whose reads (or writes) answer an error. */
function fakeDb(
  tables: Record<string, Row[]>,
  membership: string[] = [],
  opts: { maxRows?: number; failRead?: string; failWrite?: string } = {},
) {
  const maxRows = opts.maxRows ?? 1000;
  const writes: { table: string; patch: unknown; filters: Filter[] }[] = [];
  const inSizes: number[] = [];
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let patch: unknown = undefined;
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      const matches = (r: Row) =>
        filters.every(({ op, col, v }) =>
          op === "eq" ? r[col] === v : op === "neq" ? r[col] !== v : (v as unknown[]).includes(r[col]),
        );
      const q = {
        select: () => q,
        update: (p: unknown) => {
          patch = p;
          return q;
        },
        eq: (col: string, v: unknown) => (filters.push({ op: "eq", col, v }), q),
        neq: (col: string, v: unknown) => (filters.push({ op: "neq", col, v }), q),
        in: (col: string, v: unknown[]) => {
          inSizes.push(v.length);
          filters.push({ op: "in", col, v });
          return q;
        },
        order: () => q,
        range: (from: number, to: number) => {
          range = [from, to];
          return q;
        },
        maybeSingle: () => q,
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (table === "team_members") {
            const uid = filters.find((f) => f.col === "user_id")?.v as string;
            return Promise.resolve({ data: membership.includes(uid) ? { user_id: uid } : null, error: null }).then(resolve);
          }
          if (patch !== undefined) {
            if (opts.failWrite === table) return Promise.resolve({ data: null, error: { message: "write refused" } }).then(resolve);
            writes.push({ table, patch, filters: [...filters] });
            for (const r of tables[table] ?? []) if (matches(r)) Object.assign(r, patch as Row);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          if (opts.failRead === table) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve);
          const [from, to] = range;
          const rows = (tables[table] ?? []).filter(matches).slice(from, Math.min(to + 1, from + maxRows));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, inSizes };
}

const deals = (): Row[] => [
  { id: "deal-a", team_id: "team-1", user_id: "owner" },
  { id: "deal-b", team_id: "team-1", user_id: "other" },
  { id: "deal-own", team_id: "team-1", user_id: "member-1" },
  { id: "deal-personal", team_id: null, user_id: "member-1" },
  { id: "deal-elsewhere", team_id: "team-2", user_id: "someone" },
];
const link = (id: string, deal_id: string, created_by = "member-1", revoked = false): Row => ({ id, deal_id, created_by, revoked });

describe("revokeSharesOfDepartingMember", () => {
  it("revokes the member's live links on the team's OTHER deals only, and says it did", async () => {
    const shares = [
      link("s1", "deal-a"),
      link("s2", "deal-b"),
      link("s3", "deal-own"),
      link("s4", "deal-personal"),
      link("s5", "deal-elsewhere"),
      link("s6", "deal-a", "owner"),
    ];
    const { client } = fakeDb({ deals: deals(), deal_shares: shares });
    expect(await revokeSharesOfDepartingMember(client, "team-1", "member-1")).toBe(true);
    expect(shares.filter((s) => s.revoked).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("reads every live link past one response's rows, a hundred ids a request", async () => {
    const many: Row[] = Array.from({ length: 250 }, (_, i) => ({ id: `t${i}`, team_id: "team-1", user_id: "owner" }));
    const shares = many.map((d, i) => link(`s${i}`, d.id as string));
    const { client, inSizes } = fakeDb({ deals: many, deal_shares: shares }, [], { maxRows: 100 });
    expect(await revokeSharesOfDepartingMember(client, "team-1", "member-1")).toBe(true);
    expect(shares.every((s) => s.revoked)).toBe(true);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(100);
  });

  it("writes nothing when the member has no live links", async () => {
    const { client, writes } = fakeDb({ deals: deals(), deal_shares: [link("s1", "deal-a", "member-1", true)] });
    expect(await revokeSharesOfDepartingMember(client, "team-1", "member-1")).toBe(true);
    expect(writes).toEqual([]);
  });

  it("says a failed read or write rather than reading it as no links", async () => {
    for (const fail of [{ failRead: "deal_shares" }, { failRead: "deals" }, { failWrite: "deal_shares" }]) {
      const shares = [link("s1", "deal-a")];
      const { client } = fakeDb({ deals: deals(), deal_shares: shares }, [], fail);
      expect(await revokeSharesOfDepartingMember(client, "team-1", "member-1")).toBe(false);
      expect(shares[0].revoked).toBe(false);
    }
  });

  it("keeps the seat where the sweep failed, and the team page says why", () => {
    const actions = readFileSync("app/(app)/team/actions.ts", "utf8");
    expect(actions).toContain('redirect("/team?error=removelinks")');
    expect(actions).toContain('redirect("/team?error=leavelinks")');
    const page = readFileSync("app/(app)/team/page.tsx", "utf8");
    expect(page).toMatch(/removelinks: \{[^}]*so they are still on the team/);
    expect(page).toMatch(/leavelinks: \{[^}]*so you are still on the team/);
  });
});

describe("senderStillHasAccess", () => {
  const deal = { user_id: "creator", team_id: "team-1" };
  it("the creator always; a current member yes; a departed member no", async () => {
    const { client } = fakeDb({}, ["member-current"]);
    expect(await senderStillHasAccess(client, "creator", deal)).toBe(true);
    expect(await senderStillHasAccess(client, "member-current", deal)).toBe(true);
    expect(await senderStillHasAccess(client, "member-gone", deal)).toBe(false);
    expect(await senderStillHasAccess(client, null, deal)).toBe(false);
  });

  it("a personal deal admits only its creator", async () => {
    const { client } = fakeDb({}, ["anyone"]);
    expect(await senderStillHasAccess(client, "anyone", { user_id: "creator", team_id: null })).toBe(false);
  });
});
