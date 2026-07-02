import Link from "next/link";

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
  verdict: string | null;
  reason: string | null;
  hasModel: boolean;
  irr: number | null;
  em: number | null;
  coc: number | null;
  cap: number | null;
  price: string | null;
  noi: string | null;
};

export function CompareTable({ cols }: { cols: Col[] }) {
  // Never crown a hero number on a deal the screen rejected — that's the
  // exact broker-math trap the product exists to counter.
  const eligible = cols.filter((c) => c.verdict !== "pass_on");
  const bestIrr = Math.max(...eligible.map((c) => c.irr ?? -Infinity));
  const bestEm = Math.max(...eligible.map((c) => c.em ?? -Infinity));

  const metricRows: {
    label: string;
    get: (c: Col) => string | null;
    best?: (c: Col) => boolean;
    mono?: boolean;
  }[] = [
    { label: "Market", get: (c) => c.market },
    {
      label: "Asset class",
      get: (c) => c.assetClass.charAt(0).toUpperCase() + c.assetClass.slice(1),
    },
    {
      label: "Levered IRR",
      get: (c) => pct(c.irr),
      best: (c) => c.verdict !== "pass_on" && c.irr != null && c.irr === bestIrr,
      mono: true,
    },
    {
      label: "Equity multiple",
      get: (c) => mult(c.em),
      best: (c) => c.verdict !== "pass_on" && c.em != null && c.em === bestEm,
      mono: true,
    },
    { label: "Cash-on-cash (Yr 1)", get: (c) => pct(c.coc), mono: true },
    { label: "Going-in cap", get: (c) => pct(c.cap), mono: true },
    { label: "Purchase price", get: (c) => c.price, mono: true },
    { label: "Year-1 NOI", get: (c) => c.noi, mono: true },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
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
          {metricRows.map((mr) => (
            <tr key={mr.label} className="border-b border-line last:border-0">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                {mr.label}
              </td>
              {cols.map((c) => {
                const val = mr.get(c);
                const isBest = (mr.best?.(c) ?? false) && cols.length > 1;
                return (
                  <td
                    key={c.id}
                    className={`border-l border-line px-4 py-3 ${
                      mr.mono ? "font-mono tabular-nums" : ""
                    } ${isBest ? "font-semibold text-brand" : "text-ink"}`}
                  >
                    {val ?? <span className="text-muted">—</span>}
                    {isBest && (
                      <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand">
                        best
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
