// The signed-in app's keyboard layer: what each key does, where it works,
// when the keys stand down, and the arithmetic of stepping through deals.
//
// Pure and import-free, so the pipeline, the deal page, the shortcuts sheet
// and the command palette read one list, and a test holds the guard without
// a browser. The listeners themselves are the client modules' own
// (app/(app)/deals/pipeline-keys.ts, app/(app)/deals/[id]/deal-step-keys.tsx,
// app/(app)/shortcuts-sheet.tsx).

/** Where a shortcut works. */
export type ShortcutPlace = "anywhere" | "pipeline" | "deal";

export interface Shortcut {
  /** the keys as a keyboard prints them, pressed together */
  keys: readonly string[];
  /** what it does, in a few words */
  does: string;
  where: ShortcutPlace;
}

/** Every shortcut the app answers, in the order the sheet lists them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ["⌘", "K"], does: "Search deals and jump anywhere (Ctrl K on Windows)", where: "anywhere" },
  { keys: ["?"], does: "Show these shortcuts", where: "anywhere" },
  { keys: ["/"], does: "Search the pipeline", where: "pipeline" },
  { keys: ["n"], does: "Start a new deal", where: "pipeline" },
  { keys: ["j"], does: "Move to the next deal", where: "pipeline" },
  { keys: ["k"], does: "Move to the previous deal", where: "pipeline" },
  { keys: ["Enter"], does: "Open the deal in focus", where: "pipeline" },
  { keys: ["Esc"], does: "Close the new-deal form", where: "pipeline" },
  { keys: ["["], does: "Open the previous deal in the pipeline's order", where: "deal" },
  { keys: ["]"], does: "Open the next deal in the pipeline's order", where: "deal" },
];

/** Each place's heading on the sheet. */
export const SHORTCUT_PLACES: Record<ShortcutPlace, string> = {
  anywhere: "Anywhere",
  pipeline: "On the pipeline",
  deal: "On a deal",
};

/** The shortcuts as the command palette searches them: every one's words,
 *  so "next deal" or "new deal" finds the sheet. */
export const SHORTCUT_SEARCH = `keyboard shortcuts keys hotkeys ${SHORTCUTS.map((s) => s.does.toLowerCase()).join(" ")}`;

/** What the guard reads off a key event: a KeyboardEvent, or a test's
 *  stand-in for one. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  defaultPrevented: boolean;
  target: unknown;
  /** whether a modifier is in a given state: "AltGraph" where AltGr (or
   *  Ctrl and Alt standing in for it) typed the key's character */
  getModifierState?: (key: string) => boolean;
}

/** Whether AltGr typed the key: a layout that needs it for "[" or "]"
 *  (German, Polish, the Nordic ones) reports Ctrl and Alt held, or Alt, with
 *  the AltGraph modifier set, and the character is the key's own. */
export function typedWithAltGraph(e: KeyLike): boolean {
  try {
    return e.getModifierState?.("AltGraph") === true;
  } catch {
    return false;
  }
}

type TargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

/** The dialogs a page shortcut never reaches past: the palette, the photo
 *  viewer, the shortcuts sheet itself, a confirm. */
export const DIALOG_SELECTOR = '[role="dialog"],[role="alertdialog"]';

/** A modal open anywhere on the page, wherever the focus is: the keys stand
 *  down under it as they do inside it. */
export const MODAL_SELECTOR = '[aria-modal="true"]';

/** Whether the focus is in a field a reader types into. */
export function isTypingTarget(target: unknown): boolean {
  const t = target as TargetLike | null;
  if (!t || typeof t !== "object") return false;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true;
}

/**
 * Whether the page's shortcuts stand down for this key: another handler
 * already took it (the palette's Escape), the focus sits inside a dialog or
 * a modal is open anywhere on the page, a modifier other than Shift is held
 * (⌘K and the browser's own keys are not ours; "?" is Shift and "/"; Ctrl
 * and Alt count for nothing where AltGr typed the character,
 * `typedWithAltGraph`), an
 * input method is composing, or the reader is typing in a field — where
 * Escape cancels autofill and clears a search box, and "j" is a letter.
 */
