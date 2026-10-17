/**
 * Moving a deal between the reader's own pipeline and the team's (`moveDeal`
 * in app/(app)/deals/actions.ts, words in lib/personal-deal), driven over a
 * fake database that answers as row-level security would:
 *
 *   - only the deal's creator moves it, and never the sample;
 *   - a move into the team is refused, in plain words, where the team's
 *     trial is spent — by the app's own read, and by migration 0036's
 *     trigger where the read let it through;
 *   - a move out is counted against the reader's own free cap the same way;
 *   - a move that lands writes only team_id (and the touch), and says so;
 *   - a move that would carry someone else's work — tasks, notes, files, Ask
 *     questions, source documents — across the boundary is refused, naming
 *     what blocks it (audit C7, M1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Billing } from "@/lib/billing";

const DEAL = "22222222-2222-4222-8222-222222222222";
const CREATOR = "11111111-1111-4111-8111-111111111111";
const TEAM = "team-1";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: vi.fn(), runRecordComps: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  claimJob: vi.fn(),
  releaseClaim: vi.fn(),
  analysisWorkerEnabled: () => false,
  workerSchemaReady: vi.fn(async () => false),
  newJobRow: vi.fn(() => ({})),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({ runAnalysis: vi.fn(), runReconciliation: vi.fn() }));

const billing: { value: Billing } = { value: null as unknown as Billing };
vi.mock("@/lib/billing", () => ({ getBilling: vi.fn(async () => billing.value), isPro: async () => false }));

type Row = Record<string, unknown>;
const db = {
  caller: CREATOR,
  deal: {} as Row,
  updates: [] as Row[],
  /** the error the update answers with — 0036's trigger's refusal */
  updateError: null as { message: string } | null,
  /** rows the update matched (RLS) */
  updateMatches: 1,
  tasks: [] as Row[],
  documents: [] as Row[],
  roster: [] as Row[],
  /** a table whose read fails */
  failRead: null as string | null,
};

vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: db.caller, email: "creator@example.com" } } }) },
    from(table: string) {
      const q = {
        _op: "select" as "select" | "update",
        select: () => q,
        eq: () => q,
        maybeSingle: () => q,
        update: (patch: Row) => {
          q._op = "update";
          db.updates.push(patch);
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (q._op === "update") {
            const data = db.updateError ? null : Array.from({ length: db.updateMatches }, () => ({ id: DEAL }));
            return Promise.resolve({ data, error: db.updateError }).then(resolve);
          }
          if (table === db.failRead) return Promise.resolve({ data: null, error: { message: "down" } }).then(resolve);
          if (table === "deals") return Promise.resolve({ data: db.deal, error: null }).then(resolve);
          if (table === "deal_tasks") return Promise.resolve({ data: db.tasks, error: null }).then(resolve);
          if (table === "deal_documents") return Promise.resolve({ data: db.documents, error: null }).then(resolve);
          if (table === "team_members") return Promise.resolve({ data: db.roster, error: null }).then(resolve);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client, getCurrentUser: async () => ({ id: db.caller }) };
});

import { moveDeal } from "@/app/(app)/deals/actions";
import {
  filedPersonalNotice,
  isMoveRefusal,
  MOVE_ITEM,
  movedLanding,
  moveBlock,
  moveBlockQuery,
  moveNotice,
  moveQuestion,
  parseMoveBlock,
  type DealWork,
} from "@/lib/personal-deal";

function bill(over: Partial<Billing> = {}, team: Billing["team"] = { id: TEAM, name: "Acme", active: false, dealCount: 1 }): Billing {
  return {
    plan: "free",
    isPro: false,
    status: null,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    dealCount: 1,
    dealLimit: 3,
    canCreateDeal: true,
    team,
    ...over,
  };
}

