"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  sortDealTasks,
  isTaskOverdue,
  taskProgress,
  formatDueDate,
  unimportedVerdictSteps,
  TASK_TITLE_MAX,
  VERDICT_IMPORT_MAX,
  type DealTask,
  type TaskAssignee,
} from "@/lib/deal-tasks";
import {
  addDealTask,
  toggleDealTask,
  deleteDealTask,
  importVerdictTasks,
} from "./task-actions";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add task"}
    </button>
  );
}

function ImportButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint disabled:opacity-60"
    >
      {pending ? "Adding…" : label}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-medium text-muted underline-offset-2 transition-colors hover:text-kill hover:underline disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

/** The checkbox submits its own form on change — one round-trip per toggle,
 *  disabled while in flight so a double-click can't race itself. */
function ToggleBox({ done, title }: { done: boolean; title: string }) {
  const { pending } = useFormStatus();
  return (
    <input
      type="checkbox"
      name="done"
      defaultChecked={done}
      disabled={pending}
      aria-label={`Mark "${title}" ${done ? "open" : "done"}`}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-brand disabled:opacity-50"
    />
  );
}

/**
 * Deal tasks (Feature 7): the verdict's "next steps" and manual to-dos as
 * assignable tasks with owners and due dates — the "what happens next" that
 * the decision log then remembers.
 */
export function DealTasks({
  dealId,
  tasks,
  assignees,
  todayIso,
  verdictSteps,
}: {
  dealId: string;
  tasks: DealTask[];
  assignees: TaskAssignee[];
  /** yyyy-mm-dd (UTC), computed on the server once — keeps "overdue" and
   *  date labels identical between server and client render. */
  todayIso: string;
  /** the verdict's raw nextSteps (unknown shape — normalized here) */
  verdictSteps?: unknown;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const sorted = sortDealTasks(tasks);
  const { done, total } = taskProgress(tasks);
  const labelFor = (id: string | null) =>
    id ? (assignees.find((a) => a.userId === id)?.label ?? "teammate") : null;
  // Steps not yet imported — the SAME normalization/dedupe the action runs,
  // so the button shows exactly when a click would add something (including
  // NEW steps after a re-screen; it never vanishes forever after one import).
  const anyImported = tasks.some((t) => t.source === "verdict");
  const freshSteps = unimportedVerdictSteps(verdictSteps, tasks);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Tasks</h2>
          <p className="mt-0.5 text-xs text-muted">
            Who does what before the next call — assign it, date it, check it
            off.
          </p>
        </div>
        {total > 0 && (
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-xs tabular-nums ${
              done === total ? "bg-pass/10 text-pass" : "bg-faint text-muted"
            }`}
          >
            {done}/{total} done
          </span>
        )}
      </div>

      {freshSteps.length > 0 && (
        <form action={importVerdictTasks} className="mt-3">
          <input type="hidden" name="dealId" value={dealId} />
          <ImportButton
            label={
              anyImported
                ? // The action imports at most VERDICT_IMPORT_MAX per click —
                  // never promise more than one click delivers.
                  (() => {
                    const n = Math.min(freshSteps.length, VERDICT_IMPORT_MAX);
                    return `Add the verdict’s ${n} new next step${n === 1 ? "" : "s"}`;
                  })()
                : "Add the verdict’s next steps"
            }
          />
        </form>
      )}

      <form
        ref={formRef}
        action={async (fd) => {
          await addDealTask(fd);
          formRef.current?.reset();
        }}
        className="mt-3"
      >
        <input type="hidden" name="dealId" value={dealId} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="title"
            required
            maxLength={TASK_TITLE_MAX}
            placeholder="e.g. Request trailing-12 financials from the broker"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <select
            name="assignee"
            defaultValue=""
            aria-label="Assignee"
            className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dueDate"
            aria-label="Due date"
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <AddButton />
        </div>
      </form>

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No tasks yet — pull in the verdict’s next steps or add your own.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {sorted.map((t) => {
            const overdue = isTaskOverdue(t, todayIso);
            const who = labelFor(t.assigneeUserId);
            return (
              <li key={t.id} className="flex items-start gap-3">
                <form action={toggleDealTask}>
                  <input type="hidden" name="dealId" value={dealId} />
                  <input type="hidden" name="taskId" value={t.id} />
                  <ToggleBox done={t.done} title={t.title} />
                </form>
                <div className="min-w-0 flex-1">
                  <p
                    className={`break-words text-sm leading-relaxed ${
                      t.done ? "text-muted line-through" : ""
                    }`}
                  >
                    {t.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    {who && <span className="truncate">{who}</span>}
                    {who && t.dueDate && <span aria-hidden>·</span>}
                    {t.dueDate && (
                      <span
                        className={
                          overdue ? "font-medium text-kill" : undefined
                        }
                      >
                        Due {formatDueDate(t.dueDate, todayIso)}
                        {overdue ? " — overdue" : ""}
                      </span>
                    )}
                    {t.source === "verdict" && (
                      <span className="rounded bg-faint px-1.5 py-px text-[10px] uppercase tracking-wide">
                        from verdict
                      </span>
                    )}
                    <form action={deleteDealTask} className="inline">
                      <input type="hidden" name="dealId" value={dealId} />
                      <input type="hidden" name="taskId" value={t.id} />
                      <RemoveButton />
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
