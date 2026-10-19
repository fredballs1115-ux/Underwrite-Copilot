import type { ScreenDiff } from "@/lib/screen-diff";

const VERDICT_LABEL: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "bg-pass/10 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/10 text-caution" },
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
              <MoveTile key={r.label} label={r.label} delta={r.delta} before={r.before} after={r.after} tone={r.direction} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** How a tile is toned: from the buyer's side where the figure has one
 *  (a price up is worse), `moved` where it has none — a market figure's
 *  move is a fact, not good or bad news for the deal. */
export type MoveTone = "worse" | "better" | "flat" | "moved";

const TILE: Record<MoveTone, { box: string; delta: string }> = {
  worse: { box: "border-kill/25 bg-kill/[0.04]", delta: "text-kill" },
  better: { box: "border-pass/25 bg-pass/[0.04]", delta: "text-pass" },
  flat: { box: "border-line bg-faint", delta: "text-muted" },
  moved: { box: "border-line bg-surface", delta: "text-ink" },
};

/**
 * One figure's move as a tile: its label and the move, then before → after.
 * The retrade card's and the market check's "since this screen" alike.
 * Given `said`, the figure's sentence, the tile is drawn for the eye and the
 * sentence is what a screen reader hears, so the move is never read twice.
 */
export function MoveTile({
  label,
  delta,
  before,
  after,
  tone,
  said,
}: {
  label: string;
  delta: string;
  before: string;
  after: string;
  tone: MoveTone;
  said?: string;
}) {
  const t = TILE[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{label}</p>
        <p className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${t.delta}`}>{delta}</p>
      </div>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">
        {before} → {after}
      </p>
    </>
  );
  return (
    <div className={`rounded-lg border p-2.5 ${t.box}`} data-tile="move">
      {said ? (
        <>
          <span className="sr-only">{said}</span>
          <div aria-hidden>{body}</div>
        </>
      ) : (
        body
      )}
    </div>
  );
}
