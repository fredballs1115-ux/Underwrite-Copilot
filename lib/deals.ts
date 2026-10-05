/**
 * Shared shapes/helpers for "deals" (one screened OM). Kept here so the deals
 * list, the single-deal view, and (later) the worker all agree.
 */

export interface DealRow {
  id: string;
  name: string;
  asset_class: string;
  om_storage_path: string | null;
  // User-entered property address (StructuredAddress). Migration 0011.
  address?: unknown;
  // The fast headline read that lands ~30s into a run (FirstSignal).
  // Migration 0009; null on rows screened before it existed.
  first_signal?: unknown;
  // Snapshot of the previous run's extraction + verdict (PriorScreen),
  // written by the pipeline at the start of every re-screen. Migration 0010.
  prior_screen?: unknown;
  // Per-step results (filled in by the analysis pipeline in Phase 2).
  extraction: unknown;
  challenges: unknown;
  comps: unknown;
  reconciliation: unknown;
  market: unknown;
  verdict: unknown;
  // User-added data per section (notes + uploaded files). See migration 0002.
  supplements: unknown;
  // Generated first-draft underwriting model (UnderwritingModel). Migration 0003.
  model: unknown;
  // Public-web comp search results (unverified fallback). Migration 0004.
  comp_search: unknown;
  // The building's imagery cache (DealVisualCache): its geocode, and the
  // picture lifted out of its memorandum or added by hand. Migration 0027.
  photo?: unknown;
  created_at: string;
  updated_at: string;
}

/** One entry in deals.notes — the analyst's decision log (migration 0017). */
export interface DealNote {
  /** ISO timestamp — with the author, the note's identity for deletes */
  at: string;
  /** author's email at write time (teams see who said what) */
  by: string;
  /** author's user id — the stable delete identity (emails change) */
  byId?: string;
  text: string;
}

export function parseDealNotes(raw: unknown): DealNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (n): n is DealNote =>
      !!n &&
      typeof n === "object" &&
      typeof (n as { at?: unknown }).at === "string" &&
      typeof (n as { by?: unknown }).by === "string" &&
      typeof (n as { text?: unknown }).text === "string",
  );
}

/** One entry in deals.qa — ask-the-deal Q&A grounded in the OM (0017). */
export interface AskEntry {
  at: string;
  q: string;
  answer: string;
  /** the pages the answer cites — since the stamp below, only pages inside
   *  the deck it read (lib/facts `locatedPage`) */
  cites: { page: string; note: string }[];
  /** the memorandum it was asked of: a fingerprint of the OM's bytes
   *  (lib/om-fingerprint) — absent on an entry saved before entries were
   *  stamped */
  om?: string;
  /** who asked it: their user id, the stable identity (emails change) —
   *  absent on an entry saved before askers were recorded */
  by?: string;
  /** READ, never stored: asked of a memorandum the deal has since replaced,
   *  so its answer and its pages are that memorandum's (`parseDealQa`) */
  earlier?: boolean;
}

/** What Ask's status line says once an answer lands (the deal page's Ask
 *  panel): keyed to the answer by its place in the thread, so each new
 *  answer is said — a live region that reads the same words again says
 *  nothing, and "The answer is in the thread above." was heard for the first
 *  answer alone (the pre-merge audit). */
export function askAnsweredLine(threadLength: number): string {
  return threadLength > 0 ? `Answer ${threadLength} is in the thread above.` : "The answer is in the thread above.";
}

/** What replacing the OM appends to the thread (the deal actions'
 *  `replaceOm`). The thread only grows (migration 0036), so the answers
 *  asked of the old memorandum stay where they are, and this marker after
 *  them says the memorandum changed. It is no question: it counts toward no
 *  cap and draws no row of its own. */
export interface AskOmReplaced {
  at: string;
  event: typeof OM_REPLACED;
  /** the new memorandum's fingerprint */
  om: string;
}

export const OM_REPLACED = "om_replaced";

const isOmReplaced = (e: unknown): e is AskOmReplaced =>
  !!e && typeof e === "object" && (e as { event?: unknown }).event === OM_REPLACED;

