// Ask's starter questions: the challenger's own questions for the broker on
// this deal (`Challenge.question`), the most severe first, each a chip that
// fills Ask's input — so Ask opens on the questions the screen already found
// worth asking, never on a bare box. Pure, importing only the cap; none
// where the deal has no questions, and none already asked of it.

import type { Challenge } from "@/lib/anthropic/types";
import { ASK_QUESTION_CAP } from "@/lib/ask-cap";

/** How many chips Ask shows at most. */
export const ASK_STARTERS_MAX = 3;

/** The line over the chips (audit C11, L5). They are the challenger's
 *  questions for the BROKER, usually ones the memorandum does not answer,
 *  and each one sent spends one of the memorandum's capped questions
 *  (lib/ask-cap), so the line says both before a reader spends one. */
export const ASK_STARTERS_NOTE = `The screen’s questions for the broker: the OM may not answer them, and each one asked spends one of its ${ASK_QUESTION_CAP} questions. Choose one to put it to the OM.`;

/** Ask's own bounds on a question (its textarea's `minLength` and
 *  `maxLength`): a starter outside them could not be sent as it stands. */
const MIN = 5;
const MAX = 300;

const RANK: Record<Challenge["severity"], number> = { high: 0, medium: 1, low: 2 };

const key = (q: string) => q.replace(/\s+/g, " ").trim().toLowerCase();

export function askStarters(
  challenges: readonly Pick<Challenge, "question" | "severity">[] | null | undefined,
  asked: readonly { q: string }[] = [],
): string[] {
  const seen = new Set(asked.map((e) => key(e.q)));
  const out: string[] = [];
  const ordered = [...(challenges ?? [])]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (RANK[a.c.severity] ?? 3) - (RANK[b.c.severity] ?? 3) || a.i - b.i);
  for (const { c } of ordered) {
    const q = (c.question ?? "").replace(/\s+/g, " ").trim();
    if (q.length < MIN || q.length > MAX || seen.has(key(q))) continue;
    seen.add(key(q));
    out.push(q);
    if (out.length === ASK_STARTERS_MAX) break;
  }
  return out;
}
