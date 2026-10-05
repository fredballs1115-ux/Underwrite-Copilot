import { compactUsd } from "@/lib/money";
import { Key, KeyItem, MEASURE, PanelNote, PanelRead, Tick, tileSpan } from "@/app/panel-parts";
import { deliveryText, type ForwardRead } from "@/lib/forward-purchase";
import { sentencesOf } from "@/lib/first-sentence";

/**
 * A forward purchase or a build-to-suit bought at delivery — the pure panel
 * for `lib/forward-purchase`, drawn by the deal page and the shared screen.
 * Nothing where the buyer is not paying for a building at its completion.
 *
 * Three pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE CLOCK: today, the delivery and the outside date on one track — the
 *     run to delivery filled (`fwd-clock`), the delivery and the outside date
 *     ticks (`fwd-delivery`, `fwd-outside`) — only where the delivery is a
 *     date still ahead of the day the page is read.
 *   - THE DEPOSIT: its share of the price, the price as the track
 *     (`fwd-deposit`) — the buyer's exposure before delivery.
 *   - THE YIELD AT DELIVERY: the cap the price is struck at, or the NOI the
 *     memorandum states at delivery over the price (`fwd-yield`), against
 *     the model's exit cap (`fwd-exit`) where the page has the model.
 *
 * Then a tile each for the developer, the completion guaranty and the price
 * adjustment, as stated; the read's first sentence, the rest folded; and the
 * model's read (`forwardModelLine`, `meta.forward.read`), so the page, the
 * workbook and the report say the same thing.
 */

