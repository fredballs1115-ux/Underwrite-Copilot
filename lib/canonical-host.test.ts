import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical-host";

const at = (u: string) => new URL(u);

describe("canonicalRedirect — one address for the site (#430)", () => {
  it("is inert until the operator names the canonical host", () => {
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/demo"), "GET", undefined)).toBeNull();
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/demo"), "GET", "  ")).toBeNull();
  });

  it("sends a page request at another host to the canonical one, path and query kept", () => {
    const to = canonicalRedirect(at("https://underwrite-copilot.onrender.com/market?metro=dc"), "GET", "underwritecopilot.com");
    expect(to?.toString()).toBe("https://underwritecopilot.com/market?metro=dc");
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/"), "HEAD", "UnderwriteCopilot.com")?.toString()).toBe(
      "https://underwritecopilot.com/",
    );
  });

  it("leaves the canonical host, the API, the auth exchange, a posted form and a local server alone", () => {
    expect(canonicalRedirect(at("https://underwritecopilot.com/demo"), "GET", "underwritecopilot.com")).toBeNull();
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/api/stripe/webhook"), "GET", "underwritecopilot.com")).toBeNull();
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/auth/callback?code=x"), "GET", "underwritecopilot.com")).toBeNull();
    expect(canonicalRedirect(at("https://underwrite-copilot.onrender.com/deals"), "POST", "underwritecopilot.com")).toBeNull();
    expect(canonicalRedirect(at("http://localhost:3000/demo"), "GET", "underwritecopilot.com")).toBeNull();
    expect(canonicalRedirect(at("http://127.0.0.1:3123/demo"), "GET", "underwritecopilot.com")).toBeNull();
  });
});
