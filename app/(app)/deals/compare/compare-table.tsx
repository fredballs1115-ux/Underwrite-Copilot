import Link from "next/link";
import type { LeverageRead } from "@/lib/leverage";

export const VERDICT_PILL: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "bg-pass/15 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution" },
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
};

export const usd = (n: number | null | undefined) =>
  n == null ? null : "$" + Math.round(n).toLocaleString();
export const pct = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? null : n.toFixed(1) + "%";
export const mult = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? null : n.toFixed(2) + "x";

export type Col = {
  id: string;
  name: string;
  assetClass: string;
  market: string;
  /** covered-market name when the address maps into the 15-market scope */
  coveredMarket: string | null;
  verdict: string | null;
  reason: string | null;
  hasModel: boolean;
  /** deterministic mandate fit + a one-line why (misses / near-misses) */
  fit: "fits" | "near" | "outside" | null;
  fitNote: string | null;
  /** the deal's strategy label (Stabilized / Value-add / Conversion …), null when unknown */
  strategy: string | null;
  /** a deal with a plan (value-add, lease-up, conversion, development): its
   *  going-in cap and leverage read are not applicable — the plan is judged
   *  on yield on total cost */
  planDeal: boolean;
  irr: number | null;
  em: number | null;
  coc: number | null;
  cap: number | null;
  /** stabilized NOI ÷ total cost, % — the yardstick for a deal with a plan;
   *  null for a stabilized asset or a model built before the plan existed */
  yoc: number | null;
  /** cap vs the freshest 30-yr fixed — same arithmetic as the deal page */
  leverage: LeverageRead | null;
  price: string | null;
  noi: string | null;
};

const FIT_LABEL: Record<NonNullable<Col["fit"]>, { text: string; cls: string }> = {
  fits: { text: "Fits", cls: "text-pass" },
  near: { text: "Near miss", cls: "text-caution" },
  outside: { text: "Outside", cls: "text-kill" },
};

/** The row's spread as a bar — the pipeline's fit bar, scaled to the row's
 *  largest figure. Muted on a rejected deal (drawn, so the proportions stay
 *  honest; never crowned), brand on the best, brand at 40% otherwise. */
