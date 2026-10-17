/**
 * The click-through page an email link lands on with its token hash
 * (research pass 32): it verifies only when its one button is pressed, so a
 * link scanner's fetch uses nothing up, and a reset asked for on one device
 * opens on another. Since research pass 39 it verifies only the kinds of
 * link the app sends, never replaces an account already signed in to the
 * browser without asking first, and lands on a line naming the account
 * signed in — a token hash needs no code verifier from the browser that
 * asked, so a link made for one account can be opened in another's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

type User = { id: string; email: string };

const auth = vi.hoisted(() => ({
  /** every call the auth client was asked, in order */
  calls: [] as [string, unknown?][],
  /** who this browser is signed in as */
  user: null as User | null,
  /** a session read that fails for a reason other than "no session" */
  readFails: false,
  /** who the link's hash belongs to, and what verifying it answers */
  linkUser: { id: "link-owner", email: "link.owner@example.com" } as User,
  result: { data: { session: { access_token: "t" } }, error: null } as {
    data: { session: unknown };
    error: { code?: string; message: string } | null;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => {
        auth.calls.push(["getUser"]);
        if (auth.readFails) return { data: { user: null }, error: { name: "AuthApiError", message: "the session could not be read" } };
        return auth.user
          ? { data: { user: auth.user }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } };
      },
      signOut: async (opts: unknown) => {
        auth.calls.push(["signOut", opts]);
        auth.user = null;
        return { error: null };
      },
      verifyOtp: async (args: Record<string, unknown>) => {
        auth.calls.push(["verifyOtp", args]);
        if (!auth.result.error) auth.user = auth.linkUser;
        return auth.result;
      },
    },
  }),
  getCurrentUser: async () => auth.user,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { confirmEmailLink, signOutHere } from "@/app/auth/confirm/actions";
import ConfirmPage from "@/app/auth/confirm/page";
import {
  confirmPageCopy,
  confirmSwitchCopy,
  confirmSwitchPath,
  confirmedPath,
  emailLinkTypeOf,
  isTokenHash,
  landingAfterConfirm,
} from "./auth-flow";

