// The `server-only` import is a guard rail: if any of this file ever gets
// pulled into code that runs in the browser, the BUILD FAILS instead of
// silently shipping your Anthropic key to users. This directly enforces the
// "keep the API key server-side" rule.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns a shared Anthropic client, created on first use.
 *
 * We read the key lazily (here, not at import time) so that a missing key only
 * errors when we actually try to call Claude — it won't break `next build`.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local for local dev, " +
        "or to your Render service's environment variables in production.",
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
