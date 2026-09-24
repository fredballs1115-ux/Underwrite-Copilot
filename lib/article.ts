// "a" or "an", by the sound of the first word a reader SAYS rather than the
// first character printed: an 8.0% cap, an 11-story tower, an 18% return,
// an $80M loan, an 800 SF unit — and a 1.8% spread, a 110% LTC, a $20M
// price. A generated sentence puts an article before whatever figure
// arrives, and the figure decides, so every such sentence goes through
// `aOrAn`. The render lint (`gluedWords` in lib/render-lint.ts) reads the
// same rule back out of every rendered view and every public page, and
// lib/article.test.ts holds its pattern to this one. Pure, no imports.

/**
 * Whether a figure's first spoken word opens on a vowel sound: eight,
 * eleven, eighteen, eighty — and eight hundred, eleven thousand, eighteen
 * million. The leading group of a grouped figure decides ("11,000" is
 * eleven thousand, "1,100" one thousand one hundred); a comma-less
 * four-digit run is read in pairs, as a year or a code is ("1850s" is
 * eighteen-fifties, "1031" ten thirty-one); a longer comma-less run is
 * grouped by thousands from the right.
 */
export function figureTakesAn(digits: string): boolean {
  const int = digits.replace(/,/g, "");
  const lead = digits.includes(",")
    ? digits.slice(0, digits.indexOf(","))
    : int.length === 4
      ? int.slice(0, 2)
      : int.length > 4
        ? int.slice(0, int.length % 3 || 3)
        : int;
  return lead.startsWith("8") || lead === "11" || lead === "18";
}

// The letters whose NAMES open on a vowel sound: A, E, eff, aitch, I, ell,
// em, en, O, ar, ess, ex — an SFR, an NOI, an MSA, a BTR, a CMBS.
const AN_LETTERS = "AEFHILMNORSX";
// Initialisms said as a word, not letter by letter.
const SAID_AS_WORDS = new Set(["REIT", "HUD", "FRED", "NASA"]);

/** Whether a word takes "an": a vowel sound, not a vowel letter. */
function wordTakesAn(text: string): boolean {
  const initialism = text.match(/^[A-Z]{2,}(?=$|[^A-Za-z])/);
  if (initialism && !SAID_AS_WORDS.has(initialism[0])) return AN_LETTERS.includes(text[0]);
  const w = text.toLowerCase();
  if (/^(hour|honest|honou?r|heir)/.test(w)) return true;
  // one, once, European, unit, unique, usable, usual, utility — a
  // consonant sound for all their vowel letter.
  if (/^(one\b|one-|once\b|eu|ewe|uni(?!n)|us[aeu]|ut[ie]|ur[aeiou])/.test(w)) return false;
  return /^[aeiou]/.test(w);
}

/**
 * The article the text after it takes — "a" or "an", or "A" / "An" to open
 * a sentence. A figure (with or without a leading "$") by its first spoken
 * word; a word by its sound; anything else (a sign, a bracket) "a", since
 * "a plus three" and "a minus two" are what a reader says.
 */
export function aOrAn(text: string, capital = false): string {
  const t = text.trim();
  const figure = t.match(/^\$?(\d[\d,]*)/);
  const an = figure ? figureTakesAn(figure[1]) : /^[A-Za-z]/.test(t) ? wordTakesAn(t) : false;
  return capital ? (an ? "An" : "A") : an ? "an" : "a";
}

/** The text with its article in front: "an 8.0%", "a $20.0M", "An 800". */
export function withArticle(text: string, capital = false): string {
  return `${aOrAn(text, capital)} ${text}`;
}
