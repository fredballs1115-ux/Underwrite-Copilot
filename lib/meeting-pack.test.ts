// The Monday meeting's three questions (research pass 24, B1): how long a
// deal has sat, who owns its next step, and what moved this week.
import { describe, expect, it } from "vitest";
import { moveText, nextStepOf, nextStepText, stageAge, stageAgeText, weekActivity, type PackTask } from "./meeting-pack";

const TODAY = "2026-10-05";
const NOW = Date.parse("2026-10-05T13:00:00Z");
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe("stageAge", () => {
  it("counts from the last move where it is the deal's stage", () => {
    const h = [
      { stage: "tracking" as const, at: at(-40) },
      { stage: "active_pursuit" as const, at: at(-12) },
    ];
    expect(stageAge("active_pursuit", h, at(-60), TODAY)).toEqual({ days: 12, from: "moved" });
    expect(stageAgeText({ days: 12, from: "moved" })).toBe("12 days");
    expect(stageAgeText({ days: 1, from: "moved" })).toBe("1 day");
    expect(stageAgeText({ days: 0, from: "moved" })).toBe("today");
  });

  it("counts a deal never moved from the day it was added, and says so", () => {
    expect(stageAge("screening", [], at(-9), TODAY)).toEqual({ days: 9, from: "added" });
    expect(stageAge(null, [], at(-9), TODAY)).toEqual({ days: 9, from: "added" });
  });

  it("says nothing where the history's last move is another stage, or a deal off Screening has none", () => {
    expect(stageAge("loi_submitted", [{ stage: "tracking", at: at(-3) }], at(-9), TODAY)).toBeNull();
    expect(stageAge("tracking", [], at(-9), TODAY)).toBeNull();
    expect(stageAge("screening", [], "not a day", TODAY)).toBeNull();
  });
});

describe("nextStepOf", () => {
  const task = (over: Partial<PackTask>): PackTask => ({
    title: "A task",
    assigneeUserId: null,
    dueDate: null,
    done: false,
    completedAt: null,
    createdAt: at(-5),
    ...over,
  });
  const names = (id: string) => ({ u1: "You", u2: "Jane Doe" })[id] ?? null;

  it("is the soonest open task, its owner named and an overdue day said", () => {
    const step = nextStepOf(
      [
        task({ title: "Later", dueDate: "2026-10-20", assigneeUserId: "u1" }),
        task({ title: "Order the PCA", dueDate: "2026-10-02", assigneeUserId: "u2" }),
        task({ title: "Done", dueDate: "2026-09-01", done: true }),
        task({ title: "Undated" }),
      ],
      TODAY,
      names,
    )!;
    expect(step).toEqual({ title: "Order the PCA", owner: "Jane Doe", due: "2026-10-02", overdue: true });
    expect(nextStepText(step, TODAY)).toBe("Order the PCA — Jane Doe, due Oct 2 (overdue)");
  });

  it("says unassigned and no date where neither is set, and none where nothing is open", () => {
    const step = nextStepOf([task({ title: "Call the broker" })], TODAY, names)!;
    expect(nextStepText(step, TODAY)).toBe("Call the broker — unassigned, no date");
    expect(nextStepOf([task({ done: true })], TODAY, names)).toBeNull();
    expect(nextStepOf([], TODAY, names)).toBeNull();
  });
});

describe("weekActivity", () => {
  it("lists the week's additions, moves, calls and kills, newest first, and nothing older", () => {
    const week = weekActivity(
      [
        {
          id: "a",
          name: "Harbor Point",
          stage: "dead",
          createdAt: at(-30),
          history: [
            { stage: "tracking", at: at(-20) },
            { stage: "dead", at: at(-1) },
          ],
          verdict: { verdict: "pass_on", generatedAt: at(-2) },
        },
        {
          id: "b",
          name: "The Maddox",
          stage: "tracking",
          createdAt: at(-3),
          history: [{ stage: "tracking", at: at(-2.5) }],
          verdict: { verdict: "pass", generatedAt: at(-10) },
        },
      ],
      NOW,
    );
    expect(week.since).toBe("2026-09-28");
    expect(week.through).toBe(TODAY);
    expect(week.added.map((d) => d.name)).toEqual(["The Maddox"]);
    expect(week.moved.map((m) => [m.name, moveText(m)])).toEqual([
      ["Harbor Point", "Tracking → Dead"],
      ["The Maddox", "to Tracking"],
    ]);
    expect(week.calls.map((c) => [c.name, c.verdict])).toEqual([["Harbor Point", "pass_on"]]);
    expect(week.killed.map((m) => m.name)).toEqual(["Harbor Point"]);
  });
});
