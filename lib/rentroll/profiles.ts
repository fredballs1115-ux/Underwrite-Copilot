/**
 * Market leasing assumptions (MLA) — the reusable profile that prices what
 * happens when a lease rolls: does the tenant renew, at what rent, with how
 * much TI and LC, after how much downtime and free rent.
 *
 * The defaults below are PUBLIC CONVENTION — the structure any ARGUS market
 * leasing tab uses, with sector starting points a broker would recognise. They
 * are deliberately not derived from any employer's internal underwriting
 * standards, and they exist to be overridden: every profile is user-owned and
 * every field is editable.
 *
 * Pure types + defaults.
 */

export interface MarketLeasingProfile {
  id: string;
  name: string;
  /** which asset class the defaults came from, for display only */
  assetClass: string;
  /** probability the sitting tenant renews, 0..1 */
  renewalProbability: number;
  /** market rent, annual $/SF */
  marketRentPsf: number;
  /** annual escalation on a new lease, decimal */
  escalationPct: number;
  /** new lease term, years */
  termYears: number;
  /** tenant improvements, $/SF */
  renewalTiPsf: number;
  newTiPsf: number;
  /** leasing commissions as a decimal of TOTAL TERM rent */
  renewalLcPct: number;
  newLcPct: number;
  /** months of vacancy before a NEW tenant takes occupancy (0 on a renewal) */
  downtimeMonths: number;
  /** free rent granted, months */
  renewalFreeRentMonths: number;
  newFreeRentMonths: number;
}

export type ProfileDraft = Omit<MarketLeasingProfile, "id">;

/**
 * Sector starting points. Renewal probability, TI split (renewals cost less
 * than new deals), LC on total term rent, downtime only on new deals, and free
 * rent — the standard six levers, at ordinary market conventions.
 */
export const PROFILE_DEFAULTS: Record<string, ProfileDraft> = {
  office: {
    name: "Office — market",
    assetClass: "office",
    renewalProbability: 0.65,
    marketRentPsf: 32,
    escalationPct: 0.03,
    termYears: 5,
    renewalTiPsf: 20,
    newTiPsf: 60,
    renewalLcPct: 0.03,
    newLcPct: 0.06,
    downtimeMonths: 9,
    renewalFreeRentMonths: 1,
    newFreeRentMonths: 6,
  },
  industrial: {
    name: "Industrial — market",
    assetClass: "industrial",
    renewalProbability: 0.75,
    marketRentPsf: 10,
    escalationPct: 0.035,
    termYears: 5,
    renewalTiPsf: 1,
    newTiPsf: 5,
    renewalLcPct: 0.025,
    newLcPct: 0.05,
    downtimeMonths: 6,
    renewalFreeRentMonths: 0.5,
    newFreeRentMonths: 2,
  },
  retail: {
    name: "Retail — market",
    assetClass: "retail",
    renewalProbability: 0.7,
    marketRentPsf: 28,
    escalationPct: 0.025,
    termYears: 5,
    renewalTiPsf: 5,
    newTiPsf: 35,
    renewalLcPct: 0.03,
    newLcPct: 0.06,
    downtimeMonths: 9,
    renewalFreeRentMonths: 1,
    newFreeRentMonths: 4,
  },
  multifamily: {
    name: "Multifamily — market",
    assetClass: "multifamily",
    renewalProbability: 0.55,
    marketRentPsf: 24,
    escalationPct: 0.03,
    termYears: 1,
    renewalTiPsf: 0.25,
    newTiPsf: 1.5,
    renewalLcPct: 0,
    newLcPct: 0,
    downtimeMonths: 1,
    renewalFreeRentMonths: 0,
    newFreeRentMonths: 0.5,
  },
};

export const DEFAULT_PROFILE: ProfileDraft = PROFILE_DEFAULTS.office;

export function defaultProfileFor(assetClass: string): ProfileDraft {
  return PROFILE_DEFAULTS[assetClass] ?? DEFAULT_PROFILE;
}

/** Clamp a user-entered profile into physically sensible bounds without
 *  silently rewriting their intent (a 100% renewal probability is allowed;
 *  a 400% one is a typo). */
export function normalizeProfile(p: ProfileDraft): ProfileDraft {
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  return {
    ...p,
    name: p.name.trim() || "Market leasing",
    renewalProbability: clamp(p.renewalProbability, 0, 1),
    marketRentPsf: clamp(p.marketRentPsf, 0, 1000),
    escalationPct: clamp(p.escalationPct, -0.5, 0.5),
    termYears: clamp(p.termYears, 0.25, 30),
    renewalTiPsf: clamp(p.renewalTiPsf, 0, 500),
    newTiPsf: clamp(p.newTiPsf, 0, 500),
    renewalLcPct: clamp(p.renewalLcPct, 0, 0.25),
    newLcPct: clamp(p.newLcPct, 0, 0.25),
    downtimeMonths: clamp(p.downtimeMonths, 0, 60),
    renewalFreeRentMonths: clamp(p.renewalFreeRentMonths, 0, 36),
    newFreeRentMonths: clamp(p.newFreeRentMonths, 0, 36),
  };
}
