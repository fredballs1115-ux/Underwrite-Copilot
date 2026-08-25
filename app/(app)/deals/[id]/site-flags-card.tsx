// Site flags card (server component): the stored background site-check —
// census tract, Opportunity Zone membership, FEMA flood zone. Renders the
// honest status for every sub-lookup; a failed lookup is a visible
// "unavailable", never a silent absence. Data: deals.site_flags
// (lib/site-flags, migration 0030).

import type { SiteFlagsResult } from "@/lib/site-flags/core";

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function SiteFlagsCard({
  result,
  hasAddress,
}: {
  result: SiteFlagsResult | null;
  hasAddress: boolean;
}) {
  if (!hasAddress) return null;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Site flags</h2>
      {!result || result.status === "pending" ? (
        <p className="mt-2 text-sm text-muted">
          Checking federal datasets for this address (flood zone, Opportunity
          Zone)… refresh the page in a minute.
        </p>
      ) : result.status === "geocode_failed" ? (
        <p className="mt-2 text-sm text-muted">
          The address didn&apos;t geocode, so the site checks couldn&apos;t run.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Flood */}
            {result.flood === "unavailable" ? (
              <Chip label="Flood: unavailable" cls="bg-faint text-muted" />
            ) : result.flood === null ? (
              <Chip label="Flood: no mapped hazard zone at point" cls="bg-line/60 text-muted" />
            ) : result.flood.isHighRisk ? (
              <Chip
                label={`Flood zone ${result.flood.zone} — SFHA (insurance required on federally-backed debt)`}
                cls="bg-kill/10 text-kill"
              />
            ) : (
              <Chip
                label={`Flood zone ${result.flood.zone}${result.flood.subtype ? ` · ${result.flood.subtype.toLowerCase()}` : ""}`}
                cls="bg-caution/10 text-caution"
              />
            )}
            {/* Opportunity Zone */}
            {result.opportunityZone === "unchecked" ? (
              <Chip label="Opportunity Zone: not checked (registry unavailable)" cls="bg-faint text-muted" />
            ) : result.opportunityZone === null ? (
              <Chip label="Not in an Opportunity Zone" cls="bg-line/60 text-muted" />
            ) : (
              <Chip label="Opportunity Zone tract" cls="bg-pass/10 text-pass" />
            )}
            {result.tractGeoid && (
              <span className="text-xs text-muted">tract {result.tractGeoid}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{result.note}</p>
          {result.error && <p className="mt-1 text-xs text-caution">{result.error}</p>}
        </>
      )}
    </section>
  );
}
