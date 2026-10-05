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
      resend: async (args: Record<string, unknown>) => {
        auth.calls.push({ method: "resend", args });
        return { data: { user: null, session: null }, error: auth.error };
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

import { authenticate, resendConfirmation } from "@/app/login/actions";
import { CONFIRMATION_RESENT } from "@/lib/auth-flow";

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

describe("Resend the confirmation link", () => {
  it("asks the auth service's own resend for a sign-up, carrying next as the sign-up did", async () => {
    const state = await resendConfirmation(
      null,
      form({ email: " new@firm.example ", next: "/team/join/0a1b2c3d" }),
    );
    expect(lastCall()).toEqual({
      method: "resend",
      args: {
        type: "signup",
        email: "new@firm.example",
        options: { emailRedirectTo: `${ORIGIN}/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d` },
      },
    });
    // The service answers alike for any address, and so does the page.
    expect(state).toEqual({ intent: "resend", notice: CONFIRMATION_RESENT, email: "new@firm.example" });
  });

  it("refuses a hostile next, and asks for an address before calling anything", async () => {
    await resendConfirmation(null, form({ email: "new@firm.example", next: "https://evil.example/" }));
    expect((lastCall().args.options as { emailRedirectTo: string }).emailRedirectTo).toBe(`${ORIGIN}/login?confirmed=1`);
    auth.calls.length = 0;
    expect((await resendConfirmation(null, form({ email: "  " })))?.error).toBe("Enter the email you signed up with.");
    expect(auth.calls).toEqual([]);
  });

  it("never says 'wait a minute' to someone who never asked: our cap is ours, the address's own wait has its seconds", async () => {
    auth.error = { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" };
    const capped = await resendConfirmation(null, form({ email: "new@firm.example" }));
    expect(capped?.error).toBe("Our email is rate-limited right now, so the link didn't go out — please try again shortly.");
    expect(capped?.email).toBe("new@firm.example");
    auth.error = {
      code: "over_email_send_rate_limit",
      message: "For security purposes, you can only request this after 41 seconds.",
    };
    expect((await resendConfirmation(null, form({ email: "new@firm.example" })))?.error).toBe(
      "Wait about 41 seconds before requesting another link.",
    );
    auth.error = { code: "unexpected_failure", message: "Database error" };
    expect((await resendConfirmation(null, form({ email: "new@firm.example" })))?.error).toBe(
      "Something went wrong sending the confirmation link — please try again.",
    );
  });

  it("is offered where a confirmation is what stands in the way", async () => {
    auth.error = { code: "email_not_confirmed", message: "Email not confirmed" };
    const refused = await authenticate(null, form({ intent: "signin", email: "new@firm.example", password: "a-long-password" }));
    expect(refused).toMatchObject({ intent: "signin", resend: true, email: "new@firm.example" });
    expect(refused?.error).toMatch(/Confirm your email first/);
    auth.error = { code: "invalid_credentials", message: "Invalid login credentials" };
    expect((await authenticate(null, form({ intent: "signin", email: "a@firm.example", password: "a-long-password" })))?.resend).toBeUndefined();
    auth.error = null;
    const created = await authenticate(null, form({ intent: "signup", email: "new@firm.example", password: "a-long-password" }));
    expect(created).toMatchObject({ intent: "signup", resend: true, email: "new@firm.example" });
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
