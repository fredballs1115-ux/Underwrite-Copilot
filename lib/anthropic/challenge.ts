import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, challengerInstruction } from "./prompts";
import type { AssetClass, ChallengerResult } from "./types";

const ChallengerSchema = z.object({
  challenges: z.array(
    z.object({
      assumption: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      challenge: z.string(),
      question: z.string(),
      page: z.string(),
    }),
  ),
  stressTest: z.string(),
});

/**
 * Red-team the OM's pro forma the way an investment committee would. Returns
 * the challenges (each with the exact question to put to the broker) plus a
 * stress test. Uses the reasoning model (Opus) since this is analytical.
 */
export async function challengeAssumptions(
  pdf: Buffer,
  assetClass: AssetClass,
): Promise<ChallengerResult> {
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
            // Reads the OM from the prompt cache the extraction step wrote.
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: challengerInstruction(assetClass) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ChallengerSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Challenger did not return structured output.");
  }
  return out;
}
