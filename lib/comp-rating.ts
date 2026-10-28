// How the broker-comp scrutiny grades a comp, in the words and tones every
// surface prints: the ONE display map. The comps step's stored grades are
// `supports | favorable | stretched` (lib/anthropic/types `CompSupport`),
// graded by comparability to the subject, never by price; their words
// collided with the stress test's verdict words (a comp "stretched" beside a
// row "stretched", the review of 2026-10-28), so a reader meets them as
// comparability: comparable, less comparable in a way that flatters the ask,
// not comparable. No imports, so the deal page (a client module), the
// homepage's comps tile, the stress-test panel and the report all read it.
export const COMP_RATING = {
  supports: { label: "Comparable", short: "comparable", badge: "bg-pass/10 text-pass", rank: 2 },
  favorable: { label: "Less comparable, flatters the ask", short: "less comparable", badge: "bg-caution/10 text-caution", rank: 1 },
  stretched: { label: "Not comparable", short: "not comparable", badge: "bg-kill/10 text-kill", rank: 0 },
} as const;

export type CompSupport = keyof typeof COMP_RATING;

/** A comp's grade, an unknown one read as the deal page reads it. */
export function compRating(support: string): (typeof COMP_RATING)[CompSupport] {
  return COMP_RATING[support as CompSupport] ?? COMP_RATING.favorable;
}

/** The comps in the deal page's order: the least comparable first. */
export function inCompOrder<T extends { support: string }>(comps: readonly T[]): T[] {
  return comps
    .map((c, at) => ({ c, at }))
    .sort((a, b) => compRating(a.c.support).rank - compRating(b.c.support).rank || a.at - b.at)
    .map(({ c }) => c);
}
