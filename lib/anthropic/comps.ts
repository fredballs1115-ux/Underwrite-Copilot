import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, brokerCompsInstruction } from "./prompts";
import type { BrokerCompsResult } from "./types";

const CompSchema = z.object({
  name: z.string(),
  detail: z.string(),
  support: z.enum(["supports", "favorable", "stretched"]),
  note: z.string(),
  page: z.string(),
});

const BrokerCompsSchema = z.object({
  saleComps: z.array(CompSchema),
  leaseComps: z.array(CompSchema),
  redFlags: z.array(z.string()),
  summary: z.string(),
});

/**
 * Scrutinize the sale & lease comps INSIDE the OM — no external comps feed
 * (deliberate: avoids data-licensing constraints). Rates how well each comp
 * actually supports the subject deal and flags selection bias.
 * Uses the reasoning model (Opus) since this is judgment, not transcription.
 */
export async function scrutinizeComps(om: OmSource): Promise<BrokerCompsResult> {
  const client = getAnthropic();

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // Reads the OM from the prompt cache the extraction step wrote.
          omDocument(om),
          { type: "text", text: brokerCompsInstruction() },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(BrokerCompsSchema) },
  }, omRequestOptions(om));

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Broker-comp scrutiny did not return structured output.");
  }
  return out;
}
