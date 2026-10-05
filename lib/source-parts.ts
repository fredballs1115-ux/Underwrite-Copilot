/**
 * A research file's source, as the file writes it, split into the link and
 * the words beside it. Several sources carry a note after the address —
 * "https://www.redfin.com/news/data-center/downloads/ (redfin_metro_market_
 * tracker.tsv000.gz, updated 2026-06-02, …)" — and the sector explorer had
 * linked the whole string, an address with spaces and parentheses in it that
 * goes nowhere (the research pass of 2026-10-01). The address is the link;
 * the rest is printed as text. Pure.
 */
export function sourceParts(source: string | null | undefined): { href: string | null; words: string | null } {
  const s = (source ?? "").trim();
  const m = /^(https?:\/\/[^\s()]+)(.*)$/.exec(s);
  if (!m) return { href: null, words: s || null };
  const rest = m[2]
    .trim()
    .replace(/^[—–-]\s*/, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  return { href: m[1], words: rest || null };
}
