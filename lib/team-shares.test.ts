/**
 * A departing member's share links on the team's other deals are revoked;
 * the links on their own deals (which stay theirs) are left alone. And the
 * shared page's sender check: the creator, or a current team member.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeSharesOfDepartingMember } from "./teams";
import { senderStillHasAccess } from "./share-access";

type Call = { table: string; filters: [string, unknown][]; patch?: unknown };

function fakeDb(rows: Record<string, unknown[]>, membership: string[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const q = {
        select: () => q,
        update: (patch: unknown) => {
          call.patch = patch;
          return q;
        },
        eq: (k: string, v: unknown) => {
          call.filters.push([`eq:${k}`, v]);
          return q;
        },
        neq: (k: string, v: unknown) => {
          call.filters.push([`neq:${k}`, v]);
          return q;
        },
        in: (k: string, v: unknown) => {
          call.filters.push([`in:${k}`, v]);
          return q;
        },
        maybeSingle: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (table === "team_members") {
            const uid = call.filters.find(([k]) => k === "eq:user_id")?.[1] as string;
            return Promise.resolve({ data: membership.includes(uid) ? { user_id: uid } : null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: rows[table] ?? null, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("revokeSharesOfDepartingMember", () => {
  it("revokes the member's links on the team's OTHER deals only", async () => {
    const { client, calls } = fakeDb({ deals: [{ id: "deal-a" }, { id: "deal-b" }] }, []);
    await revokeSharesOfDepartingMember(client, "team-1", "member-1");
    const dealsRead = calls.find((c) => c.table === "deals")!;
    expect(dealsRead.filters).toEqual([
      ["eq:team_id", "team-1"],
      ["neq:user_id", "member-1"],
    ]);
    const revoke = calls.find((c) => c.table === "deal_shares")!;
    expect(revoke.patch).toEqual({ revoked: true });
    expect(revoke.filters).toEqual([
      ["eq:created_by", "member-1"],
      ["eq:revoked", false],
      ["in:deal_id", ["deal-a", "deal-b"]],
    ]);
  });

  it("writes nothing when the team has no other deals", async () => {
    const { client, calls } = fakeDb({ deals: [] }, []);
    await revokeSharesOfDepartingMember(client, "team-1", "member-1");
    expect(calls.map((c) => c.table)).toEqual(["deals"]);
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
