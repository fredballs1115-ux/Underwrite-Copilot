import { DemandBars } from "@/app/demand-bars";
import type { MetroDemand } from "@/lib/metro-demand";

/**
 * The sample market's demand side — the picture a screened deal gets under
 * its market check (lib/metro-demand → app/demand-bars), drawn on the
 * sample: the Philadelphia area's payrolls by sector against a year ago,
 * off the rows the weekday pull writes, all payrolls first, each figure
 * dated and linked to its series. The sample is an apartment building, so
 * nothing is singled out — rental housing runs on all payrolls; a screened
 * office, warehouse, store or hotel gets its own sector drawn full. Pure,
 * so the render test draws it on a fixture and checks the phrase the
 * live-verify marker greps against the markup a curl receives; nothing
 * renders when the read has nothing, so the demo never shows a picture the
 * product would not draw.
 */
export function SampleDemandCard({ demand }: { demand: MetroDemand | null }) {
  if (!demand) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4" data-qa="sample-demand">
      <p className="text-[11px] uppercase tracking-wide text-muted">
        Demand check — read today, not opined
      </p>
      <p className="mt-2 text-sm font-medium leading-relaxed">
        {`The demand side today — payrolls by sector, ${demand.area}`}
      </p>
      <p className="mt-0.5 text-xs text-muted">{demand.intro}</p>
      <DemandBars demand={demand} />
      <p className="mt-2 text-xs text-muted">
        Every screened deal in a covered market gets this picture under its market check — an office, a warehouse, a store, a clinic or a hotel with the sector that fills it drawn full.
      </p>
    </div>
  );
}
