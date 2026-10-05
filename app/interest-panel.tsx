import { compactUsd } from "@/lib/money";
import Link from "next/link";
import { LeaseTermBar } from "@/app/lease-term-bar";
import { Key, KeyItem, MEASURE, PanelHead, PanelNote, PanelRead, Tick } from "@/app/panel-parts";
import { termEndLabel } from "@/lib/ground-lease-term";
import { isWholeShare, noteCaption, noteCollateralSentence, noteYieldSentence, type InterestRead } from "@/lib/interest";
import { positionCaption, positionMoney } from "@/lib/position";

/**
 * What is being sold (#414) — the pure panel for `lib/interest`, drawn by
 * the deal page under its header and by the shared screen under its own.
 * Nothing for a plain fee simple: the usual case needs no banner.
 *
 * The picture carries the price's meaning where the memorandum gives the
 * figures: a note's balance as the track with the price filled and the
 * discount the empty remainder, a share's implied whole as the track with
 * the share filled, and under a ground lease (#415) the building's income
 * before the ground rent as the track with the rent filled — the empty
 * remainder is the cover. The sentences are the reader's own (`headline`,
 * `modelCaveat`), so every surface says the same thing.
 *
 * A note is underwritten as a note (#416): where it pays, or may, its yield
 * to maturity, current yield and price on the dollar are tiles under the
 * lead, with how long it runs and how its payments were run beneath; where
 * the memorandum states the collateral's value, the track is that value,
 * the balance filled light and the price dark over it — the loan-to-value
 * at each, and the empty remainder the cushion. A note that is not paying,
 * or is past its maturity, keeps its sentence: a large yield there is one
 * nobody earns. A note behind other debt draws no collateral track — its
 * cushion sits on top of the senior loan's balance — so its price is drawn
 * against its balance, and the sentence under it reads the stack where the
 * memorandum states that balance, or says why the loan-to-value is withheld.
 *
 * A ground lease's term is drawn under the lead where the memorandum states
 * when it ends (#421): the years left today, and the extension options
 * after them dashed — the one fact that decides what a leasehold is worth,
 * and what a leased fee's reversion waits on.
 *
 * A preferred equity position is read as a position (lib/position), as a
 * note is read as a note: where its redemption date has not gone by, its
 * yield to redemption, current yield and cash a year are tiles — each only
 * where stated — with how long it runs and on what accrual its yield was
 * read beneath; past the date no figure is drawn, and the line beneath says
 * the date has gone by. Where the memorandum states the senior loan and the
 * property's value, the track is that value: the senior loan filled from
 * the first dollar, the position from its first dollar to its last today,
 * the accrual owed at redemption on top of it, and a tick at the stated
 * value — the empty remainder is the common equity under it, and where the
 * last dollar passes the value the track runs on past the tick.
 */
