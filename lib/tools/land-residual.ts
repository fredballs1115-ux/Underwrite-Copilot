/**
 * What the dirt can be worth — the residual land value.
 *
 * Every other calculation on this site starts from a price. This one solves
 * for it. A developer looking at a site does not ask "is this price good";
 * they ask "what can I pay and still make my number", and the answer is
 * whatever is left of the finished building's value after the cost of
 * building it and the profit required for doing so.
 *
 * The arithmetic is a subtraction, and that is exactly what makes it
 * dangerous: the land is a SMALL difference between two LARGE numbers, so
 * everything upstream of it is amplified on the way down. A 25bp move in
 * the exit cap can take a third off what the site is worth. That sensitivity
 * is the reason this belongs on a page rather than in someone's head, and
 * it is reported rather than left to be discovered.
 *
 * Two hurdles, deliberately kept apart, because both are used and they do
 * not agree:
 *
 *   - **Profit on cost** — the developer takes a margin over everything
 *     spent. The market's usual way of saying "is it worth doing".
 *   - **Yield on cost** — the finished building must throw off a target
 *     unlevered return on total cost. The way a capital partner says it.
 *
 * Each reduces to a TOTAL COST BUDGET, and the land is what is left of that
 * budget after the building is paid for. Where both are set, the lower land
 * value binds: you cannot pay more than the tighter of two tests you have
 * agreed to meet.
 *
 * One piece of arithmetic worth spelling out. The carry — interest and
 * everything else the project spends while it is under construction — is
 * charged on the whole project cost INCLUDING the land, which is the thing
 * being solved for. That is circular only if you leave it in words. With
 * `L` the land, `H` hard costs, `S` soft costs, `c` the carry rate and `T`
 * the total cost budget:
 *
 *     T = (L + H + S) · (1 + c)      so     L = T / (1 + c) − H − S
 *
 * Quoting the carry against hard and soft alone — the shortcut — understates
 * it, and understating a cost overstates the land, which is the direction a
 * developer can least afford to be wrong in.
 *
 * Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

export interface ResidualTerms {
  /** the gross floor area the site can carry */
  buildableSf: number | null;
  /** units, if it is a unit deal — only used to say the land per unit */
  units: number | null;
  /** NOI once the building is finished and leased */
  stabilizedNoi: number | null;
  /** the cap rate the finished building is valued at, in % */
  exitCapPct: number | null;
  /** construction cost per buildable foot */
  hardCostPerSf: number | null;
  /** soft costs as a share of HARD costs, in % */
  softCostPct: number | null;
  /** carry over the build, as a share of land + hard + soft, in % */
  carryPct: number | null;
  /** the developer's margin over total cost, in % */
  profitOnCostPct: number | null;
  /** the unlevered return the finished project must make on total cost, in % */
  targetYieldOnCostPct: number | null;
}

/** One hurdle's answer. */
export interface Hurdle {
  /** everything the project may cost, land included */
  budget: number;
  carry: number;
  /** the finished value over the cost budget — the margin the test leaves */
  profit: number;
  /** the same margin against the budget, in % */
  profitOnCostPct: number | null;
  /** what is left for the land. NEGATIVE where the deal does not work at all */
  land: number;
}

export interface ResidualRead {
  completedValue: number | null;
  hardCost: number | null;
  softCost: number | null;
  byProfit: Hurdle | null;
  byYield: Hurdle | null;
  /** which test allows less — the one that decides the cheque */
  binding: "profit" | "yield" | null;
  land: number | null;
  landPerBuildableSf: number | null;
  landPerUnit: number | null;
  /** the binding case drawn as parts of the completed value */
  lines: { label: string; amount: number; sharePct: number }[];
  /** the land at an exit cap 25bp higher */
  capShockLand: number | null;
  /** the land with hard costs 5% over */
  costShockLand: number | null;
  note: string | null;
}

const EMPTY: ResidualRead = {
  completedValue: null,
  hardCost: null,
  softCost: null,
  byProfit: null,
  byYield: null,
  binding: null,
  land: null,
  landPerBuildableSf: null,
  landPerUnit: null,
  lines: [],
  capShockLand: null,
  costShockLand: null,
  note: null,
};

/**
 * The land left over under one total-cost budget.
 *
 * `budget` is everything the project may spend, land included. Back the
 * carry out of it, then the building, and what remains is the site.
 *
 * The land is derived from the ROUNDED pieces rather than rounded on its
 * own — the same rule the loan schedule follows, and for the same reason.
 * These five figures are drawn as segments of one bar, and a bar whose
 * parts do not add up to the whole reads as broken whatever the arithmetic
 * behind it. Deriving the land this way is also the honest reading: the
 * land IS the leftover, so it should absorb the rounding rather than push
 * it into a gap at the end of the picture.
 */
function hurdleOf(
  budget: number,
  value: number,
  hard: number,
  soft: number,
  carryRate: number,
): Hurdle {
  const carry = round(budget - budget / (1 + carryRate));
  const profit = round(value - budget);
  return {
    budget: round(budget),
    carry,
    profit,
    profitOnCostPct: budget > 0 ? round(((value - budget) / budget) * 100, 1) : null,
    land: round(value) - round(hard) - round(soft) - carry - profit,
  };
}

