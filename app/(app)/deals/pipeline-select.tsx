"use client";

// The pipeline's select mode: a checkbox on every card, row and board card,
// and a bar that moves the deals picked to a stage, or marks them dead, in
// one change (`bulkSetStage`, which the pipeline hands in — this module
// imports no server action, so the card can draw its checkbox through
// `selectBoxFor` without loading one). Beside Compare, never in its place:
// the two are separate modes and the pipeline keeps one on at a time.
import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmSubmit } from "../team/team-client";
import { BULK_STAGE_MAX, bulkStageSentence, type BulkStageResult } from "@/lib/bulk-stage";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/stages";

/** What the cards and rows are told while select mode is on. The sample
 *  deal (`isSample`) draws no box: no change moves it. */
export type SelectBoxRender = (
  d: { id: string; name: string; isSample?: boolean },
  checked: boolean,
  onToggle: (id: string) => void,
) => ReactNode;

/**
 * A deal's checkbox: a real input with a label naming the deal ("Select
 * The Maddox"), outside the card's link — a control inside an anchor is
 * invalid. `word` shows "Select" beside it where there is room (a card's
 * foot, a board card's); a list row's says it to a screen reader alone.
 * The focus ring is the page's own (globals.css), drawn round the input.
 */
export function SelectBox({
  id,
  name,
  checked,
  onToggle,
  word = false,
}: {
  id: string;
  name: string;
  checked: boolean;
  onToggle: (id: string) => void;
  word?: boolean;
}) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink">
      <input
        type="checkbox"
        data-keys-pass
        data-select-deal={id}
        checked={checked}
        onChange={() => onToggle(id)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
      />
      {word ? <span aria-hidden>Select</span> : null}
      <span className="sr-only">{`Select ${name}`}</span>
    </label>
  );
}

/** The checkbox as the card and the board card draw it, at their foot: one
 *  function for the life of the page, so a memoized card re-renders only
 *  when its own box is ticked. None on the sample deal, which no change
 *  moves (the action refuses it). */
export const selectBoxFor: SelectBoxRender = (d, checked, onToggle) =>
  d.isSample ? null : <SelectBox id={d.id} name={d.name} checked={checked} onToggle={onToggle} word />;

/** Select mode's state: on or off, the deals picked (`BULK_STAGE_MAX` at
 *  most), and the way out — which hands the focus back to the Select button
 *  where it sat on a checkbox or in the bar, since both go with the mode. */
export function useSelectMode(initial: { picked: readonly string[] } | null = null) {
  const [on, setOn] = useState(!!initial);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initial?.picked.slice(0, BULK_STAGE_MAX)));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < BULK_STAGE_MAX) next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setPicked(new Set()), []);
  /** Unpick these deals (a change settled them), the rest kept. */
  const drop = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids.map((id) => id.toLowerCase()));
    setPicked((prev) => new Set([...prev].filter((id) => !gone.has(id.toLowerCase()))));
  }, []);
  const leave = useCallback(() => {
    setOn(false);
    setPicked(new Set());
    const at = typeof document === "undefined" ? null : document.activeElement;
    if (at instanceof HTMLElement && at.closest("[data-select-deal],[data-select-bar]")) buttonRef.current?.focus();
  }, []);
  const enter = useCallback(() => setOn(true), []);
  return { on, picked, toggle, clear, drop, leave, enter, buttonRef };
}

/** The header's Select button, beside Compare: "Done" while the mode is on. */
export function SelectModeButton({
  on,
  onClick,
  buttonRef,
}: {
  on: boolean;
  onClick: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-qa="select-mode"
      className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
        on ? "border-brand bg-brand/5 text-brand" : "border-line bg-surface hover:bg-faint"
      }`}
    >
      {on ? "Done selecting" : "Select"}
    </button>
  );
}

function MoveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-disabled={pending || undefined}
      onClick={pending ? (e) => e.preventDefault() : undefined}
      aria-busy={pending}
      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Moving…" : "Move"}
    </button>
  );
}

const MOVE_STAGES = STAGES.filter((s) => s !== "dead");

/**
 * The bar while select mode is on: how many are picked, "Move to stage…"
 * and "Mark dead" (asked to confirm, the site's `ConfirmSubmit`), Clear and
 * Done, and one sentence on what the last change did. `apply` is the
 * pipeline's server action; `ids` the deals picked that the page shows;
 * `hidden` the picks the filters hide — counted against the limit and said,
 * never sent. After a change the deals it settled are unpicked
 * (`onSettled`), and a refused one stays picked.
 */
export function SelectBar({
  ids,
  hidden = 0,
  apply,
  onClear,
  onSettled,
  onDone,
}: {
  ids: readonly string[];
  hidden?: number;
  apply: (form: FormData) => Promise<BulkStageResult>;
  onClear: () => void;
  onSettled: (ids: readonly string[]) => void;
  onDone: () => void;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | "">("");
  const n = ids.length;
  const run = async (form: FormData) => {
    const result = await apply(form);
    setSaid(bulkStageSentence(result));
    if (result.ok && result.settled.length > 0) onSettled(result.settled);
  };
  const idInputs = ids.map((id) => <input key={id} type="hidden" name="dealId" value={id} />);
  const deals = `${n} ${n === 1 ? "deal" : "deals"}`;
  return (
    <div
      data-select-bar
      role="region"
      aria-label="Selected deals"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3"
    >
      <p className="text-sm font-medium" data-qa="select-count">
        {selectCountLine(n, hidden)}
      </p>
      <form action={run} className="flex items-center gap-2">
        {idInputs}
        <label className="flex items-center">
          <span className="sr-only">Move the selected deals to</span>
          <select
            name="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage | "")}
            className="rounded-lg border border-line bg-surface py-1.5 pl-2 pr-2 text-xs font-medium"
          >
            <option value="" disabled>
              Move to stage…
            </option>
            {MOVE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <MoveButton disabled={n === 0 || stage === ""} />
      </form>
      <form action={run}>
        {idInputs}
        <input type="hidden" name="stage" value="dead" />
        {n === 0 ? (
          <button type="button" disabled className="rounded-lg px-3 py-1.5 text-xs font-medium text-kill opacity-50">
            Mark dead
          </button>
        ) : (
          <ConfirmSubmit
            label="Mark dead"
            confirmText={`Mark ${deals} Dead? Each that can be moved goes to Dead, its history dated today; a stage can be changed back.`}
            danger
          />
        )}
      </form>
      <span className="ml-auto flex items-center gap-2">
        {n + hidden > 0 ? (
          <button type="button" onClick={onClear} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-faint hover:text-ink">
            Clear
          </button>
        ) : null}
        <button type="button" onClick={onDone} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-faint">
          Done
        </button>
      </span>
      {/* Present from the first render, so the sentence is announced when
          it arrives. */}
      <p role="status" className={said ? "w-full text-xs text-muted" : "sr-only"} data-qa="select-said">
        {said ?? ""}
      </p>
    </div>
  );
}

/** The bar's count: the picks shown, and the picks the filters hide —
 *  counted against `BULK_STAGE_MAX` with the shown ones, and said, since a
 *  change moves only what the page shows. */
export function selectCountLine(shown: number, hidden = 0): string {
  const total = shown + hidden;
  if (total === 0) return "Select deals to move them together.";
  const head = total >= BULK_STAGE_MAX ? `${total} of ${BULK_STAGE_MAX} selected` : `${total} selected`;
  if (hidden <= 0) return head;
  return `${head} — ${hidden} hidden by the filters, left out of a change`;
}
