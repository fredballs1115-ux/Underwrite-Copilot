// Server-only Stripe client. The secret key never reaches the browser — this
// import makes the build fail if it's ever pulled into client code.
import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local / your Render env.",
    );
  }
  if (!client) {
    // Pin nothing — use the account's default API version.
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}
