// What the data-health page tells every reader about the steward: what it
// re-checks, and when it last did. The page had said "a nightly steward"
// to every customer while only the operator could see the heartbeat that
// says whether the cron is alive, so a dead cron left the claim standing
// with nothing beside it. The sentence now carries the last run's date
// and says "nightly" nowhere: a run more than `STEWARD_OVERDUE_HOURS` old
// says nothing has been re-checked since, and no run says so.
import { hoursSince } from "@/lib/research";

/** The operator heartbeat's own line: a run older than this reads overdue. */
export const STEWARD_OVERDUE_HOURS = 48;

export interface StewardRunTimes {
  started_at: string;
  finished_at: string | null;
}

const WHAT = "A steward re-checks source links, feed freshness and the oldest singly-sourced claims";
const LEDGER = "A figure it corrects lands here, never silently.";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whether the newest run is overdue, or there is none at all. */
export function stewardOverdue(latest: StewardRunTimes | null, now: Date = new Date()): boolean {
  return !latest || hoursSince(latest.finished_at ?? latest.started_at, now) > STEWARD_OVERDUE_HOURS;
}

/** The page's opening sentence, true of the runs on file. */
export function stewardLine(latest: StewardRunTimes | null, now: Date = new Date()): string {
  if (!latest) return `${WHAT} once it runs; no run is recorded yet. ${LEDGER}`;
  const when = day(latest.finished_at ?? latest.started_at);
  if (stewardOverdue(latest, now)) {
    return `${WHAT}, but its last run was ${when}, so nothing has been re-checked since. ${LEDGER}`;
  }
  return `${WHAT}; its last run was ${when}. ${LEDGER}`;
}
