// The offering process (#467) — when offers are due and who is selling it,
// as the memorandum's cover and process page state them. A deal team lives
// by the bid calendar and the broker's phone number, and the screen read
// neither: the deadline was a date the reader typed in by hand, and the
// listing team sat on a page nobody opened twice.
//
// Pure — no I/O, no model call. The extraction files the date as a row of
// its own ("Offers due", exactly as written — never a tour date or a
// closing date) and the brokers as `listingTeam` (each as printed). This
// reads them into what every surface says.
//
// Four rules.
//
// A DEADLINE IS A DAY. Only a date with its day and its year is a deadline
// the pipeline counts down to; "October 2026" or "Thursday, October 15th"
// with no year is shown as written and never stored, because a guessed
// year moves the deadline by a year.
//
// THE READER'S DATE WINS. The memorandum's date fills the deal's deadline
// only where nobody has set one; a date the reader typed is never
// overwritten, and a date the broker moves is theirs to retype.
//
// A BROKER IS AS PRINTED. A name, a title, a firm, a phone and an email as
// the memorandum prints them — never looked up. A phone becomes a link only
// where it has a whole North American number's ten digits; an email only
// where it is one plain address (`mailtoAddressOf`), and one carrying more
// than an address is printed as written, unlinked.
//
// A BLANK IS NULL. No team is an empty list, and no stated date is none.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { parsePageNumber } from "@/lib/facts";
import { parseStatedDate } from "@/lib/note-yield";

const OFFERS_DUE = /^(?:offers?\s+due|call\s+for\s+offers|bid\s+date|offer\s+date|offer\s+deadline|best\s+and\s+final)\b/i;
// A row that states nothing.
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|t\.b\.d\.|[-–—])?\.?$/i;
const AS_RECEIVED = /\bas\s+received\b|\brolling\s+basis\b|\bon\s+a\s+rolling\b|\bupon\s+receipt\b/i;
// A date written with its day: "October 15, 2026", "Oct. 15th 2026",
// "10/15/2026", "2026-10-15".
const WITH_DAY = /\d{4}-\d{1,2}-\d{1,2}|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/;

export interface OffersDueRead {
  /** the deadline as a day (ISO), null where the memorandum states no
   *  whole date — no day, or no year */
  iso: string | null;
  /** the row as written */
  stated: string;
  /** offers are reviewed as they arrive: no deadline to count down to */
  asReceived: boolean;
  /** "p. 2", or "" where the page is not one the memorandum has */
  page: string;
}

/** When offers are due, as the memorandum states it. Null where it states
 *  nothing. */
export function offersDueOf(ex: ExtractionResult | null | undefined): OffersDueRead | null {
  const rows = Array.isArray(ex?.metrics) ? ex!.metrics : [];
  const row = rows.find(
    (m) => m && typeof m.label === "string" && typeof m.value === "string" && OFFERS_DUE.test(m.label.trim()) && !NOT_STATED.test(m.value.trim()),
  );
  if (!row) return null;
  const stated = row.value.trim();
  const asReceived = AS_RECEIVED.test(stated);
  const iso = !asReceived && WITH_DAY.test(stated) ? parseStatedDate(stated, 2000, 2100) : null;
  const pages = typeof ex?.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(row.page);
  return { iso, stated, asReceived, page: n != null && pages != null && n <= pages ? (row.page ?? "").trim() : "" };
}

/**
 * The deadline the deal should carry: the memorandum's day where the deal
 * has none, else null (nothing to write). The reader's own date is never
 * replaced.
 */
export function offersDueUpgrade(current: string | null | undefined, ex: ExtractionResult | null | undefined): string | null {
  if (current) return null;
  return offersDueOf(ex)?.iso ?? null;
}

// ── In a calendar ───────────────────────────────────────────────────────

// A time of day as written — "5:00 PM", "3 p.m.", "12:00 noon", "17:00" —
// with the zone that follows it where one does: "ET", "(EST)", "Eastern
// Time", "local time".
const TIME_OF_DAY =
  /\b(?:(?:12(?::00)?\s*)?noon|\d{1,2}(?::[0-5]\d)?\s*[ap]\.?\s?m\b\.?|\d{1,2}:[0-5]\d(?!\d))(?:,?\s*\((?:[ECMP][SD]?T|Eastern|Central|Mountain|Pacific|local)[^)]{0,24}\)|,?\s*\b[ECMP][SD]?T\b|,?\s+(?:Eastern|Central|Mountain|Pacific)(?:\s+(?:Standard|Daylight))?(?:\s+Time)?\b|\s+local\s+time\b)?/gi;

/**
 * The time of day the memorandum's words give the deadline, as written
 * with its zone: "5:00 PM ET". Null where they give none, or two different
 * ones — a window is not a deadline.
 */
