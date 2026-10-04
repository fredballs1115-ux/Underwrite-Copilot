/**
 * A lease's term, drawn (#421) — the one picture of it, pure, at the app
 * root because the interest panel (the deal page and the shared screen),
 * the deal page's leasehold card and the single-tenant panel (#454) all
 * draw it.
 *
 * One track from today: the term left, filled; the extension options after
 * it, dashed, because they are the leaseholder's to exercise and not yet
 * years anyone owns; and, where a model's hold is given, the hold filled
 * darker with the rest of the term after the sale lighter — and, where the
 * lease ends inside the hold, the hold's years past the lease's end in the
 * warning tone, since those are years the model counts and the buyer does
 * not have. A legend says each part in words, so nothing rides on colour.
 *
 * A lease that has not begun — on a building not yet delivered, its term
 * stated as a count (lib/single-tenant `termFromDelivery`) — is drawn from
 * delivery instead: the term from then, the options after it, and no hold,
 * since the model's hold begins today and the two share no start. Nothing
 * on it is counted from today.
 */
// On the tenths, and a whole number without its ".0": "40 years", "40.3 years".
const years = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? String(v) : v.toFixed(1)} ${v === 1 ? "year" : "years"}`;
};
const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;

export function LeaseTermBar({
  yearsLeft,
  endLabel,
  optionYears = null,
  holdYears = null,
  optionsWord = "Extension options",
  fromDelivery = false,
}: {
  /** years left on the lease today — or, on a lease that begins at
   *  delivery (`fromDelivery`), the term's length from then */
  yearsLeft: number;
  /** when the current term ends, as the page says it ("Dec 2071"); none on
   *  a lease from delivery, whose stated count dates no end */
  endLabel?: string;
  /** the extension options' years in all, where they parse */
  optionYears?: number | null;
  /** the model's hold, where the picture is the model's — never drawn over
   *  a lease from delivery */
  holdYears?: number | null;
  /** what the options are called: a ground lease's extension options, a
   *  tenant's renewal options (#454) */
  optionsWord?: string;
  /** the lease begins at delivery, later than today: the track is its term
   *  from then, said so */
  fromDelivery?: boolean;
}) {
  if (!(yearsLeft > 0)) return null;
  const opts = optionYears != null && optionYears > 0 ? optionYears : 0;
  const hold = !fromDelivery && holdYears != null && holdYears > 0 ? holdYears : null;
  const whole = Math.max(yearsLeft + opts, hold ?? 0);
  const heldOnLease = hold != null ? Math.min(hold, yearsLeft) : 0;
  const pastEnd = hold != null && hold > yearsLeft ? hold - yearsLeft : 0;
  const afterSale = hold != null ? Math.max(0, yearsLeft - hold) : 0;
  const toEnd = endLabel ? ` (to ${endLabel})` : "";
  const legend = [
    hold != null
      ? { tone: "bg-brand", text: `The model's hold, ${hold} ${hold === 1 ? "year" : "years"}${pastEnd > 0 ? `, ${years(pastEnd)} of it after the lease ends` : ""}` }
      : null,
    hold != null
      ? afterSale > 0
        ? { tone: "bg-brand/35", text: `Left at the sale, ${years(afterSale)}${toEnd}` }
        : null
      : fromDelivery
        ? { tone: "bg-brand/60", text: `The term, ${years(yearsLeft)} from delivery` }
        : { tone: "bg-brand/60", text: `Left today, ${years(yearsLeft)}${toEnd}` },
    pastEnd > 0 ? { tone: "bg-kill/60", text: "Past the lease's end" } : null,
    opts > 0 ? { tone: "border border-dashed border-brand/60 bg-brand/5", text: `${optionsWord}, ${years(opts)} if exercised` } : null,
  ].filter((l): l is { tone: string; text: string } => l != null);

  return (
    <div data-qa="lease-term">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-faint" aria-hidden>
        {hold == null ? (
          <div className="absolute inset-y-0 left-0 bg-brand/60" data-bar="lease-term" style={{ width: pctOf(yearsLeft, whole) }} />
        ) : (
          <>
            <div className="absolute inset-y-0 left-0 bg-brand" data-bar="lease-hold" style={{ width: pctOf(heldOnLease, whole) }} />
            {afterSale > 0 && (
              <div
                className="absolute inset-y-0 bg-brand/35"
                data-bar="lease-term"
                style={{ left: pctOf(heldOnLease, whole), width: pctOf(afterSale, whole) }}
              />
            )}
            {pastEnd > 0 && (
              <div
                className="absolute inset-y-0 bg-kill/60"
                data-bar="lease-past"
                style={{ left: pctOf(yearsLeft, whole), width: pctOf(pastEnd, whole) }}
              />
            )}
          </>
        )}
        {opts > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full border border-dashed border-brand/60 bg-brand/5"
            data-bar="lease-options"
            style={{ left: pctOf(yearsLeft, whole), width: pctOf(opts, whole) }}
          />
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {legend.map((l) => (
          <li key={l.text} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2 w-3 shrink-0 rounded-sm ${l.tone}`} />
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