async function landing(to: string): Promise<string> {
  const fd = new FormData();
  fd.set("dealId", DEAL);
  fd.set("to", to);
  try {
    await moveDeal(fd);
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  return "(no redirect)";
}

beforeEach(() => {
  db.caller = CREATOR;
  db.deal = { id: DEAL, user_id: CREATOR, team_id: null, is_sample: false };
  db.updates.length = 0;
  db.updateError = null;
  db.updateMatches = 1;
  db.tasks = [];
  db.documents = [];
  db.roster = [{ user_id: CREATOR }, { user_id: MEMBER }];
  db.failRead = null;
  billing.value = bill();
});

describe("moveDeal — Share with team", () => {
  it("moves the creator's personal deal onto their team and says so", async () => {
    expect(await landing("team")).toBe(`/deals/${DEAL}?moved=team`);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].team_id).toBe(TEAM);
    expect(Object.keys(db.updates[0]).sort()).toEqual(["team_id", "updated_at"]);
  });

  it("refuses where the team's trial is spent, before any write", async () => {
    billing.value = bill({}, { id: TEAM, name: "Acme", active: false, dealCount: 3 });
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=moveteamlimit`);
    expect(db.updates).toEqual([]);
  });

  it("an active Team plan has no cap", async () => {
    billing.value = bill({}, { id: TEAM, name: "Acme", active: true, dealCount: 40 });
    expect(await landing("team")).toBe(`/deals/${DEAL}?moved=team`);
  });

  it("the database's own cap refusal (0036's trigger) reads as the team's limit", async () => {
    db.updateError = { message: 'new row violates: team_plan_required' };
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=moveteamlimit`);
  });

  it("a write that matched nothing is a failure, never a move", async () => {
    db.updateMatches = 0;
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movefail`);
  });

  it("a reader on no team has no team pipeline to share into", async () => {
    billing.value = bill({}, null);
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movenoteam`);
    expect(db.updates).toEqual([]);
  });

  it("a teammate is refused — the creator's alone", async () => {
    db.caller = "teammate";
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movepermission`);
    expect(db.updates).toEqual([]);
  });

  it("the sample stays where it is", async () => {
    db.deal = { ...db.deal, is_sample: true };
    expect(await landing("team")).toBe(`/deals/${DEAL}`);
    expect(db.updates).toEqual([]);
  });

  it("a deal already on the team is left alone", async () => {
    db.deal = { ...db.deal, team_id: TEAM };
    expect(await landing("team")).toBe(`/deals/${DEAL}`);
    expect(db.updates).toEqual([]);
  });
});

describe("moveDeal — the deal's id (audit C7, L13)", () => {
  it("refuses anything but a uuid before any read or write", async () => {
    for (const id of ["", "not-a-uuid", "../../evil", `${DEAL}?moved=team`, `${DEAL}/x`]) {
      const fd = new FormData();
      fd.set("dealId", id);
      fd.set("to", "team");
      let to = "(no redirect)";
      try {
        await moveDeal(fd);
      } catch (e) {
        if (e instanceof Redirect) to = e.to;
        else throw e;
      }
      expect(to, id).toBe("/deals");
    }
    expect(db.updates).toEqual([]);
  });
});

describe("moveDeal — Make personal", () => {
  beforeEach(() => {
    db.deal = { ...db.deal, team_id: TEAM };
  });

  it("takes the creator's team deal into their own pipeline", async () => {
    expect(await landing("personal")).toBe(`/deals/${DEAL}?moved=personal`);
    expect(db.updates[0].team_id).toBeNull();
  });

  it("refuses where the reader's own free deals are in use", async () => {
    billing.value = bill({ dealCount: 3 });
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movelimit`);
    expect(db.updates).toEqual([]);
  });

  it("a personal Pro plan has no cap, and the trigger's refusal still reads as the limit", async () => {
    billing.value = bill({ plan: "pro", dealCount: 30 });
    expect(await landing("personal")).toBe(`/deals/${DEAL}?moved=personal`);
    db.updateError = { message: "free_deal_limit_reached" };
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movelimit`);
  });
});

describe("moveDeal — someone else's work stays where its author can see it", () => {
  it("shares a deal whose work is the creator's and the destination team's members'", async () => {
    db.tasks = [{ created_by: CREATOR, assignee_user_id: MEMBER }];
    db.documents = [{ id: "d1" }];
    db.deal = {
      ...db.deal,
      notes: [{ at: "2026-10-01T00:00:00Z", by: "creator@example.com", byId: CREATOR, text: "n" }],
      qa: [{ at: "2026-10-01T00:00:00Z", q: "q", answer: "a", cites: [], by: CREATOR }],
      supplements: { terms: { notes: [{ id: "n1", text: "t", createdAt: "x" }], files: [] } },
    };
    expect(await landing("team")).toBe(`/deals/${DEAL}?moved=team`);
  });

  it("refuses to share a deal holding work by someone outside the team, naming what", async () => {
    db.tasks = [{ created_by: OUTSIDER, assignee_user_id: null }];
    db.deal = {
      ...db.deal,
      qa: [{ at: "2026-10-01T00:00:00Z", q: "q", answer: "a", cites: [], by: OUTSIDER }],
      supplements: {
        comps: { notes: [], files: [{ id: "f1", name: "x.pdf", path: "p", createdAt: "x", byId: OUTSIDER }] },
      },
    };
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=moveteamwork&others=tasks,files,ask`);
    expect(db.updates).toEqual([]);
  });

  it("refuses to make personal a team deal holding a teammate's work", async () => {
    db.deal = {
      ...db.deal,
      team_id: TEAM,
      notes: [{ at: "2026-10-01T00:00:00Z", by: "mate@example.com", byId: MEMBER, text: "n" }],
    };
    db.tasks = [{ created_by: CREATOR, assignee_user_id: MEMBER }];
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movepersonalwork&others=tasks,notes`);
    expect(db.updates).toEqual([]);
  });

  it("counts work that records no author as possibly a teammate's when leaving a team", async () => {
    db.deal = { ...db.deal, team_id: TEAM };
    db.documents = [{ id: "d1" }];
    expect(await landing("personal")).toBe(`/deals/${DEAL}?error=movepersonalwork&unrecorded=documents`);
    expect(db.updates).toEqual([]);
  });

  it("a read that fails refuses rather than moves blind", async () => {
    db.failRead = "deal_tasks";
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movefail`);
    db.failRead = "team_members";
    expect(await landing("team")).toBe(`/deals/${DEAL}?error=movefail`);
    expect(db.updates).toEqual([]);
  });
});

