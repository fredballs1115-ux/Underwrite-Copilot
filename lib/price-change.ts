// A reissued memorandum's new ask, on the pipeline (research pass 24, B14):
// the retrade diff the deal page draws (lib/screen-diff `computeScreenDiff`)
// read for its asking-price row alone, so a card whose OM came back cheaper
// says so the way a listing says "price cut". Pure, and no second reader of
// a price: the diff's own pair, which compares two figures only where both
// screens read a price of the same kind (an exact label, or one candidate a
// side on the same basis), and its own tolerance, under which a move is
// formatting noise and no change at all.
//
// And only where the two prices buy the same thing (audit C8, M4): a
// reissued memorandum that now sells a 49% share, a note, the land under the
// building or a share of the general partner's interest asks a price for
// something else, and its move from the whole building's ask is no cut —
// $68,000,000 for the building to $33,320,000 for 49% of it had read "▼ 51%".
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import { parsePrice } from "@/lib/criteria";
import { interestOf, shareHoldingOf } from "@/lib/interest";
import { screenedOn } from "@/lib/screen-run";
import type { ExtractionResult } from "@/lib/anthropic/types";

export interface PriceChange {
  direction: "cut" | "raise";
  /** the move as a share of the earlier ask, 0–1 */
  pct: number;
  /** each ask as the memorandum stated it */
  from: string;
  to: string;
  /** the day the earlier ask's screen reached its call — that screen's
   *  verdict's `generatedAt`, ISO — or null where the snapshot carries none.
   *  Never the snapshot's own stamp, which is taken as the NEXT screen
   *  starts (audit C8, M5) */
  since: string | null;
}

/** What a price buys, as far as two asks can be set against each other: the
 *  interest's kind, a share's stated percentage and what the share is a
 *  share of (a tenancy in common, a trust, the general partner's). An
 *  extraction saved before the interest was read is fee simple, as every
 *  reader takes it. */
export function whatThePriceBuys(ex: unknown): string {
  const e = (ex ?? null) as ExtractionResult | null;
  const i = interestOf(e);
  return [i.kind, i.sharePct ?? "", shareHoldingOf(e) ?? ""].join("|");
}

/** The asking price's move since the previous screen, or null where the
 *  two screens did not both read a comparable price, the two prices buy
 *  different things, or it did not move. */
export function priceChangeOf(
  prior: PriorScreen | null | undefined,
  extraction: { metrics?: { label: string; value: string; basis?: string }[]; screenedOn?: string | null; interest?: unknown } | null | undefined,
): PriceChange | null {
  if (!prior || !extraction?.metrics?.length) return null;
  if (whatThePriceBuys(prior.extraction) !== whatThePriceBuys(extraction)) return null;
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
    since: priorScreenDay(prior),
  };
}

/** The earlier screen's own day: its verdict's `generatedAt`, the day it
 *  reached its call. The snapshot's `at` is stamped when the re-screen that
 *  replaces it starts, roughly the new screen's day, so it dates nothing
 *  about the earlier ask. */
function priorScreenDay(prior: PriorScreen): string | null {
  const g = (prior.verdict as { generatedAt?: unknown } | null | undefined)?.generatedAt;
  return typeof g === "string" && screenedOn(g) ? g : null;
}

/**
 * The pipeline's read of the previous screen: only what the badge reads —
 * the snapshot's stamp, the earlier extraction's rows, its interest and the
 * day it was read, and the earlier call's day — never the whole earlier
 * extraction and verdict, which the page had selected for every deal to
 * read one price (audit C8, L10). PostgREST's JSON paths, each aliased.
 */
export const PRIOR_PRICE_COLUMNS =
  "prior_at:prior_screen->>at, prior_metrics:prior_screen->extraction->metrics, prior_interest:prior_screen->extraction->interest, prior_screened_on:prior_screen->extraction->>screenedOn, prior_generated_at:prior_screen->verdict->>generatedAt";

/** A row's `PRIOR_PRICE_COLUMNS`, as PostgREST returns them. */
export interface PriorPriceColumns {
  prior_at?: string | null;
  prior_metrics?: unknown;
  prior_interest?: unknown;
  prior_screened_on?: string | null;
  prior_generated_at?: string | null;
}

/** The previous screen as `priceChangeOf` reads it, rebuilt from the
 *  narrow columns; null where the deal has none. */
export function priorScreenOfColumns(r: PriorPriceColumns): PriorScreen | null {
  if (!r.prior_at && !Array.isArray(r.prior_metrics)) return null;
  const extraction = Array.isArray(r.prior_metrics)
    ? {
        metrics: r.prior_metrics as { label: string; value: string; basis?: string }[],
        screenedOn: r.prior_screened_on ?? null,
        ...(r.prior_interest && typeof r.prior_interest === "object" ? { interest: r.prior_interest } : {}),
      }
    : null;
  return {
    at: r.prior_at ?? "",
    extraction,
    verdict: r.prior_generated_at ? ({ generatedAt: r.prior_generated_at } as PriorScreen["verdict"]) : null,
  };
}

/** "4.4%" — one decimal under 10%, whole above. */
export function priceChangePct(c: Pick<PriceChange, "pct">): string {
  const p = c.pct * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** "Price cut 4.4% since the screen of Sep 3, 2026: $68,000,000 to
 *  $65,000,000" — the badge's name and title. */
export function priceChangeWords(c: PriceChange): string {
  const day = screenedOn(c.since);
  const when = day ? ` since the screen of ${day}` : " since the last screen";
  return `Price ${c.direction === "cut" ? "cut" : "raised"} ${priceChangePct(c)}${when}: ${c.from} to ${c.to}`;
}
