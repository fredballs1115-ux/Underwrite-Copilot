"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rerunAnalysis } from "../actions";

type Status = {
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
};

const STEP_LABELS: Record<string, string> = {
  extract: "Reading the OM and extracting terms…",
};

export function AnalysisProgress({
  dealId,
  hasOm,
  initial,
}: {
  dealId: string;
  hasOm: boolean;
  initial: Status;
}) {
  const router = useRouter();
  const [state, setState] = useState<Status>(initial);

  useEffect(() => {
    const active = state.status === "queued" || state.status === "running";
    if (!active) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Status;
        setState(data);
        // Results are written before the job is marked done, so a refresh now
        // re-renders the page with the extracted terms.
        if (data.status === "done") router.refresh();
      } catch {
        // transient network blip — keep polling
      }
    };

    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dealId, state.status, router]);

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-medium text-kill">Analysis failed</p>
        {state.error && <p className="mt-1 text-sm text-muted">{state.error}</p>}
        <RerunButton dealId={dealId} label="Try again" />
      </div>
    );
  }

  if (state.status === "queued" || state.status === "running") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
        <span className="text-sm">
          {STEP_LABELS[state.step ?? "extract"] ?? "Analyzing…"}
        </span>
        <span className="ml-auto text-xs text-muted">{state.progress}%</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      {hasOm ? (
        <>
          <p className="text-sm text-muted">
            Analysis hasn’t run for this deal yet.
          </p>
          <RerunButton dealId={dealId} label="Run analysis" />
        </>
      ) : (
        <p className="text-sm text-muted">No OM uploaded for this deal.</p>
      )}
    </div>
  );
}

function RerunButton({ dealId, label }: { dealId: string; label: string }) {
  return (
    <form action={rerunAnalysis} className="mt-3">
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
      >
        {label}
      </button>
    </form>
  );
}
