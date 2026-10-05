import { compactUsd } from "@/lib/money";
import { withArticle } from "@/lib/article";
import { endLabel } from "@/lib/affordable";
import { endHasPassed, leftText, yearsText } from "@/lib/ground-lease-term";
import type { HotelDealRead } from "@/lib/hotel-deal";
import { Key, KeyItem, MEASURE, PanelNote, PanelRead, Tick } from "@/app/panel-parts";

/**
 * What a hotel is sold with (#455) — the pure panel for `lib/hotel-deal`,
 * drawn by the deal page under what is being sold and by the shared screen
 * under its own. Nothing on anything but a hotel.
 *
 * Three pictures, each with its legend in words so nothing rides on colour:
 *
 *   - THE BASIS A KEY: the price a key and the PIP a key stacked on one
 *     bar — the basis the buyer is really paying — where both are known.
 *   - THE CLOCKS: the franchise and the management agreement, each a bar of
 *     the years it has left on one scale, the model's sale marked where the
 *     page has the model.
 *   - THE ROOMS: ADR × occupancy = RevPAR as three figures, and the RevPAR
 *     index against the 100 line of the competitive set.
 *
 * The sentences are the reader's own: the `headline`, and the model's read
 * (`hotelModelLine`) as the derived model computed it (`meta.hotel.read`),
 * so the page, the workbook and the report say the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
// The basis a key is drawn, in thousands ("$216.7k"); ADR and RevPAR are the
// memorandum's own operating figures, checked against its STR pages, so
// they stay to the cent.
const k = (n: number) => compactUsd(n, { thousandsFrom: 0, thousandsPlaces: 1 });
const dollars = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

const ENCUMBRANCE_LABEL: Record<HotelDealRead["encumbrance"], string | null> = {
  unencumbered: "Unencumbered",
  management: "Encumbered by management",
  brand: "Encumbered by the franchise",
  brand_and_management: "Encumbered by the franchise and management",
  unknown: null,
};

export function HotelPanel({
  hotel,
  holdYears = null,
  modelLine = "",
}: {
  hotel: HotelDealRead | null;
  /** the model's hold, where the page has the model */
  holdYears?: number | null;
  /** the derived model's read of the hotel (`meta.hotel.read`) */
  modelLine?: string;
}) {
  if (!hotel) return null;
  const r = hotel;
  const unit = r.keyNoun.replace(/s$/, "");
  const clocks = [
    r.franchiseEnds ? { key: "franchise", label: "Franchise", end: r.franchiseEnds, tone: "bg-brand/70" } : null,
    r.managementEnds ? { key: "management", label: "Management agreement", end: r.managementEnds, tone: "bg-caution/70" } : null,
  ].filter((c): c is NonNullable<typeof c> => c != null);
  const longest = Math.max(5, holdYears ?? 0, ...clocks.map((c) => c.end.yearsLeft));
  const encumbrance = ENCUMBRANCE_LABEL[r.encumbrance];
  const indexScale = r.revparIndex != null ? Math.max(150, r.revparIndex) : 150;

  return (
    <section
      aria-label="Hotel"
      data-qa="hotel-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">Hotel</span>
        {r.brand && <span className="text-sm font-semibold">{r.brand}</span>}
        {encumbrance && <span className="rounded-full border border-brand/30 px-2 py-0.5 text-[10px] font-semibold text-brand">{encumbrance}</span>}
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      {/* The flag leads; the encumbrance, the PIP, the clocks and the rooms
          are one click away and whole in the HTML, since the chip and the
          pictures below draw them. */}
      <PanelRead sentences={r.sentences} />

      {r.pricePerKey != null && r.pipPerKey != null && r.allInPerKey != null && (
        <div className="mt-2.5" data-qa="hotel-basis">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="min-w-0 font-medium text-ink">{`The basis ${withArticle(unit)}`}</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`${k(r.allInPerKey)} all-in`}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            <div className="h-full bg-brand/70" data-bar="hotel-price" style={{ width: pctOf(r.pricePerKey, r.allInPerKey) }} />
            <div className="h-full bg-caution/70" data-bar="hotel-pip" style={{ width: pctOf(r.pipPerKey, r.allInPerKey) }} />
          </div>
          <Key>
            <KeyItem mark="swatch" tone="bg-brand/70">{`The price, ${k(r.pricePerKey)} ${withArticle(unit)}`}</KeyItem>
            <KeyItem mark="swatch" tone="bg-caution/70">{`The PIP, ${k(r.pipPerKey)} ${withArticle(unit)}`}</KeyItem>
          </Key>
        </div>
      )}

      {clocks.length > 0 && (
        // A clock is its label, its bar and its date. Side by side only where
        // the panel itself is 28rem wide: on a phone the label's column and
        // the date left the bar no width at all, and the dates ran past the
        // panel's edge. Side by side, the date's column is one width, so
        // every bar is drawn on one track.
        <div className="@container/clocks mt-3" data-qa="hotel-clocks">
          <dl className="space-y-1.5">
            {clocks.map((c) => {
              const left = c.end.yearsLeft;
              // Passed by the DAY, never inside its last month (lib/ground-
              // lease-term `DatedSpan`).
              const passed = endHasPassed(c.end);
              return (
                <div
                  key={c.key}
                  className="grid grid-cols-1 gap-y-0.5 text-[11px] @md/clocks:grid-cols-[minmax(7rem,11rem)_1fr] @md/clocks:items-center @md/clocks:gap-x-3"
                >
                  <dt className="font-medium text-ink">{c.label}</dt>
                  <dd className="min-w-0">
                    {!passed ? (
                      <div className="flex flex-col gap-0.5 @md/clocks:flex-row @md/clocks:items-center @md/clocks:gap-2">
                        <div className="relative h-2 min-w-0 rounded-full bg-faint @md/clocks:flex-1" aria-hidden>
                          <div className={`h-full rounded-full ${c.tone}`} data-bar="hotel-clock" style={{ width: pctOf(Math.max(0, left), longest) }} />
                          {holdYears != null && <Tick at={pctOf(holdYears, longest)} bar="hotel-hold" track="secondary" />}
                        </div>
                        <span className="font-mono tabular-nums text-muted @md/clocks:w-36 @md/clocks:shrink-0">
                          {`${c.end.from === "year" ? "" : "to "}${endLabel(c.end)} · ${leftText(c.end)}`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">{`Stated end ${endLabel(c.end)} — passed`}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {holdYears != null && (
            <Key className="mt-1">
              <KeyItem mark="tick" tone="bg-ink">{`The line is the model's sale, ${yearsText(holdYears)} out`}</KeyItem>
            </Key>
          )}
        </div>
      )}

      {(r.revparComputed != null || r.revparIndex != null) && (
        <div className="mt-3 space-y-1.5 text-[11px]" data-qa="hotel-rooms">
          {r.adr != null && r.occupancyPct != null && r.revparComputed != null && (
            // Each figure keeps its word: the line breaks between the three
            // terms, never between "RevPAR" and its figure.
            <p className="font-mono tabular-nums">
              <span className="whitespace-nowrap">
                <span className="text-muted">{"ADR "}</span>
                <span className="font-semibold text-ink">{dollars(r.adr)}</span>
              </span>{" "}
              <span className="whitespace-nowrap">
                <span className="text-muted">{"× occupancy "}</span>
                <span className="font-semibold text-ink">{`${(Math.round(r.occupancyPct * 10) / 10).toFixed(1)}%`}</span>
              </span>{" "}
              <span className="whitespace-nowrap">
                <span className="text-muted">{"= RevPAR "}</span>
                <span className={`font-semibold ${r.ties === false ? "text-kill" : "text-ink"}`}>{dollars(r.revparComputed)}</span>
              </span>
              {r.ties === false && r.revpar != null && <span className="text-kill">{` — the memorandum says ${dollars(r.revpar)}`}</span>}
            </p>
          )}
          {r.revparIndex != null && (
            <div>
              {/* The index keeps its figure and its 100 together, beside the
                  label: "92 against / 100" had broken under it. */}
              <div className="flex items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-medium text-ink">RevPAR index against its competitive set</span>
                <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`${Math.round(r.revparIndex)} against 100`}</span>
              </div>
              <div className="relative mt-0.5 h-2 rounded-full bg-faint" aria-hidden>
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${r.revparIndex < 100 ? "bg-caution/70" : "bg-pass/70"}`}
                  data-bar="hotel-index"
                  style={{ width: pctOf(r.revparIndex, indexScale) }}
                />
                <Tick at={pctOf(100, indexScale)} track="secondary" />
              </div>
            </div>
          )}
        </div>
      )}

      {(r.franchise || r.management || r.pip) && (
        <ul className={`mt-2 ${MEASURE} space-y-0.5 text-xs leading-relaxed text-muted`}>
          {r.franchise && <li>{`The franchise as stated: ${r.franchise}`}</li>}
          {r.management && <li>{`The management as stated: ${r.management}`}</li>}
          {r.pip && <li>{`The PIP as stated: ${r.pip}`}</li>}
        </ul>
      )}
      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
