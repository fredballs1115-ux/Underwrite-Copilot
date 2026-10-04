import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  UNSUBSCRIBE_KEY_LABEL,
  emailUnsubscribeToken,
  emailUnsubscribeUrl,
  isOneClickBody,
  oneClickHeaders,
  readEmailUnsubscribeToken,
} from "./email-unsubscribe";
import { emailPictureToken } from "./email-picture";

const USER = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
});

/** A token signed as this module signs, but under any label and setting. */
function signedUnder(label: string, body: string): string {
  const key = createHmac("sha256", "test-service-role-key").update(label).digest();
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url").slice(0, 22)}`;
}

describe("the digest's one-click unsubscribe token — the only permission a mail provider carries", () => {
  it("names the user and the one setting it was minted for", () => {
    const token = emailUnsubscribeToken(USER.toUpperCase(), "digest")!;
    expect(token).toMatch(new RegExp(`^${USER}\\.digest\\.[A-Za-z0-9_-]{22}$`));
    expect(readEmailUnsubscribeToken(token)).toEqual({ userId: USER, setting: "digest" });
  });

  it("refuses a token altered in any character, or naming another user", () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    for (let i = 0; i < token.length; i++) {
      const c = token[i];
      if (c === "." || c === "-") continue;
      const swapped = token.slice(0, i) + (c === "a" ? "b" : "a") + token.slice(i + 1);
      expect(readEmailUnsubscribeToken(swapped), `character ${i}`).toBeNull();
    }
    const other = "00000000-0000-4000-8000-000000000000";
    expect(readEmailUnsubscribeToken(`${other}${token.slice(36)}`)).toBeNull();
  });

  it("refuses a token signed under any label but its own — the picture's above all — and a setting no link may turn off", () => {
    expect(signedUnder(UNSUBSCRIBE_KEY_LABEL, `${USER}.digest`)).toBe(emailUnsubscribeToken(USER, "digest"));
    expect(readEmailUnsubscribeToken(signedUnder("underwrite-copilot/email-picture/v1", `${USER}.digest`))).toBeNull();
    // A picture token is never an unsubscribe, nor the other way round.
    expect(readEmailUnsubscribeToken(emailPictureToken(USER, USER)!)).toBeNull();
    // Only the digest can be turned off by a link — the screen emails keep their switch.
    expect(readEmailUnsubscribeToken(signedUnder(UNSUBSCRIBE_KEY_LABEL, `${USER}.analysis`))).toBeNull();
    expect(emailUnsubscribeToken(USER, "analysis" as never)).toBeNull();
  });

  it("refuses what is not a token, mints none without a key or for an id that is not a user's, and a rotated key retires them all", () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    for (const bad of ["", "abc", USER, `${USER}.digest`, `${USER}.digest.short`, "../../etc/passwd", `${token}x`]) {
      expect(readEmailUnsubscribeToken(bad), bad).toBeNull();
    }
    expect(emailUnsubscribeToken("u1", "digest")).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect(readEmailUnsubscribeToken(token)).toBeNull();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(emailUnsubscribeToken(USER, "digest")).toBeNull();
    expect(emailUnsubscribeUrl("https://underwrite.example", USER, "digest")).toBeNull();
  });

  it("builds the https URI the digest names, and the two header fields RFC 8058 asks for", () => {
    const url = emailUnsubscribeUrl("https://underwrite.example/", USER, "digest")!;
    const m = /^https:\/\/underwrite\.example\/api\/email\/unsubscribe\/([^/?#]+)$/.exec(url);
    expect(m).not.toBeNull();
    expect(readEmailUnsubscribeToken(m![1])).toEqual({ userId: USER, setting: "digest" });
    expect(oneClickHeaders(url)).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("reads the one-click body form-encoded, bare or as a multipart field, and nothing else", async () => {
    expect(await isOneClickBody("application/x-www-form-urlencoded", "List-Unsubscribe=One-Click")).toBe(true);
    expect(await isOneClickBody(null, "List-Unsubscribe=One-Click\r\n")).toBe(true);
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    const multipart = new Request("http://x/", { method: "POST", body: form });
    expect(await isOneClickBody(multipart.headers.get("content-type"), await multipart.text())).toBe(true);
    for (const body of ["", "List-Unsubscribe=Yes", "unsubscribe=One-Click", "List-Unsubscribe-Post=One-Click"]) {
      expect(await isOneClickBody("application/x-www-form-urlencoded", body), body).toBe(false);
    }
    expect(await isOneClickBody("multipart/form-data; boundary=x", "not multipart at all")).toBe(false);
  });
});
