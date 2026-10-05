import type { ManufacturedHousingRead } from "@/lib/manufactured-housing";

/**
 * A manufactured-housing park (#470) — the pure panel for
 * `lib/manufactured-housing`, drawn by the deal page and the shared screen.
 * Nothing on anything else.
 *
 * Three pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE PADS: one track the width of the park, the homes their residents
 *     own and the homes the park owns filled from the left, today's
 *     occupancy as a dashed line — so how much of the occupancy the park
 *     bought is the width of one segment.
 *   - THE RENTS: the lot rent in place on one scale with the memorandum's
 *     market lot rent as a tick (its range as a band where it states one),
 *     and a park-owned home's rent beside it, the lot's part solid and the
 *     home's above it light.
 *   - THE TILES: the price a pad, the water and sewer, who pays for them,
 *     the age restriction, the RV sites and the rent rules.
 *
 * The sentences are the reader's own (`sentences`) and the model's read
 * (`mhModelLine`, `meta.mh.read`), so the page, the workbook and the report
 * say the same thing.
 */

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const rent = (n: number) => (Number.isInteger(n) ? usd(n) : `$${n.toFixed(2)}`);
const count = (n: number) => n.toLocaleString("en-US");
const clamp = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

type Tone = "pass" | "caution" | "neutral";
const TONE: Record<Tone, string> = {
  pass: "border-pass/30 bg-pass/5 text-pass",
  caution: "border-caution/40 bg-caution/5 text-caution",
  neutral: "border-line bg-surface text-ink",
};

