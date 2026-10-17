"use client";

// The deal page's buy box tab — the mandate check in full and its 0–100
// fit gauge — in a module of its own, so the public sample screen (/demo)
// draws the SAME panel a signed-in user gets, on a fixture box, without the
// deal view and its server actions. deal-view.tsx re-exports it.
import Link from "next/link";
import { buyBoxCoverage, type BuyBoxCheck } from "@/lib/criteria";
import { MANDATE_TONE } from "@/lib/fit-label";
import type { MandateScore, MandateVerdict } from "@/lib/mandate";
import { EmptyState } from "./deal-sections-base";

export interface BuyBoxPanelData {
  checks: BuyBoxCheck[];
  /** the single 0–100 mandate-fit score + PURSUE/WATCH/PASS (null pre-screen) */
  mandate: MandateScore | null;
  scope: "team" | "personal";
  /** the checks came from the first signal, not the full extraction yet */
  provisional: boolean;
  hasBox: boolean;
}

const MANDATE_META: Record<
  MandateVerdict,
  { label: string; text: string; bar: string; chip: string }
> = {
  PURSUE: { label: "Pursue", text: "text-pass", bar: "bg-pass", chip: "bg-pass/10 text-pass" },
  WATCH: { label: "Watch", text: "text-caution", bar: "bg-caution", chip: "bg-caution/10 text-caution" },
  PASS: { label: "Pass", text: "text-kill", bar: "bg-kill", chip: "bg-kill/15 text-kill" },
};

/** The 0–100 mandate-fit score as a headline gauge: the number, the
 *  PURSUE/WATCH/PASS call, a bar with the 50/75 verdict thresholds marked, and
 *  the honest coverage line (what was scored, what's still pending). */
function MandateScoreHeader({
  mandate,
  unscored,
  outsideOn = [],
  priceUnchecked = false,
}: {
  mandate: MandateScore;
  /** buy-box criteria that are checked (below) but not part of the fit score */
  unscored: string[];
  /** criteria the deal misses outright — the header's chip reads "Outside
   *  box" on any of them, whatever the score's call */
  outsideOn?: string[];
  /** a criterion the price decides could not be checked (lib/criteria
   *  `buyBoxCoverage`) — the gauge is then never green, as the header's
   *  chip is not (lib/fit-label `fitTone`) */
  priceUnchecked?: boolean;
}) {
  const score = mandate.score!;
  const called = MANDATE_META[mandate.verdict!];
  // The header chip's colour rule: a score over part of the box, its price
  // unjudged, is drawn muted rather than as a green light; its call and what
  // it was scored on stay said.
  const meta =
    priceUnchecked && MANDATE_TONE[mandate.verdict!] === "pass"
      ? { ...called, text: "text-muted", bar: "bg-muted", chip: "bg-faint text-muted" }
      : called;
  const scored = mandate.dimensions.filter((d) => d.status !== "unknown").length;
  const pending = mandate.dimensions.length - scored;

  return (
    <div className="mt-3 rounded-xl border border-line bg-faint/60 p-4">
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-semibold tabular-nums tracking-tight ${meta.text}`}>
            {score}
          </span>
          <span className="text-sm text-muted">/ 100</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.chip}`}
            >
              {meta.label}
            </span>
            <span className="text-xs text-muted">mandate fit</span>
          </div>
          {/* The bar, with the WATCH (50) and PURSUE (75) thresholds ticked. */}
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${meta.bar}`}
              style={{ width: `${score}%` }}
            />
            <span className="absolute inset-y-0 left-[50%] w-px bg-surface/70" aria-hidden />
            <span className="absolute inset-y-0 left-[75%] w-px bg-surface/70" aria-hidden />
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        {mandate.dealbreakerTripped ? (
          <span className="font-medium text-kill">
            A hard dealbreaker was tripped — capped at Pass regardless of the rest.{" "}
          </span>
        ) : null}
        Scored on {scored} of {mandate.dimensions.length} mandate dimension
        {mandate.dimensions.length === 1 ? "" : "s"}
        {pending > 0 ? `, ${pending} pending more data` : ""}.
        {unscored.length
          ? ` ${unscored.join(" and ")} ${unscored.length > 1 ? "are" : "is"} checked below but not part of the fit score.`
          : ""}
        {mandate.unresolvedDealbreakers > 0 && !mandate.dealbreakerTripped
          ? ` ${mandate.unresolvedDealbreakers} dealbreaker${mandate.unresolvedDealbreakers > 1 ? "s" : ""} couldn't be checked — verify manually.`
          : ""}
        {outsideOn.length > 0
          ? ` It misses the box outright on ${outsideOn.join(" and ")}, so the deal's chip reads Outside box whatever the score's call.`
          : ""}
      </p>
    </div>
  );
}

