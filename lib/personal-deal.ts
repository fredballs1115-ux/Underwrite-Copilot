// A deal in the reader's own pipeline while the reader is on a team: the
// teammates do not see it (row-level security reads a deal by its creator or
// its team, and it has no team). The create actions file a member's new deal
// there once the team's trial deals are in use and no Team plan has started
// (app/(app)/deals/actions.ts `teamAllowed`, so a member with their own
// allowance is never refused), and the deals a member had before joining
// stay there. Nothing said so: the pipeline marked a teammate's deal
// ("added by") and never one of the reader's own the team could not see, and
// /team said every deal anyone uploads lands in the shared pipeline. Pure: no
// I/O and no server-only import, so the client pipeline, the batch panel and
// the deal page read one set of words.

/** The chip a personal deal wears on the pipeline's card and row. */
export const PERSONAL_CHIP = "Personal — not shared";

/** What the chip means, for its tooltip. */
export const PERSONAL_TITLE = "In your own pipeline, not your team's: your teammates don't see this deal.";

/** The query value a create action lands with (`?filed=personal`) when it
 *  filed a team member's new deal in their own pipeline. */
export const FILED_PERSONAL = "personal";

/** Where a create action lands: the deal, saying so where it was filed in the
 *  member's own pipeline. */
export function dealLanding(dealId: string, filedPersonal: boolean): string {
  return `/deals/${dealId}${filedPersonal ? `?filed=${FILED_PERSONAL}` : ""}`;
}

/** The deal page's notice for that landing, with the team's trial allowance
 *  (lib/teams TEAM_TRIAL_DEALS, which the create action counts by). */
export function filedPersonalNotice(trialDeals: number): string {
  return `This deal went into your own pipeline, not your team's: the team's ${trialDeals} trial deals were in use and it has no Team plan, so your teammates don't see it. Once the team's owner starts the Team plan, new deals go into the shared pipeline.`;
}

/** The pipeline's sharing filter: every deal, the ones in a team's pipeline,
 *  or the reader's own. */
export const SHARING_OPTIONS: [string, string][] = [
  ["all", "All deals"],
  ["shared", "Shared"],
  ["personal", "Personal"],
];

/** Whether a deal passes the sharing filter. */
export function matchesSharing(filter: string, personal: boolean): boolean {
  if (filter === "shared") return !personal;
  if (filter === "personal") return personal;
  return true;
}

// ---- Moving a deal between the reader's own pipeline and the team's ------
// (research pass 17, item 12). The deal's creator may move it either way:
// migration 0007's protect_deal_identity lets the creator change team_id,
// and its update policy checks the reader is on the team it lands in. Each
// move is counted against the cap of the pipeline it lands in — the app
// reads the allowance first (`moveDeal` in app/(app)/deals/actions.ts), and
// migration 0036's update trigger refuses one the read let through.

/** Where a move lands (`?moved=`), or which way it was asked. */
export type MoveTarget = "team" | "personal";

/** The query codes a refused move lands with (`?error=`). `moveteamwork` and
 *  `movepersonalwork` are the work rule's (`moveBlock`, below), and land with
 *  `?others=` and `?unrecorded=` naming what blocked them. */
export type MoveRefusal =
  | "moveteamlimit"
  | "movelimit"
  | "movepermission"
  | "movenoteam"
  | "moveteamwork"
  | "movepersonalwork"
  | "movefail";

const MOVE_REFUSALS: readonly MoveRefusal[] = [
  "moveteamlimit",
  "movelimit",
  "movepermission",
  "movenoteam",
  "moveteamwork",
  "movepersonalwork",
  "movefail",
];

export function isMoveRefusal(code: string | null | undefined): code is MoveRefusal {
  return !!code && (MOVE_REFUSALS as readonly string[]).includes(code);
}

/** The move a landing's `?moved=` may announce: only where the deal is where
 *  it says — in a team's pipeline for "team", in none for "personal" — so a
 *  stale tab or a pasted link never says a deal moved that did not (audit
 *  C7, L1). */
export function movedLanding(moved: string | null | undefined, dealTeamId: string | null | undefined): MoveTarget | null {
  if (moved === "team") return dealTeamId ? "team" : null;
  if (moved === "personal") return dealTeamId ? null : "personal";
  return null;
}

/** The menu item that opens the question. */
export const MOVE_ITEM: Record<MoveTarget, string> = {
  team: "Share with team",
  personal: "Make personal",
};

