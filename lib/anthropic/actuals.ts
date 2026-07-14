import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import {
  ANALYST_SYSTEM,
  rentRollExtractionInstruction,
  t12ExtractionInstruction,
} from "./prompts";
import type { ParsedModel } from "@/lib/model-parse";
import type { RentRollExtraction, T12Extraction } from "@/lib/actuals/types";

/** How many rent-roll rows we capture before flagging the roll as truncated. */
export const RENT_ROLL_ROW_CAP = 400;

const RentRollSchema = z.object({
  asOfDate: z.string(),
  truncated: z.boolean(),
  page: z.string(),
  rows: z.array(
    z.object({
      tenant: z.string(),
      suiteUnit: z.string(),
      sf: z.number().nullable(),
      leaseExpiry: z.string(),
      inPlaceRentMonthly: z.number().nullable(),
      rentPsf: z.number().nullable(),
      occupied: z.boolean(),
      freeRentMonths: z.number().nullable(),
      tiPsf: z.number().nullable(),
      page: z.string(),
    }),
  ),
});

const T12Schema = z.object({
  periodEndDate: z.string(),
  collectedRent: z.number().nullable(),
  vacancyLoss: z.number().nullable(),
  otherIncome: z.number().nullable(),
  egi: z.number().nullable(),
  opex: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      amount: z.number(),
      page: z.string(),
    }),
  ),
  totalOpex: z.number().nullable(),
  noi: z.number().nullable(),
  page: z.string(),
});

/** The document content block — native PDF, else flattened text. */
function docBlock(parsed: ParsedModel): Anthropic.ContentBlockParam {
  if (parsed.kind === "pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: parsed.data.toString("base64"),
      },
    };
  }
  return { type: "text", text: `Document contents (extracted text):\n\n${parsed.text}` };
}

/**
 * Extract the RAW rent-roll rows (Feature 1). The consolidation into unit mix /
 * WALT / expiry buckets happens deterministically in lib/actuals/analyze — this
 * only reads what the document states. Row count is capped; over the cap the
 * roll is flagged truncated.
 */
export async function extractRentRoll(parsed: ParsedModel): Promise<RentRollExtraction> {
  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [docBlock(parsed), { type: "text", text: rentRollExtractionInstruction(RENT_ROLL_ROW_CAP) }],
      },
    ],
    output_config: { format: zodOutputFormat(RentRollSchema) },
  });
  const out = response.parsed_output;
  if (!out) throw new Error("Could not extract the rent roll.");
  // Hard cap defensively even if the model over-returns.
  const rows = out.rows.slice(0, RENT_ROLL_ROW_CAP);
  return { ...out, rows, truncated: out.truncated || out.rows.length > RENT_ROLL_ROW_CAP };
}

/**
 * Extract the T-12 operating statement (Feature 1) as stated. EGI/NOI subtotals
 * are reconstructed downstream in code when the statement omits them.
 */
export async function extractT12(parsed: ParsedModel): Promise<T12Extraction> {
  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [docBlock(parsed), { type: "text", text: t12ExtractionInstruction() }],
      },
    ],
    output_config: { format: zodOutputFormat(T12Schema) },
  });
  const out = response.parsed_output;
  if (!out) throw new Error("Could not extract the T-12 statement.");
  return out;
}