// Rounded on the tenths, never a float's toFixed (lib/money `compactUsd`).
const money = (n: number) => compactUsd(n, { wholeMillionsFrom: 1e8 });
const times = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}×`;
const tenths = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const width = (share: number) => `${Math.max(1.5, Math.min(1, share) * 100)}%`;

export function InterestPanel({ interest }: { interest: InterestRead | null }) {
  if (!interest) return null;
  const r = interest;
  const n = r.kind === "note" ? r.note : null;
  // The note's figures, where it pays or may: a yield nobody earns is not
  // drawn large.
  const tiles =
    n && !n.matured && n.terms.status !== "non_performing" && (n.ytmPct != null || n.currentYieldPct != null)
      ? [
          n.ytmPct != null
            ? { label: "To maturity", value: `${tenths(n.ytmPct)}%`, sub: n.terms.status === "performing" ? "yield on the price" : "if paid as agreed" }
            : null,
          n.currentYieldPct != null ? { label: "Current yield", value: `${tenths(n.currentYieldPct)}%`, sub: "a year's interest on the price" } : null,
          n.cents != null ? { label: "On the dollar", value: `${tenths(n.cents)}¢`, sub: "the price over the balance" } : null,
        ].filter((t): t is { label: string; value: string; sub: string } => t != null)
      : [];
  // A preferred equity position, read as a position (lib/position): its own
  // figures where its redemption date has not gone by — a large yield
  // nobody is owed is not drawn — each only where the memorandum states it.
  const p = r.kind === "preferred_equity" ? r.position : null;
  const posTiles =
    p && !p.redeemedPast
      ? [
          p.yieldPct != null ? { label: "To redemption", value: `${tenths(p.yieldPct)}%`, sub: "if paid and redeemed as agreed" } : null,
          p.currentYieldPct != null ? { label: "Current yield", value: `${tenths(p.currentYieldPct)}%`, sub: "a year's current pay on the price" } : null,
          // The position's dollars through its own writer, as its sentences
          // say them (lib/position `positionMoney`).
          p.currentPayYear != null && p.terms.currentPayPct != null
            ? {
                label: "Cash a year",
                value: positionMoney(p.currentPayYear),
                sub: `${tenths(p.terms.currentPayPct)}% current pay${p.terms.amount != null ? ` on ${positionMoney(p.terms.amount)}` : ""}`,
              }
            : null,
        ].filter((t): t is { label: string; value: string; sub: string } => t != null)
      : [];
  // The tiles say the yield; without them the sentence does. The cushion is
  // always the collateral's bar where the memorandum states the value. The
  // first sentence leads and the rest folds, whole in the HTML, as every
  // deal-type panel reads — a position's whole read among them.
  const said = n && tiles.length === 0 ? [...r.leadSentences, noteYieldSentence(n)].filter(Boolean) : p ? [...r.leadSentences, ...p.sentences] : r.leadSentences;
  const caption = tiles.length > 0 ? noteCaption(n) : "";
  // Under a position's tiles, how long it runs and on what accrual its yield
  // was read; past its redemption date, where no figure is drawn, that the
  // date has gone by.
  const posCaption = p && (posTiles.length > 0 || p.redeemedPast) ? positionCaption(p) : "";
  // One block of figures, a note's or a position's: the same tiles, the same
  // small print beneath.
  const figures =
    tiles.length > 0
      ? { qa: "note-figures", tiles, caption }
      : posTiles.length > 0 || posCaption
        ? { qa: "position-figures", tiles: posTiles, caption: posCaption }
        : null;
  // The position's stack over the stated value: where its first and last
  // dollar sit, the track running past the value only where the last
  // dollar does (lib/position reads the last dollar compounding where the
  // memorandum does not say, the side that does not flatter it). Each
  // figure is said in the key beneath, in words a screen reader reads.
  const stack =
    p &&
    p.attachmentPct != null &&
    p.detachmentTodayPct != null &&
    p.detachmentPct != null &&
    p.terms.seniorBalance != null &&
    p.terms.value != null &&
    p.terms.amount != null
      ? (() => {
          const scale = Math.max(100, p.detachmentPct);
          const at = (pct: number) => `${(pct * 100) / scale}%`;
          const span = (from: number, to: number) => ({ left: at(from), width: `${Math.max(1.5, ((to - from) * 100) / scale)}%` });
          // The accrual is drawn where it moves the last dollar, on the
          // sentence's own rule (lib/position: "(83.8% today)").
          const accrues = p.detachmentPct - p.detachmentTodayPct >= 0.05;
          const accrued = ((p.detachmentPct - p.detachmentTodayPct) / 100) * p.terms.value;
          return {
            senior: { width: at(p.attachmentPct) },
            amount: span(p.attachmentPct, p.detachmentTodayPct),
            accrued: accrues ? span(p.detachmentTodayPct, p.detachmentPct) : null,
            value: at(100),
            seniorText: positionMoney(p.terms.seniorBalance),
            amountText: positionMoney(p.terms.amount),
            accruedText: `${positionMoney(accrued)}${p.terms.compounds === true ? ", compounding" : p.terms.compounds === false ? ", simple" : ", if it compounds"}`,
            valueText: positionMoney(p.terms.value),
            attachText: tenths(p.attachmentPct),
            todayText: tenths(p.detachmentTodayPct),
            lastText: tenths(p.detachmentPct),
            past: p.detachmentPct >= 100,
          };
        })()
      : null;
  // Behind a senior loan the note's own loan-to-value is withheld
  // (lib/note-yield), and the sentence stands where the collateral's track
  // would: the stack on the senior's stated balance, or why there is none.
  const ltvWithheld = n?.terms.subordinate ? noteCollateralSentence(n) : "";
  const collateral =
    n && n.terms.collateralValue != null && n.ltvAtBalancePct != null && n.ltvAtPricePct != null
      ? (() => {
          const value = n.terms.collateralValue;
          // A balance over the collateral's value is a loan under water: the
          // track runs to the balance and a tick marks the value.
          const scale = Math.max(value, n.terms.balance ?? 0, n.price);
          return {
            value,
            priceText: money(n.price),
            balanceText: money(n.terms.balance ?? 0),
            balance: (n.terms.balance ?? 0) / scale,
            price: n.price / scale,
            tick: value < scale ? value / scale : null,
            ltvAtBalance: Math.round(n.ltvAtBalancePct),
            ltvAtPrice: Math.round(n.ltvAtPricePct),
          };
        })()
      : null;
  // The picture: a note's price against its balance, a share against the
  // whole it implies — only where the memorandum states both figures.
  const bar = collateral
    ? null
    : r.kind === "note" && r.balance != null && r.askingPrice != null && r.balance > 0
      ? {
          fill: Math.min(1, r.askingPrice / r.balance),
          left: `Price ${money(r.askingPrice)}`,
          right: `Unpaid balance ${money(r.balance)}`,
        }
      : // All of the entity's interests (a stated 100%) fill no share of a
        // whole: the sentence says the price is the whole's.
        r.kind === "partial_interest" && r.impliedWhole != null && r.askingPrice != null && r.sharePct != null && !isWholeShare(r.sharePct)
        ? {
            fill: Math.min(1, r.sharePct / 100),
            // An undivided interest held as a tenant in common is the real
            // estate's, and its loan the property's (lib/interest).
            left: `${r.holding === "tic" ? "The interest" : "The share"} ${money(r.askingPrice)}`,
            // Beside the entity's stated loan the whole is the equity's, and
            // the loan sits on top of it (lib/interest).
            right:
              r.entityLoan != null
                ? `The equity's whole, grossed up ${money(r.impliedWhole)} · ${r.holding === "tic" ? "the property's" : "the entity's"} ${money(r.entityLoan)} loan on top`
                : `The whole, grossed up ${money(r.impliedWhole)}`,
          }
        : r.groundRent != null && r.incomeBeforeGroundRent != null && r.groundRentCoverage != null
          ? {
              fill: Math.min(1, r.groundRent / r.incomeBeforeGroundRent),
              left: `Ground rent ${money(r.groundRent)}`,
              right: `The building's income before it ${money(r.incomeBeforeGroundRent)} · covered ${times(r.groundRentCoverage)}`,
            }
          : null;
  // The bar's legend says a stated date's term (or a stated month's) and
  // parsed options whole; the sentence is kept for what it cannot say — a
  // year read as its first day, a count from today, a term that already
  // counts its options, options that did not parse, an end that has passed
  // or comes this month.
  const t = r.term;
  const termNeedsWords =
    !!t && ((t.from !== "date" && t.from !== "month") || t.includesOptions || (!!t.optionsStated && !t.options) || t.yearsLeft <= 0);
  // The ground lease calculator values either side of the lease: the
  // building on its term, or the land and its rent.
  const groundLeaseLink =
    r.kind === "leased_fee"
      ? "Value the leased fee on its term"
      : r.groundLease || r.kind === "leasehold"
        ? "Value the leasehold on its term"
        : null;
  return (
    <section
      aria-label="What is being sold"
      data-qa="interest-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <PanelHead title="What is being sold" tone="text-brand">
        <span className="text-sm font-semibold">{r.label}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </PanelHead>
      <PanelRead sentences={said} />
      {r.term && r.termLine && (
        <div className="mt-2.5">
          <LeaseTermBar
            yearsLeft={r.term.yearsLeft}
            endLabel={termEndLabel(r.term)}
            optionYears={r.term.options?.years ?? null}
            ceiling={r.term.includesOptions}
          />
          {termNeedsWords && <p className={`mt-1 ${MEASURE} text-[11px] leading-snug text-muted`}>{`${r.termLine}.`}</p>}
        </div>
      )}
      {figures && (
        <div className="mt-2.5" data-qa={figures.qa}>
          {figures.tiles.length > 0 && (
            // Two-up on a phone, as the other panels' tiles are: three to a
            // row at 320 ran "To redemption" under "Current yield".
            <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {figures.tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted">{t.label}</dt>
                  <dd className="font-mono text-base font-semibold tabular-nums">{t.value}</dd>
                  <dd className="text-[10px] leading-snug text-muted">{t.sub}</dd>
                </div>
              ))}
            </dl>
          )}
          {figures.caption && <p className={`mt-1 ${MEASURE} text-[11px] leading-snug text-muted`}>{figures.caption}</p>}
        </div>
      )}
      {collateral && (
        <div className="mt-2.5">
          <div className="relative h-3 rounded-full bg-line" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/25" data-bar="note-balance" style={{ width: width(collateral.balance) }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/70" data-bar="interest" style={{ width: width(collateral.price) }} />
            {collateral.tick != null && <Tick at={`${collateral.tick * 100}%`} />}
          </div>
          {/* A key, as every other bar has: the price dark, the balance light
              under it, and the collateral's value the whole track — or, on a
              loan under water, the tick. */}
          <Key qa="note-collateral-key">
            <KeyItem mark="swatch" tone="bg-brand/70">{`Price ${collateral.priceText} · ${collateral.ltvAtPrice}% of the collateral's value`}</KeyItem>
            <KeyItem mark="swatch" tone="bg-brand/25">{`Unpaid balance ${collateral.balanceText} · ${collateral.ltvAtBalance}%`}</KeyItem>
            <KeyItem mark={collateral.tick != null ? "tick" : "swatch"} tone={collateral.tick != null ? "bg-ink" : "bg-line"}>
              {`The collateral, as stated ${money(collateral.value)}`}
            </KeyItem>
          </Key>
        </div>
      )}
      {stack && (
        <div className="mt-2.5">
          <div className="relative h-3 rounded-full bg-line" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-l-full bg-ink/30" data-bar="pos-senior" style={stack.senior} />
            <div
              className={stack.accrued ? "absolute inset-y-0 bg-brand/70" : "absolute inset-y-0 rounded-r-full bg-brand/70"}
              data-bar="pos-amount"
              style={stack.amount}
            />
            {stack.accrued && <div className="absolute inset-y-0 rounded-r-full bg-brand/30" data-bar="pos-accrued" style={stack.accrued} />}
            <Tick at={stack.value} bar="pos-value" />
          </div>
          {/* A key, as the note's bar has: the senior loan grey, the position
              dark from its first dollar to its last today, the accrual light
              on top, and the stated value the tick. */}
          <Key qa="position-stack-key">
            <KeyItem mark="swatch" tone="bg-ink/30">{`Senior loan ${stack.seniorText} · ${stack.attachText}% of the stated value`}</KeyItem>
            <KeyItem mark="swatch" tone="bg-brand/70">
              {`The position ${stack.amountText} · ${stack.attachText}% to ${stack.todayText}%${stack.accrued ? " today" : ""}`}
            </KeyItem>
            {stack.accrued && <KeyItem mark="swatch" tone="bg-brand/30">{`Accrued by redemption ${stack.accruedText} · to ${stack.lastText}%`}</KeyItem>}
            <KeyItem mark="tick" tone="bg-ink">{`The stated value ${stack.valueText}${stack.past ? " · the last dollar runs past it" : ""}`}</KeyItem>
          </Key>
        </div>
      )}
      {bar && (
        <div className="mt-2.5" aria-hidden>
          <div className="h-3 rounded-full bg-line">
            <div className="h-3 rounded-full bg-brand/70" data-bar="interest" style={{ width: `${Math.max(1.5, bar.fill * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
            <span>{bar.left}</span>
            <span className="text-right">{bar.right}</span>
          </div>
        </div>
      )}
      {ltvWithheld && (
        <p className={`mt-1 ${MEASURE} text-[11px] leading-snug text-muted`} data-qa="note-ltv-withheld">
          {ltvWithheld}
        </p>
      )}
      {(r.summary || r.groundLease || r.loan) && (
        <ul className={`mt-2 ${MEASURE} space-y-0.5 text-xs leading-relaxed text-muted`}>
          {r.summary && <li>{`The memorandum: ${r.summary}`}</li>}
          {r.groundLease && <li>{`The ${r.masterLease ? "master" : "ground"} lease as stated: ${r.groundLease}`}</li>}
          {r.loan && <li>{`The loan as stated: ${r.loan}`}</li>}
        </ul>
      )}
      {r.modelCaveat && <PanelNote>{r.modelCaveat}</PanelNote>}
      {groundLeaseLink && (
        <p className="mt-2 text-xs">
          <Link href="/tools#ground-lease" prefetch={false} className="font-medium text-brand underline-offset-2 hover:underline">
            {groundLeaseLink}
          </Link>
        </p>
      )}
    </section>
  );
}