export function offersDueTimeOf(stated: string): string | null {
  const found = new Map<string, string>();
  for (const m of stated.matchAll(TIME_OF_DAY)) {
    const said = m[0].trim();
    found.set(said.toLowerCase().replace(/[\s.,()]/g, ""), said);
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

export interface OffersDueEventText {
  summary: string;
  description: string;
}

/**
 * The calendar event's words (research pass 35). An all-day event holds no
 * time of day, and a deadline at noon read off a calendar as "all day" is
 * a deadline missed — so where the deal's deadline is the memorandum's day,
 * the description opens on the memorandum's own words, the time with them,
 * and its page where the memorandum has one, then the deal's link; and the
 * summary carries the time where the words state one. A day the reader set
 * that is not the memorandum's gets the link alone: the memorandum's words
 * are about another day.
 */
export function offersDueEventText(
  due: string,
  name: string,
  link: string,
  ex: ExtractionResult | null | undefined,
): OffersDueEventText {
  const read = offersDueOf(ex);
  if (!read || read.iso !== due) return { summary: `Offers due — ${name}`, description: link };
  const time = offersDueTimeOf(read.stated);
  const page = parsePageNumber(read.page);
  return {
    summary: time ? `Offers due ${time} — ${name}` : `Offers due — ${name}`,
    description: `Offers due as the memorandum states it: ${read.stated}${page != null ? ` (OM p. ${page})` : ""}\n${link}`,
  };
}

// ── The listing team ────────────────────────────────────────────────────

export interface ListingBroker {
  name: string;
  title: string;
  firm: string;
  /** the phone as printed */
  phone: string;
  /** "tel:+12155550100" where the phone is a whole number, else null */
  tel: string | null;
  /** the email where it is one plain address, else null: the only one a
   *  page links */
  email: string | null;
  /** the email as printed wherever it names an address (it carries an @),
   *  linked or not; "" where it names none */
  emailText: string;
  page: string;
}

/** The team at most this long: an OM's contacts page names two to four. */
export const LISTING_TEAM_MAX = 6;

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
/** Characters a mailto link reads as more than an address. The
 *  memorandum's words are not ours, so an address carrying any of them is
 *  printed as written and never linked (research pass 39): a link writes to
 *  the address it shows, and nothing else. */
const MAILTO_EXTRA = /[?&=%]/;

/** The address a page may link a "mailto:" to, or null: one plain address,
 *  as printed, with nothing a mail link reads beyond it. */
export function mailtoAddressOf(printed: string): string | null {
  const email = printed.trim().replace(/^mailto:/i, "");
  return EMAIL.test(email) && !MAILTO_EXTRA.test(email) ? email : null;
}

/** A North American number's link: ten digits, or eleven after a leading
 *  1; an extension is dropped from the link and kept in the words. */
export function telOf(phone: string): string | null {
  const main = phone.split(/\b(?:x|ext\.?|extension)\s*\d/i)[0];
  const digits = main.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return null;
}

/** The listing team as printed, in the memorandum's order; every broker
 *  named, each at most once. */
export function listingTeamOf(ex: ExtractionResult | null | undefined): ListingBroker[] {
  const team = Array.isArray(ex?.listingTeam) ? ex!.listingTeam : [];
  const seen = new Set<string>();
  const out: ListingBroker[] = [];
  const pages = typeof ex?.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  for (const b of team) {
    const name = (b?.name ?? "").trim();
    if (!name || NOT_STATED.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const phone = (b.phone ?? "").trim();
    const email = (b.email ?? "").trim().replace(/^mailto:/i, "");
    const n = parsePageNumber(b.page);
    out.push({
      name,
      title: (b.title ?? "").trim(),
      firm: (b.firm ?? "").trim(),
      phone: NOT_STATED.test(phone) ? "" : phone,
      tel: phone ? telOf(phone) : null,
      email: mailtoAddressOf(email),
      emailText: email.includes("@") ? email : "",
      page: n != null && pages != null && n <= pages ? (b.page ?? "").trim() : "",
    });
    if (out.length >= LISTING_TEAM_MAX) break;
  }
  return out;
}

/** The brokerage (or brokerages) offering the deal, as printed: "CBRE",
 *  "Newmark · JLL". Null where the memorandum names no firm. */
export function brokerageOf(ex: ExtractionResult | null | undefined): string | null {
  const firms: string[] = [];
  for (const b of listingTeamOf(ex)) {
    if (b.firm && !firms.some((f) => f.toLowerCase() === b.firm.toLowerCase())) firms.push(b.firm);
  }
  return firms.length ? firms.join(" · ") : null;
}

/** A person's initials for an avatar: the first letters of the first and
 *  last words, "JD" for "Jane Q. Doe". */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[,(].*$/, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
