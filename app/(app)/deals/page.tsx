import type { Metadata } from "next";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
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
  exportfail:
    "Couldn’t build that export just now — please try again in a moment.",
  auth:
    "You were signed out, so the upload didn’t start. You’re back in now — everything you typed is still filled in below; just re-attach the PDF.",
  teamlimit:
    "Your team’s 3 trial deals and your personal free deals are used up. Start the Team plan for unlimited shared deals, or upgrade to Pro.",
};

// Fixed metric slots for the pipeline table — every row fills the SAME
// columns (or shows —), so one header labels them all and values align into
// scannable columns instead of repeating micro-labels in every row.
function pickSlots(metrics: ExtractedMetric[]): {
  cap: string | null;
  price: string | null;
} {
  const find = (inc: RegExp, exc?: RegExp) =>
    metrics.find((m) => inc.test(m.label) && !(exc && exc.test(m.label)))
      ?.value ?? null;
  return {
    cap:
      find(/going[- ]?in cap/i) ??
      find(/\bcap rate\b/i, /exit|terminal|reversion|pro ?forma/i),
    price: find(/purchase price|asking price|\bprice\b/i, /unit|\/sf|per sf|per unit|psf/i),
  };
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
  // Request-cached: shares the layout's auth call instead of a second hop.
  const user = await getCurrentUser();

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

  if (error) {
    // "Relation does not exist" means the migrations haven't run (a setup
    // state); anything else is a transient outage — don't tell a user in
    // production to go run SQL.
    const schemaMissing = /relation|does not exist|schema/i.test(error.message);
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        {schemaMissing ? (
          <>
            <p className="font-medium">Database isn’t set up yet</p>
            <p className="mt-1 text-muted">
              Run every file in <code>supabase/migrations/</code> (0001 through
              the latest) in your Supabase SQL editor, then refresh this page.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Couldn’t load your pipeline</p>
            <p className="mt-1 text-muted">
              We couldn’t reach your data just now. Please refresh in a moment —
              if it keeps happening, email underwritecopilot.support@gmail.com.
            </p>
          </>
        )}
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

  // The latest job per deal (Screening… / Failed labels) and the teammate
  // names for shared deals both depend only on the deal list, not on each
  // other — fetch them together instead of one after the other.
  const rows = (data ?? []) as Row[];
  const ids = rows.map((d) => d.id);
  const teammateIds = Array.from(
    new Set(
      rows
        .filter((d) => d.team_id && d.user_id !== user?.id)
        .map((d) => d.user_id),
    ),
  );
  const [{ data: jobsData }, { data: mates }, { data: dueRows }] = await Promise.all([
    ids.length
      ? supabase
          .from("analysis_jobs")
          .select("deal_id, status, created_at")
          .in("deal_id", ids)
          .order("created_at", { ascending: false })
          // Only the newest row per deal is read below — cap the fetch so a
          // long re-screen history can't grow this query without bound.
          .limit(Math.max(100, ids.length * 3))
      : Promise.resolve({ data: [] as { deal_id: string; status: string }[] }),
    teammateIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", teammateIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; full_name: string | null }[] }),
    // Call-for-offers deadlines are best-effort: the column arrived in
    // migration 0013, and the pipeline must keep working on a database that
    // hasn't run it yet (the query just errors and every deadline reads null).
    ids.length
      ? supabase.from("deals").select("id, offers_due").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; offers_due: string | null }[] }),
  ]);
  const jobByDeal = new Map<string, string>();
  for (const j of (jobsData ?? []) as { deal_id: string; status: string }[]) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j.status);
  }

  const dueById = new Map<string, string>();
  for (const r of (dueRows ?? []) as { id: string; offers_due: string | null }[]) {
    if (r.offers_due) dueById.set(r.id, r.offers_due);
  }
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
      // Deterministic mandate check, same engine as the deal page: any miss
      // → outside; else any near-miss → near; all-pass → fits. Unknown-only
      // results (nothing checkable yet) stay null and render as —.
      fit: (() => {
        const box = d.team_id ? teamBox : personalBox;
        if (!box || !extraction) return null;
        const checks = evaluateBuyBox(d.asset_class, extraction, box);
        if (checks.some((c) => c.status === "miss")) return "outside" as const;
        if (checks.some((c) => c.status === "near")) return "near" as const;
        if (checks.some((c) => c.status === "pass")) return "fits" as const;
        return null;
      })(),
      addedBy:
        d.team_id && d.user_id !== user?.id
          ? (nameById.get(d.user_id) ?? "Teammate")
          : null,
      market: extraction?.market ?? "",
      offersDue: dueById.get(d.id) ?? null,
      slots: extraction
        ? pickSlots(extraction.metrics)
        : { cap: null, price: null },
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