function SpreadBar({ share, rejected, best }: { share: number; rejected: boolean; best: boolean }) {
  return (
    <span aria-hidden data-spread-bar className="mt-1.5 block h-1 w-16 rounded-full bg-faint">
      <span
        className={`block h-full rounded-full ${
          rejected ? "bg-muted/50" : best ? "bg-brand" : "bg-brand/40"
        }`}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}

/** A signed figure's picture: a bar from a centre line — right in the pass
 *  colour, left in the kill colour, a thin spread in the caution one — scaled
 *  to the row's widest spread. Muted on a rejected deal, like SpreadBar. */
function SignedBar({
  share,
  tone,
  rejected,
}: {
  share: number;
  tone: LeverageRead["tone"];
  rejected: boolean;
}) {
  const half = Math.round(Math.abs(share) * 50);
  return (
    <span aria-hidden data-signed-bar className="relative mt-1.5 block h-1 w-16 rounded-full bg-faint">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-muted/40" />
      <span
        className={`absolute inset-y-0 rounded-full ${
          rejected
            ? "bg-muted/50"
            : tone === "negative"
              ? "bg-kill"
              : tone === "thin"
                ? "bg-caution"
                : "bg-pass"
        }`}
        style={share < 0 ? { right: "50%", width: `${half}%` } : { left: "50%", width: `${half}%` }}
      />
    </span>
  );
}

const BEST_PILL = (
  <>
    {/* The space keeps "2.10x best" two words when the table is read aloud
        or copied; the margin does the visual work. */}
    {" "}
    <span className="ml-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand">
      best
    </span>
  </>
);

export function CompareTable({ cols }: { cols: Col[] }) {
  // Never crown a hero number on a deal the screen rejected — that's the
  // exact pro-forma trap the product exists to counter.
  const eligible = cols.filter((c) => c.verdict !== "pass_on");
  const bestIrr = Math.max(...eligible.map((c) => c.irr ?? -Infinity));
  const bestEm = Math.max(...eligible.map((c) => c.em ?? -Infinity));

  const metricRows: {
    label: string;
    get: (c: Col) => string | null;
    best?: (c: Col) => boolean;
    mono?: boolean;
    /** optional per-cell tone class (e.g. the leverage row's traffic light) */
    cls?: (c: Col) => string;
    /** the figure as a number, for the row's spread bar — the same 0–100 bar
     *  the pipeline's fit column draws, scaled to the row's largest figure so
     *  a meeting reads which column leads at a glance */
    num?: (c: Col) => number | null;
    /** the figure is signed (a spread over a benchmark): its bar runs from a
     *  centre line, scaled to the row's widest spread either way */
    signed?: boolean;
  }[] = [
    { label: "Market", get: (c) => c.market },
    { label: "Covered market", get: (c) => c.coveredMarket ?? "—" },
    {
      label: "Asset class",
      get: (c) => c.assetClass.charAt(0).toUpperCase() + c.assetClass.slice(1),
    },
    // A conversion and a stabilized building are not the same kind of thing,
    // and a side-by-side that hides that compares apples to plans.
    { label: "Deal type", get: (c) => c.strategy ?? "—" },
    {
      label: "Levered IRR",
      get: (c) => pct(c.irr),
      best: (c) => c.verdict !== "pass_on" && c.irr != null && c.irr === bestIrr,
      mono: true,
      num: (c) => c.irr,
    },
    {
      label: "Equity multiple",
      get: (c) => mult(c.em),
      best: (c) => c.verdict !== "pass_on" && c.em != null && c.em === bestEm,
      mono: true,
      num: (c) => c.em,
    },
    { label: "Cash-on-cash (Yr 1)", get: (c) => pct(c.coc), mono: true, num: (c) => c.coc },
    // A plan deal's year-1 cap is a dark building's (negative, or a default)
    // — not a figure to compare on. Say so; the yield on cost row below is
    // its answer. Its cell draws no bar either.
    {
      label: "Going-in cap",
      get: (c) => (c.planDeal ? "n/a — plan" : pct(c.cap)),
      mono: true,
      num: (c) => (c.planDeal ? null : c.cap),
    },
    // The plan's yardstick: stabilized NOI over everything it cost to get
    // there. Blank for a stabilized asset — its going-in cap is the answer.
    { label: "Yield on cost (stabilized)", get: (c) => pct(c.yoc), mono: true, num: (c) => c.yoc },
    {
      label: "Leverage vs 30-yr",
      // Signed spread only — the full sentence lives on each deal's page.
      get: (c) =>
        c.planDeal
          ? "judged on yield on cost"
          : c.leverage
            ? `${c.leverage.spreadBps > 0 ? "+" : ""}${c.leverage.spreadBps} bps`
            : null,
      cls: (c) =>
        c.leverage?.tone === "negative"
          ? "text-kill"
          : c.leverage?.tone === "thin"
            ? "text-caution"
            : c.leverage
              ? "text-pass"
              : "",
      mono: true,
      // The spread is signed, so its picture is a bar from a centre line in
      // the read's colour; a plan deal has no cap to spread, so no bar.
      num: (c) => (c.planDeal || !c.leverage ? null : c.leverage.spreadBps),
      signed: true,
    },
    { label: "Purchase price", get: (c) => c.price, mono: true },
    { label: "Year-1 NOI", get: (c) => c.noi, mono: true },
  ];

  // Each row's spread, once, for both layouts: every figure against the
  // row's largest (the widest either way on a signed row), rejected deals
  // included (the proportions must be honest) but drawn muted — the "best"
  // pill still never lands on one. One column is no spread, so no bars.
  const rowStats = metricRows.map((mr) => {
    const nums = cols.map((c) => mr.num?.(c) ?? null);
    const rowMax = Math.max(0, ...nums.map((n) => (n == null ? 0 : mr.signed ? Math.abs(n) : n)));
    const drawBars = cols.length > 1 && rowMax > 0;
    return { nums, rowMax, drawBars };
  });
  const shareOf = (row: number, col: number): number | null => {
    const { nums, rowMax, drawBars } = rowStats[row];
    const n = nums[col];
    if (!drawBars || n == null) return null;
    const share = n / rowMax;
    return metricRows[row].signed ? Math.max(-1, Math.min(1, share)) : Math.min(1, Math.max(0, share));
  };
  const barFor = (mr: (typeof metricRows)[number], c: Col, ri: number, ci: number, isBest: boolean) => {
    const share = shareOf(ri, ci);
    if (share == null) return null;
    const rejected = c.verdict === "pass_on";
    return mr.signed ? (
      <SignedBar share={share} tone={c.leverage?.tone ?? "positive"} rejected={rejected} />
    ) : (
      <SpreadBar share={share} rejected={rejected} best={isBest} />
    );
  };

  return (
    <>
      {/* Phone: one card per deal with the table's rows stacked, so a phone
          reads a whole deal instead of one column and a sliver of the next.
          From `sm` up the table takes over. */}
      <ul className="grid gap-3 sm:hidden" aria-label="Deals compared">
        {cols.map((c, ci) => {
          const p = c.verdict ? VERDICT_PILL[c.verdict] : null;
          return (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/deals/${c.id}`} className="font-medium text-ink hover:text-brand">
                  {c.name}
                </Link>
                {p ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${p.cls}`}>
                    {p.label}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted">Screening</span>
                )}
              </div>
              {c.reason && <p className="mt-1 text-xs leading-relaxed text-muted">{c.reason}</p>}
              {c.fit && (
                <p className="mt-2 text-xs">
                  <span className={`font-semibold ${FIT_LABEL[c.fit].cls}`}>{FIT_LABEL[c.fit].text}</span>
                  {c.fitNote && <span className="text-muted"> · {c.fitNote}</span>}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {metricRows.map((mr, ri) => {
                  const val = mr.get(c);
                  const isBest = (mr.best?.(c) ?? false) && cols.length > 1;
                  return (
                    <div key={mr.label} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-muted">{mr.label}</dt>
                      <dd
                        className={`text-sm ${mr.mono ? "font-mono tabular-nums" : ""} ${
                          isBest ? "font-semibold text-brand" : mr.cls?.(c) || "text-ink"
                        }`}
                      >
                        {val ?? <span className="text-muted">—</span>}
                        {isBest && BEST_PILL}
                        {barFor(mr, c, ri, ci, isBest)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {!c.hasModel && (
                <Link
                  href={`/deals/${c.id}?tab=model`}
                  className="mt-3 inline-block text-[11px] font-medium text-brand hover:text-brand-strong"
                >
                  No model yet — generate →
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-card sm:block">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface" />
              {cols.map((c) => {
                const p = c.verdict ? VERDICT_PILL[c.verdict] : null;
                return (
                  <th
                    key={c.id}
                    className="border-b border-l border-line p-4 text-left align-top"
                  >
                    <Link
                      href={`/deals/${c.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {c.name}
                    </Link>
                    <div className="mt-2">
                      {p ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.cls}`}
                        >
                          {p.label}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">Screening</span>
                      )}
                    </div>
                    {c.reason && (
                      <p className="mt-2 max-w-[16rem] text-xs font-normal leading-relaxed text-muted">
                        {c.reason}
                      </p>
                    )}
                    {!c.hasModel && (
                      <Link
                        href={`/deals/${c.id}?tab=model`}
                        className="mt-2 inline-block text-[11px] font-medium text-brand hover:text-brand-strong"
                      >
                        No model yet — generate →
                      </Link>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Mandate fit leads — an analyst checks the box before the returns.
                Hidden entirely until a buy box exists to check against. */}
            {cols.some((c) => c.fit) && (
              <tr className="border-b border-line">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Buy box
                </td>
                {cols.map((c) => (
                  <td key={c.id} className="border-l border-line px-4 py-3 align-top">
                    {c.fit ? (
                      <>
                        <span className={`font-semibold ${FIT_LABEL[c.fit].cls}`}>
                          {FIT_LABEL[c.fit].text}
                        </span>
                        {c.fitNote && (
                          <p className="mt-0.5 max-w-[16rem] text-xs leading-relaxed text-muted">
                            {c.fitNote}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            )}
            {metricRows.map((mr, ri) => (
              <tr key={mr.label} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {mr.label}
                </td>
                {cols.map((c, ci) => {
                  const val = mr.get(c);
                  const isBest = (mr.best?.(c) ?? false) && cols.length > 1;
                  return (
                    <td
                      key={c.id}
                      className={`border-l border-line px-4 py-3 ${
                        mr.mono ? "font-mono tabular-nums" : ""
                      } ${isBest ? "font-semibold text-brand" : mr.cls?.(c) || "text-ink"}`}
                    >
                      {val ?? <span className="text-muted">—</span>}
                      {isBest && BEST_PILL}
                      {barFor(mr, c, ri, ci, isBest)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
