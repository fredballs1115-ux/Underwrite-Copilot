/**
 * The sign-in door's words and routes: an auth failure reads as one sentence
 * the person can act on, an email link's code reaches the callback whichever
 * page it landed on, and the page after the exchange is the right one.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS,
  CONFIRM_LINK_FAILED,
  EMAIL_CONFIRMED,
  RESET_LINK_FAILED,
  authErrorCopy,
  authLinkBanner,
  authLinkHandoff,
  initialLoginMode,
  landingAfterExchange,
  landingAfterFailedExchange,
  safeNextPath,
} from "./auth-flow";

describe("authErrorCopy — the auth service's codes become sentences", () => {
  it("names each sign-up refusal instead of 'something went wrong'", () => {
    expect(authErrorCopy({ code: "weak_password", message: "Password should be at least 6 characters." }, "signup"))
      .toMatch(/too weak/);
    expect(authErrorCopy({ code: "email_address_invalid", message: 'Email address "a@b" is invalid' }, "signup"))
      .toMatch(/valid email address/);
    expect(authErrorCopy({ code: "user_already_exists", message: "User already registered" }, "signup"))
      .toBe(ACCOUNT_EXISTS);
    expect(authErrorCopy({ code: "signup_disabled", message: "Signups not allowed for this instance" }, "signup"))
      .toMatch(/closed right now/);
    expect(authErrorCopy({ code: "email_address_not_authorized", message: "Email address not authorized" }, "signup"))
      .toMatch(/setup problem on our side/);
    expect(authErrorCopy({ code: "over_email_send_rate_limit", message: "Email rate limit exceeded" }, "signup"))
      .toMatch(/Wait a minute before requesting another link/);
  });

  it("reads the wait out of a reset rate limit", () => {
    expect(
      authErrorCopy(
        { code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 47 seconds." },
        "reset",
      ),
    ).toBe("Wait about 47 seconds before requesting another link.");
    // Older responses carry no code — the message alone still reads.
    expect(authErrorCopy({ message: "For security purposes, you can only request this after 12 seconds." }, "reset"))
      .toBe("Wait about 12 seconds before requesting another link.");
  });

  it("keeps the sign-in mappings, by code and by message", () => {
    expect(authErrorCopy({ code: "invalid_credentials", message: "Invalid login credentials" }, "signin"))
      .toMatch(/Wrong email or password/);
    expect(authErrorCopy({ message: "Invalid login credentials" }, "signin")).toMatch(/Wrong email or password/);
    expect(authErrorCopy({ code: "email_not_confirmed", message: "Email not confirmed" }, "signin"))
      .toMatch(/Confirm your email first/);
    expect(authErrorCopy({ code: "over_request_rate_limit", message: "Request rate limit reached" }, "signin"))
      .toMatch(/Too many attempts/);
  });

  it("a validation failure reads from its message", () => {
    expect(authErrorCopy({ code: "validation_failed", message: "Password cannot be longer than 72 characters" }, "signup"))
      .toMatch(/too long/);
    expect(authErrorCopy({ code: "validation_failed", message: "Unable to validate email address: invalid format" }, "signup"))
      .toMatch(/valid email address/);
  });

  it("never shows a fetch or JSON string, and the fallback names the intent", () => {
    for (const message of ["fetch failed", "Unexpected token < in JSON is not valid JSON", "Host not found", "ECONNREFUSED"]) {
      expect(authErrorCopy({ message }, "signin")).toMatch(/Couldn't reach the sign-in service/);
    }
    expect(authErrorCopy({ code: "unexpected_failure", message: "Database error saving new user" }, "signup"))
      .toBe("Something went wrong creating your account — please try again.");
    expect(authErrorCopy({ code: "unexpected_failure", message: "x" }, "reset"))
      .toBe("Something went wrong sending the reset link — please try again.");
    expect(authErrorCopy({ code: "unexpected_failure", message: "x" }, "signin"))
      .toBe("Something went wrong signing you in — please try again.");
  });
});

describe("safeNextPath — same-origin paths only", () => {
  it("keeps a path with a query and refuses anything absolute", () => {
    expect(safeNextPath("/account?reset=1")).toBe("/account?reset=1");
    expect(safeNextPath("/deals/abc")).toBe("/deals/abc");
    expect(safeNextPath("https://evil.example/")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe("authLinkHandoff — an email link's code reaches the callback", () => {
  it("a reset link that landed on the Account page is handed over with its destination", () => {
    const to = authLinkHandoff(new URL("https://app.test/account?reset=1&code=abc-123"));
    expect(to).toBe("/auth/callback?code=abc-123&next=%2Faccount%3Freset%3D1");
  });

  it("a link that fell back to the site root still carries its code", () => {
    expect(authLinkHandoff(new URL("https://app.test/?code=abc"))).toBe("/auth/callback?code=abc&next=%2F");
  });

  it("a refused link (no code, an error code) is handed over too, without the service's prose", () => {
    const to = authLinkHandoff(
      new URL(
        "https://app.test/login?confirmed=1&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    );
    expect(to).toBe("/auth/callback?error_code=otp_expired&next=%2Flogin%3Fconfirmed%3D1");
  });

  it("leaves every other request alone, including the callback itself", () => {
    expect(authLinkHandoff(new URL("https://app.test/deals?error=auth"))).toBeNull();
    expect(authLinkHandoff(new URL("https://app.test/login?next=%2Fdeals"))).toBeNull();
    expect(authLinkHandoff(new URL("https://app.test/auth/callback?code=abc"))).toBeNull();
  });
});

describe("landingAfterExchange — where a fresh session goes", () => {
  it("a recovery link lands on the Account page's reset banner", () => {
    expect(landingAfterExchange("/account?reset=1", "recovery")).toBe("/account?reset=1");
    expect(landingAfterExchange("/", "recovery")).toBe("/account?reset=1");
    expect(landingAfterExchange(null, "recovery")).toBe("/account?reset=1");
  });

  it("a confirmation link lands in the app, never back on the sign-in page", () => {
    expect(landingAfterExchange("/login?confirmed=1", null)).toBe("/deals");
    expect(landingAfterExchange("/deals/abc", null)).toBe("/deals/abc");
    expect(landingAfterExchange("https://evil.example/", null)).toBe("/deals");
  });
});

describe("landingAfterFailedExchange — where a refused link goes", () => {
  it("a confirmation whose sign-in half failed still confirmed the address", () => {
    expect(landingAfterFailedExchange("/login?confirmed=1", true)).toBe("/login?confirmed=1");
  });

  it("a confirmation the service refused says so", () => {
    expect(landingAfterFailedExchange("/login?confirmed=1", false)).toBe("/login?confirmed=1&link=expired");
  });

  it("a failed reset opens the sign-in page on the expired-link banner", () => {
    expect(landingAfterFailedExchange("/account?reset=1", true)).toBe("/login?link=expired");
    expect(landingAfterFailedExchange(null, false)).toBe("/login?link=expired");
  });
});

describe("authLinkBanner — the sign-in page reads the link that brought someone", () => {
  it("an expired confirmation never reads as confirmed", () => {
    expect(
      authLinkBanner({
        confirmed: "1",
        error: "access_denied",
        error_code: "otp_expired",
        error_description: "Email link is invalid or has expired",
      }),
    ).toEqual({ tone: "warn", text: CONFIRM_LINK_FAILED });
    expect(authLinkBanner({ confirmed: "1", link: "expired" })).toEqual({ tone: "warn", text: CONFIRM_LINK_FAILED });
  });

  it("a confirmed address, and a refused reset", () => {
    expect(authLinkBanner({ confirmed: "1" })).toEqual({ tone: "ok", text: EMAIL_CONFIRMED });
    expect(authLinkBanner({ link: "expired" })).toEqual({ tone: "warn", text: RESET_LINK_FAILED });
    expect(authLinkBanner({})).toBeNull();
    expect(authLinkBanner({ next: "/deals" } as Record<string, string>)).toBeNull();
  });

  it("the reset copy tells the person to open the link in the browser that asked", () => {
    expect(RESET_LINK_FAILED).toMatch(/different browser/);
  });
});

describe("initialLoginMode", () => {
  it("opens the form the query asks for; a refused reset opens on the reset form", () => {
    expect(initialLoginMode({})).toBe("signin");
    expect(initialLoginMode({ mode: "signup" })).toBe("signup");
    expect(initialLoginMode({ mode: "reset" })).toBe("reset");
    expect(initialLoginMode({ link: "expired" })).toBe("reset");
    expect(initialLoginMode({ link: "expired", confirmed: "1" })).toBe("signin");
  });
});
