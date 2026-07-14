import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
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
  om: OmSource,
  model: ParsedModel,
): Promise<ReconciliationResult> {
  const client = getAnthropic();

  // OM document FIRST with cache_control — byte-identical to the prefix the
  // extract/challenge/comps/market steps send, so this step reads the OM from
  // the prompt cache (and re-warms it) instead of paying a full re-read of a
  // 150-200pp PDF. The label text moves after the document for that reason.
  const content: Anthropic.ContentBlockParam[] = [
    omDocument(om),
    {
      type: "text",
      text: "The document above is the broker's offering memorandum (OM).",
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
  }, omRequestOptions(om));

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Reconciler did not return structured output.");
  }
  return out;
}
