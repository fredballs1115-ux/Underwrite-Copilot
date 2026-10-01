import type { SaleCeiling } from "@/lib/sale-ceiling";
import type { SaleRead } from "@/lib/sale-terms";

/**
 * How the property is sold (#456) — the pure panel for `lib/sale-terms`,
 * drawn by the deal page under what is being sold and by the shared screen
 * under its own. Nothing on a negotiated sale.
 *
 * One picture, its legend in words so nothing rides on colour: THE BID, on
 * one track — the starting bid, the buyer's premium on top of it (what the
 * opening bid costs all-in), and, where the page has the model, a tick at
 * the most the model pays all-in at the buyer's hurdle. A countdown chip
 * says when bids are due.
 *
 * The sentences are the reader's own (`headline`) and the ceiling's
 * (lib/sale-ceiling), so the page, the workbook and the report agree.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const money = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e4) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}M` : `$${Math.round(n).toLocaleString("en-US")}`;

const METHOD_CHIP: Record<SaleRead["method"], string> = {
  auction: "Auction",
  receivership: "Receiver's sale",
  bankruptcy: "Bankruptcy sale",
  reo: "Lender-owned (REO)",
  negotiated: "",
  unknown: "Sale terms",
};

export function SalePanel({ sale, ceiling = null }: { sale: SaleRead | null; ceiling?: SaleCeiling | null }) {
  if (!sale) return null;
  const r = sale;
  const bid = r.startingBid;
  const allIn = r.floorAllIn;
  const top = ceiling?.maxAllIn != null && !ceiling.unbounded ? ceiling.maxAllIn : null;
  const scale = Math.max(allIn ?? 0, top ?? 0) * 1.08 || 1;
  const due = r.deadline && r.deadline.daysLeft >= 0 ? r.deadline : null;

  return (
    <section
      aria-label="How it is sold"
      data-qa="sale-panel"
      className="mt-4 rounded-xl border border-l-4 border-caution/40 border-l-caution bg-caution/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-caution">How it is sold</span>
        <span className="text-sm font-semibold">{METHOD_CHIP[r.method]}</span>
        {due && (
          <span className="rounded-full border border-caution/40 px-2 py-0.5 text-[10px] font-semibold text-caution" data-qa="sale-deadline">
            {due.daysLeft === 0 ? "Bids due today" : `Bids due in ${due.daysLeft} ${due.daysLeft === 1 ? "day" : "days"}`}
          </span>
        )}
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      {/* How it is sold leads; the premium, the reserve and the deadline
          are one click away and whole in the HTML — the bid's picture below
          draws the premium, and the chip above counts down to the deadline. */}
      {r.sentences.length > 0 && <p className="mt-1 text-sm leading-relaxed">{r.sentences[0]}</p>}
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}

      {bid != null && allIn != null && (
        <div className="mt-2.5" data-qa="sale-bid">
          <div className="relative flex h-3 overflow-visible rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-l-full bg-brand/70" data-bar="sale-bid" style={{ width: pctOf(bid, scale) }} />
            {allIn > bid && <div className="h-full bg-caution/70" data-bar="sale-premium" style={{ width: pctOf(allIn - bid, scale) }} />}
            {top != null && (
              <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="sale-ceiling" style={{ left: pctOf(top, scale) }} />
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/70" />
              {`Starting bid, ${money(bid)}`}
            </li>
            {allIn > bid && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-caution/70" />
                {`Buyer's premium, ${money(allIn - bid)} — ${money(allIn)} all-in`}
              </li>
            )}
            {top != null && ceiling && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-3 w-0.5 shrink-0 rounded-full bg-ink" />
                {`The model's ceiling at ${ceiling.hurdlePct}%, ${money(top)} all-in`}
              </li>
            )}
          </ul>
        </div>
      )}

      {ceiling?.line && <p className="mt-2 text-xs font-medium leading-relaxed">{ceiling.line}</p>}
      {r.terms && <p className="mt-2 text-xs leading-relaxed text-muted">{`The sale's terms as stated: ${r.terms}`}</p>}
    </section>
  );
}
