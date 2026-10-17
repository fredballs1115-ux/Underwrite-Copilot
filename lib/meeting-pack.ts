// The Monday meeting's three questions (research pass 24, B1): what moved
// since last Monday, how long has each deal sat where it is, and who owns the
// next step. Pure: the deals' stage history, their calls and their open
// tasks come in, and the meeting workbook (lib/pipeline-workbook) and the
// Monday digest (lib/digest) draw what this returns.
//
// Its rules:
//   - a deal entered its stage at the stage history's last entry, where that
//     entry IS its stage; a deal with no history entered Screening when it
//     was added (every deal is filed there, migration 0013); a history whose
//     last entry is another stage (a row written before the history was
//     kept) says nothing — never a day count guessed from the wrong move;
//   - days are whole days between two UTC days, the digest's own day;
//   - the next step is the deal's soonest open task (lib/deal-tasks
//     `sortDealTasks`): its title as typed, its owner by name or "unassigned",
//     its day or "no date" — never a step the deal does not have;
//   - the week is the seven days before the moment the pack is built, the
//     digest's "since last week": the deals added, each stage move with the
//     stage it left where the history says it, the calls landed and the
//     deals killed (a move to Dead).
import { STAGE_LABEL, normalizeStage, type Stage, type StageChange } from "@/lib/stages";
import { formatDueDate, isTaskOverdue, sortDealTasks, type DealTask } from "@/lib/deal-tasks";

const DAY_MS = 86_400_000;

/** How far back "this week" reaches: the digest's "since last week". */
export const WEEK_DAYS = 7;

/** The UTC day an ISO timestamp falls on, or null. */
function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** Whole days from one ISO day to another (negative where `to` is earlier). */
function daysFromTo(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export interface StageAge {
  /** whole days since the deal entered its current stage */
  days: number;
  /** how the day is known: a stage move the history records, or the day the
   *  deal was added (no move yet — it has sat in Screening since) */
  from: "moved" | "added";
}

/**
 * How long a deal has sat in its stage on `todayIso`. Null where the history
 * cannot say: its last entry is another stage, or nothing is dated.
 */
export function stageAge(
  stage: string | null | undefined,
  history: readonly StageChange[],
  createdAt: string | null | undefined,
  todayIso: string,
): StageAge | null {
  const current = normalizeStage(stage ?? null);
  const last = history.length ? history[history.length - 1] : null;
  let entered: string | null;
  let from: StageAge["from"];
  if (last) {
    if (last.stage !== current) return null;
    entered = dayOf(last.at);
    from = "moved";
  } else {
    if (current !== "screening") return null;
    entered = dayOf(createdAt);
    from = "added";
  }
  if (!entered) return null;
  const days = daysFromTo(entered, todayIso);
  return days >= 0 ? { days, from } : null;
}

/** "12 days", "1 day", "today". */
export function stageAgeText(age: StageAge): string {
  if (age.days === 0) return "today";
  return `${age.days} day${age.days === 1 ? "" : "s"}`;
}

export interface NextStep {
  title: string;
  /** the owner's name, or null where the task is unassigned */
  owner: string | null;
  /** yyyy-mm-dd, or null */
  due: string | null;
  overdue: boolean;
}

/** One open task as the pack reads it. */
export type PackTask = Pick<DealTask, "title" | "assigneeUserId" | "dueDate" | "done" | "completedAt" | "createdAt">;

/**
 * The deal's next step: its soonest open task (undated ones after the dated,
 * then the oldest), with its owner named through `ownerName`. Null where the
 * deal has no open task.
 */
export function nextStepOf(
  tasks: readonly PackTask[],
  todayIso: string,
  ownerName: (userId: string) => string | null,
): NextStep | null {
  const open = tasks.filter((t) => !t.done);
  if (!open.length) return null;
  // sortDealTasks' own order, on the fields it reads.
  const first = sortDealTasks(
    open.map((t, i) => ({
      ...t,
      id: String(i),
      source: "manual" as const,
      createdBy: null,
    })),
  )[0];
  return {
    title: first.title,
    owner: first.assigneeUserId ? ownerName(first.assigneeUserId) : null,
    due: first.dueDate,
    overdue: isTaskOverdue(first, todayIso),
  };
}

/** "Order the PCA — Jane Doe, due Oct 20 (overdue)"; an unassigned step says
 *  "unassigned", an undated one "no date". */
export function nextStepText(step: NextStep, todayIso: string): string {
  const due = step.due ? `due ${formatDueDate(step.due, todayIso)}${step.overdue ? " (overdue)" : ""}` : "no date";
  return `${step.title} — ${step.owner ?? "unassigned"}, ${due}`;
}

/** One deal as the week's read takes it. */
export interface WeekDeal {
  id: string;
  name: string;
  stage: string | null;
  createdAt: string;
  history: readonly StageChange[];
  /** the call on file and the moment it was written */
  verdict: { verdict?: string; generatedAt?: string } | null;
}

export interface StageMove {
  dealId: string;
  name: string;
  /** the stage it left, where the history says it; null for its first move */
  from: Stage | null;
  to: Stage;
  at: string;
}

export interface WeekActivity {
  /** the window's first and last UTC days */
  since: string;
  through: string;
  added: { dealId: string; name: string; at: string }[];
  moved: StageMove[];
  calls: { dealId: string; name: string; verdict: string; at: string }[];
  /** the moves to Dead, which `moved` lists too */
  killed: StageMove[];
}

/** "Screening → Tracking", or "to Tracking" where the stage left is unknown. */
export function moveText(m: Pick<StageMove, "from" | "to">): string {
  return m.from ? `${STAGE_LABEL[m.from]} → ${STAGE_LABEL[m.to]}` : `to ${STAGE_LABEL[m.to]}`;
}

/**
 * What happened in the `WEEK_DAYS` before `now`: each list newest first.
 * A deal added this week and moved this week is in both lists.
 */
export function weekActivity(deals: readonly WeekDeal[], now: number): WeekActivity {
  const sinceMs = now - WEEK_DAYS * DAY_MS;
  const inWeek = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= sinceMs && t <= now;
  };
  const added: WeekActivity["added"] = [];
  const moved: StageMove[] = [];
  const calls: WeekActivity["calls"] = [];
  for (const d of deals) {
    if (inWeek(d.createdAt)) added.push({ dealId: d.id, name: d.name, at: d.createdAt });
    d.history.forEach((h, i) => {
      if (!inWeek(h.at)) return;
      moved.push({ dealId: d.id, name: d.name, from: i > 0 ? d.history[i - 1].stage : null, to: h.stage, at: h.at });
    });
    const v = d.verdict;
    if (v?.verdict && v.generatedAt && inWeek(v.generatedAt)) {
      calls.push({ dealId: d.id, name: d.name, verdict: v.verdict, at: v.generatedAt });
    }
  }
  const newest = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at);
  added.sort(newest);
  moved.sort(newest);
  calls.sort(newest);
  return {
    since: new Date(sinceMs).toISOString().slice(0, 10),
    through: new Date(now).toISOString().slice(0, 10),
    added,
    moved,
    calls,
    killed: moved.filter((m) => m.to === "dead"),
  };
}
