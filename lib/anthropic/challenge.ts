import "server-only";
import { z } from "zod";
import { screenOutputFormat } from "./output-format";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, challengerInstruction, type KeyedTrapList } from "./prompts";
import { todayLine } from "./today";
import type { AssetClass, ChallengerResult } from "./types";

const ChallengerSchema = z.object({
  challenges: z.array(
    z.object({
      assumption: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      challenge: z.string(),
      question: z.string(),
      page: z.string(),
    }),
  ),
  stressTest: z.string(),
});

/**
 * Red-team the OM's pro forma the way an investment committee would. Returns
 * the challenges (each with the exact question to put to the broker) plus a
 * stress test. Uses the reasoning model (Opus) since this is analytical.
 */
export async function challengeAssumptions(
  om: OmSource,
  assetClass: AssetClass,
  /** cross-document reconciliation red flags for the skeptic to reference */
  reconNote?: string,
  /** the trap lists the memorandum's own words call for (prompts
   *  `keyedTrapsFor`), read after the class's own */
  keyed: readonly KeyedTrapList[] = [],
  /** a forward purchase (lib/forward-purchase): its paragraph stands where
   *  a plan's construction paragraph would — the buyer carries no
   *  construction — and its facts and traps ride in `reconNote` */
  forward = false,
): Promise<ChallengerResult> {
  const client = getAnthropic();
  const instruction =
    challengerInstruction(assetClass, keyed, forward) +
    (reconNote?.trim()
      ? `\n\n${reconNote.trim()} Where a figure the OM relies on is contradicted by the rent roll or T-12, treat that as a first-order challenge and put the exact discrepancy to the broker.`
      : "");

  const out = await structured("The challenger", () => client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.analysis,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // The OM under the cache breakpoint every step sends; whether this
          // reads an earlier step's cache, with a structured-output format of
          // its own, is the ledger's to say (./models).
          omDocument(om),
          { type: "text", text: instruction },
          // Today's date, after the cached document (lib/anthropic/today).
          { type: "text", text: todayLine() },
        ],
      },
    ],
    output_config: { format: screenOutputFormat(ChallengerSchema) },
  }, omRequestOptions(om)));
  return out;
}
