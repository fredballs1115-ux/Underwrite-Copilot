"use client";

import { useFormStatus } from "react-dom";
import type { DealNote } from "@/lib/deals";
import { STAGE_LABEL, type StageChange } from "@/lib/stages";
import { outcomeWords } from "@/lib/deal-outcome";
import { addDealNote, deleteDealNote } from "../actions";
import { displayName } from "@/lib/person";
import { mayRemoveNote } from "@/lib/note-remove";
import { PersonBadge } from "../../person-badge";
import { EMPTY_GLYPH, EmptyNote } from "@/app/empty-pictures";
import { Key, KeyItem } from "@/app/panel-parts";
import { spanDaysWords, stageTimeline, type StageSpan } from "@/lib/stage-days";

// Module-level cached formatter (creating one per render is measurable).
// UTC-pinned, date-only: the server and the browser must render the SAME
// string or React logs a hydration mismatch on every deal with a note. The
// year in full: a log runs across New Year, and "Aug 26" reads as the 26th.
const WHEN_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
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
      className="shrink-0 self-end rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60 sm:self-auto"
    >
      {pending ? "Saving…" : "Add note"}
    </button>
  );
}

/** A UTC ISO day as the log prints its dates. */
const dayWords = (iso: string) => safeWhen(`${iso}T12:00:00Z`);

/**
 * A span's tone, the pipeline funnel's own (one hue, brand): the stage the
 * deal is in is the funnel's picked rung, solid; a stage it passed through
 * the funnel's lit rung, the tint ringed; Dead, which the funnel leaves out,
 * its hollow rung.
 */
function spanTone(s: StageSpan): string {
  if (s.stage === "dead") return "bg-surface ring-1 ring-inset ring-line";
  return s.current ? "bg-brand" : "bg-brand/10 ring-1 ring-inset ring-brand/40";
}

/**
 * The stage moves as one picture: a bar a stage, each as long as the days
 * the deal sat in it, oldest first, and under it each stage's days in
 * words. The log below keeps every move with its date and what became of
 * the deal; this says how long, which the list cannot. Nothing is drawn
 * without a recorded move to measure from.
 */
function StageDays({ history, today }: { history: StageChange[]; today: string | null }) {
  const { spans, end } = stageTimeline(history, today);
  if (spans.length === 0) return null;
  const total = spans.reduce((n, s) => n + s.days, 0);
  return (
    <div className="mt-3" data-qa="stage-days">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Days in each stage</p>
      <div aria-hidden className="mt-1.5 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {spans.map((s, i) => (
          <span
            key={`${s.from}-${i}`}
            data-bar="stage-days"
            title={`${s.label}: ${spanDaysWords(s)}, ${dayWords(s.from)} to ${dayWords(s.to)}`}
            className={`block h-full min-w-1.5 ${spanTone(s)}`}
            // A stage a day or less still shows as a sliver.
            style={{ flexGrow: total > 0 ? Math.max(s.days, total / 100) : 1, flexBasis: 0 }}
          />
        ))}
      </div>
      <Key stack>
        {spans.map((s, i) => (
          <KeyItem key={`${s.from}-${i}`} mark="swatch" tone={spanTone(s)}>
            <span>
              <span className="font-medium text-ink">{s.label}</span>
              {`, ${spanDaysWords(s)} — from ${dayWords(s.from)}`}
            </span>
          </KeyItem>
        ))}
        {end && (
          <KeyItem>
            <span>
              <span className="font-medium text-ink">{end.label}</span>
              {` on ${dayWords(end.on)}`}
            </span>
          </KeyItem>
        )}
      </Key>
    </div>
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
  names = null,
  isSample = false,
  today = null,
}: {
  dealId: string;
  /** the reader's day (ISO), which the stage the deal is in counts its
   *  days to; without it that stage is left off the timeline */
  today?: string | null;
  /** the sample deal, whose own seeded note its reader may remove
   *  (lib/note-remove, the delete action's rule too) */
  isSample?: boolean;
  notes: DealNote[];
  stageHistory: StageChange[];
  userEmail: string | null;
  userId: string | null;
  /** a team deal's teammates by user id, named as Ask's askers are (the
   *  name each set, else their email's local part); where it is not
   *  handed in, a teammate's note reads its author's email's local part;
   *  also who reported a trade, by account */
  names?: Record<string, string> | null;
}) {
  const entries: Entry[] = [
    ...notes.map((note): Entry => ({ kind: "note", at: note.at, note })),
    ...stageHistory.map((stage): Entry => ({ kind: "stage", at: stage.at, stage })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const mine = (n: DealNote) =>
    n.byId ? n.byId === userId : !!userEmail && n.by === userEmail;
  // Who wrote a note: the reader as "you", a teammate by name, and an
  // author no name is known for by their email's local part — a note
  // stores the address it was written under, never printed whole.
  const authorOf = (n: DealNote): string =>
    mine(n) ? "you" : (n.byId && names?.[n.byId]) || displayName(n.by) || "a teammate";

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Decision log</h2>
      <p className="mt-0.5 text-xs text-muted">Notes and stage moves, newest first.</p>
      <StageDays history={stageHistory} today={today} />

      <form action={addDealNote} className="mt-3">
        {/* On a phone the note box takes the card's whole width, the button
            under it, so its two rows hold the placeholder whole; beside the
            button it was cut off at its third line. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <input type="hidden" name="dealId" value={dealId} />
          <textarea
            name="text"
            required
            maxLength={500}
            rows={2}
            aria-label="New decision note"
            placeholder="e.g. Passed at $68M — revisit if they come back under $63M."
            className="w-full min-w-0 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 sm:flex-1"
          />
          <SaveButton />
        </div>
      </form>

      {entries.length === 0 ? (
        <EmptyNote icon={EMPTY_GLYPH.log} className="mt-4">
          Nothing logged yet.
        </EmptyNote>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3">
              {/* A note wears its author's badge; a stage move, which no
                  one is recorded as making, keeps the timeline's hollow
                  dot, centred in the badge's column so the words align. */}
              {e.kind === "note" ? (
                <PersonBadge
                  name={(e.note.byId && names?.[e.note.byId]) || e.note.by}
                  id={e.note.byId || e.note.by}
                  size="sm"
                  decorative
                />
              ) : (
                <span aria-hidden className="flex w-6 shrink-0 justify-center pt-1.5">
                  <span className="h-2 w-2 rounded-full border border-brand/50 bg-surface" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                {e.kind === "note" ? (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {e.note.text}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{safeWhen(e.at)}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{authorOf(e.note)}</span>
                      {mayRemoveNote(e.note, { userId, userEmail }, isSample) && (
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
                    {/* What became of the deal, on the move that ended it
                        (research pass 24, B4). */}
                    {e.stage.outcome ? (
                      <span className="mt-0.5 block text-xs text-ink">{outcomeWords(e.stage.outcome, names)}</span>
                    ) : null}
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
