import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, brokerCompsInstruction } from "./prompts";
import type { BrokerCompsResult } from "./types";

const CompSchema = z.object({
  name: z.string(),
  // The deal page and the report draw a sale comp's basis from this line
  // (lib/comp-detail), so it leads with the figures the OM states.
  detail: z
    .string()
    .describe(
      "What the OM states of the comp's basis, figures first: for a sale comp the price per unit (or per SF, or per key) and the cap rate, then the date and size; for a lease comp the rent and the unit type or space. Nothing the OM does not state.",
    ),
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
export async function scrutinizeComps(
  om: OmSource,
  /** what the screen established — the deal's kind and, on a plan deal, the
   *  plan's figures — so the comps are held against the right basis */
  context?: string | null,
): Promise<BrokerCompsResult> {
  const client = getAnthropic();

  const out = await structured("Broker-comp scrutiny", () => client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // Reads the OM from the prompt cache the extraction step wrote; the
          // context rides after it so the cached prefix stays identical.
          omDocument(om),
          { type: "text", text: brokerCompsInstruction(context) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(BrokerCompsSchema) },
  }, omRequestOptions(om)));
  return out;
}
