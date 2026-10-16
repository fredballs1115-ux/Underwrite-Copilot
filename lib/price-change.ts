// A reissued memorandum's new ask, on the pipeline (research pass 24, B14):
// the retrade diff the deal page draws (lib/screen-diff `computeScreenDiff`)
// read for its asking-price row alone, so a card whose OM came back cheaper
// says so the way a listing says "price cut". Pure, and no second reader of
// a price: the diff's own pair, which compares two figures only where both
// screens read a price of the same kind (an exact label, or one candidate a
// side on the same basis), and its own tolerance, under which a move is
// formatting noise and no change at all.
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import { parsePrice } from "@/lib/criteria";

export interface PriceChange {
  direction: "cut" | "raise";
  /** the move as a share of the earlier ask, 0–1 */
  pct: number;
  /** each ask as the memorandum stated it */
  from: string;
  to: string;
  /** the screen the earlier ask was read in, ISO */
  since: string;
}

/** The asking price's move since the previous screen, or null where the
 *  two screens did not both read a comparable price, or it did not move. */
export function priceChangeOf(
  prior: PriorScreen | null | undefined,
  extraction: { metrics?: { label: string; value: string; basis?: string }[]; screenedOn?: string | null } | null | undefined,
): PriceChange | null {
  if (!prior || !extraction?.metrics?.length) return null;
  const diff = computeScreenDiff(prior, { metrics: extraction.metrics, screenedOn: extraction.screenedOn ?? null }, null);
  const row = diff?.rows.find((r) => r.label === "Asking price");
  if (!row || row.direction === "flat") return null;
  const before = parsePrice(row.before);
  const after = parsePrice(row.after);
  if (before == null || after == null || before <= 0 || after === before) return null;
  return {
    direction: after < before ? "cut" : "raise",
    pct: Math.abs(after - before) / before,
    from: row.before,
    to: row.after,
    since: diff!.at,
  };
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "4.4%" — one decimal under 10%, whole above. */
export function priceChangePct(c: Pick<PriceChange, "pct">): string {
  const p = c.pct * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** "Price cut 4.4% since the screen of Sep 3, 2026: $68,000,000 to
 *  $65,000,000" — the badge's name and title. */
export function priceChangeWords(c: PriceChange): string {
  const t = Date.parse(c.since);
  const when = Number.isFinite(t) ? ` since the screen of ${DAY.format(new Date(t))}` : " since the last screen";
  return `Price ${c.direction === "cut" ? "cut" : "raised"} ${priceChangePct(c)}${when}: ${c.from} to ${c.to}`;
}
