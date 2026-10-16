import Link from "next/link";
import { DealAvatar } from "@/app/(app)/deal-avatar";
import { formatDueDate } from "@/lib/deal-tasks";
import { MY_TASKS_MAX, dueWords, groupMyTasks, type MyTaskGroupKey, type MyTaskRow } from "@/lib/my-tasks";

// Each group's tone — the bar's segment, the heading's dot and the due line.
const TONE: Record<MyTaskGroupKey, { bar: string; dot: string; due: string }> = {
  overdue: { bar: "bg-kill", dot: "bg-kill", due: "font-medium text-kill" },
  week: { bar: "bg-caution", dot: "bg-caution", due: "font-medium text-caution" },
  later: { bar: "bg-brand/60", dot: "bg-brand/60", due: "text-muted" },
  undated: { bar: "bg-line", dot: "bg-line", due: "text-muted" },
};

/**
 * "My tasks" (lib/my-tasks): the open tasks assigned to the reader across
 * every deal they can read, as one bar of how they fall due and then a list
 * a group, each task beside its deal's building (DealAvatar) and linked to
 * the deal's own task list. Pure: the page reads the rows and the reader's
 * day and hands them in, so the render test draws it on a fixture.
 */
export function MyTasksView({
  tasks,
  todayIso,
  capped = false,
}: {
  tasks: readonly MyTaskRow[];
  /** the reader's own day, yyyy-mm-dd (lib/reader-day) */
  todayIso: string;
  /** the read stopped at MY_TASKS_MAX, so more may be open */
  capped?: boolean;
}) {
  const groups = groupMyTasks(tasks, todayIso);
  const total = tasks.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
        <p className="mt-1 text-sm text-muted">Open tasks assigned to you, on every deal you can see.</p>
      </div>

      {total === 0 ? (
        <div data-qa="my-tasks-empty" className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center">
          <p className="text-sm font-medium">Nothing assigned to you is open.</p>
          <p className="mt-1 text-sm text-muted">
            A task assigned to you on a deal&apos;s page lands here.{" "}
            <Link href="/deals" className="font-medium text-brand hover:text-brand-strong">
              Open the pipeline
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* How the open tasks fall due, as one bar: a segment a group, in
              the order the lists below run. */}
          <figure className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted">
              {total} open{capped ? `, the first ${MY_TASKS_MAX} read` : ""}
            </figcaption>
            <div
              data-bar="my-tasks"
              role="img"
              aria-label={groups.map((g) => `${g.title}: ${g.tasks.length}`).join(", ")}
              className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-faint"
            >
              {groups.map((g) => (
                <span
                  key={g.key}
                  data-group={g.key}
                  className={TONE[g.key].bar}
                  style={{ width: `${(g.tasks.length / total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[g.key].dot}`} />
                  <a href={`#tasks-${g.key}`} className="hover:text-ink">
                    {g.title}{" "}
                    <span className="font-mono tabular-nums text-muted">{g.tasks.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </figure>

          {groups.map((g) => (
            <section
              key={g.key}
              id={`tasks-${g.key}`}
              aria-labelledby={`tasks-${g.key}-h`}
              className="scroll-mt-20 rounded-2xl border border-line bg-surface shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
                <h2 id={`tasks-${g.key}-h`} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[g.key].dot}`} />
                  {g.title}{" "}
                  <span className="font-mono text-xs font-normal tabular-nums text-muted">{g.tasks.length}</span>
                </h2>
                {g.note ? <span className="text-xs text-muted">{g.note}</span> : null}
              </div>
              <ul className="divide-y divide-line">
                {g.tasks.map((t) => (
                  <li key={t.id} data-task={t.id} className="flex items-start gap-3 px-5 py-3">
                    <DealAvatar dealId={t.dealId} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug break-words">{t.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <Link
                          href={`/deals/${t.dealId}#tasks`}
                          className="font-medium text-ink underline-offset-2 hover:text-brand hover:underline"
                        >
                          {t.dealName}
                        </Link>
                        {t.source === "verdict" ? <span> · from the verdict&apos;s next steps</span> : null}
                      </p>
                    </div>
                    {t.dueDate ? (
                      <p className="shrink-0 text-right text-xs">
                        <span className="block font-mono tabular-nums">{formatDueDate(t.dueDate, todayIso)}</span>
                        <span className={`block ${TONE[g.key].due}`}>{dueWords(t.dueDate, todayIso)}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
