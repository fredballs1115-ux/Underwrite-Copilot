import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
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
      unit: z.string(),
      locator: z.string(),
      basis: z.string(),
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
  if (doc.parsed.kind === "pdf") {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: doc.parsed.data.toString("base64"),
      },
    });
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

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(FactsSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error(`Could not extract facts from "${doc.name}".`);
  }
  return { docName: doc.name, kind: doc.kind, facts: out.facts };
}
