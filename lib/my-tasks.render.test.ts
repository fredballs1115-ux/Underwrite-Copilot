// "My tasks" (lib/my-tasks, app/(app)/tasks): the grouping on the reader's
// own day, the query rows as the page's, and the view rendered on fixtures,
// its visible text and markup linted. The page reads a database no test can
// reach; the view is pure.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MyTasksView } from "@/app/(app)/tasks/my-tasks-view";
import { MY_TASKS_MAX, dueWords, groupMyTasks, groupOf, isoPlusDays, myTaskRowsOf, type MyTaskRow } from "./my-tasks";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

const TODAY = "2026-10-16"; // a Friday

const task = (id: string, title: string, dueDate: string | null, deal = "d-1", dealName = "Heron Court", over: Partial<MyTaskRow> = {}): MyTaskRow => ({
  id,
  title,
  dueDate,
  createdAt: `2026-10-0${id.length}T12:00:00Z`,
  source: "manual",
  dealId: deal,
  dealName,
  ...over,
});

const FIXTURE: MyTaskRow[] = [
  task("t1", "Order the Phase I", "2026-10-12"),
  task("t2", "Call the broker about the rent roll", TODAY, "d-2", "The Maddox"),
  task("t3", "Tour the property", "2026-10-22", "d-2", "The Maddox", { source: "verdict" }),
  task("t4", "Send the LOI", "2026-10-23", "d-3", "Kestrel Point"),
  task("t5", "Ask for the T-12", null),
  task("t6", "Check the tax bill", "2027-01-08", "d-3", "Kestrel Point"),
];

describe("groupMyTasks — on the reader's own day", () => {
  it("overdue before today, this week through the sixth day after, later past it, undated last", () => {
    expect(groupOf({ dueDate: "2026-10-15" }, TODAY)).toBe("overdue");
    // Due today is not overdue (lib/deal-tasks' rule).
    expect(groupOf({ dueDate: TODAY }, TODAY)).toBe("week");
    expect(groupOf({ dueDate: isoPlusDays(TODAY, 6) }, TODAY)).toBe("week");
    expect(groupOf({ dueDate: isoPlusDays(TODAY, 7) }, TODAY)).toBe("later");
    expect(groupOf({ dueDate: null }, TODAY)).toBe("undated");
    const groups = groupMyTasks(FIXTURE, TODAY);
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ["overdue", ["t1"]],
      ["week", ["t2", "t3"]],
      ["later", ["t4", "t6"]],
      ["undated", ["t5"]],
    ]);
    expect(groups[1].note).toBe("Today through Thu, Oct 22");
  });

  it("leaves an empty group out, never an empty heading", () => {
    expect(groupMyTasks([task("t1", "x", null)], TODAY).map((g) => g.key)).toEqual(["undated"]);
    expect(groupMyTasks([], TODAY)).toEqual([]);
  });

  it("says how late or how soon in days", () => {
    expect(dueWords("2026-10-12", TODAY)).toBe("4 days late");
    expect(dueWords("2026-10-15", TODAY)).toBe("1 day late");
    expect(dueWords(TODAY, TODAY)).toBe("today");
    expect(dueWords("2026-10-17", TODAY)).toBe("tomorrow");
    expect(dueWords("2026-10-23", TODAY)).toBe("in 7 days");
  });
});

describe("myTaskRowsOf — the query's rows", () => {
  it("reads the embedded deal's name, drops a task with no deal, and keeps only a real day", () => {
    const rows = myTaskRowsOf([
      { id: "a", title: "One", due_date: "2026-10-20", created_at: "x", source: "verdict", deal_id: "d1", deals: { name: "Heron Court" } },
      { id: "b", title: "Two", due_date: "soon", created_at: "x", source: null, deal_id: "d2", deals: [{ name: "  " }] },
      { id: "c", title: "Three", due_date: null, created_at: "x", source: "manual", deal_id: "d3", deals: null },
    ]);
    expect(rows.map((r) => [r.id, r.dealName, r.dueDate, r.source])).toEqual([
      ["a", "Heron Court", "2026-10-20", "verdict"],
      ["b", "Untitled deal", null, "manual"],
    ]);
  });
});

const render = (tasks: MyTaskRow[], capped = false) =>
  renderToStaticMarkup(React.createElement(MyTasksView, { tasks, todayIso: TODAY, capped }));

describe("MyTasksView — rendered on fixtures", () => {
  it("draws how the tasks fall due as one bar, then a list a group, each task beside its deal", () => {
    const html = render(FIXTURE);
    dumpView("my-tasks", html);
    // One bar, a segment a group, named for a screen reader.
    expect(html).toContain('data-bar="my-tasks"');
    expect(html.match(/data-group="/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Overdue: 1, This week: 2, Later: 2, No date: 1"');
    // Each task links to its deal's task list, beside the deal's building.
    expect(html.match(/data-task="/g)).toHaveLength(6);
    expect(html.match(/data-deal-avatar="picture"/g)).toHaveLength(6);
    expect(html).toContain('href="/deals/d-2#tasks"');
    const text = visibleText(html);
    expect(text).toContain("6 open");
    expect(text).toContain("Overdue");
    expect(text).toContain("4 days late");
    expect(text).toContain("Today through Thu, Oct 22");
    expect(text).toContain("from the verdict's next steps");
    // A due date in another year carries its year.
    expect(text).toContain("Jan 8, 2027");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("says the read stopped at its bound", () => {
    expect(visibleText(render(FIXTURE, true))).toContain(`6 open, the first ${MY_TASKS_MAX} read`);
  });

  it("with nothing open, says so and points to the pipeline — no bar, no empty group", () => {
    const html = render([]);
    expect(html).toContain('data-qa="my-tasks-empty"');
    expect(html).not.toContain('data-bar="my-tasks"');
    expect(visibleText(html)).toContain("Nothing assigned to you is open.");
    // A picture, not a sentence alone (the pipeline's empty-state style),
    // and the one way on as a button.
    expect(html).toContain('data-art="tasks-clear"');
    expect(html).toMatch(/<a[^>]*href="\/deals"[^>]*>Open the pipeline<\/a>/);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });
});

describe("the way there", () => {
  it("the shell's nav, the ⌘K palette and the sign-in bounce all know /tasks", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(p, "utf8");
    const shell = read("app/(app)/app-shell.tsx");
    expect(shell).toContain('["/tasks", "My tasks", inTasks, IconCheck]');
    // The phone's strip draws the sidebar's own list (signed-in gaps, M6).
    expect(shell).toContain("<PhoneNav nav={nav} pathname={pathname} />");
    expect(read("app/(app)/command-palette.tsx")).toContain('href: "/tasks"');
    expect(read("lib/supabase/proxy-session.ts")).toContain('"/tasks",');
    // The deal's task list carries the anchor each row links to.
    expect(read("app/(app)/deals/[id]/deal-tasks.tsx")).toContain('id="tasks"');
  });
});
