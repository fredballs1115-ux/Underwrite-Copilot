"use client";

import { useFormStatus } from "react-dom";
import type { DealNote } from "@/lib/deals";
import { STAGE_LABEL, type StageChange } from "@/lib/stages";
import { addDealNote, deleteDealNote } from "../actions";

// Module-level cached formatter (creating one per render is measurable).
// UTC-pinned, date-only: the server and the browser must render the SAME
// string or React logs a hydration mismatch on every deal with a note.
const WHEN_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const safeWhen = (at: string) => {
  const d = new Date(at);
  return isNaN(d.getTime()) ? "" : WHEN_FMT.format(d);
};

type Entry =
  | { kind: "note"; at: string; note: DealNote }
  | { kind: "stage"; at: string; stage: StageChange };

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

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Saving…" : "Add note"}
    </button>
  );
}

/**
 * The decision log: the analyst's notes and the deal's stage moves in one
 * timeline, newest first. This is the deal's memory — "passed at $68M,
 * revisit under $63M" survives the three weeks until the retrade call.
 */
export function DecisionLog({
  dealId,
  notes,
  stageHistory,
  userEmail,
  userId,
}: {
  dealId: string;
  notes: DealNote[];
  stageHistory: StageChange[];
  userEmail: string | null;
  userId: string | null;
}) {
  const entries: Entry[] = [
    ...notes.map((note): Entry => ({ kind: "note", at: note.at, note })),
    ...stageHistory.map((stage): Entry => ({ kind: "stage", at: stage.at, stage })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const mine = (n: DealNote) =>
    n.byId ? n.byId === userId : !!userEmail && n.by === userEmail;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Decision log</h2>
      <p className="mt-0.5 text-xs text-muted">
        Notes and stage moves, newest first — the deal’s memory for the next
        call.
      </p>

      <form action={addDealNote} className="mt-3">
        <div className="flex items-start gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <textarea
            name="text"
            required
            maxLength={500}
            rows={2}
            placeholder="e.g. Passed at $68M — revisit if they come back under $63M."
            className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <SaveButton />
        </div>
        <p className="mt-1 text-[11px] text-muted">Up to 500 characters.</p>
      </form>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing logged yet — the first note usually saves a future you an
          hour.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  e.kind === "note" ? "bg-brand" : "border border-brand/50 bg-surface"
                }`}
              />
              <div className="min-w-0 flex-1">
                {e.kind === "note" ? (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {e.note.text}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{safeWhen(e.at)}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{e.note.by}</span>
                      {mine(e.note) && (
                        <form action={deleteDealNote} className="inline">
                          <input type="hidden" name="dealId" value={dealId} />
                          <input type="hidden" name="at" value={e.at} />
                          <RemoveButton />
                        </form>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Stage →{" "}
                    <span className="font-medium text-ink">
                      {STAGE_LABEL[e.stage.stage] ?? e.stage.stage}
                    </span>
                    <span className="ml-2 text-xs">{safeWhen(e.at)}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
