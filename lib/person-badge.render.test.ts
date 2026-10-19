/**
 * One badge for a person wherever one shows (signed-in gaps, H3), rendered
 * on fixtures: the badge itself, then each surface that draws it — the
 * sidebar, a task's assignee, a note's author, a question's asker and a
 * broker on the offering card — each linted for glued words and the
 * accessibility floor, and none printing a whole email as a name.
 */
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/login/actions", () => ({ signOut: async () => {} }));

import { PersonBadge } from "@/app/(app)/person-badge";
import { AppShell } from "@/app/(app)/app-shell";
import { DealTasks } from "@/app/(app)/deals/[id]/deal-tasks";
import { DecisionLog } from "@/app/(app)/deals/[id]/decision-log";
import { AskPanel } from "@/app/(app)/deals/[id]/ask-panel";
import { ListingTeam } from "@/app/(app)/deals/[id]/listing-team";
import { parseDealQa } from "./deals";
import { PERSON_TONES, personToneIndex } from "./person";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;
const ME = "11111111-1111-4111-8111-111111111111";
const MATE = "22222222-2222-4222-8222-222222222222";
const badges = (html: string) => [...html.matchAll(/<span data-person-badge="(xs|sm|md)"[^>]*>([^<]*)<\/span>/g)];
const lint = (html: string) => {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
};
// An address printed whole, where a name belongs.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

