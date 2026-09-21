import { ZORI_CREDIT, ZORI_SOURCE_URL, monthOf, type ZoriRead } from "@/lib/zori";

/**
 * What landlords are asking this month, against what HUD will pay — the
 * asking rent from Zillow's Observed Rent Index beside the metro's 2BR fair
 * market rent, on one scale, so the gap between the two is a picture.
 *
 * Pure: the page reads the rows and hands the figure in, so this renders on
 * a fixture. Nothing renders with no figure — a metro with no ZORI row gets
 * no line, never a placeholder. Zillow's condition for using the data is
 * attribution, so the credit is part of the component and not the page's
 * to forget.
 *
 * The two numbers are about different things. The FMR is set once a year
 * from survey data two years old by the time it applies; the asking rent is
 * this month's listings, all home types, before concessions. An asking
 * rent well above the FMR is the ordinary case in a tight market and says
 * nothing about a building — it says which figure an underwrite should not
 * mistake for the other.
 */
export function ZoriLine({ z, fmr2br }: { z: ZoriRead | null; fmr2br: number | null }) {
  if (!z) return null;
  const top = Math.max(z.rent, fmr2br ?? 0);
  const width = (v: number) => `${Math.max(6, Math.round((v / top) * 100))}%`;
  const gapPct = fmr2br ? Math.round(((z.rent - fmr2br) / fmr2br) * 1000) / 10 : null;
  return (
    <div className="text-sm">
      <span className="text-[11px] uppercase tracking-wide text-muted">Asking rent, all homes</span>{" "}
      <span className="font-mono font-semibold tabular-nums">${z.rent.toLocaleString("en-US")}</span>
      <span className="text-muted">/mo</span>
      {z.yoyPct !== null && (
        <span className="ml-2 text-xs text-muted">
          <span aria-hidden="true">{z.yoyPct > 0 ? "▲" : z.yoyPct < 0 ? "▼" : "•"}</span>
          <span className="sr-only">{z.yoyPct > 0 ? "up " : z.yoyPct < 0 ? "down " : "unchanged, "}</span>{" "}
          <span className="tabular-nums">{Math.abs(z.yoyPct).toFixed(1)}%</span> on a year ago
        </span>
      )}
      <span className="ml-2 text-xs text-muted">{monthOf(z.asOf)}</span>
      <a
        href={ZORI_SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className="ml-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {ZORI_CREDIT}
      </a>
      {/* The asking rent against the 2BR fair market rent, one scale — the
          widths are the real dollars (aria-hidden: the figures read as text). */}
      {fmr2br !== null && (
        <div className="mt-2 max-w-md space-y-1" aria-hidden>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] font-medium text-muted">Asking</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
              <div className="h-full rounded-full bg-brand" style={{ width: width(z.rent) }} data-bar="zori" />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
              ${z.rent.toLocaleString("en-US")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] font-medium text-muted">HUD 2BR</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
              <div className="h-full rounded-full bg-brand/40" style={{ width: width(fmr2br) }} data-bar="zori" />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
              ${fmr2br.toLocaleString("en-US")}
            </span>
          </div>
        </div>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {gapPct !== null
          ? `Asking rent ${gapPct >= 0 ? "runs" : "sits"} ${Math.abs(gapPct).toFixed(1)}% ${gapPct >= 0 ? "above" : "below"} the fair market rent HUD pays for a two-bedroom — `
          : ""}
        the asking figure is this month&apos;s listings before concessions, the fair
        market rent a year&apos;s survey applied a year later, and neither is the
        other.
        {z.shared ? " The asking rent is the metro area's, shared across the MSA." : ""}
      </p>
    </div>
  );
}
