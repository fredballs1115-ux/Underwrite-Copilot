import { initialsOf, type ListingBroker, type OffersDueRead } from "@/lib/offering";

/**
 * Who is selling it and when offers are due (#467) — the pure card for
 * lib/offering, drawn on the deal page under the reports. Nothing where the
 * memorandum names no one and states no date.
 *
 * A listing's contact card: each broker as the memorandum prints them, with
 * an initials badge, their title and firm, and the phone and email as links
 * where they are whole — a tap calls, a click writes. The call for offers
 * leads, as written, time of day and all; the day itself is the deadline
 * the header counts down to and puts in a calendar.
 */
export function ListingTeam({ team, offersDue }: { team: ListingBroker[]; offersDue: OffersDueRead | null }) {
  if (!team.length && !offersDue) return null;
  const firms: string[] = [];
  for (const b of team) if (b.firm && !firms.some((f) => f.toLowerCase() === b.firm.toLowerCase())) firms.push(b.firm);
  const page = offersDue?.page || team.find((b) => b.page)?.page || "";
  return (
    <section aria-label="The offering" data-qa="listing-team" className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">The offering</span>
        {firms.length > 0 && <span className="text-sm font-semibold">{`Offered by ${firms.join(" · ")}`}</span>}
        {page && <span className="font-mono text-[10px] text-muted">{page}</span>}
      </p>

      {offersDue && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-qa="offers-due-stated">
          <span className="text-muted">{offersDue.asReceived ? "Offers:" : "Offers due:"}</span>{" "}
          <span className="font-medium">{offersDue.stated}</span>
        </p>
      )}

      {team.length > 0 && (
        <ul className="mt-2 grid gap-3 sm:grid-cols-2" data-qa="listing-brokers">
          {team.map((b) => (
            <li key={b.name} className="flex min-w-0 items-start gap-2.5">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                {initialsOf(b.name)}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{b.name}</span>
                {(b.title || b.firm) && (
                  <span className="block text-xs leading-snug text-muted">{[b.title, b.firm].filter(Boolean).join(", ")}</span>
                )}
                {(b.phone || b.email) && (
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {b.phone &&
                      (b.tel ? (
                        <a href={b.tel} className="font-mono tabular-nums text-brand hover:underline">
                          {b.phone}
                        </a>
                      ) : (
                        <span className="font-mono tabular-nums">{b.phone}</span>
                      ))}
                    {b.email && (
                      <a href={`mailto:${b.email}`} className="break-all text-brand hover:underline">
                        {b.email}
                      </a>
                    )}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
