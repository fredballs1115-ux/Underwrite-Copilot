/**
 * A calendar day said short — "Oct 22", "Mon, Oct 22" — with its year
 * wherever the day is not in the year the reader is in: "Jan 4, 2027" on a
 * December page, "Mar 3, 2025" for a deadline long past. A month and a day
 * alone had read as this year's on every surface (the offers-due bit, the
 * pipeline's what's-new card, the weekly digest's tasks), so a deal whose
 * offers were due last March read "Offers were due Mar 3" (the audit of
 * 2026-10-19).
 *
 * Pure, no imports: the pipeline's client card and the server's digest read
 * it. `today` is an ISO day (yyyy-mm-dd) — the reader's own day on a page
 * (lib/reader-day), the run's UTC day in the digest, which has no reader.
 */
export function shortDay(iso: string, today: string, { weekday = false }: { weekday?: boolean } = {}): string {
  const day = iso.slice(0, 10);
  const otherYear = day.slice(0, 4) !== today.slice(0, 4);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    ...(otherYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}
