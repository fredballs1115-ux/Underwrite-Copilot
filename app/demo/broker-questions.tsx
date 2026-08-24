"use client";

import { useState } from "react";
import { SAMPLE_DEAL } from "@/lib/sample-deal";

// The challenger's REAL broker questions from the sample screen — the same
// challenge objects the analyses tab renders, reshaped as an interactive
// "what would you ask?" strip. No new content is written here: assumption,
// severity, and question all come straight off the stored analysis.
const ITEMS = (SAMPLE_DEAL.challenges.challenges ?? [])
  .filter((c) => c.question)
  .slice(0, 3);

const SEV_CHIP: Record<string, string> = {
  high: "bg-kill/10 text-kill",
  medium: "bg-caution/10 text-caution",
  low: "bg-brand/10 text-brand",
};

export function BrokerQuestions() {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  if (ITEMS.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Try it: what would you ask the broker?
        </h2>
        <span className="text-[11px] text-muted">
          the screen drafts the exact question for every challenged assumption
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {ITEMS.map((c, i) => {
          const open = !!revealed[i];
          return (
            <div
              key={c.assumption}
              className="flex flex-col rounded-xl border border-line bg-paper p-4"
            >
              <span
                className={`w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                  SEV_CHIP[c.severity] ?? SEV_CHIP.medium
                }`}
              >
                {c.severity}
              </span>
              <p className="mt-2 text-sm font-medium leading-snug">
                {c.assumption}
              </p>
              <div className="mt-auto pt-3">
                {open ? (
                  <p className="animate-fade border-l-2 border-brand pl-2.5 text-xs leading-relaxed text-ink">
                    “{c.question}”
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevealed((s) => ({ ...s, [i]: true }))}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                  >
                    Reveal the drafted question →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Every challenged assumption on a real screen ships with its question —
        forward them to the broker before the site visit, not after.
      </p>
    </section>
  );
}
