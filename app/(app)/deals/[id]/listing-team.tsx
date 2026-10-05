import type { ReactNode } from "react";
import { initialsOf, type ListingBroker, type OffersDueRead } from "@/lib/offering";

/** A clock time and the zone written after it — "5:00 PM ET", "3 p.m.
 *  Eastern Time", "17:00 CET", "12:00 noon (EST)" — read only where the
 *  words carry a colon, an a.m. / p.m. or a noon, so a date's figures are
 *  never one, and a zone only as a whole word ("5:00 PM Thursday" keeps
 *  its day apart). */
const TIME_AND_ZONE =
  /\b(?:\d{1,2}(?::\d{2})?\s?(?:[AaPp]\.?\s?[Mm]\b\.?|[Nn]oon\b)|\d{1,2}:\d{2}\b)(?:\s+\(?(?:[A-Z]{1,5}|(?:Eastern|Central|Mountain|Pacific)(?:\s+(?:Standard|Daylight))?(?:\s+Time)?)\b\)?)?/;

/** The call for offers as written, its time and zone kept on one line: "at
 *  5:00 PM / ET" had left the zone alone on a line of its own at 390
 *  (research pass 36). The words are the memorandum's, untouched. */
function asWritten(stated: string): ReactNode {
  const m = TIME_AND_ZONE.exec(stated);
  if (!m) return stated;
  return (
    <>
      {stated.slice(0, m.index)}
      <span className="whitespace-nowrap">{m[0]}</span>
      {stated.slice(m.index + m[0].length)}
    </>
  );
}

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
          <span className="font-medium">{asWritten(offersDue.stated)}</span>
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
                {/* What the card is for: a tap to call or write. 2px apart,
                    16px tall, the two failed WCAG 2.5.8 wherever the email
                    wrapped under the phone (820, 320 — research pass 36):
                    10px apart now, so their 24px circles never meet, and
                    32px tall to a finger. */}
                {(b.phone || b.email || b.emailText) && (
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-2.5 text-xs">
                    {b.phone &&
                      (b.tel ? (
                        <a href={b.tel} className="font-mono tabular-nums text-brand hover:underline pointer-coarse:py-2">
                          {b.phone}
                        </a>
                      ) : (
                        <span className="font-mono tabular-nums">{b.phone}</span>
                      ))}
                    {/* Linked only where it is one plain address
                        (lib/offering's mailtoAddressOf); anything more is
                        printed as written, as an undialable phone is. */}
                    {b.email ? (
                      <a href={`mailto:${b.email}`} className="break-all text-brand hover:underline pointer-coarse:py-2">
                        {b.email}
                      </a>
                    ) : (
                      b.emailText && (
                        <span className="break-all" data-qa="email-unlinked">
                          {b.emailText}
                        </span>
                      )
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
