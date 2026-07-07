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
    // STRIPE_API_BASE is a TEST hook only: it points the SDK at a local mock
    // (e.g. http://localhost:4571) so billing flows can be exercised without
    // touching Stripe. Never set it in production.
    const base = process.env.STRIPE_API_BASE
      ? new URL(process.env.STRIPE_API_BASE)
      : null;
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pinned so a Stripe account default-version bump can never silently
      // change webhook/API payload shapes under us. This matches the version
      // the installed SDK (stripe@22) is generated against.
      apiVersion: "2026-06-24.dahlia",
      ...(base
        ? {
            host: base.hostname,
            port: Number(base.port || (base.protocol === "https:" ? 443 : 80)),
            protocol: base.protocol === "https:" ? "https" : "http",
          }
        : {}),
    });
  }
  return client;
}
