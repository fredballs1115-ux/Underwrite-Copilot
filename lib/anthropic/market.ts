import "server-only";
import { z } from "zod";
import { screenOutputFormat } from "./output-format";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, marketCheckInstruction } from "./prompts";
import { todayLine } from "./today";
import type { AssetClass, MarketResult } from "./types";

const MarketSchema = z.object({
  checks: z.array(
    z.object({
      assumption: z.string(),
      // The deal page and the report draw omSays on the typicalRange band
      // (deal-sections.tsx PositionBar, report-document.tsx rangeRead), so
      // both carry a unit and the range runs low to high in that unit.
      omSays: z
        .string()
        .describe('The OM\'s figure with its unit — "5.45%", "$2,400/mo", "4.0%/yr".'),
      typicalRange: z
        .string()
        .describe(
          'Low to high in the same unit as omSays, with an en dash — "5.25%–5.75%", "$2,150–$2,450/mo", "2.5%–3.5%"; words, not an invented range, where no numeric range applies.',
        ),
      assessment: z.enum(["in-line", "aggressive", "conservative"]),
      note: z.string(),
      page: z.string(),
    }),
  ),
  summary: z.string(),
});

/**
 * Sanity-check the OM's key assumptions against general market norms for the
 * asset class. There's NO live comps feed by design — this reasons from typical
 * ranges and is explicit that it's rules-of-thumb, not pulled comps. Reasoning
 * model.
 */
export async function checkMarket(
  om: OmSource,
  assetClass: AssetClass,
  /** what the screen established — the deal's kind and, on a plan deal, the
   *  plan's figures and timeline — so the norms are applied to the right thing */
  context?: string | null,
  /** the metro's published figures, dated (lib/live-market-brief's `text`),
   *  where the deal sits in a covered market; null outside them */
  liveMarket?: string | null,
  /** a forward purchase (lib/forward-purchase): its paragraph stands where
   *  a plan's would — the developer's budget is not the buyer's */
  forward = false,
): Promise<MarketResult> {
  const client = getAnthropic();

  const out = await structured("The market check", () => client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // The OM under the cache breakpoint every step sends (whether this
          // reads an earlier step's cache, with a structured-output format of
          // its own, is the ledger's to say — ./models); the context and the
          // figures ride after it so nothing that varies by deal sits before
          // it.
          omDocument(om),
          { type: "text", text: marketCheckInstruction(assetClass, context, liveMarket, forward) },
          // Today's date, which every dated figure is read against
          // (lib/anthropic/today).
          { type: "text", text: todayLine() },
        ],
      },
    ],
    output_config: { format: screenOutputFormat(MarketSchema) },
  }, omRequestOptions(om)));
  return out;
}
