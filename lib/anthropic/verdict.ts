import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, verdictInstruction } from "./prompts";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "./types";

const ScreenRangeSchema = z.object({
  label: z.string(),
  low: z.string(),
  base: z.string(),
  high: z.string(),
  source: z.string(),
  basis: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const DealKillerSchema = z.object({
  lever: z.enum(["basis", "exit", "debt"]),
  read: z.string(),
  risk: z.string(),
});

const VerdictSchema = z.object({
  verdict: z.enum(["pass", "caution", "pass_on"]),
  reason: z.string(),
  topRisks: z.array(z.string()),
  nextSteps: z.array(z.string()),
  screen: z.object({
    ranges: z.array(ScreenRangeSchema),
    dealKillers: z.array(DealKillerSchema),
    sensitivity: z.array(
      z.object({
        scenario: z.enum(["conservative", "base", "sponsor"]),
        call: z.enum(["pass", "caution", "pass_on"]),
        note: z.string(),
      }),
    ),
  }),
});

export interface VerdictInputs {
  extraction: ExtractionResult | null;
  challenges: ChallengerResult | null;
  comps: BrokerCompsResult | null;
  reconciliation: ReconciliationResult | null;
  market: MarketResult | null;
}

/** Roll the gathered analysis up into one readable brief for the synthesizer. */
function buildBrief(input: VerdictInputs): string {
  const sections: string[] = [];

  // Deal identity first — the ranges must be grounded in the actual asset,
  // asset class, and submarket, not synthesized in a vacuum.
  const ex = input.extraction;
  sections.push(
    "## Deal",
    ex
      ? [
          `${ex.dealName ?? "(unnamed)"} — ${ex.assetClass}${ex.market ? ` — ${ex.market}` : ""}`,
          ex.address ? `Address: ${ex.address}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Not available.",
  );

  const cite = (page?: string) => (page ? ` [${page}]` : "");
  const basisTag = (b?: string) =>
    b === "in_place" ? " (in-place)" : b === "pro_forma" ? " (pro forma)" : "";

  sections.push(
    "## Extracted terms",
    input.extraction
      ? input.extraction.metrics
          .map(
            (m) =>
              `- ${m.label}: ${m.value}${basisTag(m.basis)}${cite(m.page)}${m.flagged ? " (flagged)" : ""}`,
          )
          .join("\n")
      : "Not available.",
  );

  sections.push(
    "## Assumption challenges",
    input.challenges
      ? [
          ...input.challenges.challenges.map(
            (c) =>
              `- [${c.severity}] ${c.assumption}${cite(c.page)}: ${c.challenge}`,
          ),
          `Stress test: ${input.challenges.stressTest}`,
        ].join("\n")
      : "Not available.",
  );

  sections.push(
    "## Broker-comp scrutiny",
    input.comps
      ? [
          ...input.comps.saleComps.map(
            (c) =>
              `- Sale [${c.support}] ${c.name}${c.detail ? ` (${c.detail})` : ""}${cite(c.page)}: ${c.note}`,
          ),
          ...input.comps.leaseComps.map(
            (c) =>
              `- Lease [${c.support}] ${c.name}${c.detail ? ` (${c.detail})` : ""}${cite(c.page)}: ${c.note}`,
          ),
          ...input.comps.redFlags.map((f) => `- Red flag: ${f}`),
          `Summary: ${input.comps.summary}`,
        ].join("\n")
      : "Not available.",
  );

  sections.push(
    "## Reconciliation vs. the buyer's own model",
    input.reconciliation
      ? [
          ...input.reconciliation.rows.map(
            (r) =>
              `- ${r.metric}: OM ${r.omValue} vs. model ${r.myValue} — ${r.gap} (${r.direction})`,
          ),
          `Takeaway: ${input.reconciliation.takeaway}`,
        ].join("\n")
      : "Not provided — the buyer has not uploaded their own model yet.",
  );

  sections.push(
    "## Market plausibility check",
    input.market
      ? [
          ...input.market.checks.map(
            (c) =>
              `- ${c.assumption}${cite(c.page)}: OM says ${c.omSays}, typical ${c.typicalRange} (${c.assessment}) — ${c.note}`,
          ),
          `Summary: ${input.market.summary}`,
        ].join("\n")
      : "Not available.",
  );

  return sections.join("\n\n");
}

/**
 * The one-screen call. Synthesizes every prior step (it reads the gathered
 * analysis, not the PDF) into a pass / caution / pass_on with the reason, top
 * risks, and next steps. Reasoning model. Re-run whenever a new step lands
 * (e.g. after the buyer reconciles their model) so the verdict stays current.
 */
export async function synthesizeVerdict(
  input: VerdictInputs,
): Promise<VerdictResult> {
  const client = getAnthropic();

  const response = await client.messages.parse({
    model: MODELS.reasoning,
    max_tokens: MAX_TOKENS.verdict,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: verdictInstruction() },
          {
            type: "text",
            text: `Here is the gathered analysis to synthesize:\n\n${buildBrief(
              input,
            )}`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(VerdictSchema) },
  });

  const out = response.parsed_output;
  if (!out) {
    throw new Error("Verdict did not return structured output.");
  }
  return out;
}
