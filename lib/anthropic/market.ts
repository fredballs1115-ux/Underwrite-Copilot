import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, marketCheckInstruction } from "./prompts";
import type { AssetClass, MarketResult } from "./types";

const MarketSchema = z.object({
  checks: z.array(
    z.object({
      assumption: z.string(),
      omSays: z.string(),
      typicalRange: z.string(),
      assessment: z.enum(["in-line", "aggressive", "conservative"]),
      note: z.string(),
    }),
  ),
  summary: z.string(),
});

/**
 * Sanity-check the OM's key assumptions against general market norms for the
 * asset class. There's NO live comps feed by design — this reasons from typical
 * ranges and is explicit that it's rules-of-thumb, not pulled comps. Reasoning
 * model.
 */
export async function checkMarket(
  pdf: Buffer,
  assetClass: AssetClass,
): Promise<MarketResult> {
  const client = getAnthropic();
  const data = pdf.toString("base64");

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data },
          },
          { type: "text", text: marketCheckInstruction(assetClass) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(MarketSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Market check did not return structured output.");
  }
  return out;
}
