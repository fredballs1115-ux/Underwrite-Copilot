/**
 * The progress rail's "We'll email you when it's done" is said only where
 * the screen-complete email will reach this reader (the first-run audit of
 * 2026-10-20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_WHEN_DONE, screenEmailPromised } from "./screen-email-promise";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const base = { emailOn: true, isSample: false, switchOn: true, viewerId: ME, creatorId: ME, teamId: null };

describe("screenEmailPromised", () => {
  it("promises the email on the reader's own personal deal, email sending and their switch on", () => {
    expect(screenEmailPromised(base)).toBe(true);
    expect(EMAIL_WHEN_DONE).toBe("We'll email you when it's done — you can close this page.");
  });

  it("never while email is paused or off, the switch is off, or the deal is the sample", () => {
    expect(screenEmailPromised({ ...base, emailOn: false })).toBe(false);
    expect(screenEmailPromised({ ...base, switchOn: false })).toBe(false);
    expect(screenEmailPromised({ ...base, isSample: true })).toBe(false);
    expect(screenEmailPromised({ ...base, viewerId: null })).toBe(false);
  });

  it("never to a reader the email does not go to", () => {
    // someone else's deal, with no asker recorded: the email is the creator's
    expect(screenEmailPromised({ ...base, creatorId: OTHER })).toBe(false);
    // a team deal with no asker recorded: another member may have started it
    expect(screenEmailPromised({ ...base, teamId: "t1" })).toBe(false);
    // the asker recorded: the email is theirs, whoever created the deal
    expect(screenEmailPromised({ ...base, teamId: "t1", creatorId: OTHER, requestedBy: ME })).toBe(true);
    expect(screenEmailPromised({ ...base, requestedBy: OTHER })).toBe(false);
  });

  it("the deal page reads the same send switch and the reader's own preference", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(src).toMatch(/emailEnabled\(\)\s*\n?\s*\?\s*wantsAnalysisEmail\(supabase, user\.id\)/);
  });
});
