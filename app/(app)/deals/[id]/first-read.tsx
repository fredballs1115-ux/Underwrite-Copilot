import type { FirstSignal } from "@/lib/anthropic/types";

/**
 * The instant signal card — shown from ~30s into a screen until the full
 * extraction supersedes it. Everything here is "as the OM states it".
 */
export function FirstReadCard({ signal }: { signal: FirstSignal }) {
  const stats = (
    [
      ["Ask", signal.askPrice],
      ["Size", signal.size],
      ["Going-in cap", signal.goingInCap],
      [
        /sf|sq|square|psf|\/\s?ft/i.test(signal.perUnit) ? "Per SF" : "Per unit",
        signal.perUnit,
      ],
    ] as const
  ).filter(([, v]) => v.trim());

  return (
    <section className="shadow-card rounded-2xl border border-brand/25 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">First read</h2>
        <span className="text-[11px] text-muted">
          the quick first pass — the full screen is still running
        </span>
      </div>
      {signal.take && (
        <p className="mt-2 text-sm leading-relaxed">{signal.take}</p>
      )}
      {stats.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-line bg-faint px-3 py-2"
            >
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2.5 text-[11px] text-muted">
        As the OM states them — unverified. The extraction, challenges, and
        verdict replace this as they land.
      </p>
    </section>
  );
}
