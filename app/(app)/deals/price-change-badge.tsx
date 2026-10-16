import { priceChangePct, priceChangeWords, type PriceChange } from "@/lib/price-change";

/**
 * The ask's move since the previous screen, beside the price on a pipeline
 * card and its list row (research pass 24, B14): an arrow and the share, a
 * cut in the pass tone — good news for a buyer — a raise in the caution
 * tone, and the whole sentence (both asks, the screen's day) for a screen
 * reader and in its title. Nothing where the ask did not move.
 */
export function PriceChangeBadge({ change }: { change: PriceChange | null | undefined }) {
  if (!change) return null;
  const words = priceChangeWords(change);
  const cut = change.direction === "cut";
  return (
    <span
      data-qa="price-change"
      title={words}
      className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px align-middle font-sans text-[10px] font-semibold ${
        cut ? "bg-pass/5 text-pass" : "bg-caution/5 text-caution"
      }`}
    >
      <span aria-hidden>{cut ? "▼" : "▲"}</span>
      <span aria-hidden>{priceChangePct(change)}</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}
