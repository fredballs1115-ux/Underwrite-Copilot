import { ZORI_CREDIT, ZORI_SOURCE_URL, monthOf, type ZoriRead } from "@/lib/zori";

/**
 * What landlords are asking this month, against what HUD will pay — the
 * asking rent from Zillow's Observed Rent Index beside the metro's 2BR fair
 * market rent, on one scale, so the gap between the two is a picture. And
 * two more of Zillow's figures where the pull had them: the APARTMENT
 * asking rent (the same index over multifamily listings alone, the one an
 * apartment underwrite should read, drawn as a third bar) and the typical
 * home value, said against a year of rent as the price-to-rent ratio.
 *
 * Pure: the page reads the rows and hands the figure in, so this renders on
 * a fixture. Nothing renders with no figure — a metro with no ZORI row gets
 * no line, never a placeholder, and a figure the pull did not have is
 * simply absent. Zillow's condition for using the data is attribution, so
 * the credit is part of the component and not the page's to forget.
 *
 * The numbers are about different things. The FMR is set once a year from
 * survey data two years old by the time it applies; the asking rent is
 * this month's listings, all home types, before concessions; the apartment
 * figure is those listings that are apartments. An asking rent well above
 * the FMR is the ordinary case in a tight market and says nothing about a
 * building — it says which figure an underwrite should not mistake for
 * the other.
 */
export function ZoriLine({ z, fmr2br }: { z: ZoriRead | null; fmr2br: number | null }) {
  if (!z) return null;
  const top = Math.max(z.rent, z.mfrRent ?? 0, fmr2br ?? 0);
  const width = (v: number) => `${Math.max(6, Math.round((v / top) * 100))}%`;
  const gapPct = fmr2br ? Math.round(((z.rent - fmr2br) / fmr2br) * 1000) / 10 : null;
  const mfrGapPct =
    z.mfrRent !== null && z.rent > 0 ? Math.round(((z.mfrRent - z.rent) / z.rent) * 1000) / 10 : null;

  // One string, so React puts no separators inside a sentence live-verify greps.
  const sentence =
    (gapPct !== null
      ? `Asking rent ${gapPct >= 0 ? "runs" : "sits"} ${Math.abs(gapPct).toFixed(1)}% ${gapPct >= 0 ? "above" : "below"} the fair market rent HUD pays for a two-bedroom — `
      : "") +
    "the asking figure is this month's listings before concessions, the fair market rent a year's survey applied a year later, and neither is the other." +
    (z.shared ? " The asking rent is the metro area's, shared across the MSA." : "") +
    (mfrGapPct !== null
      ? ` The apartment figure is Zillow's multifamily listings alone, ${Math.abs(mfrGapPct).toFixed(1)}% ${mfrGapPct < 0 ? "under" : "over"} the all-homes one, which adds houses and condos and runs higher wherever the houses are dear.`
      : "") +
    (z.priceToRentYears !== null
      ? ` A typical home costs ${z.priceToRentYears.toFixed(1)} years of the all-homes asking rent, which is the arithmetic that keeps a renter renting.`
      : "");

  return (
    <div className="text-sm">
      {z.mfrRent !== null && (
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted">Asking rent, apartments</span>{" "}
          <span className="font-mono font-semibold tabular-nums">${z.mfrRent.toLocaleString("en-US")}</span>
          <span className="text-muted">/mo</span>
          <Change pct={z.mfrYoyPct} />
        </div>
      )}
      <div>
        <span className="text-[11px] uppercase tracking-wide text-muted">Asking rent, all homes</span>{" "}
        <span className="font-mono font-semibold tabular-nums">${z.rent.toLocaleString("en-US")}</span>
        <span className="text-muted">/mo</span>
        <Change pct={z.yoyPct} />
        <span className="ml-2 text-xs text-muted">{monthOf(z.asOf)}</span>
        <a
          href={ZORI_SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {ZORI_CREDIT}
        </a>
      </div>
      {z.homeValue !== null && (
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted">Home value, typical</span>{" "}
          <span className="font-mono font-semibold tabular-nums">${z.homeValue.toLocaleString("en-US")}</span>
          <Change pct={z.homeValueYoyPct} />
          {z.priceToRentYears !== null && (
            <span className="ml-2 text-xs text-muted">
              {`· ${z.priceToRentYears.toFixed(1)} years of rent`}
            </span>
          )}
        </div>
      )}
      {/* The asking rents against the 2BR fair market rent, one scale — the
          widths are the real dollars (aria-hidden: the figures read as text). */}
      {fmr2br !== null && (
        <div className="mt-2 max-w-md space-y-1" aria-hidden>
          {z.mfrRent !== null && (
            <Bar label="Apartments" value={z.mfrRent} width={width(z.mfrRent)} tone="bg-brand" />
          )}
          <Bar label="All homes" value={z.rent} width={width(z.rent)} tone={z.mfrRent !== null ? "bg-brand/70" : "bg-brand"} />
          <Bar label="HUD 2BR" value={fmr2br} width={width(fmr2br)} tone="bg-brand/40" />
        </div>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{sentence}</p>
    </div>
  );
}

/** "▲ 2.3% on a year ago", with the direction read aloud; nothing without a figure. */
function Change({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <span className="ml-2 text-xs text-muted">
      <span aria-hidden="true">{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"}</span>
      <span className="sr-only">{pct > 0 ? "up " : pct < 0 ? "down " : "unchanged, "}</span>{" "}
      <span className="tabular-nums">{Math.abs(pct).toFixed(1)}%</span> on a year ago
    </span>
  );
}

function Bar({ label, value, width, tone }: { label: string; value: number; width: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-medium text-muted">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
        <div className={`h-full rounded-full ${tone}`} style={{ width }} data-bar="zori" />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
        ${value.toLocaleString("en-US")}
      </span>
    </div>
  );
}
