// The sign-in page's forms, rendered statically and linted: every control
// named, no word glued to the next — and "Resend the confirmation link"
// offered where a confirmation is what stands in the way.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The server actions the form binds to — never called in a render.
vi.mock("@/app/login/actions", () => {
  const none = async () => null;
  return { authenticate: none, requestPasswordReset: none, resendConfirmation: none };
});

import { LoginForm } from "@/app/login/login-form";
import type { LoginMode } from "@/lib/auth-flow";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

type Props = { initialMode?: LoginMode; next?: string | null; offerResend?: boolean };
const render = (props: Props) => renderToStaticMarkup(React.createElement(LoginForm, props));

describe("the sign-in page's forms", () => {
  it("every form renders clean", () => {
    for (const initialMode of ["signin", "signup", "reset", "resend"] as const) {
      const html = render({ initialMode, next: "/team/join/0a1b2c3d", offerResend: true });
      expect(a11yIssues(html), initialMode).toEqual([]);
      expect(gluedWords(visibleText(html)), initialMode).toEqual([]);
    }
  });

  it("the resend form: the address it goes to, its own button, the invite carried, the way back", () => {
    const html = render({ initialMode: "resend", next: "/team/join/0a1b2c3d" });
    const text = visibleText(html);
    expect(text).toContain("Email you signed up with");
    expect(text).toContain("Email me a new confirmation link");
    expect(text).toContain("Back to sign in");
    expect(html).toContain('name="next" value="/team/join/0a1b2c3d"');
    // One form at a time: no sign-in / create-account tabs over it.
    expect(html).not.toContain('role="tablist"');
  });

  it("is offered under the sign-in form when the page opened on a dead confirmation link, and only there", () => {
    expect(visibleText(render({ initialMode: "signin", offerResend: true }))).toContain("Resend the confirmation link");
    expect(visibleText(render({ initialMode: "signin" }))).not.toContain("Resend the confirmation link");
    expect(visibleText(render({ initialMode: "signup", offerResend: true }))).not.toContain("Resend the confirmation link");
  });
});
