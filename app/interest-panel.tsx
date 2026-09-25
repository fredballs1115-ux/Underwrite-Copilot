import Link from "next/link";
import { noteCaption, noteYieldSentence, type InterestRead } from "@/lib/interest";

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
 * nobody earns.
 */
// Rounded on the tenths, never a float's toFixed.
const money = (n: number) =>
  n >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : n >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : n >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
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
  // The tiles say the yield; without them the sentence does. The cushion is
  // always the collateral's bar where the memorandum states the value.
  const text = n && tiles.length === 0 ? [r.lead, noteYieldSentence(n)].filter(Boolean).join(" ") : r.lead;
  const caption = tiles.length > 0 ? noteCaption(n) : "";
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
      : r.kind === "partial_interest" && r.impliedWhole != null && r.askingPrice != null && r.sharePct != null
        ? {
            fill: Math.min(1, r.sharePct / 100),
            left: `The share ${money(r.askingPrice)}`,
            right: `The whole, grossed up ${money(r.impliedWhole)}`,
          }
        : r.groundRent != null && r.incomeBeforeGroundRent != null && r.groundRentCoverage != null
          ? {
              fill: Math.min(1, r.groundRent / r.incomeBeforeGroundRent),
              left: `Ground rent ${money(r.groundRent)}`,
              right: `The building's income before it ${money(r.incomeBeforeGroundRent)} · covered ${times(r.groundRentCoverage)}`,
            }
          : null;
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
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">What is being sold</span>
        <span className="text-sm font-semibold">{r.label}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{text}</p>
      {tiles.length > 0 && (
        <div className="mt-2.5" data-qa="note-figures">
          <dl className="grid grid-cols-3 gap-1.5">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
                <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted">{t.label}</dt>
                <dd className="font-mono text-base font-semibold tabular-nums">{t.value}</dd>
                <dd className="text-[10px] leading-snug text-muted">{t.sub}</dd>
              </div>
            ))}
          </dl>
          {caption && <p className="mt-1 text-[11px] leading-snug text-muted">{caption}</p>}
        </div>
      )}
      {collateral && (
        <div className="mt-2.5">
          <div className="relative h-2.5 rounded-full bg-line" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/25" data-bar="note-balance" style={{ width: width(collateral.balance) }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/70" data-bar="interest" style={{ width: width(collateral.price) }} />
            {collateral.tick != null && (
              <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink" style={{ left: `${collateral.tick * 100}%` }} />
            )}
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <span>{`Price ${collateral.priceText} · ${collateral.ltvAtPrice}% of the collateral's value`}</span>
            <span>{`Unpaid balance ${collateral.balanceText} · ${collateral.ltvAtBalance}%`}</span>
            <span className="text-right">{`The collateral, as stated ${money(collateral.value)}`}</span>
          </div>
        </div>
      )}
      {bar && (
        <div className="mt-2.5" aria-hidden>
          <div className="h-2.5 rounded-full bg-line">
            <div className="h-2.5 rounded-full bg-brand/70" data-bar="interest" style={{ width: `${Math.max(1.5, bar.fill * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
            <span>{bar.left}</span>
            <span className="text-right">{bar.right}</span>
          </div>
        </div>
      )}
      {(r.summary || r.groundLease || r.loan) && (
        <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-muted">
          {r.summary && <li>{`The memorandum: ${r.summary}`}</li>}
          {r.groundLease && <li>{`The ground lease as stated: ${r.groundLease}`}</li>}
          {r.loan && <li>{`The loan as stated: ${r.loan}`}</li>}
        </ul>
      )}
      {r.modelCaveat && <p className="mt-2 text-xs leading-relaxed text-muted">{r.modelCaveat}</p>}
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
