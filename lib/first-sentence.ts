/**
 * A text's sentences, read the way a person reads them: a period ends a
 * sentence only where it is not part of an abbreviation, a run of initials
 * or a citation inside parentheses.
 *
 * Pure, and the one splitter the market page's folded notes (app/market/fold)
 * and its rules list share. Both cut at the first ". " before this existed,
 * and nine of the rules on file ended at an abbreviation: Washington's TOPA
 * exemption read, in full, "Under D.C."; the RENTAL Act "ENACTED: RENTAL
 * Amendment Act of 2025 = D.C."; Illinois's preemption "(50 ILCS 825, eff.";
 * Chicago's "(Muni."; Takoma Park's "(City Code Ch."; Florida's "(Fla."
 * (the research pass of 2026-10-01).
 *
 * The rules, in the order they are tried at a period, "!" or "?":
 * - inside parentheses or brackets — an unclosed "(" included — is never an
 *   end: "(D.C. Code § 42-3502.05(a)(2))", "(eff. Aug 1, 1997)";
 * - a run of single-letter initials is not an end: "D.C.", "U.S.",
 *   "O.C.G.A.", "e.g.", "i.e.", and a lone initial ("John A. Smith");
 * - a known abbreviation is not an end (`ABBREVIATIONS`: "eff.", "Fla.",
 *   "Stat.", "Ch.", "Art.", "Muni.", "No.", "St.", "Co.", "Inc.", "etc.",
 *   the month abbreviations…);
 * - the next sentence must start like one — a capital, a digit, a quote,
 *   "§" or an opening bracket — so "approx. the" runs on.
 *
 * Erring long is deliberate: a first sentence that runs into the second is
 * still the rule's own words, where one cut at "D.C." is not a sentence.
 */

/** Abbreviations that never end a sentence, lower-cased, without the period. */
export const ABBREVIATIONS: ReadonlySet<string> = new Set([
  // legal and citation
  "art",
  "arts",
  "ch",
  "chs",
  "cl",
  "co",
  "corp",
  "eff",
  "fla",
  "gov",
  "govt",
  "inc",
  "ltd",
  "muni",
  "no",
  "nos",
  "ord",
  "para",
  "pub",
  "rev",
  "sec",
  "secs",
  "sess",
  "stat",
  "stats",
  "subd",
  "vol",
  // places and people
  "ave",
  "blvd",
  "dr",
  "jr",
  "mr",
  "mrs",
  "ms",
  "mt",
  "rd",
  "sr",
  "st",
  // Latin and the rest
  "al",
  "approx",
  "cf",
  "dept",
  "est",
  "etc",
  "incl",
  "vs",
  // the months a date abbreviates
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

const OPEN = new Set(["(", "["]);
const CLOSE = new Set([")", "]"]);
const QUOTES = new Set(['"', "'", "”", "’"]);

/** The word a period follows — letters and inner periods, so "D.C" and "e.g". */
function wordBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start--;
  return text.slice(start, at).replace(/^\.+/, "");
}

/** Whether a period after `word` is part of it rather than a sentence's end. */
function isAbbreviation(word: string): boolean {
  if (!word) return false;
  // A run of single-letter initials, or one: "D.C", "O.C.G.A", "e.g", "A".
  if (word.split(".").every((p) => p.length === 1 && /[A-Za-z]/.test(p))) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** Where each sentence after the first begins, as indexes into `text`. */
function boundaries(text: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (OPEN.has(c)) {
      depth++;
      continue;
    }
    if (CLOSE.has(c)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (c !== "." && c !== "!" && c !== "?") continue;
    if (depth > 0) continue;
    if (c === "." && isAbbreviation(wordBefore(text, i))) continue;
    // Closing quotes may follow the stop; then whitespace, then a start.
    let j = i + 1;
    while (j < text.length && QUOTES.has(text[j])) j++;
    if (j >= text.length || !/\s/.test(text[j])) continue;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (j >= text.length) continue;
    if (!/[A-Z0-9"'“‘§(\[]/.test(text[j])) continue;
    out.push(j);
  }
  return out;
}

/** The text's sentences, each trimmed; one sentence where none ends early. */
export function sentencesOf(text: string): string[] {
  const starts = [0, ...boundaries(text)];
  return starts.map((s, k) => text.slice(s, starts[k + 1] ?? text.length).trim()).filter(Boolean);
}

/** The first sentence and everything after it, the rest "" where there is none. */
export function firstSentence(text: string): { first: string; rest: string } {
  const at = boundaries(text)[0];
  if (at === undefined) return { first: text.trim(), rest: "" };
  return { first: text.slice(0, at).trim(), rest: text.slice(at).trim() };
}

/** Whether a sentence is a caution the text means a reader to see. */
export function isCaution(sentence: string): boolean {
  return /\bCAUTION:/.test(sentence);
}

/**
 * The text read for a page that shows its first sentence and folds the
 * rest: the first sentence, any caution ("CAUTION: …") after it — which a
 * page keeps in view, never folded away — and the remaining sentences.
 */
export function foldParts(text: string): { first: string; cautions: string[]; rest: string } {
  const [first = "", ...after] = sentencesOf(text);
  return {
    first,
    cautions: after.filter(isCaution),
    rest: after.filter((s) => !isCaution(s)).join(" "),
  };
}
