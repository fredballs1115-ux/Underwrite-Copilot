// Who may remove a decision-log note. No imports, so the client decision
// log and the server action read one rule.

/** Who the sample deal's seeded note is by: the sample, never a person
 *  (re-exported by lib/sample-deal, which seeds it). */
export const SAMPLE_AUTHOR = "Sample deal";

/**
 * A note is its author's to remove: by the stamped user id where the note
 * carries one (it survives an email change), else by the email it was
 * written under. The sample deal's own seeded note has no author but the
 * sample, so on the sample deal its reader may remove it (audit C9, L2: no
 * Remove button showed for it and the action refused it, though the seed
 * promises a removed note is never put back).
 */
export function mayRemoveNote(
  note: { by: string; byId?: string },
  reader: { userId: string | null; userEmail: string | null },
  isSample: boolean,
): boolean {
  if (note.byId) return !!reader.userId && note.byId === reader.userId;
  if (isSample && note.by === SAMPLE_AUTHOR) return true;
  return !!reader.userEmail && note.by === reader.userEmail;
}
