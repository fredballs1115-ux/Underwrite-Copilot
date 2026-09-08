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
