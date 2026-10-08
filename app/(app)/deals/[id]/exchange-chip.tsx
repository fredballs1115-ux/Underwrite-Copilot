import Link from "next/link";
import type { DealExchange } from "@/lib/exchange-deal";

/**
 * The buyer's 1031 clock beside the deal header's offers-due control
 * (lib/exchange-deal) — pure, so a test draws it. Only where the reader's
 * buy box holds an exchange still running: its tag ("1031: identify by Oct
 * 30"), in the caution tone where a date keeps the deal out of the exchange
 * (offers due after a deadline, the identification period over), the muted
 * one where what the price buys is a question for exchange counsel, else
 * the brand's. The whole read — the window's sentence and each flag — is
 * its title and is said to a screen reader; a click opens the buy box's
 * exchange. Never on the shared screen: the box is the reader's.
 */
export function ExchangeChip({ exchange }: { exchange: DealExchange | null }) {
  if (!exchange) return null;
  const tone =
    exchange.tone === "caution"
      ? "border-caution/40 text-caution"
      : exchange.tone === "muted"
        ? "border-line text-muted"
        : "border-brand/30 text-brand";
  const said = [exchange.window.sentence, ...exchange.fit.flags.map((f) => f.text)].join(" ");
  return (
    <Link
      href="/criteria#exchange"
      prefetch={false}
      title={said}
      data-qa="exchange-chip"
      data-tone={exchange.tone}
      className={`flex items-center rounded-lg border bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${tone}`}
    >
      <span className="whitespace-nowrap">{exchange.tag}</span>
      <span className="sr-only">{`. ${said}`}</span>
    </Link>
  );
}
