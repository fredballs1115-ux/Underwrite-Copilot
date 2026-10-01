/**
 * The Assumption Bridge's version-keeping rules: when the deal's live
 * assumptions are snapshotted, what an automatic version is called, which
 * two versions the page opens on, and what a failed save is said as.
 *
 * Four faults these answer, each seen on a real list (research pass 15):
 *   - Every page view compared the live set with the NEWEST version only, so
 *     a manual scenario saved on top of the base made the next view snapshot
 *     the base again: a duplicate after every save, which Delete could not
 *     remove (the next view put it back). The live set is now compared with
 *     the latest BASE snapshot — the newest automatic version — and a manual
 *     save is never a base.
 *   - The page then opened on the newest two, the auto copy against the
 *     scenario: the scenario read backwards. A scenario now opens against
 *     the base it was saved from, a base against the base before it.
 *   - The label generator looked at the newest sixty versions, so the
 *     sixty-first proposed "v1" again; the unique index refused it and the
 *     auto-snapshots stopped, silently. Labels now run one past the highest
 *     vN used on the deal, whatever else is there.
 *   - A failed save said "Check the label isn't already used" whatever
 *     failed. It now says which of the three it was.
 *
 * Pure: no I/O.
 */
import { changedPaths } from "./fields";
import type { Assumptions } from "./model";

export interface VersionLike {
  id: string;
  version_label: string;
  assumptions: Assumptions;
  automatic: boolean;
  created_at: string;
}

const time = (v: { created_at: string }) => Date.parse(v.created_at) || 0;

const newestFirst = <T extends { created_at: string }>(versions: readonly T[]): T[] =>
  [...versions].sort((a, b) => time(b) - time(a));

/** The deal's latest base snapshot: its newest AUTOMATIC version. */
export function latestBase<T extends VersionLike>(versions: readonly T[]): T | null {
  return newestFirst(versions).find((v) => v.automatic) ?? null;
}

/** Whether the live assumptions need an automatic snapshot: only where they
 *  differ from the latest base snapshot (or there is none yet). */
export function needsSnapshot(current: Assumptions, versions: readonly VersionLike[]): boolean {
  const base = latestBase(versions);
  return !base || changedPaths(base.assumptions, current).length > 0;
}

/** The version that IS the deal's live assumptions — its latest base, where
 *  that still matches them. The page keeps it (a view would only take it
 *  again), so it is marked current rather than offered for deletion. */
export function currentVersionId(current: Assumptions | null, versions: readonly VersionLike[]): string | null {
  if (!current) return null;
  const base = latestBase(versions);
  return base && changedPaths(base.assumptions, current).length === 0 ? base.id : null;
}

/**
 * The next automatic label: one past the highest `vN` used on the deal, so
 * a label is unique against EVERY existing label (manual ones included) and
 * a deleted number is never handed to a different set of assumptions.
 */
export function nextAutoLabel(labels: readonly string[]): string {
  const taken = new Set(labels);
  let n = 1;
  for (const label of labels) {
    const m = /^v(\d+)$/.exec(label);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  while (taken.has(`v${n}`)) n++;
  return `v${n}`;
}

/**
 * The two versions the bridge opens on. The asked-for "to" (else the
 * newest), and the asked-for "from" where it is another version; otherwise
 * the newest automatic version no newer than "to" — a scenario is set
 * against the base it was saved from, a base against the base before it —
 * so the page never opens a scenario against a later base, reading every
 * change backwards.
 */
export function defaultPair<T extends VersionLike>(
  versions: readonly T[],
  toId?: string | null,
  fromId?: string | null,
): { from: T | null; to: T | null } {
  const sorted = newestFirst(versions);
  const to = sorted.find((v) => v.id === toId) ?? sorted[0] ?? null;
  if (!to) return { from: null, to: null };
  const asked = sorted.find((v) => v.id === fromId && v.id !== to.id);
  if (asked) return { from: asked, to };
  const older = sorted.filter((v) => v.id !== to.id && time(v) <= time(to));
  const from = older.find((v) => v.automatic) ?? older[0] ?? sorted.find((v) => v.id !== to.id) ?? null;
  return { from, to };
}

export type SaveFailure = "label_taken" | "denied" | "failed";

/** What a refused write was: the label already used on the deal (the
 *  unique index), a write this account may not make, or anything else. */
export function saveFailure(error: { code?: string | null; message?: string | null } | null | undefined): SaveFailure {
  if (error?.code === "23505") return "label_taken";
  if (error?.code === "42501" || /row-level security/i.test(error?.message ?? "")) return "denied";
  return "failed";
}
