import "server-only";
import { z } from "zod";
import { screenOutputFormat } from "./output-format";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { MODELS } from "./models";
import { ANALYST_SYSTEM, firstSignalInstruction } from "./prompts";
import { todayLine } from "./today";
import type { AssetClass, FirstSignal } from "./types";
import { DOCUMENT_KINDS } from "@/lib/document-kind";

const FirstSignalSchema = z.object({
  dealName: z.string(),
  assetClass: z.string(),
  market: z.string(),
  askPrice: z.string(),
  size: z.string(),
  goingInCap: z.string(),
  perUnit: z.string(),
  take: z.string(),
  // What the document IS (lib/document-kind): the deal page warns where it
  // is not an offering memorandum. Asked after the cached document, so the
  // prompt cache's prefix never moves.
  documentKind: z.enum(DOCUMENT_KINDS),
});

/**
 * The instant headline read. It sends the SAME model, system prompt and
 * document block (with the same cache breakpoint) as the steps after it, so
 * that its cache write of the OM could be the one the later steps read back
 * at a tenth of the input price. Whether they do is not established: each
 * step sends its own structured-output format, and Anthropic's documentation
 * says changing that format invalidates the prompt cache — a real screen's
 * ledger (`analysis_jobs.usage`) says, call by call (./models).
 */
export async function readFirstSignal(
  om: OmSource,
  assetClass: AssetClass,
): Promise<FirstSignal> {
  const client = getAnthropic();

  const out = await structured("The first signal", () => client.messages.parse({
    model: MODELS.extraction,
    max_tokens: 1500,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          omDocument(om),
          { type: "text", text: firstSignalInstruction(assetClass) },
          // Today's date, after the cached document (lib/anthropic/today).
          { type: "text", text: todayLine() },
        ],
      },
    ],
    output_config: { format: screenOutputFormat(FirstSignalSchema) },
  }, omRequestOptions(om)));

  return {
    ...out,
    dealName: out.dealName.trim() ? out.dealName.trim() : null,
  };
}
