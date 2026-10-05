/**
 * The Account page's password change, driven against a fake auth client: a
 * refusal reads as one sentence by its code (lib/auth-flow), never the auth
 * service's developer text, and the form's fields ask for the same eight
 * characters the copy and the server do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: { id: "u1" } as unknown,
  error: null as { code?: string; message: string } | null,
  updates: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user } }),
      updateUser: async (args: unknown) => {
        auth.updates.push(args);
        return { data: { user: auth.user }, error: auth.error };
      },
    },
  }),
}));
// The account actions' other imports, never reached by a password change.
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/storage", () => ({}));
vi.mock("@/lib/teams", () => ({}));
vi.mock("@/lib/stripe/client", () => ({}));
vi.mock("@/lib/stripe/seats", () => ({}));
vi.mock("@/lib/billing", () => ({}));
vi.mock("@/lib/branding-server", () => ({}));
vi.mock("@/lib/branding", () => ({}));
vi.mock("@/lib/deal-picture", () => ({}));
vi.mock("@/lib/flood-frame-core", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("a password change never redirects");
  },
}));

import { changePassword } from "@/app/(app)/account/actions";
import { SIGNED_OUT } from "@/lib/auth-flow";

const form = (password: string, confirm = password) => {
  const fd = new FormData();
  fd.set("password", password);
  fd.set("confirm", confirm);
  return fd;
};

beforeEach(() => {
  auth.user = { id: "u1" };
  auth.error = null;
  auth.updates.length = 0;
});

describe("changing a password on the Account page", () => {
  it("saves a new password of eight characters or more", async () => {
    expect(await changePassword(null, form("eight-ch"))).toEqual({ ok: true });
    expect(auth.updates).toEqual([{ password: "eight-ch" }]);
  });

  it("refuses under eight, and two that differ, before asking the service", async () => {
    expect(await changePassword(null, form("seven-c"))).toEqual({ error: "Password must be at least 8 characters." });
    expect(await changePassword(null, form("a-long-password", "a-long-passw0rd"))).toEqual({
      error: "The two passwords don't match.",
    });
    expect(auth.updates).toEqual([]);
  });

  it("a refusal is a sentence by its code, never the service's message", async () => {
    const cases: [{ code?: string; message: string }, string][] = [
      [
        { code: "same_password", message: "New password should be different from the old password." },
        "That's already your password — choose a different one.",
      ],
      [
        { code: "reauthentication_needed", message: "Password update requires reauthentication" },
        "For your security, sign out and sign back in, then set your new password.",
      ],
      [{ code: "session_not_found", message: "Session from session_id claim in JWT does not exist" }, SIGNED_OUT],
      [
        { code: "unexpected_failure", message: "Database error updating user" },
        "Something went wrong saving your new password — please try again.",
      ],
    ];
    for (const [err, sentence] of cases) {
      auth.error = err;
      const state = await changePassword(null, form("a-long-password"));
      expect(state, err.code).toEqual({ error: sentence });
      expect(state?.error).not.toContain(err.message);
    }
    auth.error = { code: "weak_password", message: "Password should contain at least one character of each: abc" };
    expect((await changePassword(null, form("a-long-password")))?.error).toMatch(/^That password is too weak/);
  });

  it("a signed-out request says so", async () => {
    auth.user = null;
    expect(await changePassword(null, form("a-long-password"))).toEqual({ error: SIGNED_OUT });
    expect(auth.updates).toEqual([]);
  });

  it("the form's two fields ask for the eight characters the copy and the server do", () => {
    const src = readFileSync(join(__dirname, "..", "app/(app)/account/change-password-form.tsx"), "utf8");
    const mins = [...src.matchAll(/minLength=\{(\d+)\}/g)].map((m) => Number(m[1]));
    expect(mins).toEqual([8, 8]);
    const page = readFileSync(join(__dirname, "..", "app/(app)/account/page.tsx"), "utf8");
    expect(page).toContain("Use at least 8 characters.");
  });
});
