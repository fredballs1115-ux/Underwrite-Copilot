// Public-record comps panel (auto-comps v2). The deal-page wrapper around the
// shared CompsResultView: section chrome, the Refresh action, and the pending
// state live here; the readout/table/provenance rendering is shared with the
// standalone Pull Comps tool (/comps). The map stays with the OM comps view —
// this panel is the pricing read.

import { CompsResultView } from "@/app/(app)/comps/result-view";
import { pulledLine, refreshFailedLine, type RecordCompsResult } from "@/lib/public-comps/core";
import type { SubjectForCall } from "@/lib/public-comps/vs-median";
import { refreshRecordComps } from "./comps-actions";

function RefreshButton({ dealId }: { dealId: string }) {
  return (
    <form action={refreshRecordComps}>
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      >
        Refresh
      </button>
    </form>
  );
}

/** "Pulled Oct 8, 2026" under the heading, or, past STALE_PULL_DAYS,
 *  "Pulled Aug 2, 2026, over 30 days ago — refresh …" (lib/public-comps/core). */
function PulledOn({ retrievedAt, today }: { retrievedAt: string; today: string }) {
  const line = pulledLine(retrievedAt, today);
  if (!line) return null;
  return (
    <p className={`mt-1 text-[11px] ${line.stale ? "text-caution" : "text-muted"}`} data-qa="comps-pulled">
      {line.text}
    </p>
  );
}

export function PublicCompsPanel({
  dealId,
  result,
  hasAddress,
  subject,
  today,
  dbMarketsLine = "",
}: {
  dealId: string;
  result: RecordCompsResult | null;
  hasAddress: boolean;
  /** the deal the sales are read for (lib/public-comps/vs-median) */
  subject: SubjectForCall | null;
  /** the reader's day (ISO), read once by the page: a stored pull past
   *  STALE_PULL_DAYS says when it was pulled and asks for a refresh */
  today: string;
  /** the property database's markets holding recorded sales, by name, for
   *  the no-source sentence */
  dbMarketsLine?: string;
}) {
  if (!hasAddress) return null; // the research panel already asks for an address

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recorded sales nearby</h2>
        <RefreshButton dealId={dealId} />
      </div>
      {!result || (result.status === "pending" && !result.previous) ? (
        <p className="mt-2 text-sm text-muted">
          Pulling recorded sales from the public record for this address… it
          runs in the background. Reload the page to check.
        </p>
      ) : result.status === "pending" && result.previous ? (
        // A refresh in flight keeps the last set on the page, said as such.
        <>
          <p className="mt-1 text-[11px] text-muted" data-qa="comps-refreshing">
            Refreshing — reload the page to check. Until then, the last pull:
          </p>
          <PulledOn retrievedAt={result.previous.retrievedAt} today={today} />
          <CompsResultView result={result.previous} subject={subject} dbMarketsLine={dbMarketsLine} onDeal />
        </>
      ) : (
        <>
          {result.refreshFailed && (
            <p className="mt-1 text-[11px] text-caution" data-qa="comps-refresh-failed">
              {refreshFailedLine(result)}
            </p>
          )}
          <PulledOn retrievedAt={result.retrievedAt} today={today} />
          <CompsResultView result={result} subject={subject} dbMarketsLine={dbMarketsLine} onDeal />
        </>
      )}
    </section>
  );
}
