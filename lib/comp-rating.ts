// How the broker-comp scrutiny grades a comp, in the deal page's words and
// tones (app/(app)/deals/[id]/deal-sections.tsx `COMP_RATING`, which a
// client module cannot hand a server page as a value). No imports, so a
// server page — the homepage's comps tile — draws a comp's grade as the
// deal page draws it; lib/comp-rating.test.ts holds the two maps equal.
export const COMP_RATING = {
  supports: { label: "Supports", badge: "bg-pass/10 text-pass", rank: 2 },
  favorable: { label: "Leans favorable", badge: "bg-caution/10 text-caution", rank: 1 },
  stretched: { label: "Stretched", badge: "bg-kill/10 text-kill", rank: 0 },
} as const;

export type CompSupport = keyof typeof COMP_RATING;

/** A comp's grade, an unknown one read as the deal page reads it. */
export function compRating(support: string): (typeof COMP_RATING)[CompSupport] {
  return COMP_RATING[support as CompSupport] ?? COMP_RATING.favorable;
}

/** The comps in the deal page's order: the weakest support first. */
export function inCompOrder<T extends { support: string }>(comps: readonly T[]): T[] {
  return comps
    .map((c, at) => ({ c, at }))
    .sort((a, b) => compRating(a.c.support).rank - compRating(b.c.support).rank || a.at - b.at)
    .map(({ c }) => c);
}