export function readResidual(t: ResidualTerms): ResidualRead {
  if (!positive(t.stabilizedNoi)) {
    return { ...EMPTY, note: "Set the NOI the finished building will make." };
  }
  if (!positive(t.exitCapPct)) {
    return { ...EMPTY, note: "Set the cap rate the finished building is valued at." };
  }
  if (!positive(t.buildableSf)) {
    return { ...EMPTY, note: "Set how many square feet the site can carry." };
  }
  if (!positive(t.hardCostPerSf)) {
    return { ...EMPTY, note: "Set the construction cost per buildable foot." };
  }
  if (!positive(t.profitOnCostPct) && !positive(t.targetYieldOnCostPct)) {
    return {
      ...EMPTY,
      note: "Set a profit on cost or a target yield on cost — the land is whatever is left after one of them is met.",
    };
  }

  const value = t.stabilizedNoi / (t.exitCapPct / 100);
  const hard = t.buildableSf * t.hardCostPerSf;
  // Soft costs quote against HARD costs, which is both the convention and
  // the only non-circular reading: a soft-cost percentage of a total that
  // includes soft costs is defined in terms of itself.
  const soft = real(t.softCostPct) && t.softCostPct > 0 ? hard * (t.softCostPct / 100) : 0;
  const carryRate = real(t.carryPct) && t.carryPct > 0 ? t.carryPct / 100 : 0;

  // Profit on cost: the finished value covers the cost AND a margin on it,
  // so the budget is the value divided by one plus the margin. (The other
  // convention, a margin on VALUE, gives a different and always larger
  // budget; "profit on cost" is what a development appraisal means.)
  const byProfit = positive(t.profitOnCostPct)
    ? hurdleOf(value / (1 + t.profitOnCostPct / 100), value, hard, soft, carryRate)
    : null;

  // Yield on cost: the budget is simply the NOI capitalised at the target.
  // The margin is not an input here — it falls out of the gap between the
  // target yield and the exit cap, and is reported so the two tests can be
  // compared on the same terms.
  const byYield = positive(t.targetYieldOnCostPct)
    ? hurdleOf(
        t.stabilizedNoi / (t.targetYieldOnCostPct / 100),
        value,
        hard,
        soft,
        carryRate,
      )
    : null;

  // Where both are set, the tighter test decides. You cannot pay the higher
  // of two numbers and still satisfy the test that produced the lower one.
  const binding: "profit" | "yield" | null =
    byProfit && byYield
      ? byProfit.land <= byYield.land
        ? "profit"
        : "yield"
      : byProfit
        ? "profit"
        : byYield
          ? "yield"
          : null;
  const bound = binding === "profit" ? byProfit : byYield;
  // The land is never clamped at zero. A negative residual means the
  // finished building is worth less than it costs to build plus the return
  // required for building it — the site does not work at any price, free
  // included, and a zero would hide exactly that.
  const land = bound ? bound.land : null;

  const lines =
    bound && value > 0
      ? [
          { label: "Hard costs", amount: round(hard), sharePct: round((hard / value) * 100, 1) },
          { label: "Soft costs", amount: round(soft), sharePct: round((soft / value) * 100, 1) },
          {
            label: "Carry",
            amount: bound.carry,
            sharePct: round((bound.carry / value) * 100, 1),
          },
          {
            label: "Developer profit",
            amount: bound.profit,
            sharePct: round((bound.profit / value) * 100, 1),
          },
          {
            label: "Land",
            amount: bound.land,
            sharePct: round((bound.land / value) * 100, 1),
          },
        ].filter((x) => x.amount !== 0)
      : [];

  // The two shocks worth naming, both re-solved rather than scaled: a
  // quarter point on the exit cap, and a 5% overrun on the build. On a
  // normal development each takes a third off the land, which is the whole
  // argument for why a residual is a range and not a number.
  const capShock = bindingLand({ ...t, exitCapPct: t.exitCapPct + 0.25 });
  const costShock = bindingLand({ ...t, hardCostPerSf: t.hardCostPerSf * 1.05 });

  return {
    completedValue: round(value),
    hardCost: round(hard),
    softCost: round(soft),
    byProfit,
    byYield,
    binding,
    land,
    landPerBuildableSf:
      land === null ? null : round(land / t.buildableSf, 2),
    landPerUnit: land === null || !positive(t.units) ? null : round(land / t.units),
    lines,
    capShockLand: capShock,
    costShockLand: costShock,
    note:
      land !== null && land < 0
        ? "The residual is negative: the finished building is worth less than it costs to build plus the return required for building it, so the site does not work at any land price."
        : null,
  };
}

/**
 * The binding land value under one changed assumption — the same arithmetic
 * as above with none of the reporting, so a shock is re-SOLVED rather than
 * scaled. Scaling would miss the point: the land is a residual, so a 5%
 * move upstream is never a 5% move here.
 */
function bindingLand(t: ResidualTerms): number | null {
  if (
    !positive(t.stabilizedNoi) ||
    !positive(t.exitCapPct) ||
    !positive(t.buildableSf) ||
    !positive(t.hardCostPerSf)
  ) {
    return null;
  }
  const value = t.stabilizedNoi / (t.exitCapPct / 100);
  const hard = t.buildableSf * t.hardCostPerSf;
  const soft = real(t.softCostPct) && t.softCostPct > 0 ? hard * (t.softCostPct / 100) : 0;
  const carryRate = real(t.carryPct) && t.carryPct > 0 ? t.carryPct / 100 : 0;

  const lands: number[] = [];
  if (positive(t.profitOnCostPct)) {
    lands.push(hurdleOf(value / (1 + t.profitOnCostPct / 100), value, hard, soft, carryRate).land);
  }
  if (positive(t.targetYieldOnCostPct)) {
    lands.push(
      hurdleOf(
        t.stabilizedNoi / (t.targetYieldOnCostPct / 100),
        value,
        hard,
        soft,
        carryRate,
      ).land,
    );
  }
  return lands.length === 0 ? null : Math.min(...lands);
}
