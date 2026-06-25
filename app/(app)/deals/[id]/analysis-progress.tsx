"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = { status: string; step: string | null; progress: number };

const STEP_LABELS: Record<string, string> = {
  extract: "Reading the OM and extracting the key terms…",
  challenge: "Red-teaming the assumptions like an investment committee…",
  comps: "Scrutinizing the broker’s comps for cherry-picking…",
  reconcile: "Reconciling your model against the OM…",
};

/**
 * Shown only while analysis is queued/running. Polls the status endpoint and
 * refreshes the page when a step finishes (so results appear one at a time) or
 * when the run ends (success or error).
 */
export function AnalysisProgress({
  dealId,
  initial,
}: {
  dealId: string;
  initial: Status;
}) {
  const router = useRouter();
  const [state, setState] = useState<Status>(initial);
  const lastStep = useRef<string | null>(initial.step);

  useEffect(() => {
    if (state.status !== "queued" && state.status !== "running") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Status;
        if (cancelled) return;

        const stepChanged = data.step !== lastStep.current;
        lastStep.current = data.step;
        setState(data);

        // Refresh to reveal a finished step's results, or to swap in the final
        // state (results or error) when the run ends.
        if (stepChanged || data.status === "done" || data.status === "error") {
          router.refresh();
        }
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

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand"
        aria-hidden
      />
      <span className="text-sm">
        {STEP_LABELS[state.step ?? "extract"] ?? "Analyzing…"}
      </span>
      <span className="ml-auto text-xs tabular-nums text-muted">
        {state.progress}%
      </span>
    </div>
  );
}