/** The mandate check, full detail — the bar carries only the chip. */
export function BuyBoxPanel({
  data,
  publicDemo = false,
}: {
  data: BuyBoxPanelData;
  /** the public pages' sample: a visitor has no criteria page to edit, so
   *  the link asks them to sign up and set their own box */
  publicDemo?: boolean;
}) {
  if (!data.hasBox) {
    return (
      <EmptyState
        title="No buy box set yet."
        action={
          <Link
            href="/criteria"
            className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Set your buy box
          </Link>
        }
      />
    );
  }
  if (!data.checks.length) {
    return (
      <EmptyState title="The screen hasn’t produced anything to check against your mandate yet." />
    );
  }
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            The deal against your mandate
          </h2>
          <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            {data.scope === "team" ? "Team" : "Personal"}
          </span>
          {data.provisional && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
              First read
            </span>
          )}
        </div>
        <Link
          href={publicDemo ? "/login?mode=signup" : "/criteria"}
          className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {publicDemo ? "Sign up to set your own box →" : "Edit criteria →"}
        </Link>
      </div>
      {data.mandate?.score != null && data.mandate.verdict && (
        <MandateScoreHeader
          mandate={data.mandate}
          // Criteria the fold checks below but the 0–100 score doesn't weigh.
          // The basis check wears the deal's noun ("Basis / key" on a hotel),
          // and on a plan deal what it divides ("Price / unit"), so it is
          // matched by its prefix, never by one spelling.
          unscored={data.checks
            .filter((c) => c.label === "Price" || c.label.startsWith("Basis / ") || c.label.startsWith("Price / "))
            .map((c) => (c.label === "Price" ? "price" : c.label.toLowerCase()))}
          // The criteria the deal misses outright: the header's chip folds
          // every check and reads "Outside box" on any of them (lib/buy-box-
          // chip), so the gauge says why it differs from its own call.
          outsideOn={data.checks.filter((c) => c.status === "miss").map((c) => c.label.toLowerCase())}
          priceUnchecked={buyBoxCoverage(data.checks, data.mandate).priceUnchecked}
        />
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.checks.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border p-3 ${
              c.status === "miss"
                ? "border-kill/25 bg-kill/[0.04]"
                : c.status === "near"
                  ? "border-caution/30 bg-caution/[0.05]"
                  : c.status === "pass"
                    ? "border-line bg-surface"
                    : "border-line bg-faint"
            }`}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <span
                aria-hidden
                className={
                  c.status === "miss"
                    ? "text-kill"
                    : c.status === "near"
                      ? "text-caution"
                      : c.status === "pass"
                        ? "text-pass"
                        : "text-muted"
                }
              >
                {c.status === "miss"
                  ? "✕"
                  : c.status === "near"
                    ? "≈"
                    : c.status === "pass"
                      ? "✓"
                      : "—"}
              </span>
              {c.label}
              {c.status === "near" && (
                <span className="rounded-full bg-caution/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-caution">
                  Near miss
                </span>
              )}
              {/* A word of its own for a screen reader: "Asset class inside
                  the mandate", never "classinside" (a flex row draws no
                  space for it). */}{" "}
              <span className="sr-only">
                {c.status === "miss"
                  ? "outside the mandate"
                  : c.status === "near"
                    ? "a near-miss against the mandate"
                    : c.status === "pass"
                      ? "inside the mandate"
                      : "not determinable yet"}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
