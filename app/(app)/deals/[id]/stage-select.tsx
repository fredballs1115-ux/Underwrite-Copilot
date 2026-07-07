"use client";

import { useRef } from "react";
import { setStage } from "../actions";
import { STAGES, STAGE_LABEL, normalizeStage } from "@/lib/stages";

/** Where this deal sits in YOUR process — saves on change. Independent of the
 *  screen's verdict, shared with the team when the deal is shared. Used on the
 *  deal page and (compact) on each pipeline row. */
export function StageSelect({
  dealId,
  stage,
  next,
  compact = false,
}: {
  dealId: string;
  stage: string;
  /** "pipeline" returns to /deals after saving (row-level use) */
  next?: "pipeline";
  compact?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setStage} className={compact ? "w-full" : undefined}>
      <input type="hidden" name="dealId" value={dealId} />
      {next && <input type="hidden" name="next" value={next} />}
      <select
        name="stage"
        defaultValue={normalizeStage(stage)}
        onChange={() => {
          const f = formRef.current;
          if (!f) return;
          if (typeof f.requestSubmit === "function") f.requestSubmit();
          else f.submit();
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Deal stage"
        title="Track where this deal sits in your process"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235f6b69' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.5rem center",
          backgroundSize: "0.8rem",
        }}
        className={`appearance-none rounded-lg border border-line bg-surface outline-none transition-colors hover:bg-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 ${
          compact
            ? "w-full min-w-0 py-1 pl-2 pr-6 text-[11px] font-medium"
            : "py-1.5 pl-3 pr-7 text-xs font-medium shadow-sm"
        }`}
      >
        {STAGES.map((v) => (
          <option key={v} value={v}>
            {STAGE_LABEL[v]}
          </option>
        ))}
      </select>
    </form>
  );
}
