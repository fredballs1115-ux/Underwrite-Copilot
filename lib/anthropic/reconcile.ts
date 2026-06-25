import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, reconcilerInstruction } from "./prompts";
import type { ReconciliationResult } from "./types";
import type { ParsedModel } from "@/lib/model-parse";

const ReconciliationSchema = z.object({
  rows: z.array(
    z.object({
      metric: z.string(),
      omValue: z.string(),
      myValue: z.string(),
      gap: z.string(),
      direction: z.enum(["favorable", "unfavorable", "neutral"]),
    }),
  ),
  takeaway: z.string(),
});

/**
 * The differentiator: line the OM up against the buyer's OWN underwriting and
 * surface every gap, with each gap framed from the buyer's perspective. The OM
 * always goes in as a PDF; the buyer's model is either a second PDF (ARGUS /
 * printed) or text we flattened out of their spreadsheet. Reasoning model.
 */
export async function reconcileModel(
  omPdf: Buffer,
  model: ParsedModel,
): Promise<ReconciliationResult> {
  const client = getAnthropic();

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "The broker's offering memorandum (OM):" },
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: omPdf.toString("base64"),
      },
    },
  ];

  if (model.kind === "pdf") {
    content.push({ type: "text", text: "The buyer's own underwriting model:" });
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: model.data.toString("base64"),
      },
    });
  } else {
    content.push({
      type: "text",
      text: `The buyer's own underwriting model, flattened out of their spreadsheet:\n\n${model.text}`,
    });
  }

  content.push({ type: "text", text: reconcilerInstruction() });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages,
    output_config: { format: zodOutputFormat(ReconciliationSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Reconciler did not return structured output.");
  }
  return out;
}
