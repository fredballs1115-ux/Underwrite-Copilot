/**
 * The sample deal's lower half, seeded (signed-in gaps, H7), drawn by the
 * panels a reader meets on its Overview: Ask with three answers, the tasks
 * with the verdict's next steps, the decision log with one note. Each is
 * linted, and each is the sample's — no one's name, nothing the reader can
 * delete as theirs, and no offer to import steps already filed.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));

import { AskPanel } from "@/app/(app)/deals/[id]/ask-panel";
import { DealTasks } from "@/app/(app)/deals/[id]/deal-tasks";
import { DecisionLog } from "@/app/(app)/deals/[id]/decision-log";
import { SAMPLE_DEAL, sampleWork } from "./sample-deal";
import { parseDealNotes, parseDealQa } from "./deals";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;
const AT = "2026-10-16T12:00:00.000Z";
const ME = "00000000-0000-4000-8000-000000000001";
const work = sampleWork(AT);

function lint(html: string) {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
}

describe("the sample's seeded panels", () => {
  it("Ask shows the three answers with their pages, asked by no one", () => {
    const html = renderToStaticMarkup(
      h(AskPanel, { dealId: "s1", qa: parseDealQa(work.qa), hasOm: false, isSample: true, isPro: true, askers: null }),
    );
    const text = visibleText(html);
    for (const e of work.qa) {
      expect(text).toContain(e.q);
      expect(text).toContain(e.answer);
    }
    expect(text).not.toMatch(/asked by/);
    // The sample has no PDF to open, so a page is a chip, not a link.
    expect(html).not.toMatch(/#page=/);
    for (const p of ["p. 41", "p. 8", "p. 12", "p. 40", "p. 14", "p. 3"]) expect(text).toContain(p);
    lint(html);
  });

  it("the tasks are the verdict's next steps, and the import is not offered again", () => {
    const html = renderToStaticMarkup(
      h(DealTasks, {
        dealId: "s1",
        todayIso: "2026-10-16",
        assignees: [{ userId: ME, label: "You" }],
        verdictSteps: SAMPLE_DEAL.verdict.nextSteps,
        tasks: work.tasks.map((t, i) => ({
          id: `t${i}`,
          title: t.title,
          assigneeUserId: null,
          dueDate: null,
          done: false,
          completedAt: null,
          source: t.source,
          createdBy: null,
          createdAt: AT,
        })),
      }),
    );
    const text = visibleText(html);
    for (const s of SAMPLE_DEAL.verdict.nextSteps) expect(text).toContain(s);
    expect(text).toContain("from verdict");
    expect(text).not.toMatch(/Add the verdict’s/);
    expect(text).not.toMatch(/No tasks yet/);
    lint(html);
  });

  it("the note is the sample's, and not the reader's to remove", () => {
    const html = renderToStaticMarkup(
      h(DecisionLog, {
        dealId: "s1",
        userEmail: "fredballs1115@gmail.com",
        userId: ME,
        stageHistory: [],
        notes: parseDealNotes(work.notes),
      }),
    );
    const text = visibleText(html);
    expect(text).toContain(work.notes[0].text);
    expect(text).toContain("Sample deal");
    expect(text).not.toMatch(/\byou\b/);
    expect(html).not.toMatch(/name="at"/);
    lint(html);
  });
});
