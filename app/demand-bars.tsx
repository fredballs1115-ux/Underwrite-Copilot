import type { MetroDemand } from "@/lib/metro-demand";
import { supplySentence, type MetroSupply } from "@/lib/metro-supply";

/**
 * The demand side of a market as bars: a metro area's payrolls by sector
 * against a year ago (lib/metro-demand's rows), all payrolls first, the
 * sector that fills a building's kind drawn full and the others faded
 * where one is marked, every figure linked to its series, and the newest
 * month with the BLS credit in the caption. One picture, drawn by the deal
 * page's market section (a client component) and by the demo's sample
 * market (a server page) alike — so it takes plain rows, imports nothing
 * but a type, and carries no data of its own.
 *
 * The widths are the real changes on one scale (aria-hidden: each row's
 * label and figure read as text). A negative change draws leftward from
 * the centre line.
 */
export function DemandBars({ demand }: { demand: MetroDemand }) {
  const widest = Math.max(0.1, ...demand.rows.map((r) => Math.abs(r.valuePct)));
  return (
    <>
      <div className="mt-2 max-w-xl space-y-1">
        {demand.rows.map((r) => {
          const tone = r.all ? "bg-ink/40" : demand.mine === null || r.mine ? "bg-brand" : "bg-brand/35";
          return (
            <div key={r.key} className="flex items-center gap-2">
              <span className={`w-40 shrink-0 truncate text-[11px] sm:w-56 ${r.mine ? "font-medium text-ink" : "text-muted"}`}>
                {r.mine ? `${r.label} · this building's sector` : r.label}
              </span>
              <div className="relative h-3 flex-1 rounded-sm bg-faint" aria-hidden="true">
                <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <div
                  data-bar="demand"
                  className={`absolute inset-y-0 ${r.valuePct >= 0 ? "left-1/2" : "right-1/2"} ${tone}`}
                  style={{ width: `${(Math.abs(r.valuePct) / widest) * 50}%` }}
                />
              </div>
              <a
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {r.text}
              </a>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {`${demand.newestMonth} · BLS payrolls via FRED, against the same month a year earlier · each figure links to its series`}
        {demand.stale.length > 0 &&
          ` · ${demand.stale.length === 1 ? "one sector's figure is stale" : `${demand.stale.length} sectors' figures are stale`}: ${demand.stale.join(", ")}`}
      </p>
      {demand.supply && <SupplyLine supply={demand.supply} />}
    </>
  );
}

/**
 * The supply side under the demand bars, one line: the units the metro
 * area permitted in buildings of two or more over the last twelve months
 * against the twelve before, the share of everything permitted, and where
 * the two counts came from — the total less the single-family series,
 * which is the only split FRED publishes for a metro. The sentence is one
 * JS string, so the phrase live-verify greps has no separator inside it.
 */
export function SupplyLine({ supply }: { supply: MetroSupply }) {
  return (
    <p className="mt-2 text-xs text-muted" data-qa="metro-supply">
      <span className="font-medium text-ink">{"The supply side · "}</span>
      {supplySentence(supply)}
      {supply.fresh ? "" : " (a stale figure: the pull has not updated it on its cadence)"}
      {" · Census Bureau building permits via FRED, "}
      <a href={supply.hrefTotal} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand">
        all units
      </a>
      {" less "}
      <a href={supply.hrefSingle} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand">
        single-family
      </a>
      {", the only split published for a metro or a state"}
    </p>
  );
}
