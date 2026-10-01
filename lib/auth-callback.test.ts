/**
 * The email-link callback, driven end to end against a fake auth client: the
 * one-time code becomes a session and the person lands on the right page; a
 * refused code lands on the sign-in page with the right banner.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExchangeResult = {
  data: { session: unknown; user: unknown; redirectType: string | null };
  error: { code?: string; message: string } | null;
};
let exchange: (code: string) => Promise<ExchangeResult>;
const exchanged: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        exchanged.push(code);
        return exchange(code);
      },
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";
import { authLinkHandoff, confirmationRedirect } from "@/lib/auth-flow";

const ok = (redirectType: string | null): ExchangeResult => ({
  data: { session: { access_token: "t" }, user: { id: "u1" }, redirectType },
  error: null,
});
const refused = (code: string, message: string): ExchangeResult => ({
  data: { session: null, user: null, redirectType: null },
  error: { code, message },
});

async function land(url: string): Promise<string> {
  const res = await GET(new NextRequest(url));
  expect(res.status).toBe(307);
  return new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  exchanged.length = 0;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("GET /auth/callback", () => {
  it("a password-reset code becomes a session and lands on the Account page's reset banner", async () => {
    exchange = async () => ok("recovery");
    expect(await land("https://app.test/auth/callback?code=abc-123&next=%2Faccount%3Freset%3D1")).toBe(
      "/account?reset=1",
    );
    expect(exchanged).toEqual(["abc-123"]);
  });

  it("a recovery link that lost its destination still lands on the reset banner", async () => {
    exchange = async () => ok("recovery");
    expect(await land("https://app.test/auth/callback?code=abc&next=%2F")).toBe("/account?reset=1");
  });

  it("a confirmation code signs the person in and lands in the app", async () => {
    exchange = async () => ok(null);
    expect(await land("https://app.test/auth/callback?code=abc&next=%2Flogin%3Fconfirmed%3D1")).toBe("/deals");
  });

  it("a reset code the service refuses (another browser, a second click) lands on the expired-link banner", async () => {
    exchange = async (code) => refused("bad_code_verifier", `no verifier for ${code}`);
    expect(await land("https://app.test/auth/callback?code=abc&next=%2Faccount%3Freset%3D1")).toBe(
      "/login?link=expired",
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("bad_code_verifier"));
  });

  it("a confirmation code that fails to exchange still confirmed the address", async () => {
    exchange = async () => refused("flow_state_not_found", "flow state not found");
    expect(await land("https://app.test/auth/callback?code=abc&next=%2Flogin%3Fconfirmed%3D1")).toBe(
      "/login?confirmed=1",
    );
  });

  it("a link the service already refused (no code) says the link expired", async () => {
    exchange = async () => {
      throw new Error("must not be called");
    };
    expect(await land("https://app.test/auth/callback?error_code=otp_expired&next=%2Flogin%3Fconfirmed%3D1")).toBe(
      "/login?confirmed=1&link=expired",
    );
    expect(await land("https://app.test/auth/callback?error_code=otp_expired&next=%2Faccount%3Freset%3D1")).toBe(
      "/login?link=expired",
    );
    expect(exchanged).toEqual([]);
  });

  it("an exchange that throws is a refused link, not a crash", async () => {
    exchange = async () => {
      throw new Error("socket hang up");
    };
    expect(await land("https://app.test/auth/callback?code=abc")).toBe("/login?link=expired");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("socket hang up"));
  });

  it("never follows an off-site destination", async () => {
    exchange = async () => ok(null);
    expect(await land("https://app.test/auth/callback?code=abc&next=https%3A%2F%2Fevil.example%2F")).toBe("/deals");
  });
});

describe("an invitee who creates an account lands on the invite, not an empty pipeline", () => {
  // The confirmation link as the auth service sends it back: the target the
  // sign-up asked for (confirmationRedirect), with the code appended.
  const fromEmail = (next: string | null) =>
    new URL(`${confirmationRedirect("https://app.test", next)}&code=abc`);
  /** The proxy's handoff, then the callback, as a browser would follow them. */
  const follow = async (url: URL) => land(`https://app.test${authLinkHandoff(url)!}`);

  it("signs the person in and opens the invite they signed up from", async () => {
    exchange = async () => ok(null);
    expect(await follow(fromEmail("/team/join/0a1b2c3d"))).toBe("/team/join/0a1b2c3d");
    expect(await follow(fromEmail("/billing"))).toBe("/billing");
    expect(await follow(fromEmail(null))).toBe("/deals");
  });

  it("a confirmation whose sign-in half failed keeps the invite for the sign-in that follows", async () => {
    exchange = async () => refused("bad_code_verifier", "opened in another browser");
    expect(await follow(fromEmail("/team/join/0a1b2c3d"))).toBe("/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d");
  });

  it("a hostile next carried on the link lands in the app", async () => {
    exchange = async () => ok(null);
    // Built by hand: confirmationRedirect itself would drop it.
    const forged = new URL("https://app.test/login?confirmed=1&next=https%3A%2F%2Fevil.example%2F&code=abc");
    expect(await follow(forged)).toBe("/deals");
    const protocolRelative = new URL("https://app.test/login?confirmed=1&next=%2F%2Fevil.example&code=abc");
    expect(await follow(protocolRelative)).toBe("/deals");
  });
});
