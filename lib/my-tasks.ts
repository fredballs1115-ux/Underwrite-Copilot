// "My tasks" (research pass 17, item 14 — Dealpath's role-based task
// assignments): the open tasks assigned to the reader across every deal they
// can read, grouped by when they are due on the reader's own day
// (lib/reader-day). Pure: the page reads the rows in one bounded query and
// hands them in; the view draws what this returns.
//
// Its rules:
//   - a task's day is compared as an ISO string against the reader's day,
//     the deal card's rule (lib/deal-tasks `isTaskOverdue`): due today is
//     not overdue;
//   - "this week" is today through the sixth day after, the Monday digest's
//     window (lib/digest `OFFERS_WINDOW_DAYS`), and its heading names the
//     last day, never an unnamed "week";
//   - a task with no date is no one's deadline, listed last and said so;
//   - the read is bounded (`MY_TASKS_MAX`), and a list the bound cut says
//     so — never a silent short list.
import { isTaskOverdue } from "@/lib/deal-tasks";

/** How many open tasks the page reads at once. */
export const MY_TASKS_MAX = 200;

/** Today through the sixth day after: seven days, today included. */
export const TASK_WEEK_DAYS = 7;

/** One open task as the page's query returns it, with its deal. */
export interface MyTaskRow {
  id: string;
  title: string;
  /** yyyy-mm-dd, or null */
  dueDate: string | null;
  createdAt: string;
  source: "manual" | "verdict";
  dealId: string;
  dealName: string;
}

export type MyTaskGroupKey = "overdue" | "week" | "later" | "undated";

export interface MyTaskGroup {
  key: MyTaskGroupKey;
  title: string;
  /** a line under the heading: the window's last day, or what an empty
   *  date means */
  note: string | null;
  tasks: MyTaskRow[];
}

const DAY_MS = 86_400_000;

/** The ISO day `n` days after `iso` (UTC arithmetic on a bare date). */
export function isoPlusDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

/** "Sun, Oct 22" — UTC-pinned, so the server and the browser agree. */
export function weekdayDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Which group a task falls in on the reader's day. */
export function groupOf(task: Pick<MyTaskRow, "dueDate">, todayIso: string): MyTaskGroupKey {
  if (!task.dueDate) return "undated";
  if (isTaskOverdue({ dueDate: task.dueDate, done: false }, todayIso)) return "overdue";
  return task.dueDate <= isoPlusDays(todayIso, TASK_WEEK_DAYS - 1) ? "week" : "later";
}

/**
 * The reader's open tasks in four groups, in order: overdue, this week,
 * later, no date. Within a group the soonest first, then the oldest. A group
 * with no task is left out — never an empty heading.
 */
export function groupMyTasks(rows: readonly MyTaskRow[], todayIso: string): MyTaskGroup[] {
  const by: Record<MyTaskGroupKey, MyTaskRow[]> = { overdue: [], week: [], later: [], undated: [] };
  for (const r of rows) by[groupOf(r, todayIso)].push(r);
  const order = (a: MyTaskRow, b: MyTaskRow) =>
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.createdAt.localeCompare(b.createdAt);
  const last = isoPlusDays(todayIso, TASK_WEEK_DAYS - 1);
  const groups: MyTaskGroup[] = [
    { key: "overdue", title: "Overdue", note: null, tasks: by.overdue.sort(order) },
    { key: "week", title: "This week", note: `Today through ${weekdayDay(last)}`, tasks: by.week.sort(order) },
    { key: "later", title: "Later", note: `After ${weekdayDay(last)}`, tasks: by.later.sort(order) },
    { key: "undated", title: "No date", note: "No due date set", tasks: by.undated.sort(order) },
  ];
  return groups.filter((g) => g.tasks.length > 0);
}

/** How far past due, or how soon, in the reader's days: "3 days late",
 *  "today", "tomorrow", "in 5 days". */
export function dueWords(dueDate: string, todayIso: string): string {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / DAY_MS);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day late";
  return days < 0 ? `${-days} days late` : `in ${days} days`;
}

/** The query's raw row (deal_tasks with its deal embedded). */
export interface MyTaskDbRow {
  id: string;
  title: string;
  due_date: string | null;
  created_at: string;
  source: string | null;
  deal_id: string;
  deals: { name: string | null } | { name: string | null }[] | null;
}

/** The query's rows as the page's, a task whose deal the reader cannot
 *  read (no embedded deal) left out. */
export function myTaskRowsOf(rows: readonly MyTaskDbRow[] | null | undefined): MyTaskRow[] {
  const out: MyTaskRow[] = [];
  for (const r of rows ?? []) {
    const deal = Array.isArray(r.deals) ? r.deals[0] : r.deals;
    if (!deal) continue;
    out.push({
      id: r.id,
      title: r.title,
      dueDate: r.due_date && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date) ? r.due_date : null,
      createdAt: r.created_at,
      source: r.source === "verdict" ? "verdict" : "manual",
      dealId: r.deal_id,
      dealName: deal.name?.trim() || "Untitled deal",
    });
  }
  return out;
}