const HASH = "pkce_0123456789abcdef0123456789abcdef0123456789abcdef";
const SIGNED_IN: User = { id: "already-here", email: "already.here@example.com" };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Where an action sends the person. */
async function landing(act: () => Promise<void>): Promise<string> {
  try {
    await act();
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
  throw new Error("no redirect");
}
const press = (fields: Record<string, string>) => landing(() => confirmEmailLink(form(fields)));
const names = () => auth.calls.map((c) => c[0]);

async function page(query: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(await ConfirmPage({ searchParams: Promise.resolve(query) }));
}

beforeEach(() => {
  auth.calls.length = 0;
  auth.user = null;
  auth.readFails = false;
  auth.result = { data: { session: { access_token: "t" } }, error: null };
});

describe("the link's kind and hash, read before anything is asked", () => {
  it("verifies only the kinds the app sends: a sign-up's confirmation and a reset", () => {
    expect(emailLinkTypeOf("recovery")).toBe("recovery");
    expect(emailLinkTypeOf("signup")).toBe("signup");
    expect(emailLinkTypeOf("email")).toBe("email");
    for (const never of ["invite", "magiclink", "email_change", "sms", null]) expect(emailLinkTypeOf(never)).toBeNull();
    expect(isTokenHash(HASH)).toBe(true);
    expect(isTokenHash("short")).toBe(false);
    expect(isTokenHash(`${HASH}<script>`)).toBe(false);
  });

  it("the app asks the auth service for no other kind of email (a sign-up, its resend, a reset)", () => {
    const login = readFileSync(join(process.cwd(), "app/login/actions.ts"), "utf8");
    expect(login).toContain("supabase.auth.signUp(");
    expect(login).toContain('type: "signup"');
    expect(login).toContain("supabase.auth.resetPasswordForEmail(");
    for (const file of ["app/login/actions.ts", "app/(app)/account/actions.ts", "app/(app)/team/actions.ts"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/signInWithOtp|inviteUserByEmail|generateLink|updateUser\(\{\s*email/);
    }
  });

  it("says what the button does, by the kind", () => {
    expect(confirmPageCopy("recovery").heading).toBe("Set a new password");
    expect(confirmPageCopy("signup").button).toBe("Confirm my email");
  });

  it("lands a refused reset on the reset form, and a refused confirmation on its banner", () => {
    expect(landingAfterConfirm("recovery", null, true)).toBe("/account?reset=1");
    expect(landingAfterConfirm("recovery", null, false)).toBe("/login?link=expired");
    expect(landingAfterConfirm("signup", "/team/join/0a1b2c3d", true)).toBe("/team/join/0a1b2c3d");
    expect(landingAfterConfirm("signup", "/team/join/0a1b2c3d", false)).toBe(
      "/login?confirmed=1&link=expired&next=%2Fteam%2Fjoin%2F0a1b2c3d",
    );
    // A hostile next never leaves the site.
    expect(landingAfterConfirm("signup", "https://evil.example/", true)).toBe("/deals");
    expect(confirmedPath("https://evil.example/")).toBe("/auth/confirm?signed_in=1&next=%2Fdeals");
    expect(confirmSwitchPath("recovery", HASH, "//evil.example")).toBe(`/auth/confirm?token_hash=${HASH}&type=recovery&switch=1`);
  });
});

describe("the page verifies nothing until its button is pressed", () => {
  it("renders the one button with the hash and kind, and asks the auth service nothing", async () => {
    const html = await page({ token_hash: HASH, type: "recovery", next: "/account?reset=1" });
    expect(auth.calls).toHaveLength(0);
    expect(visibleText(html)).toContain("Set a new password");
    expect(html).toContain(`name="token_hash" value="${HASH}"`);
    expect(html).toContain('name="type" value="recovery"');
    expect(html).not.toContain('name="replace"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    // The page's module never verifies or reaches for the auth client itself:
    // it reads who is signed in, through the request's one cached read.
    const src = readFileSync(join(process.cwd(), "app/auth/confirm/page.tsx"), "utf8");
    expect(src).not.toMatch(/createSupabase|verifyOtp/);
  });

  it("says an incomplete link is incomplete, with the way to a new one", async () => {
    const html = await page({ type: "recovery" });
    expect(visibleText(html)).toContain("This link is incomplete");
    expect(html).toContain('href="/login?link=expired"');
    expect(html).not.toContain("<form");
  });

  it("draws a link of a kind the app never sends as incomplete, with no button", async () => {
    for (const type of ["magiclink", "invite", "email_change"]) {
      const html = await page({ token_hash: HASH, type });
      expect(visibleText(html), type).toContain("This link is incomplete");
      expect(html, type).not.toContain("<form");
    }
  });
});

describe("a press in a browser no one is signed in to", () => {
  it("verifies the hash and lands on the line naming the account now signed in", async () => {
    expect(await press({ token_hash: HASH, type: "recovery" })).toBe(confirmedPath("/account?reset=1"));
    expect(names()).toEqual(["getUser", "verifyOtp"]);
    expect(auth.calls[1][1]).toEqual({ type: "recovery", token_hash: HASH });
  });

  it("lands a refused link on the sign-in page's banner, signed in as no one", async () => {
    auth.result = { data: { session: null }, error: { code: "otp_expired", message: "Token has expired or is invalid" } };
    expect(await press({ token_hash: HASH, type: "signup", next: "/billing" })).toBe("/login?confirmed=1&link=expired&next=%2Fbilling");
  });

  it("asks nothing of a link whose kind or hash it does not read — a magic link to a deal included", async () => {
    expect(await press({ token_hash: "x", type: "recovery" })).toBe("/login?link=expired");
    expect(await press({ token_hash: HASH, type: "sms" })).toBe("/login?confirmed=1&link=expired");
    for (const type of ["magiclink", "invite", "email_change"]) {
      expect(await press({ token_hash: HASH, type, next: "/deals/00000000-0000-0000-0000-000000000000" }), type).toBe(
        "/login?confirmed=1&link=expired&next=%2Fdeals%2F00000000-0000-0000-0000-000000000000",
      );
    }
    expect(auth.calls).toHaveLength(0);
  });
});

describe("a press in a browser another account is signed in to", () => {
  it("asks first: the first press verifies nothing and signs no one out", async () => {
    auth.user = SIGNED_IN;
    const to = await press({ token_hash: HASH, type: "signup", next: "/billing" });
    expect(to).toBe(confirmSwitchPath("signup", HASH, "/billing"));
    expect(names()).toEqual(["getUser"]);
    expect(auth.user).toBe(SIGNED_IN);
  });

  it("the question names the account signed in, and its button carries the second press", async () => {
    auth.user = SIGNED_IN;
    const html = await page({ token_hash: HASH, type: "signup", next: "/billing", switch: "1" });
    const text = visibleText(html);
    expect(text).toContain(`You’re signed in as ${SIGNED_IN.email}`);
    expect(text).toContain(`Continuing signs ${SIGNED_IN.email} out of this browser first`);
    expect(text).toContain(`Stay signed in as ${SIGNED_IN.email}`);
    expect(html).toContain('name="replace" value="1"');
    expect(html).toContain('name="next" value="/billing"');
    expect(names()).not.toContain("verifyOtp");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("the second press signs this browser's session out, then verifies, then names the account signed in", async () => {
    auth.user = SIGNED_IN;
    const to = await press({ token_hash: HASH, type: "recovery", replace: "1" });
    expect(names()).toEqual(["getUser", "signOut", "verifyOtp"]);
    expect(auth.calls[1][1]).toEqual({ scope: "local" });
    expect(to).toBe(confirmedPath("/account?reset=1"));
    const html = await page({ signed_in: "1", next: "/account?reset=1" });
    const text = visibleText(html);
    expect(text).toContain(`Signed in as ${auth.linkUser.email} — not you? Sign out`);
    expect(html).toContain('href="/account?reset=1"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a session it cannot read is asked about too, never replaced on one press", async () => {
    auth.readFails = true;
    expect(await press({ token_hash: HASH, type: "recovery" })).toBe(confirmSwitchPath("recovery", HASH, null));
    expect(names()).toEqual(["getUser"]);
    expect(confirmSwitchCopy("recovery", null).heading).toBe("This browser may be signed in already");
  });

  it("says what the link does and whom continuing signs out, as the action does it (audit C3b LOW-3)", () => {
    // The link signs this browser in, where the new password is set on the
    // next screen; and the second press signs out whoever is signed in here,
    // the same account included, as the press test above shows.
    const named = confirmSwitchCopy("recovery", "ana@example.com");
    expect(named.body).toBe(
      "This link signs this browser in to the account it was sent to, and takes you on to set its new password. Continuing signs ana@example.com out of this browser first.",
    );
    expect(named.body).not.toContain("If that is another account");
    expect(confirmSwitchCopy("recovery", null).body).toBe(
      "This link signs this browser in to the account it was sent to, and takes you on to set its new password. Continuing signs out whoever is signed in here first.",
    );
    expect(confirmSwitchCopy("signup", "ana@example.com").body).toBe(
      "This link confirms the account it was sent to, and signs this browser in to that account. Continuing signs ana@example.com out of this browser first.",
    );
  });
});

describe("the line a verified link lands on", () => {
  it("names the account, with a sign-out of this browser beside it, and the way on", async () => {
    auth.user = auth.linkUser;
    const html = await page({ signed_in: "1", next: "/team/join/0a1b2c3d" });
    expect(visibleText(html)).toContain(`Signed in as ${auth.linkUser.email} — not you? Sign out`);
    expect(html).toContain('href="/team/join/0a1b2c3d"');
    // A next that is not the site's own path goes to the pipeline instead.
    expect(await page({ signed_in: "1", next: "https://evil.example/" })).toContain('href="/deals"');
  });

  it("says so where no one is signed in after all", async () => {
    const text = visibleText(await page({ signed_in: "1" })).replace(/\s+/g, " ");
    expect(text).toContain("You’re not signed in");
    expect(text).toContain("Sign in to carry on.");
  });

  it("not you? signs this browser's session out, and only it", async () => {
    auth.user = auth.linkUser;
    expect(await landing(() => signOutHere())).toBe("/login");
    expect(auth.calls).toEqual([["signOut", { scope: "local" }]]);
  });
});
