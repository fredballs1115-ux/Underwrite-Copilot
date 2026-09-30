// One calendar event as an iCalendar file (RFC 5545) — pure. The deal's
// call for offers as an all-day event with a reminder two days before, so a
// deadline read out of a memorandum lands in the calendar a deal team
// actually lives in (#467).
//
// The format's three traps, each handled here and pinned by a test: lines
// end in CRLF, never LF; a text value escapes its backslashes, semicolons,
// commas and newlines; and a line longer than 75 octets is folded, the
// continuation starting with a space — counted in BYTES, since a deal's
// name may carry an accent or a dash that is more than one.

export interface AllDayEvent {
  /** a stable id, so a second download updates the same event */
  uid: string;
  /** the day, ISO (YYYY-MM-DD) */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  /** days before the event to remind; none where absent */
  remindDaysBefore?: number;
  /** the moment the file is made (DTSTAMP) */
  now: Date;
}

/** A text value escaped as RFC 5545 §3.3.11 requires. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** A content line folded at 75 octets (§3.1), each continuation led by a
 *  space; never splits a multi-byte character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  // The first line holds 75 octets; each continuation 74 after its space.
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const day = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The event as a whole .ics file, CRLF throughout. */
export function allDayEventIcs(e: AllDayEvent): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error("allDayEventIcs: date must be YYYY-MM-DD");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Underwrite Copilot//Offers due//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(e.uid)}`,
    `DTSTAMP:${stamp(e.now)}`,
    `DTSTART;VALUE=DATE:${day(e.date)}`,
    `DTEND;VALUE=DATE:${day(nextDay(e.date))}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "TRANSP:TRANSPARENT",
    ...(e.remindDaysBefore != null && e.remindDaysBefore > 0
      ? ["BEGIN:VALARM", `TRIGGER:-P${Math.round(e.remindDaysBefore)}D`, "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.summary)}`, "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
