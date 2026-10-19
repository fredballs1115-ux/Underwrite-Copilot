// A CSV cell as every download on the site writes one (the pipeline's CSV,
// the recorded sales on /comps). No imports, so a client module can take it.
//
// Text is untrusted — a deal's name, a memorandum's words, a recorded deed's
// buyer — and a cell that opens on =, +, -, @, a tab or a carriage return is
// read by Excel and Sheets as a formula. Such a cell is led with an
// apostrophe, which a spreadsheet shows as text and never runs; every text
// cell is quoted, its quotes doubled. A number is written raw, unquoted and
// unformatted, so a spreadsheet reads it as a number — and only a finite
// one: anything else is a blank, never "NaN".

/** A text cell, quoted, with a formula-leading value neutralised. */
export function csvText(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** A number cell, raw; a blank where there is no finite number. */
export function csvNumber(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
}
