import Link from "next/link";
import type { InterestRead } from "@/lib/interest";

/**
 * What is being sold (#414) — the pure panel for `lib/interest`, drawn by
 * the deal page under its header and by the shared screen under its own.
 * Nothing for a plain fee simple: the usual case needs no banner.
 *
 * The picture carries the price's meaning where the memorandum gives the
 * figures: a note's balance as the track with the price filled and the
 * discount the empty remainder, a share's implied whole as the track with
 * the share filled. The sentences are the reader's own (`headline`,
 * `modelCaveat`), so every surface says the same thing.
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

export function InterestPanel({ interest }: { interest: InterestRead | null }) {
  if (!interest) return null;
  const r = interest;
  // The picture: a note's price against its balance, a share against the
  // whole it implies — only where the memorandum states both figures.
  const bar =
    r.kind === "note" && r.balance != null && r.askingPrice != null && r.balance > 0
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
      <p className="mt-1 text-sm leading-relaxed">{r.headline}</p>
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
      {r.groundLease && (
        <p className="mt-2 text-xs">
          <Link href="/tools#ground-lease" prefetch={false} className="font-medium text-brand underline-offset-2 hover:underline">
            Value the leasehold on its term
          </Link>
        </p>
      )}
    </section>
  );
}
