import type { ReactNode } from "react";
import { Key, KeyItem, Tick } from "@/app/panel-parts";
import type { PlanSummary } from "@/lib/deal-strategy";

/**
 * Whether a plan's price is the building's own, bought outright, so its cost
 * can be drawn as parts: never beside a price the plan withholds (a note's,
 * the land's under a ground lease, a position's), a share's grossed-up whole
 * or the equity's whole beside its entity's loan, a cost the plan does not
 * strike, or a forward purchase, whose works are the developer's. With
 * `allowTotal`, an all-in total stated with no price stands too: the
 * construction panel sizes on it.
 */
export function planStackable(plan: PlanSummary, o: { allowTotal?: boolean } = {}): boolean {
  if (plan.priceWithheld != null || plan.equityWhole != null || plan.entityLoan != null || plan.costWithheld) return false;
  if (plan.priceLabel !== "Price" && plan.priceLabel !== "Land cost") return false;
  if (plan.forward) return false;
  if (plan.price == null) return o.allowTotal === true && plan.budget?.isTotal === true;
  return plan.price > 0;
}

/**
 * One whole drawn as the parts that make it up, on one primary track: a
 * price as its loan and its equity, a total cost as its price and its works,
 * a year's income as its expenses and what is left. Pure, with the panels'
 * own parts (app/panel-parts): the bar is a picture of the words in its key,
 * which say every figure, so nothing rides on colour, and the bar itself is
 * hidden from a screen reader.
 *
 * Each part's width is its share of the larger of the parts' sum and
 * `scale`; a part of nothing or less, or one that is not a figure, is not
 * drawn. A tick marks a figure inside the whole — a price under its price
 * plus the costs of buying it — said in the key beside the parts.
 */
export interface StackPart {
  /** the part's `data-bar` marker */
  bar: string;
  /** its fill, a background class */
  tone: string;
  /** what the key says of it, its figure included */
  label: string;
  value: number;
}

export interface StackTick {
  bar: string;
  value: number;
  label: string;
  tone?: string;
}

export function StackBar({
  parts,
  scale = 0,
  tick = null,
  qa,
  note = null,
  className = "mt-3",
}: {
  parts: readonly StackPart[];
  /** the whole the parts are drawn against, where it is more than their sum */
  scale?: number;
  tick?: StackTick | null;
  qa?: string;
  /** a line under the key, where the parts need one */
  note?: ReactNode;
  className?: string;
}) {
  const drawn = parts.filter((p) => Number.isFinite(p.value) && p.value > 0);
  const sum = drawn.reduce((s, p) => s + p.value, 0);
  const whole = Math.max(sum, Number.isFinite(scale) ? scale : 0);
  if (!(whole > 0) || drawn.length === 0) return null;
  const share = (v: number) => `${Math.max(0, Math.min(100, (v / whole) * 100))}%`;
  const showTick = tick != null && Number.isFinite(tick.value) && tick.value > 0 && tick.value <= whole;
  return (
    <div className={`${className} text-[11px]`} data-qa={qa}>
      <div className="relative" aria-hidden>
        <div className="flex h-3 overflow-hidden rounded-full bg-faint">
          {drawn.map((p, i) => (
            <div key={`${p.bar}-${i}`} className={`h-full ${p.tone}`} data-bar={p.bar} style={{ width: share(p.value) }} />
          ))}
        </div>
        {showTick && <Tick at={share(tick.value)} bar={tick.bar} tone={tick.tone ?? "bg-ink"} />}
      </div>
      <Key>
        {drawn.map((p, i) => (
          <KeyItem key={`${p.bar}-${i}`} mark="swatch" tone={p.tone}>
            {p.label}
          </KeyItem>
        ))}
        {showTick && (
          <KeyItem mark="tick" tone={tick.tone ?? "bg-ink"}>
            {tick.label}
          </KeyItem>
        )}
      </Key>
      {note && <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}
