/**
 * The batch upload's run (app/(app)/deals/batch-upload.tsx), pure: each file
 * sent one at a time through an injectable `send`, what each answer makes of
 * its row, and what the panel offers after. A plan's deal limit stops the
 * rest of the batch, and those rows are "capped": the panel's button then
 * read "Retry failed uploads", which could only fail the same way until the
 * plan changed, and the limit's words carried no way to the plan (research
 * pass 30). A capped row is never sent again by the button; the panel says
 * the limit once, with a link to the plan.
 */
import { MAX_OM_PAGES } from "@/lib/pdf";

/** The create action's answer, as the batch reads it (actions.ts
 *  `CreateDealResult`). */
export type BatchResult =
  | { ok: true; dealId: string; deduped?: boolean; personal?: boolean }
  | { ok: false; error: string };

export type BatchStatus =
  | { kind: "ready" }
  | { kind: "uploading" }
  // personal: filed in the member's own pipeline, which the team does not
  // see (lib/personal-deal).
  | { kind: "queued"; dealId: string; deduped: boolean; personal: boolean }
  /** failed for a reason another try may fix, or the file's own */
  | { kind: "error"; message: string }
  /** stopped by the plan's deal limit — this one, or the rest after it */
  | { kind: "capped"; message: string; plan: "limit" | "teamlimit" };

export const BATCH_ERROR_COPY: Record<string, string> = {
  name: "Needs a deal name.",
  auth: "Signed out — sign in and retry.",
  file: "The file didn't arrive — try again.",
  empty: "The file is empty (0 bytes) — download or export it again.",
  pdf: "Not a valid PDF.",
  size: "Over the 32 MB limit.",
  locked: "Needs a password to open — upload an unlocked copy.",
  pages: `Over ${MAX_OM_PAGES} pages — upload the financial sections.`,
  save: "Couldn't save the deal — try again.",
  upload: "Upload failed — try again.",
};

const CAPPED_COPY: Record<"limit" | "teamlimit", string> = {
  limit: "Plan limit reached — this one wasn't uploaded.",
  teamlimit: "Team plan limit reached — this one wasn't uploaded.",
};

/** What the run makes of one answer. */
export function statusOf(result: BatchResult): BatchStatus {
  if (result.ok) {
    return { kind: "queued", dealId: result.dealId, deduped: !!result.deduped, personal: !!result.personal };
  }
  if (result.error === "limit" || result.error === "teamlimit") {
    return { kind: "capped", message: CAPPED_COPY[result.error], plan: result.error };
  }
  return { kind: "error", message: BATCH_ERROR_COPY[result.error] ?? "Something went wrong." };
}

/** Whether the panel's button sends this row: one not yet sent, or one that
 *  failed for a reason another try may fix — never one the plan's limit
 *  stopped, nor one already queued. */
export function sendable(status: BatchStatus): boolean {
  return status.kind === "ready" || status.kind === "error";
}

/**
 * Send the rows one at a time — one small request at a time, and a plan's
 * limit stops the rest instead of half-failing in parallel. `onStatus` is
 * told each row's status as it changes; the final statuses are returned.
 */
export async function runBatch<T extends { status: BatchStatus }>(
  items: readonly T[],
  send: (item: T, index: number) => Promise<BatchResult>,
  onStatus: (index: number, status: BatchStatus) => void = () => {},
): Promise<BatchStatus[]> {
  const out = items.map((it) => it.status);
  let cap: "limit" | "teamlimit" | null = null;
  for (let i = 0; i < items.length; i++) {
    if (!sendable(out[i])) continue;
    if (cap) {
      out[i] = { kind: "capped", message: "Skipped — plan limit reached.", plan: cap };
      onStatus(i, out[i]);
      continue;
    }
    onStatus(i, { kind: "uploading" });
    try {
      out[i] = statusOf(await send(items[i], i));
      if (out[i].kind === "capped") cap = (out[i] as { plan: "limit" | "teamlimit" }).plan;
    } catch {
      // No answer came back: the connection dropped or the server failed
      // first, so the deal may exist — a retry after 15 seconds would make
      // a twin (the create action merges a repeat only inside that window).
      out[i] = { kind: "error", message: "No answer came back — it may have been created. Check the pipeline before retrying." };
    }
    onStatus(i, out[i]);
  }
  return out;
}

/** The panel's button after a run: what it sends, said; null where it has
 *  nothing to send (every row queued, or stopped by the plan). */
export function runLabel(statuses: readonly BatchStatus[], running: boolean, finished: boolean): string | null {
  if (running) return "Uploading — keep this tab open…";
  const toSend = statuses.filter(sendable).length;
  if (toSend === 0) return null;
  if (finished && statuses.some((s) => s.kind === "error")) return "Retry failed uploads";
  return `Screen ${toSend} deal${toSend === 1 ? "" : "s"}`;
}

/** The plan's limit, said once under the rows it stopped, with where to
 *  change the plan; null where none was stopped. */
export function capNotice(statuses: readonly BatchStatus[]): { text: string; link: string; href: string } | null {
  const capped = statuses.filter((s): s is Extract<BatchStatus, { kind: "capped" }> => s.kind === "capped");
  if (capped.length === 0) return null;
  const n = capped.length;
  const lead = `${n} ${n === 1 ? "OM wasn't" : "OMs weren't"} uploaded`;
  return capped.some((s) => s.plan === "teamlimit")
    ? {
        text: `${lead} — your team's trial deals and your personal free deals are all in use.`,
        link: "Start the Team plan or upgrade to Pro →",
        href: "/billing",
      }
    : { text: `${lead} — you've reached the Free plan's deal limit.`, link: "Upgrade to Pro for unlimited deals →", href: "/billing" };
}