export function ManufacturedHousingPanel({ park, modelLine = "" }: { park: ManufacturedHousingRead | null; modelLine?: string }) {
  if (!park) return null;
  const r = park;
  const u = r.utilities;
  const anyPrivate = u?.kind === "private" || u?.kind === "mixed";
  const regulated = r.rentControl?.regulated === true;
  const flagged = anyPrivate || regulated;

  const pads = r.pads;
  const residentPct = pads && r.residentOwned != null ? (r.residentOwned / pads) * 100 : null;
  const parkPct = pads && r.parkOwned != null && r.parkOwned > 0 ? (r.parkOwned / pads) * 100 : null;
  const vacant = pads != null && r.occupied != null ? pads - r.occupied : null;
  const drawPads = pads != null && (residentPct != null || parkPct != null || r.occupancyPct != null);

  const scale = Math.max(r.lotRent ?? 0, r.marketRange?.high ?? r.marketLotRent ?? 0, r.homeRent ?? 0) * 1.08;
  const at = (n: number) => (scale > 0 ? (n / scale) * 100 : 0);

  const tiles: { key: string; label: string; value: string; sub: string; tone: Tone }[] = [];
  if (r.pricePerPad != null) tiles.push({ key: "price-pad", label: "Price a pad", value: usd(r.pricePerPad), sub: "At the asking price", tone: "neutral" });
  if (u?.label) {
    tiles.push({
      key: "utilities",
      label: "Water & sewer",
      value: u.label,
      sub: u.stated,
      tone: anyPrivate ? "caution" : u.kind === "public" ? "pass" : "neutral",
    });
  }
  if (u?.billing) {
    tiles.push({
      key: "billing",
      label: "Utility bill",
      value: u.billing === "park" ? "The park pays" : "Residents pay",
      sub: u.billingStated || (u.billing === "park" ? "Included in the lot rent" : "Billed back"),
      tone: "neutral",
    });
  }
  if (r.age) {
    tiles.push({
      key: "age",
      label: "Age",
      value: r.age === "all-age" ? "All-age" : r.age,
      sub: r.age === "55+" ? "80% of occupied homes 55 or older" : r.ageStated,
      tone: "neutral",
    });
  }
  if (r.rvSites != null) tiles.push({ key: "rv", label: "RV sites", value: count(r.rvSites), sub: "Apart from the pads", tone: "neutral" });
  if (r.rentControl) {
    tiles.push({
      key: "rent-control",
      label: "Rent rules",
      // Rules the reader cannot read as either are headlined in their own words.
      value: r.rentControl.regulated === true ? "Regulated" : r.rentControl.regulated === false ? "Not regulated" : r.rentControl.stated,
      sub: r.rentControl.regulated === false ? "The memorandum's claim" : r.rentControl.regulated === true ? r.rentControl.stated : "As stated",
      tone: r.rentControl.regulated === true ? "caution" : "neutral",
    });
  }

  return (
    <section
      aria-label="Manufactured housing"
      data-qa="mh-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-pass bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-pass"}`}>Manufactured housing</span>
        <span className="text-sm font-semibold">
          {pads != null ? `${count(pads)} pads${r.occupancyPct != null ? `, ${pct1(r.occupancyPct)} occupied` : ""}` : "A park of home sites"}
        </span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>

      {drawPads && (
        <div className="mt-2 text-[11px]" data-qa="mh-pads">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            {residentPct != null && (
              <div className="absolute inset-y-0 left-0 rounded-l-full bg-pass/60" data-bar="mh-resident" style={{ width: clamp(residentPct) }} />
            )}
            {parkPct != null && (
              <div
                className={`absolute inset-y-0 bg-brand/60 ${residentPct == null ? "rounded-l-full" : ""}`}
                data-bar="mh-park"
                style={{ left: clamp(residentPct ?? 0), width: clamp(parkPct) }}
              />
            )}
            {r.occupancyPct != null && (
              <div className="absolute -inset-y-1 border-l-2 border-dashed border-ink" data-bar="mh-occupied" style={{ left: clamp(r.occupancyPct) }} />
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
            {r.residentOwned != null && residentPct != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-pass/60" />
                {`${count(r.residentOwned)} homes their residents own (${pct1(residentPct)})`}
              </li>
            )}
            {r.parkOwned != null && parkPct != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-brand/60" />
                {`${count(r.parkOwned)} ${r.parkOwned === 1 ? "home" : "homes"} the park owns (${pct1(parkPct)})`}
              </li>
            )}
            {r.parkOwned === 0 && <li>No park-owned homes</li>}
            {r.occupancyPct != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-0 shrink-0 border-l-2 border-dashed border-ink" />
                {`Occupied ${pct1(r.occupancyPct)}`}
              </li>
            )}
            {vacant != null && vacant > 0 && <li>{`${count(vacant)} vacant ${vacant === 1 ? "pad" : "pads"}`}</li>}
          </ul>
        </div>
      )}

      {r.lotRent != null && scale > 0 && (
        <div className="mt-3 space-y-2 text-[11px]" data-qa="mh-rent">
          <div>
            <div className="relative h-3 rounded-full bg-faint" aria-hidden>
              <div
                className={`h-full rounded-full ${r.gap != null && r.gap > 0 ? "bg-brand/60" : "bg-pass/60"}`}
                data-bar="mh-lot-rent"
                style={{ width: clamp(at(r.lotRent)) }}
              />
              {r.marketRange && (
                <div
                  className="absolute inset-y-0 bg-ink/15"
                  data-bar="mh-market-range"
                  style={{ left: clamp(at(r.marketRange.low)), width: clamp(at(r.marketRange.high - r.marketRange.low)) }}
                />
              )}
              {r.marketLotRent != null && (
                <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="mh-market" style={{ left: clamp(at(r.marketLotRent)) }} />
              )}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
              <li>{`Lot rent ${rent(r.lotRent)} a month`}</li>
              {r.marketLotRent != null && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-ink" />
                  {/* The gap's share is of the lot rent in place, and says so: "16.3%"
                      alone read as a share of the market's rent. */}
                  {`The memorandum's market ${rent(r.marketLotRent)}${
                    r.gap != null && r.gap > 0
                      ? ` (${rent(r.gap)} above today's lot rent, ${pct1(r.gapPct ?? 0)} of it)`
                      : r.gap != null
                        ? " (no higher than the rent in place)"
                        : ""
                  }`}
                </li>
              )}
            </ul>
          </div>
          {r.homeRent != null && (
            <div>
              <div className="relative h-3 rounded-full bg-faint" aria-hidden>
                <div className="absolute inset-y-0 left-0 rounded-l-full bg-brand/60" style={{ width: clamp(at(Math.min(r.lotRent, r.homeRent))) }} />
                {r.homeAboveLot != null && (
                  <div
                    className="absolute inset-y-0 rounded-r-full bg-brand/25"
                    data-bar="mh-home-rent"
                    style={{ left: clamp(at(r.lotRent)), width: clamp(at(r.homeAboveLot)) }}
                  />
                )}
              </div>
              <p className="mt-1.5 text-muted">
                {`A park-owned home ${rent(r.homeRent)} a month${r.homeAboveLot != null ? `: ${rent(r.homeAboveLot)} of it the home's, above the lot's` : ""}`}
              </p>
            </div>
          )}
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-qa="mh-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border px-2.5 py-2 ${TONE[t.tone]}`} data-mh={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              {t.sub && <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>}
            </li>
          ))}
        </ul>
      )}

      {r.sentences.length > 0 && <p className="mt-2 text-sm leading-relaxed">{r.sentences[0]}</p>}
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}
      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
