import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, extractionInstruction } from "./prompts";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import type { AssetClass, ExtractionResult } from "./types";

// The schema Claude must fill. `zodOutputFormat` turns this into a strict
// JSON-schema the model is FORCED to match, so the result is always valid —
// no "please respond with JSON" guesswork, no parsing failures.
const ExtractionSchema = z.object({
  dealName: z.string(),
  assetClass: z.string(),
  market: z.string(),
  address: z.string(),
  // The OM's total page count, as the model sees the native PDF. Used to
  // VALIDATE cited pages (a byte-level counter mis-reads object-stream and
  // bookmarked PDFs); 0 if the model can't tell.
  totalPages: z.number(),
  // What kind of deal this is. Read BEFORE the figures, because it decides
  // what they mean: a stabilized pro forma on a conversion is a yield on
  // total cost years out, not a going-in cap on the price.
  strategy: z.object({
    kind: z.enum(["stabilized", "value_add", "lease_up", "conversion", "development", "unknown"]),
    summary: z.string(),
    capitalBudget: z.string(),
    timeline: z.string(),
  }),
  // Each property of a PORTFOLIO OM (two or more separately addressed
  // buildings or sites), with what the OM states for THAT property and ""
  // where it states nothing; an empty list for a single-property OM. The
  // whole portfolio's figures stay in `metrics`. Read by lib/portfolio.
  properties: z.array(
    z.object({
      name: z.string(),
      address: z.string(),
      count: z.string(),
      area: z.string(),
      noi: z.string(),
      occupancy: z.string(),
      yearBuilt: z.string(),
      allocatedPrice: z.string(),
      page: z.string(),
    }),
  ),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      flagged: z.boolean(),
      page: z.string(),
      basis: z.enum(["in_place", "pro_forma", "na"]),
      // ≤10-word verbatim quote of the surrounding text, for the source-chip
      // hover. Empty when the model can't quote it — never invented.
      locatorSnippet: z.string(),
    }),
  ),
});

/**
 * Send the OM PDF to Claude and extract the key terms. The PDF is read natively
 * (Claude sees the actual pages, text + layout), and the output is constrained
 * to the schema above.
 */
export async function extractTerms(
  om: OmSource,
  assetClass: AssetClass,
): Promise<ExtractionResult> {
  const client = getAnthropic();

  const out = await structured("Extraction", () => client.messages.parse({
    model: MODELS.extraction,
    max_tokens: MAX_TOKENS.extraction,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // Document first, then the instruction (recommended ordering).
          // The cache_control inside omDocument caches the prefix up to here —
          // the system prompt + this OM — so the next pipeline steps
          // (challenge / comps / market), which re-send the same OM
          // back-to-back, read it from cache at a fraction of the input cost.
          omDocument(om),
          { type: "text", text: extractionInstruction(assetClass) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  }, omRequestOptions(om)));

  return {
    dealName: out.dealName.trim() ? out.dealName.trim() : null,
    assetClass: out.assetClass,
    market: out.market,
    // The buy-box market check matches against market AND address — dropping
    // this field made "Dallas" fail on a deal whose street address is Dallas.
    address: out.address,
    totalPages: Number.isFinite(out.totalPages) && out.totalPages > 0 ? Math.round(out.totalPages) : 0,
    strategy: {
      kind: out.strategy.kind,
      summary: out.strategy.summary.trim(),
      capitalBudget: out.strategy.capitalBudget.trim(),
      timeline: out.strategy.timeline.trim(),
    },
    // A one-entry list is a single property restated, not a portfolio.
    properties:
      (out.properties ?? []).length >= 2
        ? out.properties.map((p) => ({
            name: p.name.trim(),
            address: p.address.trim(),
            count: p.count.trim(),
            area: p.area.trim(),
            noi: p.noi.trim(),
            occupancy: p.occupancy.trim(),
            yearBuilt: p.yearBuilt.trim(),
            allocatedPrice: p.allocatedPrice.trim(),
            page: p.page.trim(),
          }))
        : [],
    metrics: out.metrics.map((m) => ({
      ...m,
      // Guard the ≤10-word cap even if the model over-quotes.
      locatorSnippet: m.locatorSnippet?.split(/\s+/).slice(0, 10).join(" ") ?? "",
    })),
  };
}
