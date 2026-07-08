/**
 * The dedicated analysis worker (Phase 2 of the build roadmap).
 *
 * Why this exists: a 150–200 page OM plus several Claude calls takes minutes —
 * running that inside the web service meant every deploy interrupted whatever
 * screens were in flight. With ANALYSIS_WORKER=1 on the web service, the web
 * app only ENQUEUES a job row; this process (a separate Render worker service
 * built from the same repo) claims it and does the slow work:
 *
 *   poll `analysis_jobs` for the oldest queued job
 *     → claim it atomically (status → running, attempts + 1)
 *     → run the pipeline: signal → extract → challenge → comps → market → verdict
 *       (or a reconcile, when the payload says so)
 *     → the pipeline updates progress + writes results as each step lands
 *
 * Interruption story — the whole point of this service:
 *   - On SIGTERM (a deploy), the current job is put straight back to "queued"
 *     and the process exits. The replacement worker claims it and RESUMES from
 *     the last completed step (the pipeline checkpoints each step onto the job
 *     payload), so a deploy costs seconds, not a restarted screen.
 *   - A job interrupted WORKER_MAX_ATTEMPTS times stops retrying and fails
 *     with an honest message instead of looping forever.
 *   - While the worker lives, it heartbeats the running row AND every queued
 *     row, so a backlogged job never reads as "stalled" to the deal page; if
 *     the worker actually dies, the rows go stale and the existing stall
 *     recovery (10 min) takes over exactly as before.
 *
 * Requires migration 0016 (payload + attempts on analysis_jobs). Without it,
 * the worker idles with a loud log line instead of processing — and without
 * ANALYSIS_WORKER=1 on the web service, nothing enqueues for it at all.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runAnalysis, runReconciliation } from "@/lib/anthropic/pipeline";
import { downloadDealFile, removeSupplementFile } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

// Tunables — env-overridable so the test rig can run the real binary fast.
const POLL_MS = int(process.env.WORKER_POLL_MS, 5_000);
const HEARTBEAT_MS = int(process.env.WORKER_HEARTBEAT_MS, 45_000);
const MAX_ATTEMPTS = int(process.env.WORKER_MAX_ATTEMPTS, 3);
// A single screen is normally 2–6 minutes; past this the run is presumed
// wedged (a hung upstream call). The job is re-queued and the process exits
// nonzero so the platform restarts it clean — that also kills the wedged
// promise, which a same-process retry could not.
const JOB_TIMEOUT_MS = int(process.env.WORKER_JOB_TIMEOUT_MS, 30 * 60_000);
// How often to re-probe for migration 0016 when it's missing.
const PROBE_MS = int(process.env.WORKER_PROBE_MS, 60_000);

const INTERRUPTED_MSG =
  "The screen was interrupted repeatedly (worker restarts) and stopped retrying — hit “Try again” to run it fresh.";

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function log(msg: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${msg}`);
}

interface ClaimedJob {
  id: string;
  dealId: string;
  attempts: number; // AFTER the claim's increment
  payload: {
    kind?: string;
    snapshotPrior?: boolean;
    model?: { name: string; path: string };
  };
}

let admin: SupabaseClient;
let shuttingDown = false;
let current: ClaimedJob | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True once analysis_jobs has the 0016 columns this worker depends on. */
async function schemaReady(): Promise<boolean> {
  const { error } = await admin
    .from("analysis_jobs")
    .select("payload, attempts")
    .limit(1);
  return !error;
}

/** Touch the rows this worker is responsible for so nothing it will get to
 *  reads as stale: the job it's running, and every job waiting behind it. */
async function heartbeat(): Promise<void> {
  const now = new Date().toISOString();
  try {
    if (current) {
      await admin
        .from("analysis_jobs")
        .update({ updated_at: now })
        .eq("id", current.id)
        .eq("status", "running");
    }
    await admin
      .from("analysis_jobs")
      .update({ updated_at: now })
      .eq("status", "queued");
  } catch {
    // A missed heartbeat is survivable; the next tick tries again.
  }
}

/**
 * Claim the oldest queued job: a conditional UPDATE (status AND attempts must
 * still be what we read), so two workers can never both win the same row.
 * Also enforces the attempts cap here, where the retry count is in hand.
 */
