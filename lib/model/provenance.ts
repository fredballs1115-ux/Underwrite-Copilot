// Where the first-draft model's figures come from, and what has changed
// since it was built — PURE.
//
// The model tab said "every number traces to a source" and headed its table
// "every value sourced". Not so: where no document states a figure, the
// reconciliation (lib/anthropic/model-reconcile) carries a market-grounded
// growth, vacancy or exit cap of its own and a rule-of-thumb reserve, and
// files it under an authority such as "Market". Those rows are the model's
// assumptions, and the tab now says which they are.
//
// The rule is POSITIVE, as lib/model/stated-rate's is: a list of words for
// "assumed" misses the filing it has not seen yet. A row is a document's
// only where the source that won it names a document — the offering
// memorandum, a rent roll, a T-12, the loan's terms, an appraisal, a budget,
// a file the model was built from — and neither that source nor its basis
// is a norm, a feed, an assumption, an estimate or a derivation. Everything
// else is "assumed": the honest side to err on when the claim is sourcing.
//
// What changed since the build is read off the deal's documents: a model
// keeps the ids of the documents it was built from (`generatedFromIds`), and
// one stored before it did is compared by the labels it kept
// (`generatedFrom`). The deal's own OM is not one of them: the model reads
// only the documents added to it, so a replaced OM changes nothing it read.

import { DOC_KIND_LABEL, type DealDocument } from "@/lib/documents";
import type { ReconciledMetric, UnderwritingModel } from "./types";

/** Words that name a document a figure can be read off. */
const DOCUMENT =
  /\bom\b|offering memo|memorandum|rent ?roll|\bt-?12\b|trailing|operating statement|\bfinancials\b|loan terms|term ?sheet|\blender\b|commitment|\bbov\b|broker opinion|appraisal|\bpca\b|property condition|budget|\blease\b|estoppel|tax bill|\.(?:pdf|xlsx?|csv|docx?)\b/i;

/** Words that make a figure something other than a document's statement. */
const NOT_STATED =
  /market|norm\b|norms|assum(?!able)|default|estimat|typical|benchmark|rule of thumb|industry|fred\b|treasury|sofr|\bindex\b|survey|judg(?:e)?ment|conservative|derived|implied|computed|calculated|blend/i;

/** The document a model was built from, as `generatedFrom` keeps it
 *  ("Rent roll: Maddox-RentRoll.xlsx"): its file name and the name without
 *  its extension, either of which a source may cite it by. */
