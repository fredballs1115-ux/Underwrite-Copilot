import { datedLong } from "@/lib/debt-index";
import type { CheckTone, ModelVsMarket } from "@/lib/model-vs-market";

/**
 * The model's assumptions against the published figures — the pure card
 * for `lib/model-vs-market`. One row an assumption: the model's figure,
 * where it came from, a chip saying which way it runs against the
 * published figures, and the one sentence that names the figures with
 * their dates and publishers. Nothing here is a verdict; the header says
 * what a trailing year is and is not.
 */
const TONE_CLASS: Record<CheckTone, string> = {
  ahead: "bg-caution/10 text-caution",
  behind: "bg-brand/10 text-brand",
  inside: "bg-pass/10 text-pass",
  tighter: "bg-caution/10 text-caution",
  looser: "bg-brand/10 text-brand",
  widens: "bg-pass/10 text-pass",
  compresses: "bg-kill/10 text-kill",
  level: "bg-faint text-muted",
  stated: "bg-faint text-muted",
};

export function ModelVsMarketCard({ read }: { read: ModelVsMarket | null }) {
  if (!read || read.checks.length === 0) return null;
  const readOn = datedLong(read.readOn);
  const scope = read.metro
    ? `The model's growth, vacancy and exit cap, set against what the ${read.metro} market and the national series have actually done, read on ${readOn}.`
    : `The model's expense growth and exit cap, set against the national series, read on ${readOn}.`;
  return (
    <section
      className="rounded-2xl border border-line bg-surface shadow-card"
      data-qa="model-vs-market"
      aria-labelledby="model-vs-market-heading"
    >
      <div className="border-b border-line px-5 py-4">
        <h2 id="model-vs-market-heading" className="text-sm font-semibold tracking-tight">
          Assumptions against the published figures
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {`${scope} A trailing year is what an assumption is being asked to beat, not a forecast; a metro figure is the metro area's, not the submarket's or the building's.`}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {read.checks.map((c) => (
          <li key={c.key} className="px-5 py-3" data-qa={`model-check-${c.key}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{c.title}</span>
              <span className="font-mono text-sm tabular-nums">{c.model}</span>
              <span className="text-xs text-muted">{c.modelSource}</span>
              <span
                className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${TONE_CLASS[c.tone]}`}
              >
                {c.toneLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{c.read}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
