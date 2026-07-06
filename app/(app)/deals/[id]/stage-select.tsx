"use client";

import { useRef } from "react";
import { setStage } from "../actions";

const STAGES: [string, string][] = [
  ["screening", "Screening"],
  ["reviewing", "Reviewing"],
  ["pursuing", "Pursuing"],
  ["dead", "Dead"],
];

/** Where this deal sits in YOUR process — saves on change. Independent of the
 *  screen's verdict, shared with the team when the deal is shared. */
export function StageSelect({
  dealId,
  stage,
}: {
  dealId: string;
  stage: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setStage}>
      <input type="hidden" name="dealId" value={dealId} />
      <select
        name="stage"
        defaultValue={stage}
        onChange={() => {
          const f = formRef.current;
          if (!f) return;
          if (typeof f.requestSubmit === "function") f.requestSubmit();
          else f.submit();
        }}
        aria-label="Deal stage"
        title="Track where this deal sits in your process"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235f6b69' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.5rem center",
          backgroundSize: "0.8rem",
        }}
        className="appearance-none rounded-lg border border-line bg-surface py-1.5 pl-3 pr-7 text-xs font-medium shadow-sm outline-none transition-colors hover:bg-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        {STAGES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
