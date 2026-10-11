// Public-record comps panel (auto-comps v2). The deal-page wrapper around the
// shared CompsResultView: section chrome, the Refresh action, and the pending
// state live here; the readout/table/provenance rendering is shared with the
// standalone Pull Comps tool (/comps). The map stays with the OM comps view —
// this panel is the pricing read.

import { CompsResultView } from "@/app/(app)/comps/result-view";
import type { RecordCompsResult } from "@/lib/public-comps/core";
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

export function PublicCompsPanel({
  dealId,
  result,
  hasAddress,
  subject,
}: {
  dealId: string;
  result: RecordCompsResult | null;
  hasAddress: boolean;
  /** the deal the sales are read for (lib/public-comps/vs-median) */
  subject: SubjectForCall | null;
}) {
  if (!hasAddress) return null; // the research panel already asks for an address

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recorded sales nearby</h2>
        <RefreshButton dealId={dealId} />
      </div>
      {!result || result.status === "pending" ? (
        <p className="mt-2 text-sm text-muted">
          Pulling recorded sales from the public record for this address… this
          runs automatically and usually lands within a minute. Refresh the
          page to check.
        </p>
      ) : (
        <CompsResultView result={result} subject={subject} />
      )}
    </section>
  );
}
