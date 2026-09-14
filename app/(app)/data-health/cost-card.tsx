import { costByStep, medianUsd, type UsageSummary } from "@/lib/anthropic/usage";

/**
 * What the last screens cost, as the operator's page draws it: the median
 * as the number, the latest screen's split by step as one bar, the four
 * meters on one line. Pure — the page hands it the ledgers it read, so the
 * render tests draw it on fixtures the way they draw every other signed-in
 * surface.
 */

/** A screen's ledger as the job row carries it (migration 0035). */
export interface UsageRow {
  id: string;
  usage: UsageSummary | null;
  updated_at: string;
}

/** The steps' colours in the cost bar, in the order the pipeline runs them. */
const STEP_COLORS = ["bg-brand", "bg-pass", "bg-caution", "bg-kill", "bg-ink/50", "bg-muted"];

/** "The first signal" → "First signal": the step's name as a legend word. */
export const stepWord = (what: string) => {
  const w = what.replace(/^The /, "");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const fmtTokens = (n: number) => n.toLocaleString("en-US");
const usd = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : null);

export function CostCard({
  screens,
  usageColumn = true,
}: {
  /** the last screens' ledgers, newest first; rows without a ledger are ignored */
  screens: UsageRow[];
  /** false when the schema has no ledger column yet (pre-0035) */
  usageColumn?: boolean;
}) {
  const rows = screens.filter((s) => s.usage && Array.isArray(s.usage.calls));
  const priced = rows
    .map((s) => s.usage?.usd)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const medianCost = medianUsd(priced);
  const latest = rows[0]?.usage ?? null;
  const split = latest ? costByStep(latest) : [];
  const splitTotal = split.reduce((acc, s) => acc + (s.usd ?? 0), 0);

  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-cost-card>
      <h2 className="text-sm font-semibold">Cost per screen</h2>
      {!usageColumn ? (
        <p className="mt-1 text-sm text-muted">
          The ledger column isn&apos;t there yet — run migration 0035; the next screen writes what
          it spent here.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          No screen has recorded what it spent yet — the next one will.
        </p>
      ) : (
        <div className="mt-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {usd(medianCost) ?? "—"}
            </span>
            <span className="text-xs text-muted">
              {priced.length === rows.length
                ? `median of the last ${rows.length} screen${rows.length === 1 ? "" : "s"}, at list price`
                : priced.length === 0
                  ? `none of the last ${rows.length} screen${rows.length === 1 ? "" : "s"} priced — an unpriced model`
                  : `median of the ${priced.length} screen${priced.length === 1 ? "" : "s"} that priced, of the last ${rows.length}, at list price`}
            </span>
          </p>
          {latest && split.length > 0 && (
            <>
              <div
                className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-faint"
                data-cost-bar
                role="img"
                aria-label={`Latest screen, ${usd(latest.usd) ?? "unpriced"}: ${split
                  .map((s) => `${stepWord(s.what)} ${usd(s.usd) ?? "unpriced"}`)
                  .join(", ")}`}
              >
                {split.map((s, i) => (
                  <span
                    key={s.what}
                    className={`${STEP_COLORS[i % STEP_COLORS.length]} h-full`}
                    style={{ width: `${splitTotal > 0 && s.usd != null ? (s.usd / splitTotal) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-hidden>
                {split.map((s, i) => (
                  <li key={s.what} className="inline-flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-sm ${STEP_COLORS[i % STEP_COLORS.length]}`} />
                    {stepWord(s.what)}
                    <span className="font-mono tabular-nums text-ink">{usd(s.usd) ?? "—"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-muted">
                latest screen · {latest.calls.length} calls · in {fmtTokens(latest.totals.input)} · cache write{" "}
                {fmtTokens(latest.totals.cacheWrite)} · cache read {fmtTokens(latest.totals.cacheRead)} · out{" "}
                {fmtTokens(latest.totals.output)} · {Math.round(latest.ms / 1000)}s
                {latest.unpriced.length ? ` · unpriced: ${latest.unpriced.join(", ")}` : ""}
              </p>
            </>
          )}
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The one cache write of the OM is most of a screen; the levers that cut it are named in
            order in <code className="rounded bg-faint px-1">lib/anthropic/models.ts</code>.
          </p>
        </div>
      )}
    </section>
  );
}
