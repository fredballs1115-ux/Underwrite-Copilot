import { endLabel, type AffordableRead, type AffordableTier, type DatedEnd } from "@/lib/affordable";
import { yearsText } from "@/lib/ground-lease-term";
import { withArticle } from "@/lib/article";

/**
 * Affordable housing (#453) — the pure panel for `lib/affordable`, drawn by
 * the deal page under what is being sold and by the shared screen under its
 * own. Nothing on a market-rate deal.
 *
 * Three pictures, each with its legend in words so nothing rides on colour:
 *
 *   - THE UNITS: one bar the width of the building, a segment a tier — the
 *     deeper the income limit the deeper the tone, the market-rate units in
 *     the neutral one — and, where a HAP contract covers some of them, a
 *     thin second bar of the contract's units on the same scale. Where the
 *     memorandum gives no tiers, restricted and market-rate as two segments.
 *   - THE CLOCKS: the rent restriction, the credits' compliance period and
 *     the HAP contract, each a bar of the years it has left on one scale —
 *     the dates the rents change, and the one a pro forma most often gets
 *     wrong.
 *   - THE RENTS: each tier's rent against the limit the memorandum states,
 *     the limit as the track's end — at the limit, the rent grows only as
 *     the limits do; over it, the rent is a compliance finding.
 *
 * The sentences are the reader's own (`headline`, `gapLine`, `modelCaveat`),
 * so every surface says the same thing.
 */

// The rent a month, whole dollars.
const rent = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const count = (n: number) => n.toLocaleString("en-US");
const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;

/** A restricted tier's tone: the deeper the income limit, the deeper the
 *  teal. */
function tierTone(t: AffordableTier): string {
  if (t.kind === "market") return "bg-muted/40";
  if (t.kind === "assisted") return "bg-caution/70";
  if (t.kind === "other") return "bg-line";
  const ami = t.amiPct;
  if (ami == null) return "bg-brand/60";
  if (ami <= 30) return "bg-brand-strong";
  if (ami <= 50) return "bg-brand";
  if (ami <= 60) return "bg-brand/70";
  if (ami <= 80) return "bg-brand/50";
  return "bg-brand/35";
}

interface Segment {
  key: string;
  units: number;
  tone: string;
  text: string;
}

/** The units bar's segments: the tiers where every one states its units and
 *  they do not add past the building; else restricted and market-rate. */
function unitSegments(r: AffordableRead): { segments: Segment[]; whole: number } | null {
  const noun = r.noun;
  const tiers = r.tiers.filter((t) => t.units != null && t.units > 0);
  const tierSum = tiers.reduce((s, t) => s + (t.units ?? 0), 0);
  const whole = r.totalUnits ?? null;
  if (tiers.length > 0 && tiers.length === r.tiers.length && (whole == null || tierSum <= whole) && !r.countsDisagree) {
    // Deepest affordability first, the contract's units after, the market
    // last — the order the eye reads a building's rent roll in.
    const rank = (t: AffordableTier) => (t.kind === "restricted" ? (t.amiPct ?? 999) : t.kind === "assisted" ? 1000 : t.kind === "other" ? 1001 : 1002);
    const ordered = [...tiers].sort((a, b) => rank(a) - rank(b));
    const segments: Segment[] = ordered.map((t, i) => ({
      key: `${t.label}-${i}`,
      units: t.units!,
      tone: tierTone(t),
      text: `${t.label} · ${count(t.units!)} ${t.units === 1 ? noun.one : noun.many}`,
    }));
    const rest = whole != null ? whole - tierSum : 0;
    if (rest > 0) segments.push({ key: "rest", units: rest, tone: "bg-faint", text: `Not in the memorandum's tiers · ${count(rest)}` });
    return { segments, whole: whole ?? tierSum };
  }
  if (r.hapOnly || r.countsDisagree || r.restrictedUnits == null || whole == null || whole <= 0) return null;
  const market = r.marketUnits ?? whole - r.restrictedUnits;
  return {
    segments: [
      { key: "restricted", units: r.restrictedUnits, tone: "bg-brand/70", text: `Rent-restricted · ${count(r.restrictedUnits)}` },
      ...(market > 0 ? [{ key: "market", units: market, tone: "bg-muted/40", text: `Market-rate · ${count(market)}` }] : []),
    ],
    whole,
  };
}

interface Clock {
  key: string;
  label: string;
  end: DatedEnd;
}

