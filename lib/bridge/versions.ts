import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUnderwrite, type UnderwriteResult } from "@/lib/underwrite/engine";
import { buildBridge, type Bridge } from "./attribution";
import { changedPaths } from "./fields";
import type { Assumptions } from "./model";

/**
 * Persistence for the Assumption Bridge: immutable version snapshots plus a
 * cache of the bridge between any two of them.
 *
 * A snapshot is taken automatically whenever a deal's derived assumptions
 * actually MOVE (re-screen, a supplement that changes NOI, an address/price
 * correction), and manually when the user saves a scenario off the sensitivity
 * playground. Identical assumptions are never snapshotted twice — a version
 * list full of duplicates is a version list nobody reads.
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

/** `v1`, `v2`, … skipping labels already taken (including manual ones). */
export function nextAutoLabel(existing: readonly { version_label: string }[]): string {
  const taken = new Set(existing.map((v) => v.version_label));
  for (let i = 1; i < 1000; i++) {
    const label = `v${i}`;
    if (!taken.has(label)) return label;
  }
  return `v${Date.now()}`;
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
  | { status: "failed"; error: string };

/**
 * Snapshot an assumption set. Returns `duplicate` (without writing) when the
 * most recent version already carries the same assumptions — that's the common
 * case on every page render, and it must be cheap and silent.
 */
export async function snapshotVersion(
  supabase: SupabaseClient,
  opts: SnapshotOptions,
): Promise<SnapshotOutcome> {
  const existing = await listDealVersions(supabase, opts.dealId);
  const latest = existing[0];
  const manual = opts.automatic === false;

  // An automatic snapshot is suppressed when nothing moved. A MANUAL save is
  // always honoured — the user labelling the current state is the point, even
  // if the numbers match.
  if (!manual && latest && changedPaths(latest.assumptions, opts.assumptions).length === 0) {
    return { status: "duplicate", version: latest };
  }

  const label = opts.label?.trim() || nextAutoLabel(existing);
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

  if (error || !data) {
    return { status: "failed", error: error?.message ?? "Could not save the version." };
  }
  return { status: "created", version: data as unknown as DealVersion };
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
