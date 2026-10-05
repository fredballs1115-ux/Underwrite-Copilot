/**
 * A dated window or an effective date a research text states, read only as
 * written — and what a page says once today is past it.
 *
 * Rules and market notes state figures for a window: Los Angeles's "CURRENT
 * CAP: 3% for increases effective July 1, 2026 - June 30, 2027", Takoma
 * Park's "July 1, 2026 - June 30, 2027 allowance published at 3.0%",
 * California's "the maximum is 8.7% for increases from Aug 1, 2026 to July
 * 31, 2027". Each page printed the text as current on the day the window
 * ended and every day after. Virginia's "an amended version takes effect
 * 2027-07-01 — review before then" would have gone on asking for a review
 * before a day long past.
 *
 * The shapes the files use, and nothing else:
 *
 *   - a WINDOW is two dates, each with its day, its month and its year,
 *     joined by a dash, "to" or "through" ("July 1, 2026 - June 30, 2027",
 *     "from Aug 1, 2026 to July 31, 2027"), or "between … and …"; a date is
 *     a month name with its day and year ("July 31, 2027", "Aug 1, 2026"),
 *     an ISO day ("2027-07-01") or a month/day/year ("6/30/2027"). A window
 *     with an end that names no year is no window — "July 1 - June 30, 2027"
 *     is not read — and neither is one whose end is not after its start,
 *     nor a building's vintage ("built between February 1, 1947 and January
 *     1, 1974"), which ended long ago and is as true as ever.
 *   - an EFFECTIVE DATE is "takes effect" (or "will take effect") with a
 *     date, and "review before then" beside it where the text asks for one.
 *     A past enactment ("eff. Apr 20, 2024", "effective Dec 31, 2025") is
 *     history, not a date to watch.
 *   - a FISCAL-YEAR LABEL ("FY" and a year, as Montgomery County's note
 *     writes Takoma Park's allowance) counts only where its dates are
 *     written beside it, as a window: a fiscal year's dates are its
 *     jurisdiction's own — HUD's, for one, begins in October (lib/fmr) — so
 *     a label is never given dates from another text or from memory. A
 *     label with no dates beside it is listed (`fiscalYears`) and guards
 *     nothing.
 *
 * What a page says (`datedNotes`): once today is past the end of a window
 * the text states — the last of a run, since a text that gives last year's
 * window beside this year's ("it was 3% for July 1, 2025 - June 30, 2026")
 * is telling its own history — the window has ended on that day and the
 * figure needs checking. On the day an effective date falls the change
 * takes effect today; after it, the date has passed. The text itself is
 * never hidden or changed, and no next figure is ever written in.
 *
 * Pure, and imports nothing: the rules panel, the evaluation, the market
 * brief and the demo all read it.
 */

export interface DatedWindow {
  /** the window as the text writes it: "July 1, 2026 - June 30, 2027" */
  text: string;
  /** its first and last day, ISO */
  start: string;
  end: string;
}

export interface TakesEffect {
  /** as written: "takes effect 2027-07-01" */
  text: string;
  /** the day, ISO */
  on: string;
  /** the text asks for a review before the day ("— review before then") */
  review: boolean;
}

export interface DatedText {
  windows: DatedWindow[];
  takesEffect: TakesEffect[];
  /** fiscal-year labels the text uses with no dates written beside them
   *  ("FY" and a year) — read, and guarding nothing */
  fiscalYears: string[];
}

const MONTH: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAME = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
/** A date with its day, its month and its year, in one of three shapes. */
const DATE = new RegExp(
  `\\b(?:${MONTH_NAME}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})/(\\d{1,2})/(\\d{4}))\\b`,
  "gi",
);

/** An ISO day from its parts, or null for a day that does not exist. */
function iso(y: number, m: number, d: number): string | null {
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return back.toISOString().slice(0, 10);
}

interface Found {
  text: string;
  iso: string;
  index: number;
  end: number;
}

