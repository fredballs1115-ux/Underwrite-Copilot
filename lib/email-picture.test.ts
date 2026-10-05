import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMAIL_PICTURE_DAYS,
  emailPictureToken,
  emailPictureUrl,
  readEmailPictureToken,
} from "./email-picture";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
const USER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const OTHER_USER = "11111111-2222-4333-8444-555555555555";
const NOW = Date.parse("2026-09-30T06:00:00Z");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
});

/**
 * A token as the server minted it before the recipient was carried: the
 * deal and an expiry, signed under the same key and label. Built here by
 * hand, so this also pins the key's derivation — a changed label would
 * retire every link already in an inbox.
 */
function legacyToken(dealId: string, now: number): string {
  const key = createHmac("sha256", "test-service-role-key").update("underwrite-copilot/email-picture/v1").digest();
  const body = `${dealId}.${(Math.floor(now / 1000) + EMAIL_PICTURE_DAYS * 86_400).toString(36)}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url").slice(0, 22)}`;
}

describe("the email's picture token (#464) — the only permission an email client carries", () => {
  it("names the deal and the person it was minted for, until it expires", () => {
    const token = emailPictureToken(DEAL, USER, NOW)!;
    expect(token.startsWith(`${DEAL}.${USER}.`)).toBe(true);
    expect(readEmailPictureToken(token, NOW)).toEqual({ dealId: DEAL, recipient: USER });
    expect(readEmailPictureToken(token, NOW + (EMAIL_PICTURE_DAYS - 1) * 86_400_000)).toEqual({ dealId: DEAL, recipient: USER });
    expect(readEmailPictureToken(token, NOW + (EMAIL_PICTURE_DAYS + 1) * 86_400_000)).toBeNull();
  });

  it("refuses a token altered in any character, or minted under another key", () => {
    const token = emailPictureToken(DEAL, USER, NOW)!;
    for (let i = 0; i < token.length; i++) {
      const c = token[i];
      if (c === "." || c === "-") continue;
      const swapped = token.slice(0, i) + (c === "a" ? "b" : "a") + token.slice(i + 1);
      expect(readEmailPictureToken(swapped, NOW), `character ${i}`).toBeNull();
    }
    // A rotated key retires every link already sent.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect(readEmailPictureToken(token, NOW)).toBeNull();
  });

  it("cannot be replayed for another deal or another person", () => {
    const token = emailPictureToken(DEAL, USER, NOW)!;
    const [, , exp, sig] = token.split(".");
    const other = "00000000-0000-4000-8000-000000000000";
    // Another deal's id, or another person's, under this token's signature.
    expect(readEmailPictureToken(`${other}.${USER}.${exp}.${sig}`, NOW)).toBeNull();
    expect(readEmailPictureToken(`${DEAL}.${OTHER_USER}.${exp}.${sig}`, NOW)).toBeNull();
    // The person dropped, to pass for a token that names no one.
    expect(readEmailPictureToken(`${DEAL}.${exp}.${sig}`, NOW)).toBeNull();
    // …and a person added to a legacy token, to pass for theirs.
    const legacy = legacyToken(DEAL, NOW);
    const [, lexp, lsig] = legacy.split(".");
    expect(readEmailPictureToken(`${DEAL}.${USER}.${lexp}.${lsig}`, NOW)).toBeNull();
  });

  it("still reads a token minted before the recipient was carried, until its year runs out", () => {
    const legacy = legacyToken(DEAL, NOW);
    expect(readEmailPictureToken(legacy, NOW)).toEqual({ dealId: DEAL, recipient: null });
    expect(readEmailPictureToken(legacy, NOW + (EMAIL_PICTURE_DAYS + 1) * 86_400_000)).toBeNull();
  });

  it("refuses what is not a token, and mints none without a key, or for an id that is not a uuid", () => {
    for (const bad of [
      "",
      "abc",
      `${DEAL}`,
      `${DEAL}.x`,
      `${DEAL}.zz.short`,
      `${DEAL}.${USER}.zz.short`,
      "../../etc/passwd",
      `${DEAL}.1.${"A".repeat(23)}`,
      `${DEAL}.${"-".repeat(36)}.1.${"A".repeat(22)}`,
    ]) {
      expect(readEmailPictureToken(bad, NOW)).toBeNull();
    }
    expect(emailPictureToken("not-a-uuid", USER, NOW)).toBeNull();
    expect(emailPictureToken(DEAL, "u1", NOW)).toBeNull();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(emailPictureToken(DEAL, USER, NOW)).toBeNull();
    expect(readEmailPictureToken(legacyToken(DEAL, NOW), NOW)).toBeNull();
    expect(emailPictureUrl("https://example.com", DEAL, "banner", USER, NOW)).toBeNull();
  });

  it("builds the URL an email draws from, for either frame, signed for its recipient", () => {
    const url = emailPictureUrl("https://underwrite.example/", DEAL.toUpperCase(), "thumb", USER.toUpperCase(), NOW)!;
    const m = /^https:\/\/underwrite\.example\/api\/email\/picture\/([^?]+)\?s=thumb$/.exec(url);
    expect(m).not.toBeNull();
    expect(readEmailPictureToken(m![1], NOW)).toEqual({ dealId: DEAL, recipient: USER });
    expect(emailPictureUrl("https://underwrite.example", DEAL, "banner", USER, NOW)).toMatch(/\?s=banner$/);
  });
});
