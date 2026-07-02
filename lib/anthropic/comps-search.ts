import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";
import { MODELS } from "./models";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ExtractionResult } from "./types";

export interface PublicComp {
  name: string;
  location: string;
  detail: string;
  date: string;
  sourceName: string;
  sourceUrl: string;
  note: string;
}
export interface CompSearchResult {
  candidates: PublicComp[];
  summary: string;
  searchedAt: string;
}

function extractJson(text: string): { summary?: string; candidates?: PublicComp[] } | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/)?.[0] ?? null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Best-effort, PUBLIC-WEB comp finder used when the OM has no comps. Uses
 * Claude's web-search tool over publicly-reported sources only — explicitly NOT
 * CoStar or any paywalled/licensed database. Results are unverified candidates
 * the buyer must confirm.
 */
export async function findPublicComps(subject: {
  name: string;
  address: string;
  market: string;
  assetClass: string;
}): Promise<CompSearchResult> {
  const client = getAnthropic();

  const where = subject.market ? ` in ${subject.market}` : "";
  const asset = subject.assetClass && subject.assetClass !== "auto"
    ? `${subject.assetClass} `
    : "";
  const at = subject.address ? `, ${subject.address}` : "";
  const prompt = `Use web search to find PUBLICLY-REPORTED comparable sale transactions for this commercial real estate property.

Subject: ${subject.name}${at} — a ${asset}property${where}. Anchor the search on the property's actual address and submarket, not the deal's marketing name.

Rules:
- Search ONLY publicly available sources: news articles, press releases, public county records, brokerage marketing pages, and trade publications.
- Do NOT use, cite, or reproduce data from CoStar or any paywalled/licensed subscription database. If a figure is only available behind such a paywall, skip it.
- Find up to 6 recent, genuinely comparable sales (same asset class; same metro/submarket where possible).
- For each, capture what is publicly reported: property name, location, deal detail (price, price per unit or per SF, cap rate, date, size), and the public source (name + URL).
- These are UNVERIFIED public-web findings the buyer must confirm.

After searching, output ONLY a JSON object inside a \`\`\`json code block:
{"summary":"one sentence on what you found, with the unverified caveat","candidates":[{"name":"","location":"","detail":"","date":"","sourceName":"","sourceUrl":"","note":""}]}
If you find nothing credible, return an empty candidates array and say so in the summary.`;

  const response = await client.messages.create({
    model: MODELS.reasoning,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 6,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const parsed = extractJson(text);

  // A parse failure is NOT the same as "no comps exist" — say so, so the user
  // knows a retry may succeed.
  if (!parsed) {
    return {
      candidates: [],
      summary:
        "The search ran but its results couldn't be read — try searching again.",
      searchedAt: new Date().toISOString(),
    };
  }

  return {
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    summary:
      parsed.summary ??
      "No publicly-reported comps could be confirmed. Add comps manually or upload a comp sheet.",
    searchedAt: new Date().toISOString(),
  };
}

async function patchJob(
  dealId: string,
  patch: { status?: string; step?: string | null; progress?: number; error?: string | null },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("analysis_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("deal_id", dealId);
}

/** Background runner: look up the subject from the deal, search, store results. */
export async function runCompSearch(dealId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: deal } = await admin
      .from("deals")
      .select("name, asset_class, extraction")
      .eq("id", dealId)
      .single();
    if (!deal) throw new Error("Deal not found.");

    await patchJob(dealId, {
      status: "running",
      step: "comps_search",
      progress: 30,
      error: null,
    });

    const extraction = deal.extraction as ExtractionResult | null;
    const result = await findPublicComps({
      name: (deal.name as string) ?? "the subject property",
      address: extraction?.address ?? "",
      market: extraction?.market ?? "",
      assetClass: (deal.asset_class as string) ?? "",
    });

    await admin
      .from("deals")
      .update({ comp_search: result, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    await patchJob(dealId, {
      status: "done",
      step: "comps_search",
      progress: 100,
      error: null,
    });
  } catch (err) {
    await patchJob(dealId, {
      status: "error",
      error:
        err instanceof Error ? err.message : "Public-web comp search failed.",
    });
  }
}
