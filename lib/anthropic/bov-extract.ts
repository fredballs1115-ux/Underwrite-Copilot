import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM } from "./prompts";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import type { ValuationField } from "@/lib/valuation/types";

/**
 * BOV extraction (Phase 2) — added ALONGSIDE the OM path, never folded into it.
 *
 * A broker opinion of value is not an offering memorandum: it's short, it's a
 * pitch for a price, and the assumptions almost always sit in one summary
 * table. So this is a single focused call for a fixed field list, not the OM's
 * open-ended metric sweep.
 *
 * Two rules the schema enforces:
 *   - a page citation per field, so every number links back to where it was read
 *   - a cap rate backed out of a value and an NOI is DERIVED, and comes back
 *     marked as derived rather than presented as something the BOV stated
 *
 * One API call per document. Fields the BOV doesn't state come back null and
 * the user fills them in.
 */

/** A numeric field plus where it came from. `value` is null when the document
 *  doesn't state it — the model is instructed never to estimate. */
const Field = z.object({
  value: z.number().nullable(),
  /** page reference as printed, e.g. "p. 7"; empty when not locatable */
  page: z.string(),
  /** ≤10-word verbatim quote of the surrounding text; empty if not quotable */
  snippet: z.string(),
  /** true when computed from other figures rather than read off the page */
  derived: z.boolean(),
});

const BovSchema = z.object({
  /** the broker/house issuing the opinion, as printed ("JLL", "Eastdil") */
  sourceLabel: z.string(),
  sourceType: z.enum(["broker", "internal", "seller"]),
  propertyName: z.string(),
  headlineValue: Field,
  year1Noi: Field,
  /** decimals: 6.5% must come back as 0.065 */
  goingInCap: Field,
  exitCap: Field,
  /** whole years */
  holdYears: Field,
  rentGrowth: Field,
  vacancyAssumption: Field,
  capexDeduction: Field,
  discountRate: Field,
  /** one skeptical sentence on what this opinion is arguing for */
  take: z.string(),
});

export type BovField = z.infer<typeof Field>;

export interface BovExtraction {
  sourceLabel: string;
  sourceType: "broker" | "internal" | "seller";
  propertyName: string;
  take: string;
  fields: Record<ValuationField, BovField>;
}

const INSTRUCTION = `The attached document is a BROKER OPINION OF VALUE (BOV) or a seller's pricing guidance — not an offering memorandum. It is short, it argues for a price, and its assumptions almost always sit in one summary or valuation-conclusion table.

Read that table and return EXACTLY the fields in the schema.

Rules, in order of importance:

1. NEVER INVENT A NUMBER. If the document does not state a field, return value: null. A null is a correct answer. An estimate is not.

2. NEVER GUESS A CAP RATE FROM A VALUE AND AN NOI WITHOUT MARKING IT. If the document states a cap rate, return it with derived: false. If it does not state one but you can compute it from a stated value and a stated NOI, return the computed figure with derived: true and cite the pages the value and NOI came from. The same rule applies to any other field you compute rather than read.

3. RATES ARE DECIMALS. A "6.5% cap rate" is 0.065. A "3.0% rent growth" is 0.03. A "5% vacancy" is 0.05. Hold period is in whole years.

4. CITE THE PAGE for every non-null field: the page number as printed on the page or in the PDF, formatted like "p. 7". Add a verbatim quote of at most 10 words from the surrounding text as the snippet. If you genuinely cannot locate it, return an empty page string rather than a made-up one.

5. WHICH NOI. year1Noi is the FORWARD / Year-1 NOI the valuation is capitalizing, not a trailing-12 actual, unless the document capitalizes the trailing figure — in which case say so in your take.

6. capexDeduction is anything deducted below the line to reach the headline value: tenant improvements and leasing commissions, deferred maintenance, free-rent or downtime credits, a capital reserve. Sum them if the document itemizes them, and quote the itemization in the snippet. Null if the document deducts nothing.

7. sourceLabel is the firm whose opinion this is, as printed. sourceType is 'broker' for a brokerage BOV, 'seller' for owner/seller guidance, 'internal' for a buy-side memo.

Finish with take: ONE skeptical sentence naming the single assumption this opinion leans hardest on.`;

/** Run the BOV extraction. One call per document. */
export async function extractBov(source: OmSource): Promise<BovExtraction> {
  const client = getAnthropic();

  const response = await client.messages.parse(
    {
      model: MODELS.extraction,
      max_tokens: MAX_TOKENS.extraction,
      system: ANALYST_SYSTEM,
      messages: [
        {
          role: "user",
          content: [omDocument(source), { type: "text", text: INSTRUCTION }],
        },
      ],
      output_config: { format: zodOutputFormat(BovSchema) },
    },
    omRequestOptions(source),
  );

  const out = response.parsed_output;
  if (!out) throw new Error("BOV extraction did not return structured output.");

  const clean = (f: BovField): BovField => ({
    value: f.value != null && Number.isFinite(f.value) ? f.value : null,
    page: f.page?.trim() ?? "",
    snippet: f.snippet?.split(/\s+/).slice(0, 10).join(" ") ?? "",
    derived: f.derived === true,
  });

  return {
    sourceLabel: out.sourceLabel?.trim() || "Broker opinion of value",
    sourceType: out.sourceType,
    propertyName: out.propertyName?.trim() ?? "",
    take: out.take?.trim() ?? "",
    fields: {
      headlineValue: clean(out.headlineValue),
      year1Noi: clean(out.year1Noi),
      goingInCap: clean(out.goingInCap),
      exitCap: clean(out.exitCap),
      holdYears: clean(out.holdYears),
      rentGrowth: clean(out.rentGrowth),
      vacancyAssumption: clean(out.vacancyAssumption),
      capexDeduction: clean(out.capexDeduction),
      discountRate: clean(out.discountRate),
    },
  };
}
