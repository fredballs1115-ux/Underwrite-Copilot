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
// the same functions.

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

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/**
 * A place said with what is ranked and which way, for a chip that stands
 * beside a figure: "lowest of 5 ranked", "=4th lowest of 11 ranked",
 * "highest of 5 ranked" — where "#1 of 5" left a reader to guess whether
 * first was the best or the worst. `low` names the end place 1 is (the
 * vacancy boards rank the tightest first, so "lowest"), `high` the other.
 * Equal figures share a place, as `competitionRanks` gives it.
 */
export function rankWords(p: Place, total: number, low = "lowest", high = "highest"): string {
  if (total <= 1) return "the only figure ranked";
  if (p.rank === 1) return `${p.tied ? "joint " : ""}${low} of ${total} ranked`;
  if (p.rank === total && !p.tied) return `${high} of ${total} ranked`;
  return `${p.tied ? "=" : ""}${ordinal(p.rank)} ${low} of ${total} ranked`;
}
