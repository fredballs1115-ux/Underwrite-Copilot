/**
 * The screens this web process is running itself (ANALYSIS_WORKER unset:
 * `after()` runs the pipeline in the request's process), and what happens to
 * them when the process is told to stop.
 *
 * A deploy or a restart sends SIGTERM. The runs inside `after()` die with the
 * process, and their job rows say "running" until `STALE_MS` (ten minutes)
 * passes and the page reads them as stalled — ten minutes of a spinning rail
 * over a screen nobody is running (the first-run audit of 2026-10-20). So on
 * the signal the rows of the runs this process holds are marked failed at
 * once, with a sentence that says what happened, and a run still going stops
 * writing "running" over that at its next step boundary
 * (`interruptedRunMessage`, read by the pipeline's job writer).
 *
 * The retry is honest about what it does: an in-process run keeps no
 * checkpoints (only the worker's do, lib/jobs `keepCheckpoints`), so "Try
 * again" runs the screen from the start and the sentence never promises it
 * resumes.
 *
 * The state lives on `globalThis` under a registered symbol, never in
 * module variables: `instrumentation.ts` registers the handler from its own
 * module runtime, apart from the routes' (CLAUDE.md, the News layer's note),
 * and a module-level Set would be two Sets in one process.
 *
 * Worker mode does nothing here: the worker process has its own signal
 * handling (it re-queues its run), and the web process runs no screens.
 */

export type InProcessRunKind = "screen" | "reconcile";

/** What the deal page says for a run the restart cut off. */
export const RESTART_MESSAGES: Record<InProcessRunKind, string> = {
  screen: "The site restarted while this screen ran — start it again.",
  reconcile: "The site restarted while this reconciliation ran — start it again.",
};

/** How long the signal handler waits on the database before letting the
 *  process go: a stop has a grace period of its own, and this is a courtesy. */
export const RESTART_MARK_TIMEOUT_MS = 5_000;

interface RunsState {
  /** deal id → the kind of run this process is holding for it */
  running: Map<string, InProcessRunKind>;
  /** deal id → the sentence its row was marked with on the signal */
  interrupted: Map<string, string>;
  registered: boolean;
  marking: Promise<string[]> | null;
}

const STATE_KEY = Symbol.for("underwrite-copilot.in-process-runs");

function runsState(): RunsState {
  const g = globalThis as unknown as Record<symbol, RunsState | undefined>;
  let s = g[STATE_KEY];
  if (!s) {
    s = { running: new Map(), interrupted: new Map(), registered: false, marking: null };
    g[STATE_KEY] = s;
  }
  return s;
}

/** Record a run this process is holding; the returned function forgets it
 *  (idempotent, for a `finally`). */
export function trackInProcessRun(dealId: string, kind: InProcessRunKind): () => void {
  const s = runsState();
  s.running.set(dealId, kind);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (s.running.get(dealId) === kind) s.running.delete(dealId);
  };
}

/** The deals this process is running a screen or a reconciliation for. */
export function inProcessRuns(): ReadonlyMap<string, InProcessRunKind> {
  return runsState().running;
}

/** The sentence a run's row was marked with when the process was told to
 *  stop, or null while it was not: the pipeline's job writer then refuses to
 *  write "running" over it. */
export function interruptedRunMessage(dealId: string): string | null {
  return runsState().interrupted.get(dealId) ?? null;
}

/** Writes the failure onto each deal's live job row. */
export type MarkRows = (rows: { dealId: string; message: string }[]) => Promise<void>;

/**
 * Mark every run this process holds as failed with its restart sentence.
 * Bounded by `timeoutMs`, never throws, and runs once however many signals
 * arrive. Answers the deal ids it marked (or tried to).
 */
export function markInterruptedRuns(mark: MarkRows, timeoutMs = RESTART_MARK_TIMEOUT_MS): Promise<string[]> {
  const s = runsState();
  if (s.marking) return s.marking;
  const rows = [...s.running].map(([dealId, kind]) => ({ dealId, message: RESTART_MESSAGES[kind] }));
  for (const r of rows) s.interrupted.set(r.dealId, r.message);
  if (rows.length === 0) {
    s.marking = Promise.resolve([]);
    return s.marking;
  }
  s.marking = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve()
          .then(() => mark(rows))
          .catch((err) => {
            console.error(
              `[in-process-runs] could not mark ${rows.length} interrupted run(s): ${err instanceof Error ? err.message : String(err)}`,
            );
          }),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            console.error(`[in-process-runs] marking interrupted runs timed out after ${timeoutMs} ms`);
            resolve();
          }, timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return rows.map((r) => r.dealId);
  })();
  return s.marking;
}

/** The database write: each deal's live job row, failed with its sentence.
 *  Only a row still queued or running is touched, so a run that finished a
 *  moment before the signal keeps its "done". */
export const markRowsInDatabase: MarkRows = async (rows) => {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const at = new Date().toISOString();
  await Promise.all(
    rows.map(async ({ dealId, message }) => {
      const { error } = await admin
        .from("analysis_jobs")
        .update({ status: "error", error: message, updated_at: at })
        .eq("deal_id", dealId)
        .in("status", ["queued", "running"]);
      if (error) console.error(`[in-process-runs] mark failed for deal ${dealId}: ${error.message}`);
    }),
  );
};

/** The part of `process` the handler needs, so a test can hand in its own. */
export interface SignalSource {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

/**
 * Register the stop handler, once a process. Does nothing in worker mode.
 * The listener only starts the marking: Next's own handler closes the server
 * and exits, and this one never holds that up past its bound.
 */
export function registerRestartHandler(opts?: {
  proc?: SignalSource;
  workerMode?: boolean;
  mark?: MarkRows;
  timeoutMs?: number;
}): boolean {
  const workerMode = opts?.workerMode ?? process.env.ANALYSIS_WORKER === "1";
  if (workerMode) return false;
  const s = runsState();
  if (s.registered) return false;
  s.registered = true;
  const proc = opts?.proc ?? process;
  const listener = () => {
    try {
      void markInterruptedRuns(opts?.mark ?? markRowsInDatabase, opts?.timeoutMs);
    } catch {
      // a signal handler never throws
    }
  };
  proc.on("SIGTERM", listener);
  proc.on("SIGINT", listener);
  return true;
}

/** Test seam: forget every run, mark and registration. */
export function resetInProcessRunsForTest(): void {
  const s = runsState();
  s.running.clear();
  s.interrupted.clear();
  s.registered = false;
  s.marking = null;
}
