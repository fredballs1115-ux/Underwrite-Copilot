import { describe, expect, it } from "vitest";
import {
  ScreenError,
  describeRunFailure,
  looksReadable,
  structured,
  structuredOutput,
} from "./failure";
import { newLedger, withUsageLedger } from "./usage";
import { needsOperator } from "./operator-failures";
import { documentFailure } from "./document-failures";

/** The SDK's APIError, by shape: an HTTP status and its "401 {…}" message. */
function apiError(status: number, type: string, message: string): Error {
  return Object.assign(
    new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`),
    { status, name: "APIError" },
  );
}

describe("describeRunFailure — the analyst reads a sentence, the log keeps the raw text", () => {
  it("credentials: a 401, a 403 and a missing key all read as our configuration, not the deal", () => {
    for (const err of [
      apiError(401, "authentication_error", "invalid x-api-key"),
      apiError(403, "permission_error", "forbidden"),
      new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local for local dev, or to your Render service's environment variables in production.",
      ),
    ]) {
      const f = describeRunFailure(err);
      expect(f.message).toMatch(/configuration problem on our side/);
      expect(f.message).not.toMatch(/x-api-key|\.env|Render/);
    }
    expect(describeRunFailure(apiError(401, "authentication_error", "invalid x-api-key")).detail).toContain(
      "invalid x-api-key",
    );
  });

  it("rate limit, overload and a 5xx each name the wait; a 413 and a 400 name the document", () => {
    expect(describeRunFailure(apiError(429, "rate_limit_error", "slow down")).message).toMatch(/rate-limiting/);
    expect(describeRunFailure(apiError(529, "overloaded_error", "Overloaded")).message).toMatch(/overloaded/);
    expect(describeRunFailure(apiError(500, "api_error", "boom")).message).toMatch(/overloaded/);
    expect(describeRunFailure(apiError(413, "invalid_request_error", "too big")).message).toMatch(/too large/);
    expect(describeRunFailure(apiError(400, "invalid_request_error", "pdf pages")).message).toMatch(
      /Replace OM/,
    );
    // A scan is read as pictures: the advice never blames one.
    expect(describeRunFailure(apiError(400, "invalid_request_error", "pdf pages")).message).not.toMatch(/scan/i);
  });

  it("a 400 about the account — a spent credit balance, a usage limit — is ours, never the document's (pass 14, 2026-10-01)", () => {
    for (const err of [
      apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."),
      apiError(400, "invalid_request_error", "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."),
    ]) {
      const f = describeRunFailure(err);
      expect(f.message).toMatch(/on our side, not your deal/);
      expect(f.message).not.toMatch(/PDF|document|scanned/);
      expect(f.message).not.toMatch(/credit|billing|Anthropic/i);
      expect(f.detail).toMatch(/credit balance|usage limits/);
      // The deal page leaves out its "Try again" under it.
      expect(needsOperator(f.message)).toBe(true);
    }
  });

  it("only the operator's failures read as needing the operator (the deal page's Try again)", () => {
    expect(needsOperator(describeRunFailure(apiError(401, "authentication_error", "invalid x-api-key")).message)).toBe(true);
    for (const err of [
      apiError(429, "rate_limit_error", "slow down"),
      apiError(529, "overloaded_error", "Overloaded"),
      apiError(400, "invalid_request_error", "pdf pages"),
      new Error("fetch failed"),
    ]) {
      expect(needsOperator(describeRunFailure(err).message)).toBe(false);
    }
    expect(needsOperator(null)).toBe(false);
    expect(needsOperator("")).toBe(false);
  });

  it("a connection failure and a storage miss each say what to do", () => {
    const conn = Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
    expect(describeRunFailure(conn).message).toMatch(/couldn't reach/);
    expect(describeRunFailure(new Error("fetch failed")).message).toMatch(/couldn't reach/);
    const missing = describeRunFailure(new Error("Storage download failed: Object not found")).message;
    expect(missing).toBe("The OM is missing from our file storage — upload it again with Replace OM.");
    // A retry reads nothing again: the deal page offers Replace OM.
    expect(documentFailure(missing)).toBe("replace");
  });

  it("our file storage failing on the network names our storage, never the analysis service (research pass 30)", () => {
    for (const raw of [
      "Storage download failed: fetch failed",
      "Storage download failed: The operation was aborted due to timeout",
      "Storage download failed: Gateway Timeout",
      "Storage upload failed: socket hang up",
    ]) {
      const m = describeRunFailure(new Error(raw)).message;
      expect(m, raw).toBe(
        "We couldn't read the OM back from our file storage just now — try again in a minute; if it keeps failing, upload it again with Replace OM.",
      );
      expect(m, raw).not.toMatch(/analysis service/);
      // A passing fault keeps its retry.
      expect(documentFailure(m), raw).toBeNull();
    }
  });

  it("the SDK parser's own message becomes 'incomplete or unreadable'", () => {
    const parse = new Error(
      "Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string in JSON at position 62 (line 1 column 63)",
    );
    const f = describeRunFailure(parse);
    expect(f.message).toMatch(/incomplete or unreadable/);
    expect(f.detail).toContain("position 62");
  });

  it("a ScreenError passes through as written; an unreadable message does not", () => {
    expect(describeRunFailure(new ScreenError("No OM file is attached to this deal — upload one.")).message).toBe(
      "No OM file is attached to this deal — upload one.",
    );
    expect(describeRunFailure(new Error("Deal not found.")).message).toMatch(/no longer available/);
    expect(describeRunFailure(new Error("This OM is too large to send inline and the upload failed — try again in a minute.")).message).toMatch(
      /too large to send inline/,
    );
    expect(describeRunFailure(new Error('TypeError: Cannot read properties of undefined (reading "x")')).message).toMatch(
      /unexpected error/,
    );
    expect(describeRunFailure({ weird: true }).message).toMatch(/unexpected error/);
    expect(describeRunFailure(undefined).message).toMatch(/unexpected error/);
  });

  it("looksReadable refuses JSON, stack frames, provider types and the SDK's status prefix", () => {
    expect(looksReadable("The screen needs an OM — upload one first.")).toBe(true);
    expect(looksReadable('401 {"type":"error"}')).toBe(false);
    expect(looksReadable("overloaded_error: Overloaded")).toBe(false);
    expect(looksReadable("boom\n    at Object.<anonymous> (x.js:1:1)")).toBe(false);
    expect(looksReadable("x".repeat(300))).toBe(false);
    expect(looksReadable("Nospace")).toBe(false);
  });
});

describe("structuredOutput / structured — a cut-off, a refusal and an empty answer are named", () => {
  it("returns the parsed output when the model finished", () => {
    expect(structuredOutput({ parsed_output: { a: 1 }, stop_reason: "end_turn" }, "Extraction")).toEqual({
      a: 1,
    });
  });

  it("names a max_tokens cut-off even when the truncated text happened to parse", () => {
    expect(() => structuredOutput({ parsed_output: { a: 1 }, stop_reason: "max_tokens" }, "Extraction")).toThrow(
      /Extraction was cut off/,
    );
  });

  it("names a refusal and a missing parsed block", () => {
    expect(() => structuredOutput({ parsed_output: null, stop_reason: "refusal" }, "The verdict")).toThrow(
      /declined/,
    );
    expect(() => structuredOutput({ parsed_output: null, stop_reason: "end_turn" }, "The verdict")).toThrow(
      /did not return structured output/,
    );
  });

  it("records the response's meters into the open ledger — on a finished answer and on a cut-off alike", async () => {
    const ledger = newLedger();
    const finished = { parsed_output: { a: 1 }, stop_reason: "end_turn", model: "m-1", usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 0, output_tokens: 3 } };
    const cutOff = { ...finished, stop_reason: "max_tokens", usage: { ...finished.usage, output_tokens: 8000 } };
    await withUsageLedger(ledger, async () => {
      await structured("Extraction", async () => finished);
      await expect(structured("The verdict", async () => cutOff)).rejects.toThrow(/cut off/);
    });
    expect(ledger.calls.map((c) => [c.what, c.model, c.input, c.cacheWrite, c.output])).toEqual([
      ["Extraction", "m-1", 10, 5, 3],
      ["The verdict", "m-1", 10, 5, 8000],
    ]);
    // A response with no meters records nothing, and a call outside a
    // ledger records nowhere.
    await withUsageLedger(ledger, async () => {
      await structured("Extraction", async () => ({ parsed_output: { a: 1 }, stop_reason: "end_turn" }));
    });
    expect(ledger.calls).toHaveLength(2);
    await structured("Extraction", async () => finished);
    expect(ledger.calls).toHaveLength(2);
  });

  it("turns the SDK's parse failure into a ScreenError that keeps the parser's text as detail", async () => {
    const call = () =>
      Promise.reject(
        new Error(
          "Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string in JSON at position 62",
        ),
      );
    const err = await structured("Extraction", call).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScreenError);
    expect((err as ScreenError).message).toMatch(/Extraction came back unreadable/);
    expect((err as ScreenError).detail).toContain("position 62");
    // Every other failure passes through untouched.
    const other = new Error("fetch failed");
    await expect(structured("Extraction", () => Promise.reject(other))).rejects.toBe(other);
  });
});
