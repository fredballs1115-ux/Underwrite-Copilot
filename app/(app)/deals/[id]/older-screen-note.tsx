import type { ReactNode } from "react";

/**
 * A screen stored before a reader the deal's figures turn on (lib/older-
 * screen, research pass 42): said once, at the head of the header's panels —
 * before the plan and what is being sold, since it changes what every figure
 * above means — with the re-screen control the page already has. Pure: the
 * page hands in the sentence and the control.
 */
export function OlderScreenNote({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div
      role="status"
      data-qa="older-screen"
      className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm text-caution">{line}</p>
      {action}
    </div>
  );
}
