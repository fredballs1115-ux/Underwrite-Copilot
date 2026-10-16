"use client";

import { useFormStatus } from "react-dom";
import { OUTCOME_REASONS, OUTCOME_REASON_LABEL, type StageChange } from "@/lib/stages";
import { currentOutcome, outcomeEntryIndex, tradeWords } from "@/lib/deal-outcome";
import { setDealOutcome } from "../actions";

function ReasonChip({ reason, selected }: { reason: (typeof OUTCOME_REASONS)[number]; selected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="reason"
      value={selected ? "" : reason}
      disabled={pending}
      aria-pressed={selected}
      className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
        selected ? "border-kill bg-kill text-white" : "border-line bg-surface text-ink hover:border-kill/50"
      }`}
    >
      {OUTCOME_REASON_LABEL[reason]}
    </button>
  );
}

function SaveTrade() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-9 shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save trade"}
    </button>
  );
}

/**
 * What became of the deal (research pass 24, B4), on a deal moved to Dead or
 * Closed: on Dead, why — one tap on a reason, a second tap clears it; on
 * either, the price it traded at, as someone on the team heard it, said with
 * who reported it and when. Nothing renders on a deal still in play, or on
 * one whose move was never recorded (lib/deal-outcome).
 */
export function DealOutcomeCard({
  dealId,
  stage,
  history,
  names = null,
}: {
  dealId: string;
  stage: string | null | undefined;
  history: StageChange[];
  /** the team's names by account (the deal page's roster lookup), so a
   *  trade says who reported it as the team knows them today */
  names?: Record<string, string> | null;
}) {
  const i = outcomeEntryIndex(stage, history);
  if (i == null) return null;
  const dead = history[i].stage === "dead";
  const outcome = currentOutcome(stage, history);
  const trade = outcome?.trade ?? null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="deal-outcome">
      <h2 className="text-sm font-semibold tracking-tight">{dead ? "Why it died" : "What it closed at"}</h2>
      {dead && (
        <form action={setDealOutcome} className="mt-3">
          <input type="hidden" name="dealId" value={dealId} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Why the deal died">
            {OUTCOME_REASONS.map((r) => (
              <ReasonChip key={r} reason={r} selected={outcome?.reason === r} />
            ))}
          </div>
        </form>
      )}
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {dead ? "What it traded at" : "The price paid"}
        </h3>
        {trade && <p className="mt-1 text-sm" data-qa="deal-outcome-trade">{tradeWords(trade, names)}</p>}
        <form action={setDealOutcome} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <input type="hidden" name="dealId" value={dealId} />
          <label className="text-xs text-muted">
            Price
            <input
              name="price"
              inputMode="decimal"
              defaultValue={trade ? String(trade.price) : ""}
              placeholder="$41.5M"
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-muted">
            {dead ? "Buyer" : "Buyer of record"}
            <input
              name="buyer"
              maxLength={120}
              defaultValue={trade?.buyer ?? ""}
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-muted">
            Date
            <input
              name="date"
              type="date"
              defaultValue={trade?.date ?? ""}
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <SaveTrade />
        </form>
        <p className="mt-1.5 text-[11px] text-muted">
          {"A reported price, not a recorded one: it is kept apart from the asking prices your pipeline pools, with your profile's name (else your email) and the day."}
        </p>
      </div>
    </section>
  );
}
