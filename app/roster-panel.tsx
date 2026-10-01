import { endLabel } from "@/lib/affordable";
import type { RosterRead } from "@/lib/tenant-roster";

/**
 * The tenants a multi-tenant property's memorandum lists (#457) — the pure
 * panel for `lib/tenant-roster`, drawn by the deal page under what is being
 * sold and by the shared screen under its own. Nothing on a single-tenant
 * property, housing, a hotel, storage or land.
 *
 * Three pictures, each with its words beside it so nothing rides on
 * colour:
 *
 *   - THE ROLL: a column a year to the model's sale, the share of the
 *     listed rent (or space) expiring in it, the worst year in the warning
 *     tone and the sale marked after the last.
 *   - THE BUILDING: one bar of its area, a segment a listed tenant (the
 *     anchors darker), the space the list does not cover left empty, and an
 *     anchor outside the sale drawn apart, dashed.
 *   - THE LIST: each tenant's share of the listed rent and when its lease
 *     ends or it may leave (in the warning tone before the sale), its area
 *     and the rights it holds under its name.
 *
 * The first two sentences of the read lead — what the list covers, and the
 * roll — and the rest is folded, since the pictures draw most of it.
 *
 * The sentences are the reader's own: the `headline`, and the model's read
 * (`rosterModelLine`) as the derived model computed it (`meta.roster.read`),
 * so the page, the workbook and the report say the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const sfText = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const pct = (n: number) => `${Math.round(n)}%`;

export function RosterPanel({ roster, modelLine = "" }: { roster: RosterRead | null; modelLine?: string }) {
  if (!roster) return null;
  const r = roster;
  const of = r.rollBasis === "rent" ? "rent" : "space";
  const tallest = Math.max(25, ...r.years.map((y) => y.sharePct));
  const whole = r.buildingSf ?? r.listedSf ?? null;
  const listedRent = r.tenants.every((t) => t.annualRent != null) ? r.tenants.reduce((a, t) => a + (t.annualRent ?? 0), 0) : null;
  const beforeSale = (years: number | null | undefined) => years != null && years <= r.holdYears;

  return (
    <section
      aria-label="Tenants"
      data-qa="roster-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">Tenants</span>
        <span className="text-sm font-semibold">{`${r.tenants.length} listed`}</span>
        {r.coveragePct != null && (
          <span className="rounded-full border border-brand/30 px-2 py-0.5 text-[10px] font-semibold text-brand">{`${pct(r.coveragePct)} of the building`}</span>
        )}
        {r.shadow.length > 0 && (
          <span className="rounded-full border border-caution/40 px-2 py-0.5 text-[10px] font-semibold text-caution">Shadow-anchored</span>
        )}
      </p>
      {/* What the list covers and the roll lead; the rest of the read is one
          click away and whole in the HTML, since the pictures below draw
          most of it. */}
      <p className="mt-1 text-sm leading-relaxed">{r.sentences.slice(0, 2).join(" ")}</p>
      {r.sentences.length > 2 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 2} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(2).join(" ")}</p>
        </details>
      )}

      {r.years.length > 0 && (
        <div className="mt-3" data-qa="roster-roll">
          <p className="text-[11px] font-medium text-ink">{`The ${of} each year's leases take with them, to the model's sale`}</p>
          <ol className="mt-1.5 flex items-end gap-1.5">
            {r.years.map((y) => {
              const worst = r.worst?.year === y.year && y.sharePct > 0;
              return (
                <li key={y.year} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px]">
                  <span className={`font-mono tabular-nums ${worst ? "font-semibold text-caution" : "text-muted"}`}>{pct(y.sharePct)}</span>
                  <div className="flex h-16 w-full items-end rounded-md bg-faint" aria-hidden>
                    <div
                      className={`w-full rounded-md ${worst ? "bg-caution/75" : "bg-brand/60"}`}
                      data-bar="roster-roll"
                      style={{ height: pctOf(y.sharePct, tallest) }}
                    />
                  </div>
                  <span className="text-muted">{`Year ${y.year}`}</span>
                </li>
              );
            })}
            <li className="flex shrink-0 flex-col items-center gap-1 self-stretch text-[10px]">
              <span className="invisible font-mono" aria-hidden>
                0%
              </span>
              <div className="h-16 w-0 border-l-2 border-dashed border-ink" aria-hidden />
              <span className="font-semibold text-ink">Sale</span>
            </li>
          </ol>
        </div>
      )}

      {whole != null && r.tenants.some((t) => t.sf != null) && (
        <div className="mt-3" data-qa="roster-building">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="font-medium text-ink">{r.buildingSf != null ? "The building, by the space each listed tenant leases" : "The listed space"}</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{sfText(whole)}</span>
          </div>
          <div className="mt-0.5 flex items-stretch gap-2">
            <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-faint" aria-hidden>
              {r.tenants
                .filter((t) => t.sf != null)
                .map((t, i) => (
                  <div
                    key={t.name}
                    title={t.name}
                    className={`h-full border-r border-surface ${t.anchor ? "bg-brand/80" : i % 2 ? "bg-brand/45" : "bg-brand/60"}`}
                    data-bar="roster-tenant"
                    style={{ width: pctOf(t.sf!, whole) }}
                  />
                ))}
            </div>
            {r.shadow.map((t) => (
              <div
                key={t.name}
                className="flex h-3 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-caution/70"
                data-bar="roster-shadow"
                aria-hidden
              />
            ))}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/80" />
              Anchors
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/55" />
              The other listed tenants
            </li>
            {r.buildingSf != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-faint ring-1 ring-line" />
                Space the list does not cover
              </li>
            )}
            {r.shadow.map((t) => (
              <li key={t.name} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm border border-dashed border-caution/70" />
                {`${t.name}${t.sf != null ? `, ${sfText(t.sf)}` : ""} — an anchor not in the sale`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Three columns, so the list fits a phone: each tenant's area, its
          anchor tag and the rights it holds sit under its name. */}
      <table className="mt-3 w-full max-w-2xl text-left text-[11px]" data-qa="roster-list">
        <caption className="sr-only">The listed tenants</caption>
        <thead className="text-[10px] uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-1 pr-2 font-semibold">Tenant</th>
            <th scope="col" className="whitespace-nowrap py-1 pr-2 text-right font-semibold">Of rent</th>
            <th scope="col" className="py-1 font-semibold">Lease ends</th>
          </tr>
        </thead>
        <tbody>
          {r.tenants.map((t) => {
            // Before the sale by the DAY: whole months put a lease ending a
            // week after the sale before it (lib/ground-lease-term
            // `DatedSpan`).
            const endsYears = t.monthToMonth ? 0 : t.ends?.yearsToTheDay;
            const leaveYears = t.early?.yearsToTheDay;
            const notes = [
              t.sf != null ? sfText(t.sf) : "",
              t.coTenancy ? "Co-tenancy" : "",
              t.goDark ? "May go dark" : "",
              t.kickOut ? "Kick-out" : "",
            ].filter(Boolean);
            return (
              <tr key={t.name} className="border-b border-line/60 align-top last:border-0">
                <th scope="row" className="py-1 pr-2 font-normal">
                  <span className="font-medium text-ink">{t.name}</span>
                  {t.anchor && <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-brand">Anchor</span>}
                  {notes.length > 0 && <span className="block text-[10px] text-muted">{notes.join(" · ")}</span>}
                </th>
                <td className="py-1 pr-2 text-right font-mono tabular-nums">
                  {listedRent && t.annualRent != null ? pct((t.annualRent / listedRent) * 100) : "—"}
                </td>
                <td className="py-1">
                  <span className={beforeSale(endsYears) ? "font-semibold text-caution" : ""}>
                    {t.monthToMonth ? "Month to month" : t.ends ? endLabel(t.ends) : "Not stated"}
                  </span>
                  {t.early && (
                    <span className={`block ${beforeSale(leaveYears) ? "text-caution" : "text-muted"}`}>{`May leave ${endLabel(t.early)}`}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">{`A lease ending before the model's sale in year ${r.holdYears} is in the warning tone.`}</p>

      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
