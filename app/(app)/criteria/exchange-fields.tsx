import { EXCHANGE_FILERS, exchangeWindow, type ExchangeBlock } from "@/lib/exchange-window";

/**
 * The buy box's 1031 exchange (lib/exchange-window) — the fields the
 * criteria page's form saves, pure so a test draws them: the day the
 * relinquished property was transferred, who files the return and whether
 * it is extended, each optional, and a blank day no exchange. Where the box
 * holds one, the clock's own sentence is said under the fields, on the
 * reader's day (lib/reader-day) the page hands in. Each deal's deadlines
 * against it are the deal page's, the pipeline's, the memo's and the
 * verdict's; never the shared screen's, since the box is the reader's.
 */

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

export function ExchangeFields({ exchange, today }: { exchange: ExchangeBlock | null | undefined; today: string }) {
  const w = exchangeWindow(exchange, new Date(`${today}T12:00:00Z`));
  return (
    <section id="exchange" data-qa="buy-box-exchange" className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold tracking-tight">A 1031 exchange</h2>
      <p className="mt-1 text-xs text-muted">
        Optional. Both deadlines run from the day the relinquished property transferred; leave it blank for none.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="exchangeTransferOn" className="text-sm font-medium">
            Relinquished property transferred
          </label>
          <input
            id="exchangeTransferOn"
            name="exchangeTransferOn"
            type="date"
            defaultValue={exchange?.relinquishedTransferOn ?? ""}
            className={`mt-1.5 ${inputCls}`}
          />
        </div>
        <div>
          <label htmlFor="exchangeFiler" className="text-sm font-medium">
            Who files the return
          </label>
          <select id="exchangeFiler" name="exchangeFiler" defaultValue={exchange?.filer ?? ""} className={`mt-1.5 ${inputCls}`}>
            <option value="">Not set, read as an individual</option>
            {EXCHANGE_FILERS.map((f) => (
              <option key={f.id} value={f.id}>{`${f.label} (${f.form})`}</option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 self-end rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:bg-faint has-[:checked]:border-brand has-[:checked]:bg-brand/5">
          <input type="checkbox" name="exchangeExtended" defaultChecked={!!exchange?.returnExtended} className="h-3.5 w-3.5 accent-brand" />
          The return is extended
        </label>
      </div>
      {w && (
        <p className="mt-3 text-sm leading-relaxed" data-qa="exchange-window">
          {w.sentence}
        </p>
      )}
    </section>
  );
}
