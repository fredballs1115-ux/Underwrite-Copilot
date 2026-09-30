import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMAIL_PICTURE_DAYS,
  emailPictureToken,
  emailPictureUrl,
  readEmailPictureToken,
} from "./email-picture";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
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

describe("the email's picture token (#464) — the only permission an email client carries", () => {
  it("names the deal it was minted for, until it expires", () => {
    const token = emailPictureToken(DEAL, NOW)!;
    expect(readEmailPictureToken(token, NOW)).toBe(DEAL);
    expect(readEmailPictureToken(token, NOW + (EMAIL_PICTURE_DAYS - 1) * 86_400_000)).toBe(DEAL);
    expect(readEmailPictureToken(token, NOW + (EMAIL_PICTURE_DAYS + 1) * 86_400_000)).toBeNull();
  });

  it("refuses a token altered in any character, or minted under another key", () => {
    const token = emailPictureToken(DEAL, NOW)!;
    for (let i = 0; i < token.length; i++) {
      const c = token[i];
      if (c === "." || c === "-") continue;
      const swapped = token.slice(0, i) + (c === "a" ? "b" : "a") + token.slice(i + 1);
      expect(readEmailPictureToken(swapped, NOW), `character ${i}`).toBeNull();
    }
    // Another deal's id with this token's signature.
    const other = "00000000-0000-4000-8000-000000000000";
    expect(readEmailPictureToken(`${other}${token.slice(36)}`, NOW)).toBeNull();
    // A rotated key retires every link already sent.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect(readEmailPictureToken(token, NOW)).toBeNull();
  });

  it("refuses what is not a token, and mints none without a key or for an id that is not a deal's", () => {
    for (const bad of ["", "abc", `${DEAL}`, `${DEAL}.x`, `${DEAL}.zz.short`, "../../etc/passwd", `${DEAL}.1.${"A".repeat(23)}`]) {
      expect(readEmailPictureToken(bad, NOW)).toBeNull();
    }
    expect(emailPictureToken("not-a-uuid", NOW)).toBeNull();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(emailPictureToken(DEAL, NOW)).toBeNull();
    expect(emailPictureUrl("https://example.com", DEAL, "banner", NOW)).toBeNull();
  });

  it("builds the URL an email draws from, for either frame", () => {
    const url = emailPictureUrl("https://underwrite.example/", DEAL.toUpperCase(), "thumb", NOW)!;
    const m = /^https:\/\/underwrite\.example\/api\/email\/picture\/([^?]+)\?s=thumb$/.exec(url);
    expect(m).not.toBeNull();
    expect(readEmailPictureToken(m![1], NOW)).toBe(DEAL);
    expect(emailPictureUrl("https://underwrite.example", DEAL, "banner", NOW)).toMatch(/\?s=banner$/);
  });
});
