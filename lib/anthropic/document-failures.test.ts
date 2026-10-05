/**
 * Every failure that is the DOCUMENT's is held to the list the deal page and
 * the screen-stopped email read (lib/anthropic/document-failures): under it
 * the page offers Replace OM, never a "Try again" that reads the same file
 * the same way (research pass 30). A failure a retry may fix stays off it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScreenError, describeRunFailure, structuredOutput } from "./failure";
import {
  NO_FIGURES_FAILURE,
  NO_OM_FAILURE,
  REJECTED_FAILURE,
  TOO_LARGE_FAILURE,
  documentFailure,
  pageCapFailure,
  refusalFailure,
} from "./document-failures";
import { needsOperator } from "./operator-failures";

/** The SDK's APIError, by shape: an HTTP status and its "413 {…}" message. */
function apiError(status: number, type: string, message: string): Error {
  return Object.assign(new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`), {
    status,
    name: "APIError",
  });
}

const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw");
};

describe("documentFailure — the failures a retry of the same file cannot fix", () => {
  it("no figures, the page cap and a 413 offer Replace OM alone; a refusal offers the retry beside it", () => {
    expect(documentFailure(NO_FIGURES_FAILURE)).toBe("replace");
    expect(documentFailure(pageCapFailure(700))).toBe("replace");
    expect(documentFailure(pageCapFailure(1_204))).toBe("replace");
    expect(documentFailure(describeRunFailure(apiError(413, "request_too_large", "Request exceeds the maximum size")).message)).toBe("replace");
    // A refusal at any step, as the structured-output guard writes it.
    for (const what of ["Extraction", "The challenger", "The verdict"]) {
      const err = thrown(() => structuredOutput({ parsed_output: null, stop_reason: "refusal" }, what));
      expect(err).toBeInstanceOf(ScreenError);
      expect((err as Error).message).toBe(refusalFailure(what));
      // A refusal may not recur on a second read (the batch-2 audit).
      expect(documentFailure(describeRunFailure(err).message), what).toBe("replace_or_retry");
    }
    // A failure stored under the 413's earlier remedy reads the same way.
    expect(documentFailure("The analysis service refused this document as too large — try a smaller PDF.")).toBe("replace");
    // Each names Replace OM as the way on, but the refusal, whose remedy the
    // banner itself offers.
    for (const m of [NO_FIGURES_FAILURE, pageCapFailure(700), TOO_LARGE_FAILURE]) expect(m).toContain("Replace OM");
  });

  it("the provider's 400 for a PDF it will not read offers Replace OM beside the retry — its words are not read yet", () => {
    const f = describeRunFailure(apiError(400, "invalid_request_error", "The PDF specified was not valid."));
    expect(f.message).toBe(REJECTED_FAILURE);
    expect(documentFailure(f.message)).toBe("replace_or_retry");
  });

  it("a deal with no OM is offered one, and an OM gone from storage is uploaded again", () => {
    expect(documentFailure(NO_OM_FAILURE)).toBe("attach");
    expect(documentFailure(describeRunFailure(new Error("Storage download failed: Object not found")).message)).toBe("replace");
  });

  it("a failure a retry may fix, and the operator's, are not the document's", () => {
    for (const err of [
      apiError(429, "rate_limit_error", "slow down"),
      apiError(529, "overloaded_error", "Overloaded"),
      apiError(500, "api_error", "boom"),
      apiError(401, "authentication_error", "invalid x-api-key"),
      apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."),
      Object.assign(new Error("Connection error."), { name: "APIConnectionError" }),
      // Our storage on a blip; an object that is gone is the document's (below).
      new Error("Storage download failed: fetch failed"),
      new Error("Failed to parse structured output: Unterminated string in JSON at position 6"),
    ]) {
      const m = describeRunFailure(err).message;
      expect(documentFailure(m), m).toBeNull();
    }
    const cut = thrown(() => structuredOutput({ parsed_output: { a: 1 }, stop_reason: "max_tokens" }, "Extraction"));
    expect(documentFailure((cut as Error).message)).toBeNull();
    expect(documentFailure(null)).toBeNull();
    expect(documentFailure("")).toBeNull();
    // The two lists never overlap.
    for (const m of [NO_FIGURES_FAILURE, TOO_LARGE_FAILURE, REJECTED_FAILURE, NO_OM_FAILURE, pageCapFailure(700)]) {
      expect(needsOperator(m)).toBe(false);
    }
  });

  it("every document sentence the screen writes comes from the list — none typed in place", () => {
    const dir = join(process.cwd(), "lib/anthropic");
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "document-failures.ts") continue;
      const src = readFileSync(join(dir, f), "utf8");
      // A ScreenError whose own literal names Replace OM, or the sentences
      // the list holds, written out where they are thrown.
      if (/new ScreenError\(\s*[`"'][^`"']*Replace OM/.test(src)) offenders.push(`${f}: a Replace OM sentence typed in place`);
      for (const marker of ["couldn't read any figures", "was declined by the model", "refused this document as too large", "No OM file is attached to this deal —"]) {
        if (src.includes(marker)) offenders.push(`${f}: "${marker}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