// ---- What a move carries (audit C7, M1) -----------------------------------
// A move takes everything on the deal with it: its tasks, its notes (the
// decision log and each tab's), its files, its Ask questions and its source
// documents. So a move is refused where it would carry someone else's work
// across a visibility boundary:
//   - into a team, where any of it is by someone who is not a member of that
//     team (a creator who left team A could otherwise take team A's notes and
//     files into team B's pipeline);
//   - out of a team, where any of it is by anyone but the creator (it would
//     hide a teammate's files and notes from the person who wrote them).
// Who added a thing is read where it is recorded: a task's creator and its
// assignee, a note's `byId` (or, on a decision-log note from before ids, its
// email), an Ask entry's `by`, a tab note's or file's `byId` (stamped since
// this rule). A source document records no uploader (deal_documents has no
// such column), and older tab notes, files and Ask entries none either: on a
// deal in no team's pipeline only its creator can write, so they count as the
// creator's; on a team's deal they may be a teammate's, so they block taking
// it out, said as "doesn't record who added it".

/** The kinds of work on a deal that move with it. */
export type MoveWork = "tasks" | "notes" | "files" | "ask" | "documents";

export const MOVE_WORK: readonly MoveWork[] = ["tasks", "notes", "files", "ask", "documents"];

const WORK_WORDS: Record<MoveWork, string> = {
  tasks: "tasks",
  notes: "notes",
  files: "files",
  ask: "Ask questions",
  documents: "source documents",
};

/** What a move would carry, as the deal's tables record it. */
export interface DealWork {
  tasks: { createdBy: string | null; assignee: string | null }[];
  /** the decision log (deals.notes) */
  logNotes: { by: string; byId?: string }[];
  /** each tab's notes (deals.supplements) */
  tabNotes: { byId?: string }[];
  /** each tab's files (deals.supplements) */
  files: { byId?: string }[];
  /** Ask's thread (deals.qa) */
  ask: { by?: string }[];
  /** source documents (deal_documents) — no uploader is recorded */
  documents: number;
}

/** What blocks a move: work by someone it may not reach, and work that
 *  doesn't record who added it. */
export interface MoveBlock {
  others: MoveWork[];
  unrecorded: MoveWork[];
}

/** Whether moving a deal `to` would carry someone else's work across the
 *  boundary, or null where it would not. `members` is the destination team's
 *  roster (the creator among them) for a move into a team. */
export function moveBlock(
  to: MoveTarget,
  work: DealWork,
  who: { creatorId: string; creatorEmail: string | null; members?: ReadonlySet<string> },
): MoveBlock | null {
  const may = (id: string) => id === who.creatorId || (to === "team" && !!who.members?.has(id));
  const others = new Set<MoveWork>();
  const unrecorded = new Set<MoveWork>();
  // An author not recorded: the creator's on a personal deal, possibly a
  // teammate's on a team's.
  const unknown = (kind: MoveWork) => {
    if (to === "personal") unrecorded.add(kind);
  };
  const byId = (kind: MoveWork, id: string | null | undefined) => {
    if (!id) unknown(kind);
    else if (!may(id)) others.add(kind);
  };

  for (const t of work.tasks) {
    byId("tasks", t.createdBy);
    if (t.assignee && !may(t.assignee)) others.add("tasks");
  }
  const creatorEmail = who.creatorEmail?.trim().toLowerCase() || null;
  for (const n of work.logNotes) {
    if (n.byId) byId("notes", n.byId);
    else if (!creatorEmail || n.by.trim().toLowerCase() !== creatorEmail) others.add("notes");
  }
  for (const n of work.tabNotes) byId("notes", n.byId);
  for (const f of work.files) byId("files", f.byId);
  for (const a of work.ask) byId("ask", a.by);
  if (work.documents > 0) unknown("documents");

  if (others.size === 0 && unrecorded.size === 0) return null;
  const inOrder = (s: Set<MoveWork>) => MOVE_WORK.filter((k) => s.has(k));
  return { others: inOrder(others), unrecorded: inOrder(unrecorded) };
}

/** A block as the refusal's query carries it (`?others=…&unrecorded=…`). */
export function moveBlockQuery(block: MoveBlock): string {
  const parts: string[] = [];
  if (block.others.length) parts.push(`others=${block.others.join(",")}`);
  if (block.unrecorded.length) parts.push(`unrecorded=${block.unrecorded.join(",")}`);
  return parts.join("&");
}

/** The block a refusal landed with, read back from its query — only the
 *  kinds this module names, so a link can say nothing else. */
