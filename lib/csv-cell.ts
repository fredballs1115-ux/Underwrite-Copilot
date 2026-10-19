// A CSV cell as every download on the site writes one (the pipeline's CSV,
// the recorded sales on /comps). No imports, so a client module can take it.
//
// Text is untrusted — a deal's name, a memorandum's words, a recorded deed's
// buyer — and a cell that opens on =, +, -, @, a tab or a carriage return
// can be read by Excel or Sheets as a formula; so can one where spaces come
// before the sign, or where the sign is its full-width form (＝ ＋ － ＠),
// which a spreadsheet may take for the ASCII one. Such a cell is led with an
// apostrophe, OWASP's advice against CSV injection: the spreadsheet reads
// the cell as text rather than run it. The apostrophe is part of the value
// read from a CSV — a reader sees it in the cell, unlike the hidden marker a
// typed apostrophe is — and it guards the file as written, not a cell a
// reader later edits. Every text cell is quoted, its quotes doubled. A
// number is written raw, unquoted and unformatted, so a spreadsheet reads it
// as a number — and only a finite one: anything else is a blank, never
// "NaN".

/** A cell's opening that a spreadsheet may read as a formula: a tab or a
 *  carriage return, or a sign — ASCII or full-width — after any spaces. */
const FORMULA_LEAD = /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;

/** A text cell, quoted, with a formula-leading value neutralised. */
export function csvText(v: string): string {
  const safe = FORMULA_LEAD.test(v) ? `'${v}` : v;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** A number cell, raw; a blank where there is no finite number. */
export function csvNumber(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
}
