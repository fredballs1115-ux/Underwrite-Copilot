/**
 * A regulatory alert's dismissal is one reader's, in one browser
 * (lib/dismissed-alerts): a cookie named for the account, whose list is read
 * as untrusted text — uuids only, each once, the newest MAX_DISMISSED_ALERTS
 * — and written back bounded, newest first.
 */
import { describe, expect, it } from "vitest";
import {
  ALERT_WINDOW_DAYS,
  DISMISSED_ALERTS_COOKIE,
  DISMISSED_ALERTS_MAX_AGE,
  MAX_DISMISSED_ALERTS,
  alertWindowStart,
  dismissedCookie,
  dismissedCookieName,
  dismissedFor,
  isAlertId,
  parseDismissed,
  undismissed,
  withDismissed,
} from "./dismissed-alerts";

/** The n-th alert id, a well-formed uuid. */
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
/** Two accounts' ids. */
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

describe("the cookie's list", () => {
  it("reads uuids only, each once, in the cookie's order", () => {
    expect(parseDismissed(undefined)).toEqual([]);
    expect(parseDismissed("")).toEqual([]);
    expect(parseDismissed(`${id(1)},${id(2)}`)).toEqual([id(1), id(2)]);
    // Upper case and stray spaces are the same id; a repeat is kept once.
    expect(parseDismissed(` ${id(3).toUpperCase()} ,${id(3)},${id(4)}`)).toEqual([id(3), id(4)]);
    // Anything that is not an alert's id is dropped, whatever it carries.
    expect(parseDismissed(`${id(5)},a1,;path=/,<script>,${id(6)}x,,${id(7)}`)).toEqual([id(5), id(7)]);
    expect(isAlertId("a1")).toBe(false);
    expect(isAlertId(id(1))).toBe(true);
  });

  it("keeps at most the newest MAX_DISMISSED_ALERTS of a longer list", () => {
    const long = Array.from({ length: MAX_DISMISSED_ALERTS + 25 }, (_, i) => id(i + 1));
    const read = parseDismissed(long.join(","));
    expect(read).toHaveLength(MAX_DISMISSED_ALERTS);
    expect(read).toEqual(long.slice(0, MAX_DISMISSED_ALERTS));
  });

  it("puts a new dismissal first and drops the oldest past the bound", () => {
    expect(withDismissed([id(1), id(2)], id(3))).toEqual([id(3), id(1), id(2)]);
    // Dismissed again: moved to the front, not doubled.
    expect(withDismissed([id(1), id(2), id(3)], id(3).toUpperCase())).toEqual([id(3), id(1), id(2)]);
    const full = Array.from({ length: MAX_DISMISSED_ALERTS }, (_, i) => id(i + 1));
    const next = withDismissed(full, id(999));
    expect(next).toHaveLength(MAX_DISMISSED_ALERTS);
    expect(next[0]).toBe(id(999));
    expect(next).not.toContain(id(MAX_DISMISSED_ALERTS));
    // An id that is not an alert's changes nothing.
    expect(withDismissed([id(1)], "a1; path=/")).toEqual([id(1)]);
  });
});

describe("the cookie the dismissal sets", () => {
  it("is the whole site's, unreadable by script, lax, secure in production, a year", () => {
    const c = dismissedCookie(`${id(1)},junk`, id(2), true, ALICE)!;
    expect(c.name).toBe(`${DISMISSED_ALERTS_COOKIE}_${ALICE}`);
    expect(c.value).toBe(`${id(2)},${id(1)}`);
    expect(c.options).toEqual({ path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: DISMISSED_ALERTS_MAX_AGE });
    expect(DISMISSED_ALERTS_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(dismissedCookie(undefined, id(2), false, ALICE)!.options.secure).toBe(false);
    // Fifty ids and their commas — encoded, as Next writes a cookie's value —
    // stay well inside a cookie's 4 KB.
    const full = Array.from({ length: MAX_DISMISSED_ALERTS + 10 }, (_, i) => id(i + 1)).join(",");
    expect(encodeURIComponent(dismissedCookie(full, id(999), true, ALICE)!.value).length).toBeLessThan(2048);
  });

  it("is named for the account, so a second account on the same browser keeps its own list (the audit of 2026-09-30)", () => {
    expect(dismissedCookieName(ALICE)).not.toBe(dismissedCookieName(BOB));
    expect(dismissedCookie(undefined, id(1), true, BOB)!.name).toBe(dismissedCookieName(BOB));
    // Only a uuid's characters reach the name, whatever the id holds.
    expect(dismissedCookieName("A;b=c\r\n1")).toBe(`${DISMISSED_ALERTS_COOKIE}_abc1`);
  });

  it("is not set for an id that is not an alert's", () => {
    expect(dismissedCookie(id(1), "", true, ALICE)).toBeNull();
    expect(dismissedCookie(id(1), "x\r\nSet-Cookie: a=b", true, ALICE)).toBeNull();
  });
});

describe("the list a reader has dismissed (the audit of 2026-10-01)", () => {
  const jar = (cookies: Record<string, string>) => (name: string) => cookies[name];

  it("is the account's cookie where there is one, whatever the old shared cookie holds", () => {
    const get = jar({ [dismissedCookieName(ALICE)]: id(2), [DISMISSED_ALERTS_COOKIE]: `${id(1)},${id(3)}` });
    expect(dismissedFor(get, ALICE)).toEqual([id(2)]);
  });

  it("falls back to the old shared cookie before the reader's first dismissal under the account's name", () => {
    const get = jar({ [DISMISSED_ALERTS_COOKIE]: `${id(1)},${id(3)}` });
    expect(dismissedFor(get, ALICE)).toEqual([id(1), id(3)]);
    // …and the first dismissal under the account's name carries them.
    const next = dismissedCookie(dismissedFor(get, ALICE).join(","), id(4), true, ALICE)!;
    expect(next.name).toBe(dismissedCookieName(ALICE));
    expect(parseDismissed(next.value)).toEqual([id(4), id(1), id(3)]);
  });

  it("is empty with neither cookie, and an emptied account cookie is not filled from the old one", () => {
    expect(dismissedFor(jar({}), ALICE)).toEqual([]);
    expect(dismissedFor(jar({ [dismissedCookieName(ALICE)]: "", [DISMISSED_ALERTS_COOKIE]: id(1) }), ALICE)).toEqual([]);
  });
});

describe("which alerts still ask for attention", () => {
  it("starts the window ALERT_WINDOW_DAYS before now", () => {
    expect(ALERT_WINDOW_DAYS).toBe(30);
    expect(alertWindowStart(new Date("2026-09-30T12:00:00Z"))).toBe("2026-08-31T12:00:00.000Z");
  });

  it("keeps the rows this browser has not dismissed, in order, up to the limit", () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({ id: id(n) }));
    expect(undismissed(rows, [id(1), id(3)], 3).map((r) => r.id)).toEqual([id(2), id(4), id(5)]);
    expect(undismissed(rows, [], 2).map((r) => r.id)).toEqual([id(1), id(2)]);
    expect(undismissed(rows, [id(2)]).map((r) => r.id)).toEqual([id(1), id(3), id(4), id(5)]);
  });
});
