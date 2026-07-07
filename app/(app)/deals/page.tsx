import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBilling } from "@/lib/billing";
import { type DealRow } from "@/lib/deals";
import type { ExtractionResult, ExtractedMetric } from "@/lib/anthropic/types";
import { Pipeline, type DealCard } from "./pipeline";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox } from "@/lib/criteria";

export const metadata: Metadata = { title: "Pipeline" };

const ERRORS: Record<string, string> = {
  name: "Please give the deal a name.",
  file: "Please choose a PDF offering memorandum to upload.",
  pdf: "That file isn’t a PDF — please upload the OM as a PDF.",
  size: "That PDF is larger than 22 MB — please try a smaller file for now.",
  save: "Couldn’t save the deal. Please try again.",
  upload: "The upload didn’t complete — nothing was saved. Please try again.",
  limit:
    "You’ve reached the 3-deal limit on the Free plan. Upgrade to Pro for unlimited deals.",
  teamlimit:
    "Your team's 3 trial deals and your personal free deals are used up. Start the Team plan for unlimited shared deals, or upgrade to Pro.",
};

// Up to two headline figures to show on each pipeline row.
function pickStats(metrics: ExtractedMetric[]): { label: string; value: string }[] {
  const priority = [/going[- ]?in cap/i, /\bprice\b/i, /\bnoi\b/i, /\birr\b/i];
  const chosen: ExtractedMetric[] = [];
  for (const re of priority) {
    const m = metrics.find((x) => re.test(x.label) && !chosen.includes(x));
    if (m) chosen.push(m);
    if (chosen.length >= 2) break;
  }
  return chosen.slice(0, 2).map((m) => ({ label: m.label, value: m.value }));
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    deleted?: string;
    joined?: string;
    new?: string;
  }>;
}) {
  const { error: errorCode, deleted, joined, new: newParam } = await searchParams;
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? null) : null;
  const notice = deleted
    ? "Deal deleted."
    : joined
      ? "Welcome to the team — this pipeline is now shared with your teammates."
      : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Billing state, the deal list, and the personal buy box are independent —
  // fetch them together.
  const [billing, { data, error }, personalBox] = await Promise.all([
    user ? getBilling(supabase, user.id) : Promise.resolve(null),
    supabase
      .from("deals")
      .select(
        "id, name, asset_class, created_at, verdict, extraction, user_id, team_id, stage, is_sample",
      )
      .order("created_at", { ascending: false }),
    user ? getBuyBoxForDeal(user.id, null).catch(() => null) : Promise.resolve(null),
  ]);
  const teamBox = billing?.team
    ? await getBuyBoxForDeal("", billing.team.id).catch(() => null)
    : null;

  // Latest job per deal so the list can show "Screening…" vs "Analysis failed"
  // instead of an inert label.
  const ids = ((data ?? []) as { id: string }[]).map((d) => d.id);
  const { data: jobsData } = ids.length
    ? await supabase
        .from("analysis_jobs")
        .select("deal_id, status, created_at")
        .in("deal_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] };
  const jobByDeal = new Map<string, string>();
  for (const j of (jobsData ?? []) as { deal_id: string; status: string }[]) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j.status);
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        <p className="font-medium">Database isn’t set up yet</p>
        <p className="mt-1 text-muted">
          Run every file in <code>supabase/migrations/</code> (0001 through
          0010) in your Supabase SQL editor, then refresh this page.
        </p>
        <p className="mt-2 text-xs text-muted">({error.message})</p>
      </div>
    );
  }

  type Row = Pick<
    DealRow,
    "id" | "name" | "asset_class" | "created_at" | "verdict" | "extraction"
  > & {
    user_id: string;
    team_id: string | null;
    stage: string | null;
    is_sample: boolean | null;
  };

  // Who added each team deal — teammate profiles are readable under RLS.
  const rows = (data ?? []) as Row[];
  const teammateIds = Array.from(
    new Set(
      rows
        .filter((d) => d.team_id && d.user_id !== user?.id)
        .map((d) => d.user_id),
    ),
  );
  const { data: mates } = teammateIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", teammateIds)
    : { data: [] };
  const nameById = new Map(
    ((mates ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (m) => [m.id, m.full_name || m.email || "Teammate"],
    ),
  );

  const deals: DealCard[] = rows.map((d) => {
    const extraction = d.extraction as ExtractionResult | null;
    const verdict = d.verdict as { verdict?: string } | null;
    const job = jobByDeal.get(d.id);
    return {
      id: d.id,
      name: d.name,
      assetClass: d.asset_class,
      createdAt: d.created_at,
      verdict: verdict?.verdict ?? null,
      stage: (d.stage as DealCard["stage"]) ?? "screening",
      outsideBuyBox: (() => {
        const box = d.team_id ? teamBox : personalBox;
        if (!box || !extraction) return false;
        return evaluateBuyBox(d.asset_class, extraction, box).some(
          (c) => c.status === "fail",
        );
      })(),
      addedBy:
        d.team_id && d.user_id !== user?.id
          ? (nameById.get(d.user_id) ?? "Teammate")
          : null,
      market: extraction?.market ?? "",
      stats: extraction ? pickStats(extraction.metrics) : [],
      jobStatus:
        job === "queued" || job === "running"
          ? ("running" as const)
          : job === "error"
            ? ("failed" as const)
            : null,
    };
  });

  // Getting-started state — all real, computed from the account's actual data.
  const onboarding = {
    hasBuyBox: !!(personalBox || teamBox),
    sampleId: rows.find((d) => d.is_sample)?.id ?? null,
    hasRealDeal: rows.some((d) => !d.is_sample),
  };

  return (
    <Pipeline
      deals={deals}
      errorMessage={errorMessage}
      notice={notice}
      openNew={newParam}
      onboarding={onboarding}
      billing={
        billing
          ? {
              isPro: billing.isPro,
              canCreateDeal: billing.canCreateDeal,
              dealCount: billing.dealCount,
              dealLimit: billing.dealLimit,
            }
          : null
      }
    />
  );
}
