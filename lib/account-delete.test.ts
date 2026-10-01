/**
 * Deleting an account keeps what the privacy page promises, and says what
 * happened. The deals a member added to a team's pipeline — the team they are
 * on, or one they have left — are handed to that team's owner with their own
 * work on the team's deals, not deleted (deleteAccount, step 3;
 * lib/account-handover), so the sign-in page it lands on says they stayed, and
 * with whom, where "all its data have been deleted" would not be true. Driven
 * against an in-memory fake of the two database clients that answers each
 * read by its filters and, on deleting the user, cascades the user's rows as
 * the schema does — so a deal that was not handed over is gone afterwards.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Filter = [op: "eq" | "in" | "notIs", col: string, val: unknown];

const db = vi.hoisted(() => ({
  team: null as { id: string; role: "owner" | "member" } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** a table whose writes fail */
  failOn: null as string | null,
  deleted: false,
  writes: [] as { table: string; op: string; values?: unknown; filters: [string, string, unknown][] }[],
  /** each paged read: the table and the page asked for */
  pages: [] as { table: string; range: [number, number] }[],
  /** the storage sweep, by the deal each path was checked against */
  swept: [] as string[],
}));

const ME = "member-1";
const WORK_TABLES = ["deal_versions", "valuations", "rent_roll_imports"] as const;

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) => {
    const v = row[col] ?? null;
    if (op === "eq") return v === val;
    if (op === "in") return (val as unknown[]).includes(v);
    return v !== val;
  });
}

/** A query builder over the in-memory tables, recording every write. */
function query(table: string) {
  const q = {
    op: "select",
    values: undefined as unknown,
    filters: [] as Filter[],
    order: null as string | null,
    range: null as [number, number] | null,
  };
  const answer = (single: boolean) => {
    const rows = (db.tables[table] ??= []);
    if (q.op !== "select") db.writes.push({ table, op: q.op, values: q.values, filters: q.filters });
    if (q.op !== "select" && db.failOn === table) return { data: null, error: { message: "write refused" }, count: null };
    const hit = rows.filter((r) => matches(r, q.filters));
    if (q.op === "update") {
      for (const r of hit) Object.assign(r, q.values);
      return { data: null, error: null, count: hit.length };
    }
    if (q.op === "delete") {
      db.tables[table] = rows.filter((r) => !hit.includes(r));
      return { data: null, error: null, count: hit.length };
    }
    const key = q.order;
    const ordered = key ? [...hit].sort((a, b) => String(a[key]).localeCompare(String(b[key]))) : hit;
    if (q.range) db.pages.push({ table, range: q.range });
    const page = q.range ? ordered.slice(q.range[0], q.range[1] + 1) : ordered;
    const out = page.map((r) => ({ ...r }));
    return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
  };
  const api = {
    select: () => api,
    update: (values: unknown) => {
      Object.assign(q, { op: "update", values });
      return api;
    },
    delete: () => {
      q.op = "delete";
      return api;
    },
    eq: (col: string, val: unknown) => {
      q.filters.push(["eq", col, val]);
      return api;
    },
    in: (col: string, val: unknown) => {
      q.filters.push(["in", col, val]);
      return api;
    },
    not: (col: string, op: string, val: unknown) => {
      if (op !== "is") throw new Error(`not.${op} is not faked`);
      q.filters.push(["notIs", col, val]);
      return api;
    },
    order: (col: string) => {
      q.order = col;
      return api;
    },
    range: (from: number, to: number) => {
      q.range = [from, to];
      return api;
    },
    maybeSingle: async () => answer(true),
    // Awaited without maybeSingle(), as a list read or a write is.
    then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(answer(false)).then(ok, fail),
  };
  return api;
}

/** Deleting the auth user, as the schema's ON DELETE CASCADEs do it: the
 *  user's own rows, and every row on a deal that went with them. */
