import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import {
  omDocument,
  omRequestOptions,
  omSourceFor,
  releaseOmSource,
  type OmSource,
} from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, docExtractionInstruction } from "./prompts";
import type { ParsedModel } from "@/lib/model-parse";
import type { DocFacts } from "@/lib/model/types";

const FactsSchema = z.object({
  facts: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.string(),
      numeric: z.number().nullable(),
      unit: z.enum(["%", "$", "$/unit/mo", "$/sf", "units", "sf", "years", "x", ""]),
      locator: z.string(),
      basis: z.enum(["actual", "pro_forma", "term_sheet", "appraisal", "other"]),
    }),
  ),
});

/**
 * Pass 1 of the model generator: read ONE document and pull every underwriting
 * fact, each tagged with where it came from and whether it's an actual or a
 * pro forma. PDFs go in natively; spreadsheets arrive as flattened text.
 */
export async function extractDocFacts(doc: {
  name: string;
  kind: string;
  parsed: ParsedModel;
}): Promise<DocFacts> {
  const client = getAnthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  let om: OmSource | null = null;
  if (doc.parsed.kind === "pdf") {
    om = await omSourceFor(doc.parsed.data, doc.name || "document.pdf");
    content.push(omDocument(om, false));
  } else {
    content.push({
      type: "text",
      text: `Document contents (extracted text):\n\n${doc.parsed.text}`,
    });
  }
  content.push({
    type: "text",
    text: docExtractionInstruction(doc.kind, doc.name),
  });

  try {
    const out = await structured(`Fact extraction from "${doc.name}"`, () =>
      client.messages.parse({
        model: MODELS.reasoning,
        max_tokens: MAX_TOKENS.analysis,
        system: ANALYST_SYSTEM,
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(FactsSchema) },
      }, om ? omRequestOptions(om) : {}),
    );
    return { docName: doc.name, kind: doc.kind, facts: out.facts };
  } finally {
    // A PDF's Files-API copy lives only for this pass.
    await releaseOmSource(om);
  }
}
