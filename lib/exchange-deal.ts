// The buy box's 1031 exchange set against one deal (research pass 28,
// round 4). lib/exchange-window reads the clock and sets a deal's facts
// against it; this hands it the deal's own facts the way every surface
// reads them — the offers-due day the deal carries (the reader's own, else
// the memorandum's, lib/offering) and what its price buys (lib/interest,
// and on a leasehold the years its lease has left on the day) — so the deal
// header's chip, the pipeline's tag and the memo's line say one thing.
//
// Never handed to a Claude step: the verdict's words reach the shared
// screen, and a counterparty who learned the buyer's deadline would hold
// the price (the batch-2 audit).
//
// Pure: no I/O. The day is the caller's: the reader's own on a signed-in
// page and in the memo route (lib/reader-day), the UTC day in the worker.
//
// Never on the shared screen: the buy box is the reader's.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { sanitizeExchange } from "@/lib/criteria";
import {
  exchangeFit,
  exchangeShortLine,
  exchangeWindow,
  type ExchangeBlock,
  type ExchangeFit,
  type ExchangeFlag,
  type ExchangeWindow,
} from "@/lib/exchange-window";
import { endIsAhead } from "@/lib/ground-lease-term";
import { interestOf, leaseholdTermOf } from "@/lib/interest";
import { offersDueUpgrade } from "@/lib/offering";

export interface DealExchange {
  window: ExchangeWindow;
  fit: ExchangeFit;
  /** the pipeline's tag and the deal header's chip — "1031: identify by
   *  Oct 30", "1031: offers due after ID" (lib/exchange-window) */
  tag: string;
  /** a date that keeps the deal out of the exchange — offers due after a
   *  deadline, or the identification period over — is the caution tone; a
   *  question for exchange counsel about what the price buys the muted
   *  one; the clock alone the brand's */
  tone: "caution" | "muted" | "brand";
  /** the clock and the first flag in one line, for the memo
   *  (lib/exchange-window `exchangeShortLine`) */
  line: string;
}

/** The flags that are dates: the deal can be in the exchange only if it is
 *  identified, or closed, in time. */
const DATE_FACTS: ReadonlySet<ExchangeFlag["kind"]> = new Set(["after_identify", "id_period_over", "after_close"]);

/**
 * The buy box's exchange against a deal on a day: null where the box holds
 * no exchange, or its period is over (nothing is said about a window that
 * has closed). `offersDue` is the deadline the deal carries (an ISO day,
 * `deals.offers_due`); where it has none, the memorandum's own day is read,
 * as the deal page fills it. The block is the stored box's, which its owner
 * can write by hand, so it is read through the save's own rule
 * (lib/criteria `sanitizeExchange`): a filer not on the list is no filer.
 */
export function exchangeForDeal(
  block: ExchangeBlock | null | undefined,
  extraction: ExtractionResult | null | undefined,
  offersDue: string | null | undefined,
  asOf: Date = new Date(),
): DealExchange | null {
  const window = exchangeWindow(sanitizeExchange(block), asOf);
  if (!window) return null;
  const kind = extraction ? interestOf(extraction).kind : null;
  // A leasehold's years left today and its options' years, ahead by the
  // day (lib/ground-lease-term): a lease whose end has passed has no years
  // to set against the regulation's thirty.
  const term = extraction && kind === "leasehold" ? leaseholdTermOf(extraction, asOf).term : null;
  const lease = term && endIsAhead(term) ? term : null;
  const fit = exchangeFit(window, {
    offersDueIso: offersDue || offersDueUpgrade(null, extraction),
    interestKind: kind,
    leaseYearsLeft: lease ? lease.yearsLeft : null,
    leaseOptionYears: lease?.options?.years ?? null,
  });
  if (!fit?.tag) return null;
  const first = fit.flags[0]?.kind;
  return {
    window,
    fit,
    tag: fit.tag,
    tone: first ? (DATE_FACTS.has(first) ? "caution" : "muted") : "brand",
    line: exchangeShortLine(window, fit),
  };
}
