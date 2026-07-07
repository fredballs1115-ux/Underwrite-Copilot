import "server-only";
import type Stripe from "stripe";

/**
 * The Team plan's Stripe structure, as pure payload builders so the exact
 * item arithmetic is unit-testable without Stripe:
 *
 *   ONE subscription, TWO items —
 *     base  = STRIPE_TEAM_PRICE_ID,      quantity 1        ($49.99, covers the owner)
 *     seats = STRIPE_TEAM_SEAT_PRICE_ID, quantity = added members ($9.99 each)
 *
 * Transitions always UPDATE the existing subscription in place (Stripe
 * prorates); nothing here ever cancels-and-recreates — that would break
 * billing history and risk double-charging.
 *
 * Legacy note: teams subscribed before this structure carry a single
 * graduated-tier item (first unit $49.99, units 2+ $9.99, quantity = member
 * count). Seat syncing still supports them — see planSeatSync.
 */

type ItemsPayload = Stripe.SubscriptionUpdateParams.Item[];

/** Checkout line items for a brand-new Team subscription. */
export function teamCheckoutLineItems(
  basePriceId: string,
  seatPriceId: string | null,
  memberCount: number,
): { price: string; quantity: number }[] {
  const added = Math.max(0, memberCount - 1);
  const items = [{ price: basePriceId, quantity: 1 }];
  // Without a configured seat price, fall back to the legacy single-item
  // shape (quantity = members) so checkout still works mid-configuration.
  if (!seatPriceId) return [{ price: basePriceId, quantity: Math.max(1, memberCount) }];
  if (added > 0) items.push({ price: seatPriceId, quantity: added });
  return items;
}

/** Pro → Team: swap the Pro item for base + seats on the SAME subscription. */
export function proToTeamItems(
  sub: Stripe.Subscription,
  basePriceId: string,
  seatPriceId: string | null,
  memberCount: number,
): ItemsPayload {
  const items: ItemsPayload = sub.items.data.map((item) => ({
    id: item.id,
    deleted: true,
  }));
  for (const li of teamCheckoutLineItems(basePriceId, seatPriceId, memberCount)) {
    items.push({ price: li.price, quantity: li.quantity });
  }
  return items;
}

/** Team → Pro (team deleted): swap base + seats for the Pro item in place. */
export function teamToProItems(
  sub: Stripe.Subscription,
  proPriceId: string,
): ItemsPayload {
  const items: ItemsPayload = sub.items.data.map((item) => ({
    id: item.id,
    deleted: true,
  }));
  items.push({ price: proPriceId, quantity: 1 });
  return items;
}

export type SeatSyncPlan =
  | { action: "none" }
  | { action: "update"; itemId: string; quantity: number }
  | { action: "create"; price: string; quantity: number }
  | { action: "delete"; itemId: string };

/**
 * Keep the seat item in step with the roster.
 *  - New structure (base item present): the SEAT item carries added members;
 *    0 added members = no seat item at all.
 *  - Legacy structure (single graduated item): its quantity = member count.
 */
export function planSeatSync(
  sub: Stripe.Subscription,
  basePriceId: string | null,
  seatPriceId: string | null,
  memberCount: number,
): SeatSyncPlan {
  const items = sub.items?.data ?? [];
  const baseItem = basePriceId
    ? items.find((i) => i.price?.id === basePriceId)
    : undefined;
  const seatItem = seatPriceId
    ? items.find((i) => i.price?.id === seatPriceId)
    : undefined;

  if (baseItem && seatPriceId) {
    const added = Math.max(0, memberCount - 1);
    if (seatItem) {
      if (added === 0) return { action: "delete", itemId: seatItem.id };
      if (seatItem.quantity === added) return { action: "none" };
      return { action: "update", itemId: seatItem.id, quantity: added };
    }
    if (added > 0) return { action: "create", price: seatPriceId, quantity: added };
    return { action: "none" };
  }

  // Legacy single-item subscription: quantity mirrors the member count.
  const only = items[0];
  if (!only) return { action: "none" };
  if (only.quantity === Math.max(1, memberCount)) return { action: "none" };
  return {
    action: "update",
    itemId: only.id,
    quantity: Math.max(1, memberCount),
  };
}