/** "$48.0M", "$3.96M", "$950k" — the reader's own money. */
const money = (n: number): string => compactUsd(n, { millions: "auto" });
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const pct2 = (n: number) => `${n.toFixed(2)}%`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/** "Oct 5, 2026" — a day as a page says it. */
function dayText(iso: string): string {
  const at = dayMs(iso);
  return Number.isFinite(at)
    ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

export function ForwardPanel({
  forward,
  today = null,
  exitCapPct = null,
  modelLine = "",
}: {
  forward: ForwardRead | null;
  /** the day the page is read, an ISO day — the clock's start */
  today?: string | null;
  /** the model's exit cap, a percent, where the page has the model */
  exitCapPct?: number | null;
  /** the model's read of the purchase (`meta.forward.read`) */
  modelLine?: string;
}) {
  if (!forward) return null;
  const r = forward;
  // Two dates that cannot both hold, or a delivery the day has passed, is
  // what to settle first: the warning tone.
  const flagged = r.deliveryPassed || (r.slackMonths != null && r.slackMonths < 0);
  const what = r.kind === "bts" ? "Build-to-suit, bought at delivery" : "Forward purchase";
  const headline = `${r.price != null ? `${money(r.price)} paid` : "Paid"} at delivery${r.delivery ? `, ${r.delivery.text}` : r.deliveryWords ? ` (${r.deliveryWords})` : ""}`;

  // The clock, from the day the page is read to the later of the delivery
  // and the outside date.
  const t0 = today ? dayMs(today) : NaN;
  const d = r.delivery && !r.deliveryPassed ? dayMs(r.delivery.iso) : NaN;
  const o = r.outside ? dayMs(r.outside.iso) : NaN;
  const end = Number.isFinite(o) ? Math.max(d, o) : d;
  const clock =
    Number.isFinite(t0) && Number.isFinite(d) && end - t0 > 0
      ? {
          delivery: clamp(((d - t0) / (end - t0)) * 100),
          outside: Number.isFinite(o) ? clamp(((o - t0) / (end - t0)) * 100) : null,
        }
      : null;

  const exit = exitCapPct != null && Number.isFinite(exitCapPct) && exitCapPct > 0 ? exitCapPct : null;
  const yieldScale = r.deliveryYieldPct != null ? Math.max(r.deliveryYieldPct, exit ?? 0) * 1.25 : 0;
  const atYield = (n: number) => clamp((n / yieldScale) * 100);

  const tiles: { key: string; label: string; value: string }[] = [];
  if (r.developer) tiles.push({ key: "developer", label: "Developer", value: r.developer });
  if (r.guaranty) tiles.push({ key: "guaranty", label: "Completion guaranty", value: r.guaranty });
  if (r.priceAdjustment) tiles.push({ key: "price-adjustment", label: "Price adjustment", value: r.priceAdjustment });

  const sentences = sentencesOf(r.headline);

  return (
    <section
      aria-label="Forward purchase"
      data-qa="forward-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-brand bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-brand"}`}>{what}</span>
        <span className="text-sm font-semibold">{headline}</span>
      </p>

      {clock && today && r.delivery && (
        <div className="mt-3 text-[11px]" data-qa="forward-clock">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-full bg-brand/40" data-bar="fwd-clock" style={{ width: `${clock.delivery}%` }} />
            <Tick at={`${clock.delivery}%`} bar="fwd-delivery" />
            {clock.outside != null && <Tick at={`${clock.outside}%`} bar="fwd-outside" tone="border-caution" dashed />}
          </div>
          <Key>
            <KeyItem>{`Today, ${dayText(today)}`}</KeyItem>
            <KeyItem mark="tick" tone="bg-ink">
              {`Delivery, ${deliveryText(r.delivery)}${r.monthsToDelivery != null ? `: ${months(r.monthsToDelivery)} away` : ""}`}
            </KeyItem>
            {r.outside && (
              <KeyItem mark="dashed" tone="border-caution">
                {`Outside date, ${deliveryText(r.outside)}${
                  r.slackMonths != null
                    ? r.slackMonths < 0
                      ? ", before the delivery"
                      : `, ${months(r.slackMonths)} after the delivery`
                    : ""
                }`}
              </KeyItem>
            )}
          </Key>
        </div>
      )}

      {r.deposit && (
        <div className="mt-3 text-[11px]" data-qa="forward-deposit">
          {r.deposit.sharePct != null && (
            <div className="relative h-3 rounded-full bg-faint" aria-hidden>
              <div className="h-full rounded-full bg-caution/60" data-bar="fwd-deposit" style={{ width: `${Math.max(1.5, clamp(r.deposit.sharePct))}%` }} />
            </div>
          )}
          <p className={`mt-1.5 ${MEASURE} text-muted`}>
            {r.deposit.sharePct != null
              ? `Deposit${r.deposit.amount != null ? ` ${money(r.deposit.amount)}` : ""}, ${pct1(r.deposit.sharePct)} of the price, at risk before delivery. As stated: ${r.deposit.text}`
              : `Deposit, at risk before delivery. As stated: ${r.deposit.text}`}
          </p>
        </div>
      )}

      {r.deliveryYieldPct != null && (
        <div className="mt-3 text-[11px]" data-qa="forward-yield">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-full bg-brand/60" data-bar="fwd-yield" style={{ width: `${atYield(r.deliveryYieldPct)}%` }} />
            {exit != null && <Tick at={`${atYield(exit)}%`} bar="fwd-exit" />}
          </div>
          <Key>
            <KeyItem>{`${pct2(r.deliveryYieldPct)} at delivery, ${r.yieldFrom === "stated_cap" ? "the cap as stated" : "the stated NOI over the price"}`}</KeyItem>
            {exit != null && <KeyItem mark="tick" tone="bg-ink">{`The model's exit cap, ${pct2(exit)}`}</KeyItem>}
          </Key>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="forward-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border border-line bg-surface px-2.5 py-2 text-ink ${tileSpan(t.value)}`} data-fwd={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              <span className="block text-[11px] leading-snug text-muted">As stated</span>
            </li>
          ))}
        </ul>
      )}

      <PanelRead sentences={sentences} className="mt-2" />
      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
