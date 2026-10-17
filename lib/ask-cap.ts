/**
 * Ask's question cap, one constant for the action that holds it and the box
 * that says it (research pass 42, L4). Each answer is a full read of the
 * memorandum, so the questions asked of each memorandum are capped; the box
 * had said nothing of it until the cap refused a question.
 *
 * A reissued deck is a new document with its own pages, so its questions
 * start again; an answer asked of an earlier memorandum counts toward that
 * deck's cap, never this one's.
 *
 * No imports: the client box reads it.
 */

/** Questions a memorandum may be asked. */
export const ASK_QUESTION_CAP = 25;

/** The line under Ask's box: the questions asked of the memorandum the deal
 *  holds now, against the cap. */
export function askCountLine(asked: number): string {
  const n = Math.max(0, Math.min(asked, ASK_QUESTION_CAP));
  return `${n} of ${ASK_QUESTION_CAP} questions asked of this memorandum`;
}
