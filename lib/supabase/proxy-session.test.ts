/**
 * The first gate on every request, driven with a fake auth client: a
 * signed-out visit to the app bounces to sign-in with its destination, a
 * signed-in visit to sign-in goes where it was headed (query intact), and an
 * email link's code is handed to the callback before either bounce can strip
 * it.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let signedIn = false;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: "u1" } : null }, error: null }),
    },
  }),
}));

import { PROTECTED_PREFIXES, updateSession } from "./proxy-session";

async function after(url: string): Promise<{ status: number; to: string | null }> {
  const res = await updateSession(new NextRequest(url));
  const loc = res.headers.get("location");
  return { status: res.status, to: loc ? new URL(loc).pathname + new URL(loc).search : null };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("updateSession — the email-link hand-off", () => {
  it("a reset link that landed on the Account page goes to the callback with its code, signed out", async () => {
    signedIn = false;
    expect(await after("https://app.test/account?reset=1&code=abc-123")).toEqual({
      status: 307,
      to: "/auth/callback?code=abc-123&next=%2Faccount%3Freset%3D1",
    });
  });

  it("…and signed in, and from the site root", async () => {
    signedIn = true;
    expect((await after("https://app.test/account?reset=1&code=abc")).to).toBe(
      "/auth/callback?code=abc&next=%2Faccount%3Freset%3D1",
    );
    expect((await after("https://app.test/?code=abc")).to).toBe("/auth/callback?code=abc&next=%2F");
  });

  it("a refused confirmation link on the sign-in page is handed over instead of reading as confirmed", async () => {
    signedIn = false;
    expect(
      (await after("https://app.test/login?confirmed=1&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).to,
    ).toBe("/auth/callback?error_code=otp_expired&next=%2Flogin%3Fconfirmed%3D1");
  });

  it("the callback itself is left alone", async () => {
    signedIn = false;
    expect(await after("https://app.test/auth/callback?code=abc&next=%2Faccount%3Freset%3D1")).toEqual({
      status: 200,
      to: null,
    });
  });
});

describe("updateSession — the sign-in bounces", () => {
  it("a signed-out visit to any signed-in area carries its destination", async () => {
    signedIn = false;
    expect((await after("https://app.test/deals/abc")).to).toBe("/login?next=%2Fdeals%2Fabc");
    expect((await after("https://app.test/submarkets/s1")).to).toBe("/login?next=%2Fsubmarkets%2Fs1");
    expect((await after("https://app.test/news")).to).toBe("/login?next=%2Fnews");
    for (const p of PROTECTED_PREFIXES) {
      expect((await after(`https://app.test${p}`)).status).toBe(307);
    }
  });

  it("public pages pass through signed out", async () => {
    signedIn = false;
    for (const p of ["/", "/market", "/demo", "/why", "/login", "/share/abc"]) {
      expect((await after(`https://app.test${p}`)).status).toBe(200);
    }
  });

  it("a signed-in visit to the sign-in page goes where it was headed, query intact", async () => {
    signedIn = true;
    expect((await after("https://app.test/login?next=%2Fdeals%3Ferror%3Dauth")).to).toBe("/deals?error=auth");
    expect((await after("https://app.test/login")).to).toBe("/deals");
    expect((await after("https://app.test/login?next=https%3A%2F%2Fevil.example")).to).toBe("/deals");
  });
});
