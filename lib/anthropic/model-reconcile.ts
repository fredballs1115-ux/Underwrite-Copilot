import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, reconciliationInstruction } from "./prompts";
import type { DocFacts } from "@/lib/model/types";

const SourceSchema = z.object({
  doc: z.string(),
  value: z.string(),
  locator: z.string(),
  basis: z.string(),
});

const MetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  chosenValue: z.string(),
  unit: z.string(),
  sources: z.array(SourceSchema),
  authority: z.string(),
  rationale: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  isConflict: z.boolean(),
});

const InputsSchema = z.object({
  units: z.number(),
  purchasePrice: z.number(),
  year1Gpr: z.number(),
  vacancyPct: z.number(),
  otherIncomeAnnual: z.number(),
  year1Opex: z.number(),
  capexReserveAnnual: z.number(),
  rentGrowthPct: z.number(),
  expenseGrowthPct: z.number(),
  otherIncomeGrowthPct: z.number(),
  exitCapPct: z.number(),
  sellingCostPct: z.number(),
  holdYears: z.number(),
  loan: z.object({
    ltvPct: z.number(),
    ratePct: z.number(),
    amortYears: z.number(),
    ioYears: z.number(),
  }),
});

const ReconSchema = z.object({
  metrics: z.array(MetricSchema),
  inputs: InputsSchema,
  summary: z.string(),
  caveats: z.array(z.string()),
});

export type ReconciliationOutput = z.infer<typeof ReconSchema>;

/**
 * Pass 2 — the heart of the model generator. Given the facts pulled from every
 * source document, reconcile each disagreement by source authority (actuals
 * beat pro forma, term sheet beats OM summary), surface every conflict, and
 * emit the numeric inputs the cash-flow math needs.
 */
export async function reconcileDocs(
  allFacts: DocFacts[],
): Promise<ReconciliationOutput> {
  const client = getAnthropic();
  const factsJson = JSON.stringify(allFacts, null, 2);

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.model,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: reconciliationInstruction() },
          {
            type: "text",
            text: `Facts extracted from each source document:\n\n${factsJson}`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ReconSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Reconciliation did not return structured output.");
  }
  return out;
}
