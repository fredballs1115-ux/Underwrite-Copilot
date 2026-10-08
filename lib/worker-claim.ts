/**
 * The analysis worker's reads and writes of its queue (worker/index.ts),
 * with the decisions left to lib/worker-queue: which deal's turn it is, that
 * a deal still running is skipped, that a deal holds one queued run, and that
 * an account's queued deals past its share wait behind everyone else's.
 *
 * Every function runs with the service role the worker holds and throws on
 * a failed read, so a poll that could not see the queue claims nothing (the
 * worker backs off and asks again) rather than claiming on half a picture.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  QUEUE_PAGE_ROWS,
  QUEUE_SCAN_PAGES,
  SUPERSEDED,
  readQueue,
  type ClaimLog,
  type QueuePick,
  type QueuedRow,
  type RunningRow,
} from "@/lib/worker-queue";

/** Deal ids one request names: a list of ids in a URL, kept short. */
const ID_CHUNK = 100;

/** Deals with a second queued row put back to one a poll, at most — the
 *  rest are reached on the polls after. */
export const MAX_COLLAPSE_PER_POLL = 20;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface QueueHead {
  pick: QueuePick | null;
  /** deals met with more than one queued row */
  collapse: string[];
}

/**
 * Read the queue a page at a time, oldest first, until the deal whose turn
 * it is cannot change (lib/worker-queue `readQueue`'s `readMore`), with each
 * deal's creator and its running rows beside it; `log` is the worker's
 * memory of the runs it took (lib/worker-queue `noteClaim`).
 */
export async function readQueueHead(
  admin: SupabaseClient,
  log: ClaimLog = new Map(),
  now: number = Date.now(),
): Promise<QueueHead> {
  const rows = new Map<string, QueuedRow>();
  const running: RunningRow[] = [];
  const owners = new Map<string, string | null>();
  let head: QueueHead = { pick: null, collapse: [] };
  for (let page = 0; page < QUEUE_SCAN_PAGES; page++) {
    const from = page * QUEUE_PAGE_ROWS;
    const { data, error } = await admin
      .from("analysis_jobs")
      .select("id, deal_id, created_at")
      .eq("status", "queued")
      .not("payload", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + QUEUE_PAGE_ROWS - 1);
    if (error) throw new Error(`queue read failed: ${error.message}`);
    const got = (data ?? []) as { id: string; deal_id: string; created_at: string }[];

    const unseen = [...new Set(got.map((r) => r.deal_id))].filter((id) => !owners.has(id));
    for (const ids of chunks(unseen, ID_CHUNK)) {
      const [deals, runs] = await Promise.all([
        admin.from("deals").select("id, user_id").in("id", ids),
        admin.from("analysis_jobs").select("deal_id, updated_at").in("deal_id", ids).eq("status", "running"),
      ]);
      if (deals.error) throw new Error(`queue owners read failed: ${deals.error.message}`);
      if (runs.error) throw new Error(`queue running read failed: ${runs.error.message}`);
      for (const id of ids) owners.set(id, null);
      for (const d of (deals.data ?? []) as { id: string; user_id: string | null }[]) owners.set(d.id, d.user_id ?? null);
      for (const r of (runs.data ?? []) as { deal_id: string; updated_at: string | null }[]) {
        running.push({ dealId: r.deal_id, updatedAt: r.updated_at });
      }
    }
    for (const r of got) {
      rows.set(r.id, { id: r.id, dealId: r.deal_id, owner: owners.get(r.deal_id) ?? null, createdAt: r.created_at });
    }

    const read = readQueue([...rows.values()], running, now, log);
    head = { pick: read.pick, collapse: read.collapse };
    if (!read.readMore || got.length < QUEUE_PAGE_ROWS) break;
  }
  return head;
}

/** A queued worker row as the claim reads it. */
export interface QueuedJob {
  id: string;
  deal_id: string;
  payload: Record<string, unknown> | null;
  attempts: number | null;
}

/** The deal's newest queued worker row — the one its run is (rule 2). */
export async function newestQueued(admin: SupabaseClient, dealId: string): Promise<QueuedJob | null> {
  const { data, error } = await admin
    .from("analysis_jobs")
    .select("id, deal_id, payload, attempts")
    .eq("deal_id", dealId)
    .eq("status", "queued")
    .not("payload", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`queue row read failed: ${error.message}`);
  return (data as QueuedJob | null) ?? null;
}

/**
 * Claim one queued row: a conditional update (still queued, still at the
 * attempts we read), so two workers can never both win the same row.
 */
export async function claimQueuedRow(admin: SupabaseClient, row: QueuedJob): Promise<boolean> {
  const attempts = row.attempts ?? 0;
  const { data, error } = await admin
    .from("analysis_jobs")
    .update({ status: "running", attempts: attempts + 1, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "queued")
    .eq("attempts", attempts)
    .select("id");
  if (error) throw new Error(`claim failed for job ${row.id}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Close every queued worker row of the deal but `keepId` as superseded —
 * never run, and saying why in their own state. Answers how many it closed.
 * A queued row with no payload is an in-process run's, never the worker's
 * to touch.
 */
export async function supersedeOthers(admin: SupabaseClient, dealId: string, keepId: string): Promise<number> {
  const { data, error } = await admin
    .from("analysis_jobs")
    .update({ status: "error", error: SUPERSEDED, updated_at: new Date().toISOString() })
    .eq("deal_id", dealId)
    .eq("status", "queued")
    .not("payload", "is", null)
    .neq("id", keepId)
    .select("id");
  if (error) throw new Error(`superseding the queued rows of deal ${dealId} failed: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

/** Put a deal with more than one queued row back to one: its newest. */
export async function collapseDeal(admin: SupabaseClient, dealId: string): Promise<number> {
  const keep = await newestQueued(admin, dealId);
  return keep ? supersedeOthers(admin, dealId, keep.id) : 0;
}
