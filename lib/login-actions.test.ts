/**
 * The sign-in page's server actions, driven against a fake auth client: the
 * page a person was headed to (an invite, a plan) rides through a sign-up's
 * confirmation link and a sign-in's redirect, and a hostile `next` never
 * leaves the site.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; args: Record<string, unknown> };
const auth = vi.hoisted(() => ({
  calls: [] as { method: string; args: Record<string, unknown> }[],
  session: null as unknown,
  error: null as { code?: string; message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signUp: async (args: Record<string, unknown>) => {
        auth.calls.push({ method: "signUp", args });
        return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: auth.session }, error: auth.error };
      },
      signInWithPassword: async (args: Record<string, unknown>) => {
        auth.calls.push({ method: "signInWithPassword", args });
        return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: auth.session }, error: auth.error };
      },
    },
  }),
}));

// A redirect from a server action throws in Next; here it throws its target.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { authenticate } from "@/app/login/actions";

const ORIGIN = "https://app.test";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Where a server action redirected, or null when it returned a state. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (!m) throw e;
    return m[1];
  }
}

const lastCall = (): Call => auth.calls[auth.calls.length - 1];

beforeEach(() => {
  auth.calls.length = 0;
  auth.session = null;
  auth.error = null;
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
});

describe("a sign-up carries where the person was headed through its confirmation link", () => {
  it("an invitee's confirmation link points back at the invite", async () => {
    const state = await authenticate(
      null,
      form({ intent: "signup", email: "new@firm.example", password: "a-long-password", next: "/team/join/0a1b2c3d" }),
    );
    expect(state?.notice).toMatch(/Account created/);
    const { method, args } = lastCall();
    expect(method).toBe("signUp");
    expect((args.options as { emailRedirectTo: string }).emailRedirectTo).toBe(
      `${ORIGIN}/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d`,
    );
  });

  it("the homepage's plan buttons ride through too", async () => {
    for (const next of ["/billing", "/team"]) {
      await authenticate(null, form({ intent: "signup", email: "new@firm.example", password: "a-long-password", next }));
      expect((lastCall().args.options as { emailRedirectTo: string }).emailRedirectTo).toBe(
        `${ORIGIN}/login?confirmed=1&next=${encodeURIComponent(next)}`,
      );
    }
  });

  it("a hostile next is refused, and the link points where it always did", async () => {
    for (const next of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      await authenticate(null, form({ intent: "signup", email: "new@firm.example", password: "a-long-password", next }));
      expect((lastCall().args.options as { emailRedirectTo: string }).emailRedirectTo, next).toBe(
        `${ORIGIN}/login?confirmed=1`,
      );
    }
  });
});

describe("a sign-in goes where the person was headed", () => {
  it("to the invite, or into the app when the next is hostile", async () => {
    auth.session = { access_token: "t" };
    const signIn = (next: string) =>
      redirectOf(() => authenticate(null, form({ intent: "signin", email: "a@firm.example", password: "a-long-password", next })));
    expect(await signIn("/team/join/0a1b2c3d")).toBe("/team/join/0a1b2c3d");
    expect(await signIn("https://evil.example/")).toBe("/deals");
    expect(await signIn("//evil.example")).toBe("/deals");
  });
});
