import "server-only";
import type Stripe from "stripe";

/**
 * Turn a raw Stripe SDK error into an actionable config-error code, so the
 * billing/team pages can say exactly WHICH knob is wrong ("test-mode price ID
 * with a live key") instead of a generic "try again in a moment". These
 * conditions only arise from operator misconfiguration — a correctly
 * configured site never shows them — so the copy can afford to be specific.
 *
 * Returns null for anything transient (network blip, Stripe outage, card
 * issues) — callers fall back to their generic retry copy for those.
 */
export type StripeConfigErrorCode = "stripekey" | "price" | "pricetype" | "appurl";

/**
 * True when a SAVED Stripe customer id no longer exists under the current
 * key — the classic case is an id minted in TEST mode surviving in the
 * database after the switch to LIVE keys ("No such customer"). Callers
 * self-heal by clearing the mirror and minting a fresh customer, instead of
 * failing checkout forever. Deleted customers count as stale too. Errors
 * other than resource_missing propagate to normal handling.
 */
export async function isStaleCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return (customer as { deleted?: boolean }).deleted === true;
  } catch (err) {
    if ((err as { code?: string })?.code === "resource_missing") return true;
    throw err;
  }
}

export function classifyStripeError(err: unknown): StripeConfigErrorCode | null {
  const e = err as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
    statusCode?: number;
  } | null;
  if (!e || typeof e !== "object") return null;
  const msg = (e.message ?? "").toLowerCase();

  // Wrong/truncated/revoked API key (or a restricted key without write access).
  if (e.type === "StripeAuthenticationError" || e.statusCode === 401) return "stripekey";
  if (e.type === "StripePermissionError" || e.statusCode === 403) return "stripekey";

  // "No such price: 'price_…'" — the classic test-mode ID with a live key
  // (each mode has its own objects), or a typo'd/deleted price.
  if (e.code === "resource_missing" && ((e.param ?? "").includes("price") || msg.includes("price")))
    return "price";

  // Subscription checkout with a one-time price.
  if (msg.includes("one_time") || (msg.includes("recurring") && msg.includes("price")))
    return "pricetype";

  // Malformed success/cancel/return URL — NEXT_PUBLIC_APP_URL missing or
  // not a full https:// address.
  if (
    msg.includes("not a valid url") ||
    ((msg.includes("success_url") || msg.includes("cancel_url") || msg.includes("return_url")) &&
      (msg.includes("invalid") || msg.includes("valid")))
  )
    return "appurl";

  return null;
}
