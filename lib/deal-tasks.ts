// Deal task assignments (Feature 7): the verdict's "next steps" and manual
// to-dos as assignable tasks with owners and due dates. Pure types + list
// logic — sorting, overdue, progress — shared by the server page and the
// client card. (Universal module: no server-only.)

export const TASK_TITLE_MAX = 200;
/** Cap on tasks imported from a verdict in one click (verdicts carry ≤6
 *  next steps in practice; the cap just bounds a malformed one). */
export const VERDICT_IMPORT_MAX = 8;

export interface DealTask {
  id: string;
  title: string;
  /** auth user id, or null (unassigned / account deleted) */
  assigneeUserId: string | null;
  /** yyyy-mm-dd, or null */
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
  source: "manual" | "verdict";
  createdBy: string | null;
  createdAt: string;
}

/** Who a task can be assigned to — the current user, plus teammates. */
export interface TaskAssignee {
  userId: string;
  label: string;
}

/** Open tasks first (soonest due first, undated last, then oldest first);
 *  done tasks after (most recently completed first). Stable for ties. */
export function sortDealTasks<T extends DealTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done) {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return a.createdAt.localeCompare(b.createdAt);
    }
    return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
  });
}

/** Past-due and still open. Dates are compared as ISO strings — no timezone
 *  math; the caller supplies "today" (yyyy-mm-dd, UTC) once. Due today is
 *  NOT overdue. */
export function isTaskOverdue(
  task: Pick<DealTask, "dueDate" | "done">,
  todayIso: string,
): boolean {
  if (task.done || !task.dueDate || !todayIso) return false;
  return task.dueDate < todayIso;
}

export function taskProgress(tasks: Pick<DealTask, "done">[]): {
  done: number;
  total: number;
} {
  return {
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
  };
}

/** Trim + code-point cap — the ONE normalization every writer applies, so
 *  the import dedupe (title equality) can't be defeated by truncation. */
export function normalizeTaskTitle(raw: string): string {
  return Array.from(raw.trim()).slice(0, TASK_TITLE_MAX).join("");
}

/** The verdict's next steps that aren't tasks yet (normalized, in-batch
 *  deduped). Drives both the import action and the button's visibility, so
 *  the UI can never hide steps the action would import. */
export function unimportedVerdictSteps(
  nextSteps: unknown,
  tasks: Pick<DealTask, "title">[],
): string[] {
  const existing = new Set(tasks.map((t) => t.title));
  const out: string[] = [];
  for (const s of Array.isArray(nextSteps) ? nextSteps : []) {
    if (typeof s !== "string" || !s.trim()) continue;
    const title = normalizeTaskTitle(s);
    if (!existing.has(title)) {
      existing.add(title); // also dedupes within the batch
      out.push(title);
    }
  }
  return out;
}

/** "Jul 20" / "Jul 20, 2027" — UTC-pinned so the server and browser render
 *  the SAME string (a bare yyyy-mm-dd parses as UTC midnight). Year shown
 *  only when it isn't the current one. */
export function formatDueDate(dueDate: string, todayIso: string): string {
  const d = new Date(`${dueDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return dueDate;
  const sameYear = dueDate.slice(0, 4) === todayIso.slice(0, 4);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