export function AffordablePanel({ affordable }: { affordable: AffordableRead | null }) {
  if (!affordable) return null;
  const r = affordable;
  const units = unitSegments(r);
  // The contract's units on the building's scale, where the memorandum
  // states both and the tiers do not already draw them.
  const hapBar =
    r.assistedUnits != null && r.totalUnits != null && r.totalUnits > 0 && !r.countsDisagree && !r.tiers.some((t) => t.kind === "assisted")
      ? { units: r.assistedUnits, whole: r.totalUnits }
      : null;
  const clocks: Clock[] = [
    r.restrictionEnds ? { key: "restriction", label: "Rent restriction", end: r.restrictionEnds } : null,
    r.complianceEnds ? { key: "compliance", label: "Credits' compliance period", end: r.complianceEnds } : null,
    r.hapEnds ? { key: "hap", label: "HAP contract", end: r.hapEnds } : null,
  ].filter((c): c is Clock => c != null);
  const longest = Math.max(5, ...clocks.map((c) => c.end.yearsLeft));
  const rents = r.tiers.filter((t) => t.rent != null && t.maxRent != null && t.maxRent > 0);

  return (
    <section
      aria-label="Affordable housing"
      data-qa="affordable-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">Affordable housing</span>
        <span className="text-sm font-semibold">{r.label}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{r.headline}</p>

      {units && (
        <div className="mt-2.5" data-qa="affordable-units">
          <div className="flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            {units.segments.map((s) => (
              <div key={s.key} className={`h-full ${s.tone}`} data-bar="affordable-units" style={{ width: pctOf(s.units, units.whole) }} />
            ))}
          </div>
          {hapBar && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-faint" aria-hidden>
              <div className="h-full bg-caution/70" data-bar="affordable-hap" style={{ width: pctOf(hapBar.units, hapBar.whole) }} />
            </div>
          )}
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {units.segments.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-2 w-3 shrink-0 rounded-sm ${s.tone}`} />
                {s.text}
              </li>
            ))}
            {hapBar && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-1.5 w-3 shrink-0 rounded-sm bg-caution/70" />
                {`Under the HAP contract · ${count(hapBar.units)} of ${count(hapBar.whole)}`}
              </li>
            )}
          </ul>
        </div>
      )}

      {clocks.length > 0 && (
        <dl className="mt-3 space-y-1.5" data-qa="affordable-clocks">
          {clocks.map((c) => {
            const left = c.end.yearsLeft;
            return (
              <div key={c.key} className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-x-3 gap-y-0.5 text-[11px]">
                <dt className="font-medium text-ink">{c.label}</dt>
                <dd className="min-w-0">
                  {left > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-faint" aria-hidden>
                        <div
                          className={`h-full rounded-full ${c.key === "hap" ? "bg-caution/70" : c.key === "compliance" ? "bg-brand/40" : "bg-brand/70"}`}
                          data-bar="affordable-clock"
                          style={{ width: pctOf(left, longest) }}
                        />
                      </div>
                      <span className="shrink-0 font-mono tabular-nums text-muted">
                        {`${c.end.from === "year" ? "" : "to "}${endLabel(c.end)} · ${yearsText(left)}`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted">{`Stated end ${endLabel(c.end)} — passed`}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {rents.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-qa="affordable-rents">
          {rents.map((t, i) => {
            const over = (t.headroom ?? 0) < 0;
            const scale = Math.max(t.maxRent!, t.rent!);
            const atLimit = !over && (t.headroom ?? 0) <= t.maxRent! * 0.01;
            return (
              <li key={`${t.label}-${i}`} className="text-[11px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-ink">{t.units != null ? `${t.label} · ${count(t.units)}` : t.label}</span>
                  <span className={`font-mono tabular-nums ${over ? "font-semibold text-kill" : "text-muted"}`}>
                    {over
                      ? `${rent(t.rent!)} — over the ${rent(t.maxRent!)} limit`
                      : atLimit
                        ? `${rent(t.rent!)} — at the limit`
                        : `${rent(t.rent!)} of ${withArticle(rent(t.maxRent!))} limit`}
                  </span>
                </div>
                <div className="relative mt-0.5 h-2 rounded-full bg-faint" aria-hidden>
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-kill/60" : "bg-brand/70"}`}
                    data-bar="affordable-rent"
                    style={{ width: pctOf(t.rent!, scale) }}
                  />
                  {over && <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink" style={{ left: pctOf(t.maxRent!, scale) }} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {r.gapLine && <p className="mt-2 text-xs leading-relaxed">{r.gapLine}</p>}

      {(r.summary || r.agreement || r.assistance || r.unreadEnds.length > 0) && (
        <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-muted">
          {r.summary && <li>{`The memorandum: ${r.summary}`}</li>}
          {r.agreement && <li>{`The regulatory agreement as stated: ${r.agreement}`}</li>}
          {r.assistance && <li>{`The rental assistance as stated: ${r.assistance}`}</li>}
          {r.unreadEnds.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      )}
      {r.modelCaveat && <p className="mt-2 text-xs leading-relaxed text-muted">{r.modelCaveat}</p>}
    </section>
  );
}
