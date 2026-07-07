/**
 * Team billing flow — TEST MODE end-to-end, with invoice printouts.
 *
 * Exercises the exact transitions the app performs, on throwaway objects it
 * creates itself (a fresh test-clock customer), and prints every invoice so
 * you can verify the amounts:
 *
 *   1. New Pro subscription ($29.99)
 *   2. Pro → Team in place: Pro item removed, Team base + seat items added,
 *      prorated (never cancel-and-recreate)
 *   3. Add 2 members (seat quantity → 2), remove 1 (→ 1)
 *   4. Delete team: reverse to Pro on the same subscription
 *   5. Advance the test clock a month → print the real invoice
 *
 * Run it with your TEST key (refuses live keys):
 *
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_PRICE_ID=price_... \
 *   STRIPE_TEAM_PRICE_ID=price_... \
 *   STRIPE_TEAM_SEAT_PRICE_ID=price_... \
 *   node scripts/stripe-test-flow.mjs
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY must be a TEST key (sk_test_…).");
  process.exit(1);
}
const PRO = process.env.STRIPE_PRICE_ID;
const BASE = process.env.STRIPE_TEAM_PRICE_ID;
const SEAT = process.env.STRIPE_TEAM_SEAT_PRICE_ID;
if (!PRO || !BASE || !SEAT) {
  console.error("Set STRIPE_PRICE_ID, STRIPE_TEAM_PRICE_ID, STRIPE_TEAM_SEAT_PRICE_ID.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

async function printInvoice(inv, label) {
  console.log(`\n— ${label} —`);
  console.log(`  status ${inv.status ?? "preview"} · total ${usd(inv.total)}`);
  for (const line of inv.lines.data) {
    console.log(`   · ${usd(line.amount).padStart(9)}  ${line.description}`);
  }
}

async function preview(subId, customer, label) {
  const inv = await stripe.invoices.createPreview({
    customer,
    subscription: subId,
  });
  await printInvoice(inv, `Upcoming invoice ${label}`);
}

const clock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: "uc-team-flow-test",
});
console.log(`Test clock ${clock.id}`);

const customer = await stripe.customers.create({
  email: "flow-test@example.com",
  name: "UC billing flow test",
  test_clock: clock.id,
  payment_method: "pm_card_visa",
  invoice_settings: { default_payment_method: "pm_card_visa" },
});
console.log(`Customer ${customer.id}`);

// 1. Personal Pro.
let sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: PRO, quantity: 1 }],
  metadata: { user_id: "test-user" },
});
console.log(`\n[1] Pro subscription ${sub.id} (${sub.status})`);
const first = await stripe.invoices.retrieve(sub.latest_invoice);
await printInvoice(first, "first invoice (Pro)");

// 2. Pro → Team in place (what startTeamCheckout does for a Pro owner).
sub = await stripe.subscriptions.retrieve(sub.id);
await stripe.subscriptions.update(sub.id, {
  items: [
    ...sub.items.data.map((i) => ({ id: i.id, deleted: true })),
    { price: BASE, quantity: 1 },
  ],
  metadata: { team_id: "test-team", user_id: "" },
  proration_behavior: "create_prorations",
});
console.log(`\n[2] Converted to Team base in place (same subscription ${sub.id})`);
await preview(sub.id, customer.id, "after Pro → Team");

// 3a. Add 2 members → seat item quantity 2 (what syncTeamSeats does).
sub = await stripe.subscriptions.retrieve(sub.id);
await stripe.subscriptionItems.create({
  subscription: sub.id,
  price: SEAT,
  quantity: 2,
});
console.log(`\n[3a] Added 2 members (seat item ×2)`);
await preview(sub.id, customer.id, "with 2 added members");

// 3b. Remove 1 member → seat quantity 1.
sub = await stripe.subscriptions.retrieve(sub.id);
const seatItem = sub.items.data.find((i) => i.price.id === SEAT);
await stripe.subscriptionItems.update(seatItem.id, { quantity: 1 });
console.log(`\n[3b] Removed 1 member (seat item ×1)`);
await preview(sub.id, customer.id, "with 1 added member");

// 4. Delete team → reverse to Pro on the same subscription.
sub = await stripe.subscriptions.retrieve(sub.id);
await stripe.subscriptions.update(sub.id, {
  items: [
    ...sub.items.data.map((i) => ({ id: i.id, deleted: true })),
    { price: PRO, quantity: 1 },
  ],
  metadata: { team_id: "", user_id: "test-user" },
  proration_behavior: "create_prorations",
});
console.log(`\n[4] Team deleted → reversed to Pro in place (same subscription ${sub.id})`);
await preview(sub.id, customer.id, "after Team → Pro");

// 5. Advance the clock past renewal so a REAL invoice generates.
console.log(`\n[5] Advancing the test clock one month…`);
await stripe.testHelpers.testClocks.advance(clock.id, {
  frozen_time: Math.floor(Date.now() / 1000) + 32 * 24 * 3600,
});
// The clock advances asynchronously — poll until ready.
for (let i = 0; i < 30; i++) {
  const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
  if (c.status === "ready") break;
  await new Promise((r) => setTimeout(r, 2000));
}
const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
for (const inv of invoices.data.reverse()) {
  await printInvoice(inv, `Invoice ${inv.number ?? inv.id}`);
}

// Cleanup: one subscription, one customer, one clock — all test-mode.
sub = await stripe.subscriptions.retrieve(sub.id);
if (!["canceled"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id);
await stripe.testHelpers.testClocks.del(clock.id);
console.log("\nDone — subscription canceled, test clock deleted.");