const isAskEntry = (e: unknown): e is AskEntry =>
  !!e &&
  typeof e === "object" &&
  typeof (e as { at?: unknown }).at === "string" &&
  typeof (e as { q?: unknown }).q === "string" &&
  typeof (e as { answer?: unknown }).answer === "string";

/**
 * The thread's questions, in order, each saying whether it was asked of the
 * memorandum the deal holds now. The current one, as far as the thread can
 * say, is the newest replacement marker's. An answer stamped with another
 * fingerprint was asked of an earlier memorandum, wherever it sits — an
 * answer to the old deck that landed after the marker included. An answer
 * saved before answers were stamped was asked of an earlier memorandum
 * only where a marker follows it; with none after it, it reads as asked of
 * the current OM. That is the honest reading of what the thread holds: a
 * replacement made before the markers existed left nothing to say
 * otherwise.
 */
export function parseDealQa(raw: unknown): AskEntry[] {
  if (!Array.isArray(raw)) return [];
  let lastMarker = -1;
  raw.forEach((e, i) => {
    if (isOmReplaced(e)) lastMarker = i;
  });
  const current = lastMarker >= 0 ? (raw[lastMarker] as AskOmReplaced).om : null;
  return raw.flatMap((e, i): AskEntry[] => {
    if (!isAskEntry(e)) return [];
    const om = typeof e.om === "string" && e.om ? e.om : undefined;
    const by = typeof e.by === "string" && e.by ? e.by : undefined;
    const earlier =
      lastMarker < 0 ? false : om && typeof current === "string" && current ? om !== current : i < lastMarker;
    return [
      {
        at: e.at,
        q: e.q,
        answer: e.answer,
        cites: Array.isArray(e.cites)
          ? e.cites
              .filter(
                (c): c is { page: string; note: string } =>
                  !!c &&
                  typeof c === "object" &&
                  typeof (c as { page?: unknown }).page === "string" &&
                  typeof (c as { note?: unknown }).note === "string",
              )
              .slice(0, 6)
          : [],
        ...(om ? { om } : {}),
        ...(by ? { by } : {}),
        earlier,
      },
    ];
  });
}

/**
 * Whether the deal's memorandum was replaced after `since` (the deal's last
 * finished screen — its verdict's `generatedAt`), as far as the Ask thread
 * says: `replaceOm` appends a marker naming the new deck's fingerprint to
 * every deal that had a memorandum before. Replaced since, where:
 *
 *   - a marker is later than `since`, or its moment does not read (it
 *     cannot be placed before the screen), or `since` is unknown and any
 *     marker exists;
 *   - the newest marker names other bytes than `fingerprint`, the deck
 *     being read: the deck changed after it, when nothing says.
 *
 * No marker says nothing was replaced since the markers were first written
 * — which is all the thread can say. The screen reads this to know whether
 * an extraction stored before it fingerprinted its deck was read from the
 * deck it is reading now (lib/criteria `screenStampFor`).
 */
export function memorandumReplacedSince(
  rawQa: unknown,
  since: string | null | undefined,
  fingerprint: string | null | undefined,
): boolean {
  if (!Array.isArray(rawQa)) return false;
  const markers = rawQa.filter(isOmReplaced);
  if (markers.length === 0) return false;
  const newest = markers[markers.length - 1];
  if (fingerprint && typeof newest.om === "string" && newest.om && newest.om !== fingerprint) return true;
  const screened = typeof since === "string" ? Date.parse(since) : NaN;
  if (!Number.isFinite(screened)) return true;
  return markers.some((m) => {
    const at = typeof m.at === "string" ? Date.parse(m.at) : NaN;
    return !Number.isFinite(at) || at > screened;
  });
}

/** The six analysis steps, in order, keyed to the columns on `deals`. */
export const DEAL_STEPS = [
  { key: "extraction", label: "Extract & flag" },
  { key: "challenges", label: "Challenge the assumptions" },
  { key: "comps", label: "Scrutinize the comps" },
  { key: "reconciliation", label: "Reconcile your model" },
  { key: "market", label: "Market check" },
  { key: "verdict", label: "Verdict" },
] as const satisfies ReadonlyArray<{ key: keyof DealRow; label: string }>;