describe("moveBlock (lib/personal-deal)", () => {
  const none: DealWork = { tasks: [], logNotes: [], tabNotes: [], files: [], ask: [], documents: 0 };
  const who = { creatorId: CREATOR, creatorEmail: "creator@example.com", members: new Set([CREATOR, MEMBER]) };

  it("an empty deal moves either way", () => {
    expect(moveBlock("team", none, who)).toBeNull();
    expect(moveBlock("personal", none, who)).toBeNull();
  });

  it("into a team: members may have added work; work with no author is the creator's", () => {
    const work: DealWork = {
      ...none,
      tasks: [{ createdBy: MEMBER, assignee: null }],
      tabNotes: [{}],
      documents: 2,
      ask: [{}],
    };
    expect(moveBlock("team", work, who)).toBeNull();
    expect(moveBlock("team", { ...none, ask: [{ by: OUTSIDER }] }, who)).toEqual({ others: ["ask"], unrecorded: [] });
  });

  it("out of a team: only the creator's work moves, and unrecorded work blocks", () => {
    const work: DealWork = { ...none, tasks: [{ createdBy: MEMBER, assignee: null }], files: [{}], documents: 1 };
    expect(moveBlock("personal", work, who)).toEqual({ others: ["tasks"], unrecorded: ["files", "documents"] });
  });

  it("a task assigned outside the destination blocks too", () => {
    expect(moveBlock("team", { ...none, tasks: [{ createdBy: CREATOR, assignee: OUTSIDER }] }, who)).toEqual({
      others: ["tasks"],
      unrecorded: [],
    });
  });

  it("an old decision-log note is the creator's only by the creator's own email", () => {
    expect(moveBlock("personal", { ...none, logNotes: [{ by: "Creator@Example.com" }] }, who)).toBeNull();
    expect(moveBlock("personal", { ...none, logNotes: [{ by: "mate@example.com" }] }, who)).toEqual({
      others: ["notes"],
      unrecorded: [],
    });
  });

  it("the query round-trips, and reads only the kinds it names", () => {
    const q = new URLSearchParams(moveBlockQuery({ others: ["tasks", "ask"], unrecorded: ["documents"] }));
    expect(parseMoveBlock(q.get("others"), q.get("unrecorded"))).toEqual({
      others: ["tasks", "ask"],
      unrecorded: ["documents"],
    });
    expect(parseMoveBlock("tasks,<script>,secrets", null)).toEqual({ others: ["tasks"], unrecorded: [] });
  });
});