async function claimNext(): Promise<ClaimedJob | null> {
  const { data: next } = await admin
    .from("analysis_jobs")
    .select("id, deal_id, payload, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return null;

  const attempts = (next.attempts as number) ?? 0;
  const payload = (next.payload as ClaimedJob["payload"]) ?? {};

  if (attempts >= MAX_ATTEMPTS) {
    const { data: killed } = await admin
      .from("analysis_jobs")
      .update({
        status: "error",
        error: INTERRUPTED_MSG,
        updated_at: new Date().toISOString(),
      })
      .eq("id", next.id)
      .eq("status", "queued")
      .eq("attempts", attempts)
      .select("id");
    if (killed && killed.length > 0) {
      log(`job ${next.id} exceeded ${MAX_ATTEMPTS} attempts — marked error`);
      if (payload.model?.path) await removeSupplementFile(payload.model.path);
    }
    return null;
  }

  const { data: claimed } = await admin
    .from("analysis_jobs")
    .update({
      status: "running",
      attempts: attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id)
    .eq("status", "queued")
    .eq("attempts", attempts)
    .select("id");
  if (!claimed || claimed.length === 0) return null; // raced — re-poll

  return {
    id: next.id as string,
    dealId: next.deal_id as string,
    attempts: attempts + 1,
    payload,
  };
}

/** Put the in-flight job back in line (deploy/shutdown/timeout). The payload
 *  keeps its per-step checkpoints, so the next attempt resumes, not restarts. */
async function requeueCurrent(reason: string): Promise<void> {
  if (!current) return;
  try {
    await admin
      .from("analysis_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .eq("status", "running");
    log(`job ${current.id} re-queued (${reason})`);
  } catch {
    // If this write is lost the row goes stale and the existing stall
    // recovery reclaims it — slower, but nothing is stranded.
  }
}

/** Run one claimed job to a terminal state. The pipeline functions handle
 *  their own failures (they patch the job row to "error"), so a throw here
 *  is unexpected — it's caught by the caller and logged. */
async function runJob(job: ClaimedJob): Promise<void> {
  if (job.payload.kind === "reconcile") {
    const model = job.payload.model;
    if (!model?.path || !model.name) {
      await admin
        .from("analysis_jobs")
        .update({
          status: "error",
          error: "This reconcile job lost its model file — upload it again.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return;
    }
    let buffer: Buffer;
    try {
      buffer = await downloadDealFile(model.path);
    } catch {
      // The parked file couldn't be read — a terminal, honest failure (the
      // user re-uploads; retrying without the bytes can't succeed).
      await admin
        .from("analysis_jobs")
        .update({
          status: "error",
          error:
            "Your model file couldn't be read back for the run — please upload it again.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      await removeSupplementFile(model.path);
      return;
    }
    try {
      // Handles its own failures (patches the job row to "error").
      await runReconciliation(job.dealId, { name: model.name, buffer });
    } finally {
      // Terminal either way (done or error) — the parked model is deleted.
      // A SIGTERM re-queue exits the process before reaching this, which is
      // exactly right: the retry still needs the file.
      await removeSupplementFile(model.path);
    }
    return;
  }

  // Default: the full screen. resume=true reads the payload's per-step
  // checkpoints (empty on a first attempt → full run).
  await runAnalysis(job.dealId, {
    snapshotPrior: job.payload.snapshotPrior !== false,
    resume: true,
  });
}

async function main(): Promise<void> {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `[worker] missing required env: ${missing.join(", ")} — set them on this service (see worker/README.md) and redeploy.`,
    );
    process.exit(1);
  }

  admin = createSupabaseAdminClient();

  log(
    `starting — poll ${POLL_MS}ms, heartbeat ${HEARTBEAT_MS}ms, max ${MAX_ATTEMPTS} attempts, job timeout ${Math.round(JOB_TIMEOUT_MS / 60000)}min`,
  );
  if (process.env.RESEND_API_KEY && !process.env.NEXT_PUBLIC_APP_URL) {
    log(
      "note: RESEND_API_KEY is set but NEXT_PUBLIC_APP_URL isn't — email links will use the default host",
    );
  }

  // Don't process until migration 0016 is in place — a claim without the
  // payload/attempts columns would fail anyway. Loud, not fatal: the moment
  // the migration runs, this picks up without a redeploy.
  while (!(await schemaReady())) {
    if (shuttingDown) return;
    log(
      "analysis_jobs is missing the payload/attempts columns — run supabase/migrations/0016_worker_jobs.sql, idling until it appears",
    );
    await sleep(PROBE_MS);
  }
  log("schema OK — processing jobs");

  const ticker = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  ticker.unref?.();

  while (!shuttingDown) {
    let job: ClaimedJob | null = null;
    try {
      job = await claimNext();
    } catch (err) {
      log(`claim failed (${err instanceof Error ? err.message : err}) — backing off`);
      await sleep(POLL_MS);
      continue;
    }
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }

    current = job;
    log(
      `claimed job ${job.id} (deal ${job.dealId}, ${job.payload.kind ?? "screen"}, attempt ${job.attempts}/${MAX_ATTEMPTS})`,
    );
    const started = Date.now();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), JOB_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([
        runJob(job).then(() => "done" as const),
        timedOut,
      ]);
      if (outcome === "timeout") {
        // The run is wedged. Re-queue and exit nonzero: the platform restart
        // kills the wedged promise too — a same-process retry couldn't.
        await requeueCurrent("timed out");
        log(`job ${job.id} exceeded ${JOB_TIMEOUT_MS}ms — exiting for a clean restart`);
        process.exit(1);
      }
      log(`job ${job.id} finished in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      // runJob handles its own failures; reaching here is unexpected. Mark
      // the job errored so the deal never wedges on "running".
      log(`job ${job.id} threw unexpectedly: ${err instanceof Error ? err.message : err}`);
      try {
        await admin
          .from("analysis_jobs")
          .update({
            status: "error",
            error: "The analysis hit an unexpected worker error — please try again.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "running");
      } catch {
        // stall recovery will reclaim it
      }
    } finally {
      clearTimeout(timer);
      current = null;
    }
  }
}

/** Deploy-time shutdown: put the in-flight job back in line and go. Render
 *  sends SIGTERM and the replacement instance resumes from the checkpoints —
 *  this is what makes deploys invisible to running screens. */
function shutdown(signal: string): void {
  shuttingDown = true;
  log(`${signal} received — ${current ? `re-queueing job ${current.id}` : "idle"}, exiting`);
  void (async () => {
    await requeueCurrent(signal);
    process.exit(0);
  })();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  log(`uncaught exception: ${err instanceof Error ? (err.stack ?? err.message) : err}`);
  void (async () => {
    await requeueCurrent("uncaught exception");
    process.exit(1);
  })();
});
process.on("unhandledRejection", (err) => {
  log(`unhandled rejection: ${err instanceof Error ? (err.stack ?? err.message) : err}`);
  void (async () => {
    await requeueCurrent("unhandled rejection");
    process.exit(1);
  })();
});

void main();