export function shortcutsStandDown(e: KeyLike, opts: { modalOpen?: boolean } = {}): boolean {
  if (e.defaultPrevented) return true;
  if (opts.modalOpen) return true;
  const t = e.target as TargetLike | null;
  if (t && typeof t === "object" && typeof t.closest === "function" && t.closest(DIALOG_SELECTOR)) return true;
  if (e.metaKey || e.isComposing) return true;
  // Ctrl and Alt are a shortcut's own, unless AltGr typed the character:
  // there they are how the layout reaches "[" and "]".
  if ((e.ctrlKey || e.altKey) && !typedWithAltGraph(e)) return true;
  return isTypingTarget(e.target);
}

/** What a key does on the pipeline, or null where it does nothing there or
 *  the keys stand down: the one decision the pipeline's listener acts on. */
export type PipelineKeyAction = "escape" | "search" | "new" | "next" | "previous";

export function pipelineKeyAction(e: KeyLike, opts: { modalOpen?: boolean; canNew: boolean }): PipelineKeyAction | null {
  if (shortcutsStandDown(e, opts)) return null;
  switch (e.key) {
    case "Escape":
      return "escape";
    case "/":
      return "search";
    case "n":
      // At the free plan's limit the form cannot open: the key is no one's.
      return opts.canNew ? "new" : null;
    case "j":
      return "next";
    case "k":
      return "previous";
    default:
      return null;
  }
}

/** Which way "[" and "]" step on a deal, or null. */
export function dealStepOf(e: KeyLike, opts: { modalOpen?: boolean } = {}): 1 | -1 | null {
  if (e.key !== "[" && e.key !== "]") return null;
  if (shortcutsStandDown(e, opts)) return null;
  return e.key === "]" ? 1 : -1;
}

/** Whether a key opens the shortcuts sheet: "?", under the same guard. */
export function opensShortcuts(e: KeyLike, opts: { modalOpen?: boolean } = {}): boolean {
  return e.key === "?" && !shortcutsStandDown(e, opts);
}

/**
 * The deal to move to from `current` (−1: none in focus) among `count`
 * shown: the first where none is in focus, else one along, held at the ends
 * rather than wrapping — "j" on the last deal stays on it. Null where none
 * is shown.
 */
export function stepFrom(current: number, count: number, delta: 1 | -1): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return 0;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/** The deal before or after `id` in the pipeline's order, or null at either
 *  end and where the deal is not in it. */
export function neighbourIn(order: readonly string[], id: string, delta: 1 | -1): string | null {
  const at = order.indexOf(id);
  if (at < 0) return null;
  return order[at + delta] ?? null;
}

/** The session key the pipeline keeps its last shown order under, for the
 *  deal page's "[" and "]". */
export const PIPELINE_ORDER_KEY = "uc-pipeline-order";

/** The order's key for one signed-in reader, so another account signed in
 *  later in the same tab never steps through the first one's deals; null
 *  where the reader is not known, and no order is kept or read. */
export function pipelineOrderKey(viewerId: string | null | undefined): string | null {
  const id = (viewerId ?? "").toLowerCase().replace(/[^0-9a-z-]/g, "");
  return id ? `${PIPELINE_ORDER_KEY}:${id}` : null;
}

/** At most this many deals are kept: a pipeline larger than this steps
 *  through its first part. */
export const PIPELINE_ORDER_MAX = 2000;

/** A deal's id as the order holds it: a uuid, or a fixture's short id —
 *  never a path or a word with a slash in it. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The order as it is stored. */
export function orderJson(ids: readonly string[]): string {
  return JSON.stringify(ids.filter((id) => ID.test(id)).slice(0, PIPELINE_ORDER_MAX));
}

/** The order read back, or null where nothing usable is stored: a corrupt
 *  or foreign value is no order, and an id that is not an id is dropped. */
export function readOrder(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || !ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= PIPELINE_ORDER_MAX) break;
  }
  return out.length ? out : null;
}
