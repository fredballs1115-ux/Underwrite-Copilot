import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS } from "./models";
import { ANALYST_SYSTEM, firstSignalInstruction } from "./prompts";
import type { AssetClass, FirstSignal } from "./types";

const FirstSignalSchema = z.object({
  dealName: z.string(),
  assetClass: z.string(),
  market: z.string(),
  askPrice: z.string(),
  size: z.string(),
  goingInCap: z.string(),
  perUnit: z.string(),
  take: z.string(),
});

/**
 * The instant headline read. Deliberately the SAME model, system prompt, and
 * document block (with the same cache breakpoint) as the extraction step: this
 * call pays the one-time cache write for the OM, and every later pipeline step
 * reads it back at a fraction of the input price — so the fast first signal is
 * close to free, not a second full read.
 */
export async function readFirstSignal(
  pdf: Buffer,
  assetClass: AssetClass,
): Promise<FirstSignal> {
  const client = getAnthropic();

  const response = await client.messages.parse({
    model: MODELS.extraction,
    max_tokens: 1500,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdf.toString("base64"),
            },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: firstSignalInstruction(assetClass) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(FirstSignalSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("First signal did not return structured output.");
  }

  return {
    ...out,
    dealName: out.dealName.trim() ? out.dealName.trim() : null,
  };
}
