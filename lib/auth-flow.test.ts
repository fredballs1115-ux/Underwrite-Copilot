/**
 * The sign-in door's words and routes: an auth failure reads as one sentence
 * the person can act on, an email link's code reaches the callback whichever
 * page it landed on, and the page after the exchange is the right one.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS,
  CONFIRMATION_RESENT,
  CONFIRM_LINK_FAILED,
  EMAIL_CONFIRMED,
  RESET_LINK_FAILED,
  SIGNED_OUT,
  authErrorCopy,
  authLinkBanner,
  awaitingConfirmation,
  authLinkHandoff,
  confirmationRedirect,
  initialLoginMode,
  landingAfterExchange,
  landingAfterFailedExchange,
  safeNextPath,
} from "./auth-flow";

/** Every shape of `next` that must never leave the site or loop. */
const HOSTILE_NEXT = [
  "https://evil.example/",
  "//evil.example",
  "/\\evil.example",
  "javascript:alert(1)",
  "/team/join/0a1b\n",
  " /billing",
  "/billing#x",
  "/a b",
  "/deals@evil.example",
];

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
  });

  it("the project's hourly email cap says it is ours, never 'wait before requesting another'", () => {
    // It trips during a sign-up spike, for people who asked for nothing.
    for (const intent of ["signup", "reset"] as const) {
      const copy = authErrorCopy({ code: "over_email_send_rate_limit", message: "Email rate limit exceeded" }, intent);
      expect(copy, intent).toBe(
        "Our email is rate-limited right now, so the link didn't go out — please try again shortly.",
      );
      expect(copy).not.toMatch(/wait a minute|another link/i);
      // Older responses carry no code.
      expect(authErrorCopy({ message: "Email rate limit exceeded" }, intent), intent).toBe(copy);
    }
    // Any other rate limit is still the request limit.
    expect(authErrorCopy({ message: "Request rate limit reached" }, "signin")).toMatch(/Too many attempts/);
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

  it("a password change reads as a sentence, never the service's own text", () => {
    expect(authErrorCopy({ code: "same_password", message: "New password should be different from the old password." }, "password"))
      .toBe("That's already your password — choose a different one.");
    expect(authErrorCopy({ message: "New password should be different from the old password." }, "password"))
      .toBe("That's already your password — choose a different one.");
    for (const code of ["reauthentication_needed", "reauthentication_not_valid", "reauth_nonce_missing"]) {
      expect(authErrorCopy({ code, message: "Password update requires reauthentication" }, "password"), code)
        .toBe("For your security, sign out and sign back in, then set your new password.");
    }
    for (const code of ["session_not_found", "session_expired"]) {
      expect(authErrorCopy({ code, message: "Session from session_id claim in JWT does not exist" }, "password"), code)
        .toBe(SIGNED_OUT);
    }
    expect(authErrorCopy({ code: "weak_password", message: "Password should contain at least one character of each: abc" }, "password"))
      .toMatch(/too weak/);
    expect(authErrorCopy({ code: "unexpected_failure", message: "Database error updating user" }, "password"))
      .toBe("Something went wrong saving your new password — please try again.");
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

describe("a confirmation that stands in the way is offered again", () => {
  it("awaitingConfirmation reads the code, and the message where there is none", () => {
    expect(awaitingConfirmation({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe(true);
    expect(awaitingConfirmation({ message: "Email not confirmed" })).toBe(true);
    expect(awaitingConfirmation({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
    // A code that says otherwise wins over words that happen to match.
    expect(awaitingConfirmation({ code: "over_request_rate_limit", message: "email not confirmed" })).toBe(false);
  });

  it("the resend's words: neutral about the address, and a fallback of its own", () => {
    expect(CONFIRMATION_RESENT).toMatch(/^If that address is waiting to be confirmed/);
    expect(authErrorCopy({ code: "unexpected_failure", message: "x" }, "resend")).toBe(
      "Something went wrong sending the confirmation link — please try again.",
    );
    // The expired-link banner points at the button the page now shows.
    expect(CONFIRM_LINK_FAILED).toContain("Resend the confirmation link");
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
    for (const n of HOSTILE_NEXT) expect(safeNextPath(n), JSON.stringify(n)).toBeNull();
  });
});

describe("confirmationRedirect — where a sign-up was headed rides through its confirmation link", () => {
  it("carries the invite the person signed up from, and the plan they picked", () => {
    expect(confirmationRedirect("https://app.test", "/team/join/0a1b2c3d")).toBe(
      "https://app.test/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d",
    );
    expect(confirmationRedirect("https://app.test", "/billing")).toBe("https://app.test/login?confirmed=1&next=%2Fbilling");
    expect(confirmationRedirect("https://app.test", "/team")).toBe("https://app.test/login?confirmed=1&next=%2Fteam");
  });

  it("points where it always did with nothing worth carrying", () => {
    for (const n of [null, "", "/", "/login", "/login?confirmed=1&next=%2Fbilling"]) {
      expect(confirmationRedirect("https://app.test", n), String(n)).toBe("https://app.test/login?confirmed=1");
    }
  });

  it("refuses a hostile next, leaving the link as it was", () => {
    for (const n of HOSTILE_NEXT) {
      expect(confirmationRedirect("https://app.test", n), JSON.stringify(n)).toBe("https://app.test/login?confirmed=1");
    }
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

  it("a confirmation link that carried an invite or a plan lands there", () => {
    expect(landingAfterExchange("/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d", null)).toBe("/team/join/0a1b2c3d");
    expect(landingAfterExchange("/login?confirmed=1&next=%2Fbilling", null)).toBe("/billing");
    // The auth service may re-order the query when it appends the code.
    expect(landingAfterExchange("/login?next=%2Fteam&confirmed=1", null)).toBe("/team");
  });

  it("a carried next that is hostile, or the sign-in page again, lands in the app", () => {
    for (const n of HOSTILE_NEXT) {
      const carried = `/login?confirmed=1&next=${encodeURIComponent(n)}`;
      expect(landingAfterExchange(carried, null), JSON.stringify(n)).toBe("/deals");
    }
    expect(landingAfterExchange("/login?confirmed=1&next=%2Flogin%3Fnext%3D%252Fbilling", null)).toBe("/deals");
    expect(landingAfterExchange("/login?confirmed=1&next=%2F", null)).toBe("/deals");
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

  it("keeps the page a confirmation carried, so the sign-in that follows goes there", () => {
    const invite = "/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d";
    expect(landingAfterFailedExchange(invite, true)).toBe("/login?confirmed=1&next=%2Fteam%2Fjoin%2F0a1b2c3d");
    expect(landingAfterFailedExchange(invite, false)).toBe(
      "/login?confirmed=1&link=expired&next=%2Fteam%2Fjoin%2F0a1b2c3d",
    );
    for (const n of HOSTILE_NEXT) {
      const carried = `/login?confirmed=1&next=${encodeURIComponent(n)}`;
      const landed = landingAfterFailedExchange(carried, true);
      // Never carried on. (A path whose own characters fail the rule — the
      // bare parentheses of "javascript:alert(1)" — is refused whole, and
      // lands on the plain expired-link page.)
      expect(landed, JSON.stringify(n)).toMatch(/^\/login\?(confirmed=1|link=expired)$/);
    }
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
