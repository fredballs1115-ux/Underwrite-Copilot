/**
 * Deleting an account says what happened. A team member's deals in the
 * team's pipeline are handed to the team's owner, not deleted (deleteAccount,
 * step 3), so the sign-in page it lands on says they stayed, and with whom,
 * where "all its data have been deleted" would not be true. Driven against a
 * recording fake of the two database clients.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  team: null as { id: string; role: "owner" | "member" } | null,
  handedOver: 0,
  /** the team's deals, as the list read answers them */
  teamDealIds: [] as string[],
  /** a write that fails, by table */
  failOn: null as string | null,
  deleted: false,
  writes: [] as { table: string; op: string; values?: unknown; opts?: unknown; filters: unknown[] }[],
}));

/** A query builder that records what it was asked and answers by table. */
function query(table: string) {
  const q = { table, op: "select", values: undefined as unknown, opts: undefined as unknown, filters: [] as unknown[] };
  const answer = (single: boolean) => {
    if (q.op !== "select") db.writes.push({ ...q });
    if (q.op !== "select" && db.failOn === table) return { data: null, error: { message: "write refused" } };
    if (q.op === "update" && table === "deals") return { data: null, error: null, count: db.handedOver };
    if (q.op === "select" && table === "deals" && q.filters.some((f) => (f as unknown[])[0] === "team_id")) {
      return { data: db.teamDealIds.map((id) => ({ id })), error: null };
    }
    if (q.op !== "select") return { data: null, error: null };
    if (table === "teams") return { data: { owner_id: "owner-1" }, error: null };
    if (table === "profiles") return { data: single ? {} : [], error: null };
    return { data: [], error: null };
  };
  const api = {
    select: () => api,
    update: (values: unknown, opts?: unknown) => {
      Object.assign(q, { op: "update", values, opts });
      return api;
    },
    delete: () => {
      q.op = "delete";
      return api;
    },
    eq: (col: string, val: unknown) => {
      q.filters.push([col, val]);
      return api;
    },
    in: (col: string, val: unknown) => {
      q.filters.push([col, val]);
      return api;
    },
    maybeSingle: async () => answer(true),
    // Awaited without maybeSingle(), as a list read is.
    then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(answer(false)).then(ok, fail),
  };
  return api;
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
        deleteUser: async () => {
          db.deleted = true;
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
  removeStorageFiles: async () => {},
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

beforeEach(() => {
  db.team = null;
  db.handedOver = 0;
  db.teamDealIds = [];
  db.failOn = null;
  db.deleted = false;
  db.writes.length = 0;
});

describe("deleting an account says what happened to a team's deals", () => {
  it("a member whose deals went to the team's owner lands on the sign-in page saying so", async () => {
    db.team = { id: "team-1", role: "member" };
    db.handedOver = 3;
    expect(await landing()).toBe("/login?deleted=team");
    const handover = db.writes.find((w) => w.table === "deals" && w.op === "update");
    expect(handover).toMatchObject({
      values: { user_id: "owner-1" },
      opts: { count: "exact" },
      filters: [
        ["team_id", "team-1"],
        ["user_id", "member-1"],
      ],
    });
    const text = await signInPage("team");
    expect(text).toContain("The deals you added to your team's pipeline stay with the team, handed to its owner.");
    expect(text).not.toContain("all its data have been deleted");
  });

  it("an account with nothing handed over says everything went", async () => {
    db.team = { id: "team-1", role: "member" };
    db.handedOver = 0;
    expect(await landing()).toBe("/login?deleted=1");
    db.team = null;
    expect(await landing()).toBe("/login?deleted=1");
    expect(await signInPage("1")).toContain("Your account and all its data have been deleted.");
  });

  it("a member's versions, valuations and rent roll imports on the team's deals move to the owner with the deals (pass 14)", async () => {
    db.team = { id: "team-1", role: "member" };
    db.handedOver = 1;
    db.teamDealIds = ["deal-a", "deal-b"];
    expect(await landing()).toBe("/login?deleted=team");
    for (const table of ["deal_versions", "valuations", "rent_roll_imports"]) {
      expect(db.writes.find((w) => w.table === table && w.op === "update"), table).toMatchObject({
        values: { user_id: "owner-1" },
        filters: [
          ["deal_id", ["deal-a", "deal-b"]],
          ["user_id", "member-1"],
        ],
      });
    }
    // A share link the member minted is revoked with them, never handed on.
    expect(db.writes.some((w) => w.table === "deal_shares")).toBe(false);
    expect(db.deleted).toBe(true);
  });

  it("a handover that fails stops before the account is deleted, so nothing cascades away", async () => {
    db.team = { id: "team-1", role: "member" };
    db.teamDealIds = ["deal-a"];
    for (const table of ["deals", "valuations"]) {
      db.failOn = table;
      db.deleted = false;
      expect(await landing(), table).toBe("/account?error=handover");
      expect(db.deleted, table).toBe(false);
    }
  });

  it("a team's owner is still refused, before anything is touched", async () => {
    db.team = { id: "team-1", role: "owner" };
    expect(await landing()).toBe("/account?error=ownerdelete");
    expect(db.writes).toEqual([]);
  });
});
