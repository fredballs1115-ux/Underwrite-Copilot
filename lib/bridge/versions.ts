import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUnderwrite, type UnderwriteResult } from "@/lib/underwrite/engine";
import { buildBridge, type Bridge } from "./attribution";
import type { Assumptions } from "./model";
import { needsSnapshot, nextAutoLabel, saveFailure, type SaveFailure } from "./version-rules";

/**
 * Persistence for the Assumption Bridge: immutable version snapshots plus a
 * cache of the bridge between any two of them.
 *
 * A snapshot is taken automatically whenever a deal's derived assumptions
 * actually MOVE from its latest base snapshot (re-screen, a supplement that
 * changes NOI, an address/price correction, the rate index moving), and
 * manually when the user saves a scenario. A scenario is never a base, so
 * saving one takes no automatic copy of the base after it — a version list
 * full of duplicates is a version list nobody reads. The rules are pure and
 * tested in ./version-rules.
 */

export interface DealVersion {
  id: string;
  deal_id: string;
  user_id: string;
  version_label: string;
  note: string | null;
  assumptions: Assumptions;
  results: StoredResults;
  automatic: boolean;
  created_at: string;
}

/** The slice of UnderwriteResult worth storing — the returns and the cash-flow
 *  ladder. The full result is re-derivable from `assumptions` at any time, so
 *  this is a convenience for list rendering, not the source of truth. */
export interface StoredResults {
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  leveredEquityMultiple: number | null;
  goingInCapPct: number;
  year1Noi: number;
  equity: number;
  leveredVector: number[];
  unleveredVector: number[];
}

export function resultsFrom(r: UnderwriteResult): StoredResults {
  return {
    leveredIrrPct: r.returns.leveredIrrPct,
    unleveredIrrPct: r.returns.unleveredIrrPct,
    leveredEquityMultiple: r.returns.leveredEquityMultiple,
    goingInCapPct: r.returns.goingInCapPct,
    year1Noi: r.cashFlow[0]?.noi ?? 0,
    equity: r.sourcesUses.equity,
    leveredVector: r.leveredVector,
    unleveredVector: r.unleveredVector,
  };
}

const VERSION_COLS =
  "id, deal_id, user_id, version_label, note, assumptions, results, automatic, created_at";

/** Newest first. */
export async function listDealVersions(
  supabase: SupabaseClient,
  dealId: string,
): Promise<DealVersion[]> {
  const { data } = await supabase
    .from("deal_versions")
    .select(VERSION_COLS)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as unknown as DealVersion[];
}

export interface SnapshotOptions {
  dealId: string;
  userId: string;
  assumptions: Assumptions;
  /** omit for an automatic `vN` label */
  label?: string;
  note?: string | null;
  automatic?: boolean;
}

export type SnapshotOutcome =
  | { status: "created"; version: DealVersion }
  | { status: "duplicate"; version: DealVersion }
  /** `reason` is what the write was refused for (./version-rules'
   *  `saveFailure`); `error` the database's own words, for the log only */
  | { status: "failed"; reason: SaveFailure; error: string };

/**
 * Snapshot an assumption set.
 *
 * An AUTOMATIC snapshot returns `duplicate` (without writing) when the latest
 * base snapshot already carries the same assumptions — the common case on
 * every page render, and it must be cheap and silent. A MANUAL save is always
 * honoured — the user labelling the current state is the point, even if the
 * numbers match.
 *
 * An automatic label that a concurrent snapshot took first (the unique
 * index) is not a failure: the labels and the base are read again, and the
 * snapshot is either taken under the next label or found to be one already.
 */
export async function snapshotVersion(
  supabase: SupabaseClient,
  opts: SnapshotOptions,
): Promise<SnapshotOutcome> {
  const manual = opts.automatic === false;
  const asked = opts.label?.trim() || null;
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const [labelsRes, baseRes] = await Promise.all([
      // Every label the deal uses — newest first, so a server row cap still
      // holds the highest vN — never the sixty the page lists.
      supabase
        .from("deal_versions")
        .select("version_label")
        .eq("deal_id", opts.dealId)
        .order("created_at", { ascending: false })
        .limit(10_000),
      supabase
        .from("deal_versions")
        .select(VERSION_COLS)
        .eq("deal_id", opts.dealId)
        .eq("automatic", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (labelsRes.error || baseRes.error) {
      const error = labelsRes.error ?? baseRes.error;
      return { status: "failed", reason: saveFailure(error), error: error?.message ?? "Could not read the versions." };
    }
    const base = (baseRes.data as unknown as DealVersion | null) ?? null;
    if (!manual && base && !needsSnapshot(opts.assumptions, [base])) {
      return { status: "duplicate", version: base };
    }

    const labels = ((labelsRes.data ?? []) as { version_label: string }[]).map((r) => r.version_label);
    const label = asked ?? nextAutoLabel(labels);
    const results = resultsFrom(computeUnderwrite(opts.assumptions));

    const { data, error } = await supabase
      .from("deal_versions")
      .insert({
        deal_id: opts.dealId,
        user_id: opts.userId,
        version_label: label,
        note: opts.note?.trim() || null,
        assumptions: opts.assumptions,
        results,
        automatic: !manual,
      })
      .select(VERSION_COLS)
      .maybeSingle();

    if (!error && data) return { status: "created", version: data as unknown as DealVersion };
    lastError = error?.message ?? "Could not save the version.";
    // A label the user typed that is taken is theirs to change; one this
    // module picked is read again and picked again.
    if (error && saveFailure(error) === "label_taken" && !asked) continue;
    return { status: "failed", reason: saveFailure(error), error: lastError };
  }
  return { status: "failed", reason: "failed", error: lastError };
}

/**
 * The bridge between two versions, from cache when it's there.
 *
 * The bridge is a pure function of the two assumption blobs, and versions are
 * immutable, so a cached bridge can never go stale — reopening a deal is a
 * single indexed read instead of up to 2^6 model runs.
 */
export async function getOrBuildBridge(
  supabase: SupabaseClient,
  dealId: string,
  from: DealVersion,
  to: DealVersion,
): Promise<Bridge> {
  const { data } = await supabase
    .from("deal_version_bridges")
    .select("bridge")
    .eq("from_version_id", from.id)
    .eq("to_version_id", to.id)
    .maybeSingle();
  if (data?.bridge) return data.bridge as Bridge;

  const bridge = buildBridge(from.assumptions, to.assumptions);
  // Best-effort: a failed cache write must never fail the page.
  await supabase
    .from("deal_version_bridges")
    .upsert(
      { from_version_id: from.id, to_version_id: to.id, deal_id: dealId, bridge },
      { onConflict: "from_version_id,to_version_id" },
    );
  return bridge;
}
