// A ranking's places, where two figures can be equal (the audit of
// 2026-10-04). Two equal figures are not in an order: the research
// tracker's Miami and New York industrial vacancy, both 7.7% for Q2 2026,
// read "#5 of 12" and "#6 of 12" and were shaded apart, an order broken by
// the markets' names; the rent board numbered Washington's +1.2% and
// Atlanta's +1.2% second and third. Equal figures share one place, said
// "=5", and the next figure takes the place its position gives it
// (1, 2, =3, =3, 5) — so every place is one plus the count of figures ahead
// of it, and the shade drawn from a place is one shade for equal figures.
//
// Pure, no imports: the boards, the chips, the demo and the deal page read
// the same two functions.

export interface Place {
  /** one plus the number of figures strictly ahead of this one */
  rank: number;
  /** another figure shares this place */
  tied: boolean;
}

/**
 * The places of a list already sorted best first, where `same` says two
 * neighbouring entries are equal figures: an entry equal to the one before
 * it shares that entry's place.
 */
export function competitionRanks<T>(sorted: readonly T[], same: (a: T, b: T) => boolean): Place[] {
  const places: Place[] = [];
  sorted.forEach((x, i) => {
    const tiedBefore = i > 0 && same(sorted[i - 1], x);
    places.push({ rank: tiedBefore ? places[i - 1].rank : i + 1, tied: tiedBefore });
    if (tiedBefore) places[i - 1].tied = true;
  });
  return places;
}

/** A place as a board prints it: "#5", or "=5" where it is shared; `bare`
 *  drops the "#" for a numbered column whose header already says it. */
export function rankLabel(p: Place, bare = false): string {
  return p.tied ? `=${p.rank}` : bare ? String(p.rank) : `#${p.rank}`;
}
