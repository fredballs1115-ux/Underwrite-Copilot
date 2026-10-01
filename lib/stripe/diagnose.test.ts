/**
 * A Stripe setup problem is the operator's to fix and the operator's to
 * read: the page's code names it, the server log says which knob is wrong,
 * and the billing and team pages show a customer only that checkout is not
 * available (pass 14, 2026-10-01).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRIPE_CONFIG_DIAGNOSIS, classifyStripeError, stripeErrorCode } from "./diagnose";

afterEach(() => vi.restoreAllMocks());

describe("stripeErrorCode", () => {
  it("names a setup problem by its code and says which knob is wrong in the server log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const keyErr = { type: "StripeAuthenticationError", message: "Invalid API Key provided: sk_live_****" };
    expect(classifyStripeError(keyErr)).toBe("stripekey");
    expect(stripeErrorCode(keyErr, "checkout")).toBe("stripekey");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(STRIPE_CONFIG_DIAGNOSIS.stripekey));
    const priceErr = { code: "resource_missing", param: "line_items[0][price]", message: "No such price: 'price_123'" };
    expect(stripeErrorCode(priceErr, "checkout")).toBe("price");
  });

  it("keeps the caller's generic code for anything transient, and logs nothing of its own", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(stripeErrorCode({ type: "StripeConnectionError", message: "socket hang up" }, "checkout")).toBe("checkout");
    expect(stripeErrorCode(null, "upgrade")).toBe("upgrade");
    expect(log).not.toHaveBeenCalled();
  });
});
