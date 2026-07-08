/**
 * Parse a human dollar string into whole dollars. Understands the notations
 * analysts actually type: "68000000", "$68,000,000", "$68.5M", "63 million",
 * "500k". Returns null for anything negative, unparsable, or below `floor` —
 * the floor is a typo guard ("$68" is never a building price). Callers pick
 * the floor for the figure's scale: whole-asset prices default to $10k;
 * deposits pass something smaller.
 *
 * Shared by the LOI panel (client) and the LOI route (server) so the two
 * never disagree about what a price string means.
 */
export function parseUsd(raw: string, floor = 10_000): number | null {
  const v = raw.trim();
  if (!v || v.includes("-")) return null;
  const m = v
    .replace(/,/g, "")
    .match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(k|thousand|m|mm|million|b|bn|billion)?\b/i);
  if (!m) return null;
  const mult = m[2]
    ? { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }[
        m[2].toLowerCase()
      ] ?? 1
    : 1;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) && n >= floor ? Math.round(n) : null;
}

/** parseUsd, then "$68,000,000" formatting — "" when unusable. */
export function fmtUsd(raw: string | null, floor = 10_000): string {
  const n = parseUsd(raw ?? "", floor);
  return n !== null ? `$${n.toLocaleString("en-US")}` : "";
}