/** Every date the text writes with its day, month and year, in order. */
function datesIn(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(DATE)) {
    let day: string | null = null;
    if (m[1]) day = iso(Number(m[3]), MONTH[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
    else if (m[4]) day = iso(Number(m[4]), Number(m[5]), Number(m[6]));
    else if (m[7]) day = iso(Number(m[9]), Number(m[7]), Number(m[8]));
    if (day) out.push({ text: m[0], iso: day, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** What may stand between a window's two dates. */
const JOIN = /^\s*(?:-|–|—|to|through)\s*$/i;

/** Words that make a range a building's vintage — when it was built,
 *  permitted or first occupied — rather than a period a figure holds for:
 *  New York's "buildings … built between February 1, 1947 and January 1,
 *  1974" ended in 1974 and is as true today as then. */
const VINTAGE = /\b(?:built|constructed|first occupied|occupied|permit(?:ted|s)?|issued|c\s?of\s?o|certificate of occupancy)\b[^.;]{0,30}$/i;

/**
 * The windows, effective dates and undated fiscal-year labels a text
 * states, read only as written. Pure.
 */
export function readDatedText(text: string | null | undefined): DatedText {
  const t = typeof text === "string" ? text : "";
  const dates = datesIn(t);
  const windows: DatedWindow[] = [];
  const used = new Set<number>();
  for (let i = 0; i + 1 < dates.length; i++) {
    const a = dates[i];
    const b = dates[i + 1];
    const between = t.slice(a.end, b.index);
    const lead = t.slice(Math.max(0, a.index - 60), a.index);
    const joined = JOIN.test(between) || (/^\s*and\s*$/i.test(between) && /\bbetween\s*$/i.test(lead));
    if (!joined || !(a.iso < b.iso) || VINTAGE.test(lead)) continue;
    windows.push({ text: t.slice(a.index, b.end), start: a.iso, end: b.iso });
    used.add(i).add(i + 1);
    i++;
  }
  const takesEffect: TakesEffect[] = [];
  for (const [i, d] of dates.entries()) {
    if (used.has(i)) continue;
    const before = /\b(?:takes|will take|take)\s+effect\s+(?:on\s+)?$/i.exec(t.slice(Math.max(0, d.index - 30), d.index));
    if (!before) continue;
    const after = t.slice(d.end, d.end + 40);
    takesEffect.push({ text: `${before[0]}${d.text}`, on: d.iso, review: /^\W{0,4}review before\b/i.test(after) });
  }
  // A fiscal-year label counts only where a window is written right beside
  // it (the label, then its window in brackets or after a colon);
  // otherwise it is listed.
  const fiscalYears: string[] = [];
  for (const m of t.matchAll(/\bFY\s?(?:\d{4}|\d{2})\b/g)) {
    const at = (m.index ?? 0) + m[0].length;
    const dated = windows.some((w) => {
      const wi = t.indexOf(w.text, at);
      return wi >= 0 && /^\s*[(:–—-]?\s*$/.test(t.slice(at, wi));
    });
    if (!dated && !fiscalYears.includes(m[0])) fiscalYears.push(m[0]);
  }
  return { windows, takesEffect, fiscalYears };
}

/** An ISO day as a page says it: "Jun 30, 2027", read in UTC. */
function longDay(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(at)
    ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : day;
}

export type DatedNoteKind = "window_ended" | "takes_effect_today" | "takes_effect_passed";

export interface DatedNote {
  kind: DatedNoteKind;
  /** the window's last day, or the effective date, ISO */
  date: string;
  /** the one sentence a page prints under the text */
  text: string;
}

/**
 * What a page says under a text on `today` (an ISO day): each window the
 * text states for its current figure that has ended — never one a later
 * window in the same text follows, which is the text's own history — and
 * each effective date that falls today or has passed. Empty while every
 * window holds and every date is ahead. Pure.
 */
export function datedNotes(text: string | null | undefined, today: string): DatedNote[] {
  const read = readDatedText(text);
  const day = /^\d{4}-\d{2}-\d{2}/.exec(today)?.[0] ?? null;
  if (!day) return [];
  const notes: DatedNote[] = [];
  for (const w of read.windows) {
    const followed = read.windows.some((v) => v !== w && v.start > w.end);
    if (followed || !(day > w.end)) continue;
    // A window written "between X and Y" is said from X to Y: its text runs
    // from the first date to the second, so the "and" in it is the joiner,
    // and "for X and Y" read as two days rather than a window.
    const said = /\s+and\s+/.test(w.text) ? `from ${w.text.replace(/\s+and\s+/, " to ")}` : `for ${w.text}`;
    notes.push({
      kind: "window_ended",
      date: w.end,
      text: `This states its figure ${said}, a window that ended on ${longDay(w.end)}: the figure needs checking.`,
    });
  }
  for (const e of read.takesEffect) {
    if (day < e.on) continue;
    notes.push(
      day === e.on
        ? {
            kind: "takes_effect_today",
            date: e.on,
            text: `This says a change takes effect today, ${longDay(e.on)}: it was written before then and needs checking.`,
          }
        : {
            kind: "takes_effect_passed",
            date: e.on,
            text: `This says a change takes effect on ${longDay(e.on)}${e.review ? " and asks for a review before then" : ""}; that date has passed: it was written before then and needs checking.`,
          },
    );
  }
  return notes;
}

/** The last day a text's dated statements hold through — the latest window
 *  end or effective date it states — or null where it states none. For a
 *  list of what ends when. */
export function lastStatedDay(text: string | null | undefined): string | null {
  const read = readDatedText(text);
  const days = [...read.windows.map((w) => w.end), ...read.takesEffect.map((e) => e.on)].sort();
  return days.length > 0 ? days[days.length - 1] : null;
}
