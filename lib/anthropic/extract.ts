import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, extractionInstruction } from "./prompts";
import type { AssetClass, ExtractionResult } from "./types";

// The schema Claude must fill. `zodOutputFormat` turns this into a strict
// JSON-schema the model is FORCED to match, so the result is always valid —
// no "please respond with JSON" guesswork, no parsing failures.
const ExtractionSchema = z.object({
  dealName: z.string(),
  assetClass: z.string(),
  market: z.string(),
  address: z.string(),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      flagged: z.boolean(),
      page: z.string(),
      basis: z.enum(["in_place", "pro_forma", "na"]),
      // ≤10-word verbatim quote of the surrounding text, for the source-chip
      // hover. Empty when the model can't quote it — never invented.
      locatorSnippet: z.string(),
    }),
  ),
});

/**
 * Send the OM PDF to Claude and extract the key terms. The PDF is read natively
 * (Claude sees the actual pages, text + layout), and the output is constrained
 * to the schema above.
 */
export async function extractTerms(
  pdf: Buffer,
  assetClass: AssetClass,
): Promise<ExtractionResult> {
  const client = getAnthropic();
  const data = pdf.toString("base64");

  const response = await client.messages.parse({
    model: MODELS.extraction,
    max_tokens: MAX_TOKENS.extraction,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // Document first, then the instruction (recommended ordering).
          // `cache_control` caches the prefix up to here — the system prompt +
          // this OM — so the next pipeline steps (challenge / comps / market),
          // which re-send the same OM back-to-back, read it from cache at a
          // fraction of the input cost instead of re-uploading it each time.
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data,
            },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: extractionInstruction(assetClass) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Extraction did not return structured output.");
  }

  return {
    dealName: out.dealName.trim() ? out.dealName.trim() : null,
    assetClass: out.assetClass,
    market: out.market,
    // The buy-box market check matches against market AND address — dropping
    // this field made "Dallas" fail on a deal whose street address is Dallas.
    address: out.address,
    metrics: out.metrics.map((m) => ({
      ...m,
      // Guard the ≤10-word cap even if the model over-quotes.
      locatorSnippet: m.locatorSnippet?.split(/\s+/).slice(0, 10).join(" ") ?? "",
    })),
  };
}