describe("the words (lib/personal-deal)", () => {
  const caps = { trialDeals: 3, freeDeals: 3 };
  it("says the team's cap in plain words", () => {
    const n = moveNotice({ refused: "moveteamlimit" }, caps);
    expect(n.tone).toBe("caution");
    // the words filedPersonalNotice uses for the same allowance (audit C7, L3)
    expect(n.text).toMatch(/^The team’s 3 trial deals are in use/);
    expect(n.text).not.toMatch(/free plan/);
    expect(filedPersonalNotice(3)).toMatch(/the team.s 3 trial deals/);
    expect(moveNotice({ refused: "movelimit" }, caps).text).toMatch(/^Your free plan holds 3 deals of your own/);
  });
  it("names the team where it is known, and says what a move changes", () => {
    expect(moveNotice({ moved: "team", teamName: "Acme" }, caps).text).toContain("Acme’s pipeline");
    expect(moveQuestion("team", null)).toContain("your team’s pipeline");
    expect(moveQuestion("personal", "Acme")).toContain("Your teammates stop seeing all of it");
    expect(MOVE_ITEM.team).toBe("Share with team");
  });
  it("a deal in a team the reader has left is not said to be the reader's teammates' (audit C7, L2)", () => {
    const q = moveQuestion("personal", null, false);
    expect(q).toBe(
      "Take this deal out of the team pipeline it is in, with its tasks, notes, files and Ask questions? That team’s members stop seeing all of it.",
    );
    expect(q).not.toMatch(/your team|teammates/i);
    expect(moveQuestion("personal", "Acme", true)).toContain("Acme’s pipeline");
  });
  it("the confirm question names what moves with the deal", () => {
    for (const to of ["team", "personal"] as const) {
      expect(moveQuestion(to, "Acme")).toContain("tasks, notes, files and Ask questions");
    }
  });
  it("a refusal for someone else's work names what blocks it", () => {
    const team = moveNotice(
      { refused: "moveteamwork", teamName: "Acme", block: { others: ["tasks", "files", "ask"], unrecorded: [] } },
      caps,
    );
    expect(team.tone).toBe("caution");
    expect(team.text).toBe(
      "This deal stays in your own pipeline: its tasks, files and Ask questions include work by someone who isn’t on Acme, and sharing it would show that work to the team. Nothing changed.",
    );
    const personal = moveNotice(
      { refused: "movepersonalwork", teamName: "Acme", block: { others: ["notes"], unrecorded: ["documents"] } },
      caps,
    );
    expect(personal.text).toBe(
      "This deal stays in Acme’s pipeline. Its notes include work by someone other than you, and its source documents don’t record who added them, so they may be a teammate’s — taking it out would hide that work from the people who added it. Nothing changed.",
    );
    expect(isMoveRefusal("moveteamwork")).toBe(true);
    expect(isMoveRefusal("movepersonalwork")).toBe(true);
  });
  it("a landing says a move only while the deal is where it says (audit C7, L1)", () => {
    expect(movedLanding("team", TEAM)).toBe("team");
    expect(movedLanding("team", null)).toBeNull();
    expect(movedLanding("personal", null)).toBe("personal");
    expect(movedLanding("personal", TEAM)).toBeNull();
    expect(movedLanding("elsewhere", null)).toBeNull();
    expect(movedLanding(undefined, TEAM)).toBeNull();
  });
  it("knows its own codes and no other", () => {
    expect(isMoveRefusal("movelimit")).toBe(true);
    expect(isMoveRefusal("deletepermission")).toBe(false);
    expect(isMoveRefusal(undefined)).toBe(false);
  });
});
