import "server-only";
import type Stripe from "stripe";

/**
 * The only prices this app ever sells, straight from env. Anything else on a
 * subscription we're asked to sync is a red flag — a misconfigured webhook
 * pointing at the wrong account, a manually edited subscription, or worse —
 * so the webhook alerts instead of silently processing it.
 */

export interface KnownPrices {
  pro: string | null;
  teamBase: string | null;
  teamSeat: string | null;
}

export function knownPrices(): KnownPrices {
  return {
    pro: process.env.STRIPE_PRICE_ID ?? null,
    teamBase: process.env.STRIPE_TEAM_PRICE_ID ?? null,
    teamSeat: process.env.STRIPE_TEAM_SEAT_PRICE_ID ?? null,
  };
}

export interface PriceAssertion {
  ok: boolean;
  /** price ids on the subscription that match no configured env var */
  unknown: string[];
  /** every price id seen, for the log line */
  seen: string[];
}

/** Read-and-verify only — inspects the subscription, never writes. */
export function assertKnownPrices(sub: Stripe.Subscription): PriceAssertion {
  const known = knownPrices();
  const expected = new Set(
    [known.pro, known.teamBase, known.teamSeat].filter(
      (v): v is string => !!v,
    ),
  );
  const seen = (sub.items?.data ?? [])
    .map((item) => item.price?.id)
    .filter((v): v is string => !!v);
  // With no price env vars configured there is nothing to assert against —
  // fail open (process normally) rather than lock billing out on a deploy
  // that predates the configuration.
  if (expected.size === 0) return { ok: true, unknown: [], seen };
  const unknown = seen.filter((id) => !expected.has(id));
  return { ok: unknown.length === 0, unknown, seen };
}