function documentNames(generatedFrom: string[]): string[] {
  return generatedFrom.flatMap((label) => {
    const file = label.includes(": ") ? label.slice(label.indexOf(": ") + 2).trim() : label.trim();
    const stem = file.replace(/\.[a-z0-9]{2,5}$/i, "");
    return [file, stem].filter((s) => s.length >= 3).map((s) => s.toLowerCase());
  });
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Whether a document states the row's chosen value: the source that won it
 * (the one its authority names, else the authority's own words) names a
 * document, and nothing about it is a norm, a feed or an assumption.
 */
export function statedByDocument(m: ReconciledMetric, generatedFrom: string[] = []): boolean {
  const authority = (m.authority ?? "").trim();
  if (!authority) return false;
  const won = (m.sources ?? []).find((s) => norm(s.doc) === norm(authority)) ?? null;
  const words = [authority, won?.doc ?? "", won?.basis ?? ""].join(" ");
  if (NOT_STATED.test(words)) return false;
  const names = documentNames(generatedFrom);
  const named = `${authority} ${won?.doc ?? ""}`.toLowerCase();
  return DOCUMENT.test(named) || names.some((n) => named.includes(n));
}

export interface ModelProvenance {
  /** rows a document states */
  stated: number;
  /** rows no document states — the model's own assumptions */
  assumed: number;
  /** the build's day, "Sep 30, 2026"; null for a model stored undated */
  builtOn: string | null;
  /** the documents it was built from, as it kept them */
  builtFrom: string[];
  /** documents added since the build, by their labels */
  added: string[];
  /** documents the model was built from that the deal no longer has */
  removed: string[];
}

// UTC-pinned so the server's markup and the browser's agree.
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A document as `generatedFrom` names it. */
export const documentLabel = (d: Pick<DealDocument, "kind" | "filename">) => `${DOC_KIND_LABEL[d.kind] ?? "Document"}: ${d.filename}`;

/** What the model is built on, and what has changed in the deal's documents since. */
export function modelProvenance(
  model: Pick<UnderwritingModel, "metrics" | "generatedFrom" | "generatedAt" | "generatedFromIds">,
  documents: Pick<DealDocument, "id" | "kind" | "filename">[],
): ModelProvenance {
  const builtFrom = model.generatedFrom ?? [];
  const stated = model.metrics.filter((m) => statedByDocument(m, builtFrom)).length;
  const when = model.generatedAt ? new Date(model.generatedAt) : null;
  const builtOn = when && !Number.isNaN(when.getTime()) ? DAY.format(when) : null;

  let added: string[];
  let removed: string[];
  const ids = model.generatedFromIds;
  if (Array.isArray(ids) && ids.length === builtFrom.length) {
    const now = new Set(documents.map((d) => d.id));
    added = documents.filter((d) => !ids.includes(d.id)).map(documentLabel);
    removed = builtFrom.filter((_, i) => !now.has(ids[i]));
  } else {
    // A model stored before it kept its documents' ids: compared by label,
    // each one counted as often as it appears.
    const left = [...builtFrom];
    added = [];
    for (const d of documents) {
      const label = documentLabel(d);
      const at = left.indexOf(label);
      if (at >= 0) left.splice(at, 1);
      else added.push(label);
    }
    removed = left;
  }
  return { stated, assumed: model.metrics.length - stated, builtOn, builtFrom, added, removed };
}

/** A document as a sentence names it: "Maddox-OM.pdf (Offering
 *  memorandum)" for the label "Offering memorandum: Maddox-OM.pdf". */
export function shownDocument(label: string): string {
  const at = label.indexOf(": ");
  return at > 0 ? `${label.slice(at + 2).trim()} (${label.slice(0, at).trim()})` : label.trim();
}

/** When the model was built and from what — "undated" for a model stored
 *  before builds were dated. */
export function builtSentence(p: Pick<ModelProvenance, "builtOn" | "builtFrom">): string {
  const from = p.builtFrom.map(shownDocument).join(", ");
  if (!p.builtOn) return from ? `Undated — built from ${from}.` : "Undated.";
  return from ? `Built ${p.builtOn} from ${from}.` : `Built ${p.builtOn}.`;
}

/** The banner's sentence on where the figures come from — true by count. */
export function sourcingSentence(p: Pick<ModelProvenance, "stated" | "assumed">): string {
  const total = p.stated + p.assumed;
  if (total === 0) return "Built from your documents; conflicts are listed below.";
  if (p.assumed === 0) return "Built from your documents: every assumption below names the document it came from, and conflicts are listed below.";
  if (p.stated === 0) {
    return `No document states the ${total === 1 ? "assumption" : `${total} assumptions`} below: ${total === 1 ? "it is" : "each is"} the model's own, marked “assumed”. Conflicts are listed below.`;
  }
  const others = p.assumed === 1 ? "the other one, which no document states, is" : `the other ${p.assumed}, which no document states, are`;
  return `Built from your documents where they state a figure: ${p.stated} of the ${total} assumptions below ${p.stated === 1 ? "comes" : "come"} from them, and ${others} the model's own, marked “assumed”. Conflicts are listed below.`;
}

/** What changed in the deal's documents since the build, in a sentence —
 *  "" where nothing did. */
export function changedSinceSentence(p: Pick<ModelProvenance, "added" | "removed">): string {
  const parts = [
    p.added.length ? `${p.added.map(shownDocument).join(", ")} ${p.added.length === 1 ? "was" : "were"} added` : "",
    p.removed.length ? `${p.removed.map(shownDocument).join(", ")} ${p.removed.length === 1 ? "was" : "were"} removed` : "",
  ].filter(Boolean);
  return parts.length ? `Since it was built, ${parts.join(" and ")} — these figures do not reflect that.` : "";
}
