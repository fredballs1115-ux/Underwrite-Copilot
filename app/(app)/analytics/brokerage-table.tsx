import Link from "next/link";
import { partialText, rateText, type BrokerRow } from "@/lib/brokerage";
import { Key, KeyItem } from "@/app/panel-parts";
import { moreText } from "@/lib/analytics";
import { scorecardNote } from "./scorecard-note";

/**
 * The analytics page's "By brokerage" scorecard: each firm's deals a bar on
 * one scale (the busiest firm's count), and over it, on the same scale, the
 * deals that fit the box and the deals called Go as two fills — so a firm's
 * bar says how much it sends and how much of that is worth reading. The
 * counts stay in words beside the bars ("3 of 5 (60%)"), since a fill is a
 * count and the share is its words.
 *
 * Pure: the page builds the scorecard and hands the rows in, so the render
 * test draws this on a fixture.
 */
export function BrokerageTable({ rows, unnamed, limit = 12 }: { rows: readonly BrokerRow[]; unnamed: number; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((b) => b.received));
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="by-brokerage">
      <h2 className="text-sm font-semibold tracking-tight">By brokerage</h2>
      <div className="scroll-shadows-x mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-medium">Brokerage</th>
              <th className="py-2 pr-3 font-medium">Deals</th>
              <th className="py-2 pr-3 text-right font-medium">Fit the box</th>
              <th className="py-2 text-right font-medium">Go calls</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.key} className="border-b border-line/60">
                <td className="max-w-[16rem] py-2 pr-3">
                  <Link href={`/deals?broker=${encodeURIComponent(b.key)}`} className="font-medium text-brand hover:underline">
                    {b.name}
                  </Link>
                  {b.names.length > 1 && (
                    <span className="block truncate text-[11px] text-muted" title={b.names.join(" · ")}>
                      {`as ${b.names.join(" · ")}`}
                    </span>
                  )}
                </td>
                <td className="w-[40%] min-w-[9rem] py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="relative block h-3 min-w-0 flex-1">
                      <span
                        className="absolute inset-y-0 left-0 overflow-hidden rounded-sm bg-brand/15"
                        style={{ width: pct(b.received) }}
                        data-bar="brokerage-deals"
                      />
                      {b.fits > 0 && (
                        <span
                          className="absolute left-0 top-0 h-1.5 rounded-tl-sm bg-pass"
                          style={{ width: pct(b.fits) }}
                          data-bar="brokerage-fit"
                        />
                      )}
                      {b.go > 0 && (
                        <span
                          className="absolute bottom-0 left-0 h-1.5 rounded-bl-sm bg-brand"
                          style={{ width: pct(b.go) }}
                          data-bar="brokerage-go"
                        />
                      )}
                    </span>
                    <span className="w-6 shrink-0 text-right font-mono tabular-nums">{b.received}</span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {rateText(b.fits, b.judged)}
                  {b.partial > 0 && " "}
                  {b.partial > 0 && <span className="block text-[11px] text-muted">{partialText(b.partial)}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{rateText(b.go, b.decided)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Key className="mt-2">
        <KeyItem mark="swatch" tone="bg-brand/15">Deals received</KeyItem>
        <KeyItem mark="swatch" tone="bg-pass">Fit the box</KeyItem>
        <KeyItem mark="swatch" tone="bg-brand">Called Go</KeyItem>
      </Key>
      {moreText(rows.length - shown.length, "firm") && (
        <p className="mt-2 text-xs text-muted" data-qa="brokers-more">
          {moreText(rows.length - shown.length, "firm")}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">{scorecardNote(unnamed)}</p>
    </section>
  );
}
