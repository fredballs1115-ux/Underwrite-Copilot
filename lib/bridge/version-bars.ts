// The bridge page's saved versions as one picture: each version's levered
// IRR a bar on ONE scale, so the versions read against each other at a
// glance. Pure; the page hands the view plain figures.
//
// The scale runs from zero, or from the lowest IRR where one is negative, to
// the highest, so a bar is drawn from the zero line out to its value and a
// loss reads as one, left of the line. A version with no IRR has no bar:
// a rate that did not solve is no point on the scale, and it is said why in
// the words every other surface uses (lib/underwrite/no-irr), read off its
// own stored assumptions run again through the engine — the version's
// results are a convenience, its assumptions the source (lib/bridge/versions).

import { computeUnderwrite } from "@/lib/underwrite/engine";
import { noIrrWhy, type NoIrrWhy } from "@/lib/underwrite/no-irr";
import type { Assumptions } from "./model";

export interface IrrScale {
  /** the scale's ends, decimals (0.12 = 12%) */
  lo: number;
  hi: number;
  /** where zero sits along the track, 0–100 */
  zeroAt: number;
}

/** The span the scale runs to where every version's IRR is 0%: a small,
 *  fixed one (0% to 5%), so the key reads as a scale an IRR could sit on and
 *  never "0% to 100%". */
export const ZERO_IRR_SPAN = 0.05;

/** The one scale for every version that has an IRR; null where none has. */
export function versionIrrScale(irrs: readonly (number | null | undefined)[]): IrrScale | null {
  const vals = irrs.filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  if (hi === lo) return { lo, hi: lo + ZERO_IRR_SPAN, zeroAt: 0 };
  return { lo, hi, zeroAt: ((0 - lo) / (hi - lo)) * 100 };
}

/** A bar's left edge and width along the track, both 0–100: from the zero
 *  line out to the value, either way. */
export function irrBar(s: IrrScale, irr: number): { left: number; width: number } {
  const at = ((irr - s.lo) / (s.hi - s.lo)) * 100;
  const left = Math.min(at, s.zeroAt);
  return { left, width: Math.abs(at - s.zeroAt) };
}

/** Why a version's levered IRR did not solve, from its own assumptions run
 *  again; null where it solves now, or the stored set cannot be run. */
export function versionNoIrr(assumptions: Assumptions | null | undefined): NoIrrWhy | null {
  if (!assumptions) return null;
  try {
    const r = computeUnderwrite(assumptions);
    return noIrrWhy(
      r.returns.leveredIrrPct,
      r.residual.netSaleProceeds,
      r.leveredVector.slice(1).reduce((a, b) => a + b, 0),
    );
  } catch {
    return null;
  }
}
