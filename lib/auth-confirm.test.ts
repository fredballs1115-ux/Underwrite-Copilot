/**
 * The click-through page an email link lands on with its token hash
 * (research pass 32): it verifies only when its one button is pressed, so a
 * link scanner's fetch uses nothing up, and a reset asked for on one device
 * opens on another.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const auth = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  result: { data: { session: { access_token: "t" } }, error: null } as {
    data: { session: unknown };
    error: { code?: string; message: string } | null;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp: async (args: Record<string, unknown>) => {
        auth.calls.push(args);
        return auth.result;
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { confirmEmailLink } from "@/app/auth/confirm/actions";
import ConfirmPage from "@/app/auth/confirm/page";
import { confirmPageCopy, emailLinkTypeOf, isTokenHash, landingAfterConfirm } from "./auth-flow";

const HASH = "pkce_0123456789abcdef0123456789abcdef0123456789abcdef";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function landing(fields: Record<string, string>): Promise<string> {
  try {
    await confirmEmailLink(form(fields));
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
  throw new Error("no redirect");
}

beforeEach(() => {
  auth.calls.length = 0;
  auth.result = { data: { session: { access_token: "t" } }, error: null };
});

describe("the link's kind and hash, read before anything is asked", () => {
  it("knows the auth service's email link kinds and refuses anything else", () => {
    expect(emailLinkTypeOf("recovery")).toBe("recovery");
    expect(emailLinkTypeOf("signup")).toBe("signup");
    expect(emailLinkTypeOf("sms")).toBeNull();
    expect(emailLinkTypeOf(null)).toBeNull();
    expect(isTokenHash(HASH)).toBe(true);
    expect(isTokenHash("short")).toBe(false);
    expect(isTokenHash(`${HASH}<script>`)).toBe(false);
  });

  it("says what the button does, by the kind", () => {
    expect(confirmPageCopy("recovery").heading).toBe("Set a new password");
    expect(confirmPageCopy("signup").button).toBe("Confirm my email");
  });

  it("lands a verified reset on the Account page and a refused one on the reset form", () => {
    expect(landingAfterConfirm("recovery", null, true)).toBe("/account?reset=1");
    expect(landingAfterConfirm("recovery", null, false)).toBe("/login?link=expired");
    expect(landingAfterConfirm("signup", "/team/join/0a1b2c3d", true)).toBe("/team/join/0a1b2c3d");
    expect(landingAfterConfirm("signup", "/team/join/0a1b2c3d", false)).toBe(
      "/login?confirmed=1&link=expired&next=%2Fteam%2Fjoin%2F0a1b2c3d",
    );
    // A hostile next never leaves the site.
    expect(landingAfterConfirm("signup", "https://evil.example/", true)).toBe("/deals");
  });
});

describe("the page verifies nothing until its button is pressed", () => {
  it("renders the one button with the hash and kind, and asks the auth service nothing", async () => {
    const page = await ConfirmPage({ searchParams: Promise.resolve({ token_hash: HASH, type: "recovery", next: "/account?reset=1" }) });
    const html = renderToStaticMarkup(page);
    expect(auth.calls).toHaveLength(0);
    expect(visibleText(html)).toContain("Set a new password");
    expect(html).toContain(`name="token_hash" value="${HASH}"`);
    expect(html).toContain('name="type" value="recovery"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    // The page's module never reaches for the auth client itself.
    expect(readFileSync(join(process.cwd(), "app/auth/confirm/page.tsx"), "utf8")).not.toMatch(/createSupabase|verifyOtp/);
  });

  it("says an incomplete link is incomplete, with the way to a new one", async () => {
    const html = renderToStaticMarkup(await ConfirmPage({ searchParams: Promise.resolve({ type: "recovery" }) }));
    expect(visibleText(html)).toContain("This link is incomplete");
    expect(html).toContain('href="/login?link=expired"');
    expect(html).not.toContain("<form");
  });

  it("on the press, verifies the hash and goes where a code's exchange would", async () => {
    expect(await landing({ token_hash: HASH, type: "recovery" })).toBe("/account?reset=1");
    expect(auth.calls).toEqual([{ type: "recovery", token_hash: HASH }]);
    auth.result = { data: { session: null }, error: { code: "otp_expired", message: "Token has expired or is invalid" } };
    expect(await landing({ token_hash: HASH, type: "signup", next: "/billing" })).toBe("/login?confirmed=1&link=expired&next=%2Fbilling");
  });

  it("asks nothing of a link whose kind or hash it does not read", async () => {
    expect(await landing({ token_hash: "x", type: "recovery" })).toBe("/login?link=expired");
    expect(await landing({ token_hash: HASH, type: "sms" })).toBe("/login?confirmed=1&link=expired");
    expect(auth.calls).toHaveLength(0);
  });
});
