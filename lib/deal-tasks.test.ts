import { describe, it, expect } from "vitest";
import {
  sortDealTasks,
  isTaskOverdue,
  taskProgress,
  formatDueDate,
  normalizeTaskTitle,
  unimportedVerdictSteps,
  TASK_TITLE_MAX,
  type DealTask,
} from "./deal-tasks";

const T = (over: Partial<DealTask>): DealTask => ({
  id: over.id ?? "t",
  title: "task",
  assigneeUserId: null,
  dueDate: null,
  done: false,
  completedAt: null,
  source: "manual",
  createdBy: "u1",
  createdAt: "2026-07-01T00:00:00Z",
  ...over,
});

describe("sortDealTasks", () => {
  it("open before done; open by due date, undated last, then oldest first", () => {
    const sorted = sortDealTasks([
      T({ id: "done-late", done: true, completedAt: "2026-07-10T00:00:00Z" }),
      T({ id: "undated-old", createdAt: "2026-07-01T00:00:00Z" }),
      T({ id: "due-soon", dueDate: "2026-07-14" }),
      T({ id: "done-early", done: true, completedAt: "2026-07-05T00:00:00Z" }),
      T({ id: "due-later", dueDate: "2026-08-01" }),
      T({ id: "undated-new", createdAt: "2026-07-06T00:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      "due-soon",
      "due-later",
      "undated-old",
      "undated-new",
      "done-late", // most recently completed first among done
      "done-early",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [T({ id: "a", done: true }), T({ id: "b" })];
    sortDealTasks(input);
    expect(input[0].id).toBe("a");
  });
});

describe("isTaskOverdue", () => {
  const today = "2026-07-13";
  it("past due and open → overdue; due today or future → not", () => {
    expect(isTaskOverdue(T({ dueDate: "2026-07-12" }), today)).toBe(true);
    expect(isTaskOverdue(T({ dueDate: "2026-07-13" }), today)).toBe(false);
    expect(isTaskOverdue(T({ dueDate: "2026-07-14" }), today)).toBe(false);
  });
  it("done or undated is never overdue", () => {
    expect(isTaskOverdue(T({ dueDate: "2026-01-01", done: true }), today)).toBe(false);
    expect(isTaskOverdue(T({ dueDate: null }), today)).toBe(false);
  });
});

describe("taskProgress", () => {
  it("counts done over total", () => {
    expect(taskProgress([T({ done: true }), T({}), T({ done: true })])).toEqual({
      done: 2,
      total: 3,
    });
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("unimportedVerdictSteps", () => {
  it("drops already-imported titles, junk entries, and in-batch duplicates", () => {
    const tasks = [T({ title: "Walk the comps" })];
    expect(
      unimportedVerdictSteps(
        ["Walk the comps", "  Get the T-12  ", "Get the T-12", 42, "", null],
        tasks,
      ),
    ).toEqual(["Get the T-12"]);
  });

  it("dedupe survives truncation — a long step matches its stored 200-cp form", () => {
    const long = "x".repeat(250);
    const stored = normalizeTaskTitle(long);
    expect(stored).toHaveLength(TASK_TITLE_MAX);
    expect(unimportedVerdictSteps([long], [T({ title: stored })])).toEqual([]);
  });

  it("non-array input reads as no steps", () => {
    expect(unimportedVerdictSteps(undefined, [])).toEqual([]);
    expect(unimportedVerdictSteps("next steps", [])).toEqual([]);
  });
});

describe("formatDueDate", () => {
  it("hides the year when current, shows it otherwise; UTC-pinned", () => {
    expect(formatDueDate("2026-07-20", "2026-07-13")).toBe("Jul 20");
    expect(formatDueDate("2027-01-05", "2026-07-13")).toBe("Jan 5, 2027");
  });
  it("returns garbage input verbatim rather than 'Invalid Date'", () => {
    expect(formatDueDate("not-a-date", "2026-07-13")).toBe("not-a-date");
  });
});
