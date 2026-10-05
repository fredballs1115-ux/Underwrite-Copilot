import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { screenOutputFormat } from "./output-format";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import {
  anyOmRequestOptions,
  omDocument,
  omSourceFor,
  releaseOmSource,
  type OmSource,
} from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, reconcilerInstruction } from "./prompts";
import { todayLine } from "./today";
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
  /** what the screen established — the deal's kind and, on a plan deal, the
   *  plan's figures — so the two models are compared on the plan's terms */
  context?: string | null,
): Promise<ReconciliationResult> {
  const client = getAnthropic();

  // OM document FIRST with cache_control, the step's label text after it, so
  // nothing step-specific sits before the breakpoint. The document is the
  // memorandum's pages — the caller builds its source without `textFirst`
  // (./om-source) — where the screen's steps send the deck's own text layer
  // whenever that layer is dense enough to stand in for the pages; so this
  // prefix matches theirs only on a deck the screen also read as pages, and
  // even then its structured-output format is its own, which Anthropic's
  // documentation says invalidates the prompt cache. Whether it reads
  // anything back from their cache is the ledger's to say (./models).
  // Reading the text layer here is the owner's call (research pass 41, L7).
  const content: Anthropic.ContentBlockParam[] = [
    omDocument(om),
    {
      type: "text",
      text: "The document above is the broker's offering memorandum (OM).",
    },
  ];

  let modelOm: OmSource | null = null;
  if (model.kind === "pdf") {
    content.push({ type: "text", text: "The buyer's own underwriting model:" });
    modelOm = await omSourceFor(model.data, "buyer-model.pdf");
    content.push(omDocument(modelOm, false));
  } else {
    content.push({
      type: "text",
      text: `The buyer's own underwriting model, flattened out of their spreadsheet:\n\n${model.text}`,
    });
  }

  content.push({ type: "text", text: reconcilerInstruction(context) });
  // Today's date, last, after both documents (lib/anthropic/today).
  content.push({ type: "text", text: todayLine() });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];

  try {
    return await structured("The reconciler", () =>
      client.messages.parse({
        model: MODELS.reasoning,
        max_tokens: MAX_TOKENS.analysis,
        system: ANALYST_SYSTEM,
        messages,
        output_config: { format: screenOutputFormat(ReconciliationSchema) },
      }, anyOmRequestOptions(om, modelOm)),
    );
  } finally {
    // The buyer's model rode as a Files-API object for this one call.
    await releaseOmSource(modelOm);
  }
}
