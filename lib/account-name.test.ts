/**
 * The Account page's "Your name" (signed-in gaps, H2), driven against a fake
 * database: the name goes to the reader's own profile row through the
 * reader's own session, an empty field clears it, an email or an overlong
 * name is refused before anything is written, and a write that touched no
 * row is said rather than taken for saved. The grant and the policy the
 * write leans on are held to the migrations that make them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { id: "u1", email: "fredballs1115@gmail.com" } as unknown,
  writes: [] as { table: string; values: unknown; eq: [string, unknown] }[],
  rows: [{ id: "u1" }] as unknown[],
  error: null as unknown,
  meta: [] as unknown[],
  revalidated: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: db.user } }),
      updateUser: async (args: unknown) => {
        db.meta.push(args);
        return { data: { user: db.user }, error: null };
      },
    },
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: (col: string, val: unknown) => ({
          select: async () => {
            db.writes.push({ table, values, eq: [col, val] });
            return { data: db.rows, error: db.error };
          },
        }),
      }),
    }),
  }),
}));
// The account actions' other imports, never reached by a name.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("a name is never written with the service role");
  },
}));
vi.mock("@/lib/storage", () => ({}));
vi.mock("@/lib/teams", () => ({}));
vi.mock("@/lib/stripe/client", () => ({}));
vi.mock("@/lib/stripe/seats", () => ({}));
vi.mock("@/lib/billing", () => ({}));
vi.mock("@/lib/branding-server", () => ({}));
vi.mock("@/lib/branding", () => ({}));
vi.mock("@/lib/deal-picture", () => ({}));
vi.mock("@/lib/flood-frame-core", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => db.revalidated.push(args) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("redirect"), { to });
  },
}));

import { saveFullName } from "@/app/(app)/account/actions";

const save = async (value: string | null): Promise<string> => {
  const fd = new FormData();
  if (value != null) fd.set("fullName", value);
  try {
    await saveFullName(fd);
  } catch (e) {
    return (e as { to?: string }).to ?? "threw";
  }
  return "returned";
};

beforeEach(() => {
  db.user = { id: "u1", email: "fredballs1115@gmail.com" };
  db.writes.length = 0;
  db.rows = [{ id: "u1" }];
  db.error = null;
  db.meta.length = 0;
  db.revalidated.length = 0;
});

describe("saving your name on the Account page", () => {
  it("writes the name to the reader's own profile row, and its copy to the account's metadata", async () => {
    expect(await save("  Fred   Balls ")).toBe("/account?name=saved#name");
    expect(db.writes).toEqual([{ table: "profiles", values: { full_name: "Fred Balls" }, eq: ["id", "u1"] }]);
    expect(db.meta).toEqual([{ data: { full_name: "Fred Balls" } }]);
    expect(db.revalidated).toEqual([["/", "layout"]]);
  });

  it("clears the name with an empty field", async () => {
    expect(await save("   ")).toBe("/account?name=saved#name");
    expect(db.writes[0].values).toEqual({ full_name: null });
  });

  it("refuses an email and an overlong name before anything is written", async () => {
    expect(await save("fredballs1115@gmail.com")).toBe("/account?error=nameemail#name");
    expect(await save("x".repeat(81))).toBe("/account?error=namelong#name");
    expect(db.writes).toEqual([]);
  });

  it("says so when the write touched no row or failed, never that it saved", async () => {
    db.rows = [];
    expect(await save("Fred")).toBe("/account?error=namesave#name");
    db.rows = [{ id: "u1" }];
    db.error = { message: "permission denied" };
    expect(await save("Fred")).toBe("/account?error=namesave#name");
    expect(db.meta).toEqual([]);
  });

  it("asks a signed-out visitor to sign in", async () => {
    db.user = null;
    expect(await save("Fred")).toBe("/login");
    expect(db.writes).toEqual([]);
  });
});

describe("what the write leans on", () => {
  const migration = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
  it("is a column a signed-in reader may update, on their own row alone", () => {
    expect(migration("0008_buy_box.sql")).toContain("grant update (full_name, criteria) on public.profiles to authenticated;");
    expect(migration("0001_init.sql")).toMatch(
      /create policy "own profile" on public\.profiles\s+for all using \(auth\.uid\(\) = id\) with check \(auth\.uid\(\) = id\);/,
    );
  });

  it("is a field on the Account page, with every refusal said", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/account/page.tsx"), "utf8");
    expect(page).toContain("action={saveFullName}");
    expect(page).toContain('name="fullName"');
    for (const key of ["namesave:", "namelong:", "nameemail:"]) expect(page).toContain(key);
  });
});
