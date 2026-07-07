import type { ScreenDiff } from "@/lib/screen-diff";

const VERDICT_LABEL: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "bg-pass/15 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution" },
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The retrade card: what moved between the previous screen and this one.
 * Deterministic — every row comes from parsing both extractions in code.
 */
export function SinceLastScreen({ diff }: { diff: ScreenDiff }) {
  const from = diff.verdictFrom ? VERDICT_LABEL[diff.verdictFrom] : null;
  const to = diff.verdictTo ? VERDICT_LABEL[diff.verdictTo] : null;
  const changed = diff.rows.filter((r) => r.direction !== "flat");

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Since your last screen
          <span className="ml-2 font-normal text-muted">
            {fmtDate(diff.at)}
          </span>
        </h2>
        {from && to && (
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-0.5 ${from.cls}`}>
              {from.label}
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
            <span className={`rounded-full px-2.5 py-0.5 ${to.cls}`}>
              {to.label}
            </span>
            <span className="sr-only">
              verdict {diff.verdictChanged ? "changed" : "unchanged"} from{" "}
              {from.label} to {to.label}
            </span>
          </p>
        )}
      </div>

      {diff.allFlat ? (
        <p className="mt-2 text-sm text-muted">
          Same story as the last screen — none of the deal-defining numbers
          moved materially.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            {`${changed.length} of ${diff.rows.length} tracked figures moved. Colors read from the buyer's side.`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {diff.rows.map((r) => (
              <div
                key={r.label}
                className={`rounded-lg border p-2.5 ${
                  r.direction === "worse"
                    ? "border-kill/25 bg-kill/[0.04]"
                    : r.direction === "better"
                      ? "border-pass/25 bg-pass/[0.04]"
                      : "border-line bg-faint"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{r.label}</p>
                  <p
                    className={`font-mono text-[11px] font-semibold tabular-nums ${
                      r.direction === "worse"
                        ? "text-kill"
                        : r.direction === "better"
                          ? "text-pass"
                          : "text-muted"
                    }`}
                  >
                    {r.delta}
                  </p>
                </div>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">
                  {r.before} → {r.after}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