export function parseMoveBlock(others: string | null | undefined, unrecorded: string | null | undefined): MoveBlock {
  const read = (raw: string | null | undefined) => {
    const asked = new Set((raw ?? "").split(","));
    return MOVE_WORK.filter((k) => asked.has(k));
  };
  return { others: read(others), unrecorded: read(unrecorded) };
}

/** "tasks, notes and files" */
function workList(kinds: readonly MoveWork[]): string {
  const words = kinds.map((k) => WORK_WORDS[k]);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The menu's question before a move — the confirm step's words, naming
 *  what goes with the deal. `inReadersTeam` false: the deal sits in the
 *  pipeline of a team the reader is no longer on, whose members are not the
 *  reader's teammates (audit C7, L2). */
export function moveQuestion(to: MoveTarget, teamName: string | null, inReadersTeam = true): string {
  if (to === "personal" && !inReadersTeam) {
    return "Take this deal out of the team pipeline it is in, with its tasks, notes, files and Ask questions? That team’s members stop seeing all of it.";
  }
  const team = teamName ? `${teamName}’s pipeline` : "your team’s pipeline";
  return to === "team"
    ? `Move this deal into ${team}, with its tasks, notes, files and Ask questions? Every member of the team can then see and edit them. You can make it personal again from this menu.`
    : `Take this deal out of ${team}, with its tasks, notes, files and Ask questions? Your teammates stop seeing all of it.`;
}

/** The notice a move lands with, or a refusal's words. The caps are handed
 *  in (lib/teams' TEAM_TRIAL_DEALS is server-only; lib/marketing-constants'
 *  FREE_DEALS) so this module stays pure. */
export function moveNotice(
  outcome:
    | { moved: MoveTarget; teamName: string | null }
    | { refused: MoveRefusal; block?: MoveBlock; teamName?: string | null },
  caps: { trialDeals: number; freeDeals: number },
): { tone: "ok" | "caution"; text: string } {
  if ("moved" in outcome) {
    const team = outcome.teamName ? `${outcome.teamName}’s pipeline` : "your team’s pipeline";
    return outcome.moved === "team"
      ? { tone: "ok", text: `This deal is in ${team} now: your teammates see it and can edit it.` }
      : { tone: "ok", text: "This deal is in your own pipeline now: your teammates no longer see it." };
  }
  switch (outcome.refused) {
    case "moveteamlimit":
      return {
        tone: "caution",
        text: `The team’s ${caps.trialDeals} trial deals are in use, and it has no Team plan — this deal stays in your own pipeline. Once the team’s owner starts the Team plan, it can be shared.`,
      };
    case "movelimit":
      return {
        tone: "caution",
        text: `Your free plan holds ${caps.freeDeals} deals of your own, and they are in use — this deal stays in your team’s pipeline. Upgrade to Pro to keep more deals of your own.`,
      };
    case "movepermission":
      return { tone: "caution", text: "Only the deal’s creator can move it between their own pipeline and the team’s. Nothing changed." };
    case "movenoteam":
      return { tone: "caution", text: "You’re not on a team, so there is no team pipeline to share this deal into. Nothing changed." };
    case "moveteamwork": {
      const team = outcome.teamName ? outcome.teamName : "your team";
      const kinds = outcome.block?.others.length ? workList(outcome.block.others) : "work";
      return {
        tone: "caution",
        text: `This deal stays in your own pipeline: its ${kinds} include work by someone who isn’t on ${team}, and sharing it would show that work to the team. Nothing changed.`,
      };
    }
    case "movepersonalwork": {
      const team = outcome.teamName ? `${outcome.teamName}’s pipeline` : "the team’s pipeline";
      const parts: string[] = [];
      if (outcome.block?.others.length) parts.push(`its ${workList(outcome.block.others)} include work by someone other than you`);
      if (outcome.block?.unrecorded.length) {
        parts.push(`its ${workList(outcome.block.unrecorded)} don’t record who added them, so they may be a teammate’s`);
      }
      const why = parts.length ? parts.join(", and ") : "it holds work by someone other than you";
      return {
        tone: "caution",
        text: `This deal stays in ${team}. ${why.charAt(0).toUpperCase()}${why.slice(1)} — taking it out would hide that work from the people who added it. Nothing changed.`,
      };
    }
    case "movefail":
      return { tone: "caution", text: "Couldn’t move the deal just now — nothing changed. Try again in a moment." };
  }
}