function cascade(userId: string) {
  const deals = db.tables.deals ?? [];
  const gone = new Set(deals.filter((d) => d.user_id === userId).map((d) => d.id));
  db.tables.deals = deals.filter((d) => d.user_id !== userId);
  for (const t of [...WORK_TABLES, "deal_documents", "team_members"]) {
    db.tables[t] = (db.tables[t] ?? []).filter((r) => r.user_id !== userId && !gone.has(r.deal_id));
  }
  db.tables.profiles = (db.tables.profiles ?? []).filter((p) => p.id !== userId);
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "member-1", email: "m@firm.example" } } }),
      signOut: async () => ({ error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => query(table),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          db.deleted = true;
          cascade(id);
          return { error: null };
        },
      },
    },
  }),
}));
vi.mock("@/lib/teams", () => ({ getTeam: async () => db.team }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => {
    throw new Error("no subscription to cancel");
  },
}));
vi.mock("@/lib/stripe/seats", () => ({ syncTeamSeats: async () => {} }));
vi.mock("@/lib/storage", () => ({
  removeStorageFiles: async (_paths: string[], scope: { dealId?: string }) => {
    if (scope.dealId) db.swept.push(scope.dealId);
  },
  modelTmpPath: (p: string) => `${p}.model-tmp`,
  omStoragePath: (u: string, d: string) => `${u}/${d}.pdf`,
}));
vi.mock("@/lib/deal-picture", () => ({ picturePaths: () => [] }));
vi.mock("@/lib/flood-frame-core", () => ({ floodFramePaths: () => [] }));
vi.mock("@/lib/billing", () => ({}));
vi.mock("@/lib/branding-server", () => ({}));
vi.mock("@/lib/branding", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
// The sign-in form's actions — never called in a render.
vi.mock("@/app/login/actions", () => {
  const none = async () => null;
  return { authenticate: none, requestPasswordReset: none, resendConfirmation: none };
});

import { deleteAccount } from "@/app/(app)/account/actions";
import { HANDOVER_CHUNK, READ_PAGE } from "./account-handover";
import LoginPage from "@/app/login/page";
import { visibleText } from "./render-lint";

async function landing(): Promise<string> {
  const fd = new FormData();
  fd.set("confirm", "DELETE");
  try {
    await deleteAccount(fd);
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
  throw new Error("deleteAccount always redirects");
}

async function signInPage(deleted: string): Promise<string> {
  const page = await LoginPage({ searchParams: Promise.resolve({ deleted }) });
  return visibleText(renderToStaticMarkup(page));
}

const rows = (table: string) => db.tables[table] ?? [];
const row = (table: string, id: string) => rows(table).find((r) => r.id === id);
const deal = (id: string, user_id: string, team_id: string | null) => ({ id, user_id, team_id, om_storage_path: null, supplements: null, photo: null });

beforeEach(() => {
  db.team = null;
  db.tables = {
    profiles: [{ id: ME, stripe_subscription_id: null, subscription_status: null, branding: null }],
    teams: [],
    deals: [],
  };
  db.failOn = null;
  db.deleted = false;
  db.writes.length = 0;
  db.pages.length = 0;
  db.swept.length = 0;
});

describe("deleting an account says what happened to a team's deals", () => {
  it("a member whose deals went to the team's owner lands on the sign-in page saying so", async () => {
    db.team = { id: "team-1", role: "member" };
    db.tables.teams = [{ id: "team-1", owner_id: "owner-1" }];
    db.tables.deals = [deal("deal-a", ME, "team-1"), deal("deal-b", ME, "team-1"), deal("deal-c", ME, "team-1")];
    expect(await landing()).toBe("/login?deleted=team");
    for (const id of ["deal-a", "deal-b", "deal-c"]) expect(row("deals", id)?.user_id, id).toBe("owner-1");
    expect(db.deleted).toBe(true);
    const text = await signInPage("team");
    expect(text).toContain("The deals you added to your team's pipeline stay with the team, handed to its owner.");
    expect(text).not.toContain("all its data have been deleted");
  });

  it("an account with nothing handed over says everything went", async () => {
    db.team = { id: "team-1", role: "member" };
    db.tables.teams = [{ id: "team-1", owner_id: "owner-1" }];
    db.tables.deals = [deal("mine", ME, null)];
    expect(await landing()).toBe("/login?deleted=1");
    expect(row("deals", "mine")).toBeUndefined();
    db.team = null;
    expect(await landing()).toBe("/login?deleted=1");
    expect(await signInPage("1")).toContain("Your account and all its data have been deleted.");
  });

  it("a member who left the team first still hands the deals they added there to its owner, and their work on its deals (H1)", async () => {
    // Alice added D to team T, was removed or left (removeMember and leaveTeam
    // keep D in T's pipeline under her id), and is on no team when she deletes
    // her account. D carried T's work — a teammate's version, hers, and her
    // valuation on a teammate's deal. The first cut handed over only the
    // current team's deals, so D cascaded away with the account.
    db.team = null;
    db.tables.teams = [{ id: "team-t", owner_id: "owner-t" }];
    db.tables.deals = [deal("deal-d", ME, "team-t"), deal("deal-x", "teammate-2", "team-t"), deal("personal", ME, null)];
    db.tables.deal_versions = [
      { id: "v-mate", deal_id: "deal-d", user_id: "teammate-2" },
      { id: "v-mine", deal_id: "deal-d", user_id: ME },
      { id: "v-own", deal_id: "personal", user_id: ME },
    ];
    db.tables.valuations = [{ id: "val-mine", deal_id: "deal-x", user_id: ME }];
    expect(await landing()).toBe("/login?deleted=team");
    expect(db.deleted).toBe(true);
    // D stays in T's pipeline, its owner's now; the personal deal is gone.
    expect(row("deals", "deal-d")).toMatchObject({ user_id: "owner-t", team_id: "team-t" });
    expect(row("deals", "personal")).toBeUndefined();
    expect(row("deal_versions", "v-mate")?.user_id).toBe("teammate-2");
    expect(row("deal_versions", "v-mine")?.user_id).toBe("owner-t");
    expect(row("deal_versions", "v-own")).toBeUndefined();
    expect(row("valuations", "val-mine")?.user_id).toBe("owner-t");
    // D's files were never swept: only the personal deal's were.
    expect(db.swept).toEqual(["personal"]);
  });

  it("the deals in two teams' pipelines go to each team's own owner", async () => {
    db.team = { id: "team-2", role: "member" };
    db.tables.teams = [
      { id: "team-1", owner_id: "owner-1" },
      { id: "team-2", owner_id: "owner-2" },
    ];
    db.tables.deals = [deal("old-team", ME, "team-1"), deal("this-team", ME, "team-2")];
    db.tables.rent_roll_imports = [
      { id: "rr-1", deal_id: "old-team", user_id: ME },
      { id: "rr-2", deal_id: "this-team", user_id: ME },
    ];
    expect(await landing()).toBe("/login?deleted=team");
    expect(row("deals", "old-team")?.user_id).toBe("owner-1");
    expect(row("deals", "this-team")?.user_id).toBe("owner-2");
    expect(row("rent_roll_imports", "rr-1")?.user_id).toBe("owner-1");
    expect(row("rent_roll_imports", "rr-2")?.user_id).toBe("owner-2");
  });

  it("a deal whose team is gone stays the user's, and goes with the account", async () => {
    // Deleting a team sets its deals' team_id null; a team read between the
    // two has no owner to hand to.
    db.tables.deals = [deal("orphan", ME, "team-gone")];
    expect(await landing()).toBe("/login?deleted=1");
    expect(row("deals", "orphan")).toBeUndefined();
    expect(db.writes.filter((w) => w.op === "update")).toEqual([]);
  });

  it("reads the member's work in pages and moves it by row id, a chunk of ids a request", async () => {
    // A long list: PostgREST answers a read with at most its max-rows, and
    // every id of a team's deals in one URL ran to tens of KB.
    db.team = { id: "team-1", role: "member" };
    db.tables.teams = [{ id: "team-1", owner_id: "owner-1" }];
    db.tables.deals = [deal("shared", "teammate-2", "team-1")];
    const n = READ_PAGE + 234;
    db.tables.deal_versions = Array.from({ length: n }, (_, i) => ({ id: `v-${String(i).padStart(5, "0")}`, deal_id: "shared", user_id: ME }));
    expect(await landing()).toBe("/login?deleted=1");
    expect(rows("deal_versions").filter((v) => v.user_id === "owner-1")).toHaveLength(n);
    expect(db.pages.filter((p) => p.table === "deal_versions").map((p) => p.range[0])).toEqual([0, READ_PAGE, n]);
    const moves = db.writes.filter((w) => w.table === "deal_versions" && w.op === "update");
    expect(moves).toHaveLength(Math.ceil(n / HANDOVER_CHUNK));
    for (const w of moves) {
      const ids = w.filters.find(([op, col]) => op === "in" && col === "id")?.[2] as string[];
      expect(ids.length).toBeLessThanOrEqual(HANDOVER_CHUNK);
      expect(w.filters).toContainEqual(["eq", "user_id", ME]);
    }
  });

  it("a member's versions, valuations and rent roll imports on the team's deals move to the owner with the deals (pass 14)", async () => {
    db.team = { id: "team-1", role: "member" };
    db.tables.teams = [{ id: "team-1", owner_id: "owner-1" }];
    db.tables.deals = [deal("deal-a", ME, "team-1"), deal("deal-b", "teammate-2", "team-1")];
    for (const table of WORK_TABLES) {
      db.tables[table] = [
        { id: `${table}-a`, deal_id: "deal-a", user_id: ME },
        { id: `${table}-b`, deal_id: "deal-b", user_id: ME },
      ];
    }
    expect(await landing()).toBe("/login?deleted=team");
    for (const table of WORK_TABLES) {
      expect(rows(table).map((r) => r.user_id), table).toEqual(["owner-1", "owner-1"]);
    }
    // A share link the member minted is revoked with them, never handed on.
    expect(db.writes.some((w) => w.table === "deal_shares")).toBe(false);
    expect(db.deleted).toBe(true);
  });

  it("a handover that fails stops before the account is deleted, so nothing cascades away", async () => {
    db.team = { id: "team-1", role: "member" };
    db.tables.teams = [{ id: "team-1", owner_id: "owner-1" }];
    for (const table of ["deals", "valuations"]) {
      db.tables.deals = [deal("deal-a", ME, "team-1")];
      db.tables.valuations = [{ id: "val-a", deal_id: "deal-a", user_id: ME }];
      db.failOn = table;
      db.deleted = false;
      expect(await landing(), table).toBe("/account?error=handover");
      expect(db.deleted, table).toBe(false);
    }
  });

  it("a team's owner is still refused, before anything is touched", async () => {
    db.team = { id: "team-1", role: "owner" };
    db.tables.teams = [{ id: "team-1", owner_id: ME }];
    db.tables.deals = [deal("deal-a", ME, "team-1")];
    expect(await landing()).toBe("/account?error=ownerdelete");
    expect(db.writes).toEqual([]);
    expect(db.deleted).toBe(false);
  });

  it("so is the owner of the team a deal sits in, whatever the membership read says", async () => {
    // Deleting a team's owner cascades the team (teams.owner_id), and with
    // it every deal's place in its pipeline.
    db.tables.teams = [{ id: "team-x", owner_id: ME }];
    db.tables.deals = [deal("deal-a", ME, "team-x")];
    expect(await landing()).toBe("/account?error=ownerdelete");
    expect(db.writes).toEqual([]);
    expect(db.deleted).toBe(false);
  });
});