describe("the person badge", () => {
  it("draws the initials of an email's local part, in the tone its id is keyed to, named for a screen reader", () => {
    const html = renderToStaticMarkup(h(PersonBadge, { name: "fredballs1115@gmail.com", id: ME, size: "md" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="fredballs1115"');
    expect(html).toContain('title="fredballs1115"');
    expect(html).toContain(`background-color:${PERSON_TONES[personToneIndex(ME)]}`);
    expect(html).toMatch(/h-9 w-9/);
    expect(badges(html).map((m) => m[2])).toEqual(["F"]);
    expect(html).not.toContain("gmail");
    lint(html);
  });

  it("is hidden from a screen reader where the name is written beside it, and keeps its title", () => {
    const html = renderToStaticMarkup(h(PersonBadge, { name: "Jordan Lee", size: "xs", decorative: true }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain('title="Jordan Lee"');
    expect(html).toMatch(/h-4 w-4/);
    expect(badges(html).map((m) => m[2])).toEqual(["JL"]);
  });

  it("is the same tone for the same person whatever the size, and keyed to the name where no id is given", () => {
    const tone = (props: Record<string, unknown>) => /background-color:(#[0-9a-f]{6})/.exec(renderToStaticMarkup(h(PersonBadge, props as never)))?.[1];
    expect(tone({ name: "Jordan Lee", id: MATE, size: "xs" })).toBe(tone({ name: "Jordan", id: MATE, size: "md" }));
    expect(tone({ name: "Jordan Lee" })).toBe(PERSON_TONES[personToneIndex("Jordan Lee")]);
  });
});

describe("where a person shows", () => {
  it("the sidebar names the reader with their badge, linked to the account", () => {
    const html = renderToStaticMarkup(
      h(AppShell, { userEmail: "fredballs1115@gmail.com", userId: ME, userName: "Fred Balls", children: h("p", null, "page") }),
    );
    const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(aside).toMatch(/<a [^>]*href="\/account"[^>]*>[\s\S]*?data-person-badge="md"[\s\S]*?Fred Balls[\s\S]*?fredballs1115@gmail\.com/);
    expect(badges(aside).map((m) => m[2])).toEqual(["FB"]);
    lint(html);
  });

  it("the sidebar falls back to the email's local part, never the address as the name", () => {
    const html = renderToStaticMarkup(h(AppShell, { userEmail: "jordan.lee@firm.com", children: h("p", null, "page") }));
    const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(badges(aside).map((m) => m[2])).toEqual(["JL"]);
    expect(visibleText(aside)).toMatch(/jordan\.lee\s+jordan\.lee@firm\.com/);
  });

  it("the phone's top bar wears the reader's badge in Sign out's place, and its strip the sidebar's icons", () => {
    const html = renderToStaticMarkup(
      h(AppShell, { userEmail: "fredballs1115@gmail.com", userId: ME, userName: "Fred Balls", children: h("p", null, "page") }),
    );
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    // The menu, closed: the badge as a named button, Sign out behind it.
    expect(header).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-label="Account and sign out, Fred Balls"[^>]*>[\s\S]*?data-person-badge="sm"/);
    expect(header).not.toContain("Sign out</button>");
    // Eleven chips, each with its icon, the one on screen marked; both edge
    // fades drawn over the row, hidden from a screen reader.
    const strip = header.slice(header.indexOf("<nav"), header.indexOf("</nav>"));
    expect(strip.match(/<a /g)).toHaveLength(10);
    expect(strip.match(/<svg /g)).toHaveLength(10);
    expect(strip).toMatch(/aria-current="page"[^>]*>[\s\S]*?Pipeline/);
    expect(header).toMatch(/<span aria-hidden="true" data-nav-fade="start"[^>]*opacity-0/);
    expect(header).toMatch(/<span aria-hidden="true" data-nav-fade="end"[^>]*opacity-100/);
    expect(header).not.toMatch(/mask-/);
    lint(html);
  });

  it("a task wears its assignee's badge beside their name", () => {
    const html = renderToStaticMarkup(
      h(DealTasks, {
        dealId: "d1",
        todayIso: "2026-10-16",
        assignees: [
          { userId: ME, label: "Fred Balls (you)" },
          { userId: MATE, label: "jordan.lee" },
        ],
        tasks: [
          { id: "t1", title: "Request the T-12", assigneeUserId: MATE, dueDate: null, done: false, completedAt: null, source: "manual", createdBy: ME, createdAt: "2026-10-01T00:00:00Z" },
          { id: "t2", title: "Call the broker", assigneeUserId: ME, dueDate: null, done: false, completedAt: null, source: "manual", createdBy: ME, createdAt: "2026-10-02T00:00:00Z" },
          { id: "t3", title: "Unassigned one", assigneeUserId: null, dueDate: null, done: false, completedAt: null, source: "manual", createdBy: ME, createdAt: "2026-10-03T00:00:00Z" },
        ],
      }),
    );
    expect(badges(html).map((m) => [m[1], m[2]]).sort()).toEqual([["xs", "FB"], ["xs", "JL"]]);
    lint(html);
  });

  it("a note wears its author's badge, the reader's said as you, a teammate's never as an email", () => {
    const html = renderToStaticMarkup(
      h(DecisionLog, {
        dealId: "d1",
        userEmail: "fredballs1115@gmail.com",
        userId: ME,
        stageHistory: [{ stage: "tracking", at: "2026-10-03T00:00:00Z" }],
        notes: [
          { at: "2026-10-02T00:00:00Z", by: "fredballs1115@gmail.com", byId: ME, text: "Passed at $68M." },
          { at: "2026-10-01T00:00:00Z", by: "jordan.lee@firm.com", byId: MATE, text: "Broker says they'll move." },
        ],
      }),
    );
    const text = visibleText(html);
    // Each date with its year: a log runs across New Year.
    expect(text).toMatch(/Passed at \$68M\.\s*Oct 2, 2026\s*·\s*you/);
    expect(text).toMatch(/Broker says they'll move\.\s*Oct 1, 2026\s*·\s*jordan\.lee/);
    expect(text).not.toMatch(EMAIL);
    expect(badges(html).map((m) => [m[1], m[2]])).toEqual([["sm", "F"], ["sm", "JL"]]);
    lint(html);
  });

  it("a note reads its author's name where the page hands names in", () => {
    const html = renderToStaticMarkup(
      h(DecisionLog, {
        dealId: "d1",
        userEmail: null,
        userId: ME,
        stageHistory: [],
        names: { [MATE]: "Jordan Lee" },
        notes: [{ at: "2026-10-01T00:00:00Z", by: "jordan.lee@firm.com", byId: MATE, text: "Noted." }],
      }),
    );
    expect(visibleText(html)).toMatch(/Noted\.\s*Oct 1, 2026\s*·\s*Jordan Lee/);
    expect(badges(html).map((m) => m[2])).toEqual(["JL"]);
  });

  it("a question on a team deal wears its asker's badge where their name is the reader's to see", () => {
    const at = "2026-09-01T00:00:00.000Z";
    const qa = parseDealQa([
      { at, q: "Mine?", answer: "…", cites: [], by: ME },
      { at, q: "Theirs?", answer: "…", cites: [], by: MATE },
      { at, q: "Unrecorded?", answer: "…", cites: [] },
    ]);
    const html = renderToStaticMarkup(
      h(AskPanel, { dealId: "d1", qa, hasOm: true, isSample: false, isPro: true, askers: { me: ME, names: { [ME]: "Fred Balls", [MATE]: "Jordan Lee" } } }),
    );
    const text = visibleText(html);
    expect(text).toMatch(/Mine\?\s*Sep 1 · asked by you/);
    expect(text).toMatch(/Theirs\?\s*Sep 1 · asked by Jordan Lee/);
    expect(badges(html).map((m) => [m[1], m[2]])).toEqual([["sm", "FB"], ["sm", "JL"]]);
    lint(html);
    // A personal deal names no one, so it draws no one.
    const solo = renderToStaticMarkup(h(AskPanel, { dealId: "d1", qa, hasOm: true, isSample: false, isPro: true, askers: null }));
    expect(badges(solo)).toEqual([]);
  });

  it("a broker on the offering card wears the same badge", () => {
    const html = renderToStaticMarkup(
      h(ListingTeam, {
        offersDue: null,
        team: [{ name: "J. R. Smith, CCIM", title: "Senior Director", firm: "CBRE", phone: "", tel: null, email: null, emailText: "", page: "" }],
      } as never),
    );
    expect(badges(html).map((m) => [m[1], m[2]])).toEqual([["md", "JS"]]);
    lint(html);
  });

  it("the team roster and the pipeline card draw it too, keyed as the others are", () => {
    const team = readFileSync("app/(app)/team/page.tsx", "utf8");
    expect(team).toContain('<PersonBadge name={memberLabel(m)} id={m.userId} size="md" decorative />');
    const tile = readFileSync("app/(app)/deals/deal-tile.tsx", "utf8");
    expect(tile).toContain('<PersonBadge name={d.addedBy} id={d.addedById} size="xs" decorative />');
    expect(tile).toContain("added by {displayName(d.addedBy)}");
    // The list row's teammate wears the same badge, keyed on the same id.
    const row = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    expect(row).toContain('<PersonBadge name={d.addedBy} id={d.addedById} size="xs" decorative />');
    expect(row).not.toMatch(/\binitials\(d\.addedBy\)/);
  });
});
