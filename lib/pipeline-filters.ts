// The pipeline's filters in its address: `/deals?stage=tracking&fit=PURSUE`.
//
// Pure and universal, and deliberately NOT in the pipeline's client module
// (lib/pipeline-view's rule): the page, a server component, reads the
// filters from its searchParams so the server's HTML opens on them, and an
// export of a "use client" module is only a client reference there.
//
// A link is text anyone can edit, so every value is held to what the list
// can show: a verdict, a stage or a sharing choice the pipeline offers, an
// asset class, a market or a fit some deal on the list files under. Anything
// else is dropped — the filter reads "all", never a value no option names,
// which would draw the select's first option over a list filtered to
// nothing. Which view the list is drawn as (cards, list, map) is the
// reader's cookie and never a filter: a link carries none.
import { normalizeFitFilter } from "./fit-filter";
import { SHARING_OPTIONS } from "./personal-deal";
import { STAGES } from "./stages";

export interface PipelineFilters {
  /** the call: "pass", "caution", "pass_on", or "screening" (no call yet) */
  verdict: string;
  stage: string;
  asset: string;
  market: string;
  /** the fit filter's key (lib/fit-filter `fitFilterKey`) */
  fit: string;
  /** on a team: "shared" or "personal" (lib/personal-deal) */
  sharing: string;
  /** dead deals shown */
  dead: boolean;
}

export const NO_FILTERS: PipelineFilters = {
  verdict: "all",
  stage: "all",
  asset: "all",
  market: "all",
  fit: "all",
  sharing: "all",
  dead: false,
};

/** The address's keys, in the order a link writes them. None is a key the
 *  page reads for anything else (error, deleted, joined, new, addr, broker). */
export const FILTER_PARAMS = ["verdict", "stage", "asset", "market", "fit", "sharing", "dead"] as const;
type FilterParam = (typeof FILTER_PARAMS)[number];

const VERDICTS = new Set(["pass", "caution", "pass_on", "screening"]);
const STAGE_KEYS = new Set<string>(STAGES);
const SHARING_KEYS = new Set(SHARING_OPTIONS.map(([k]) => k).filter((k) => k !== "all"));

/** A value this long is no filter anyone picked. */
const MAX_VALUE = 200;

type ParamSource = URLSearchParams | string | Record<string, string | string[] | undefined>;

function firstOf(src: ParamSource, key: string): string | null {
  if (typeof src === "string" || src instanceof URLSearchParams) {
    const q = typeof src === "string" ? new URLSearchParams(src.startsWith("?") ? src.slice(1) : src) : src;
    return q.get(key);
  }
  const v = src[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * The filter part of an address, written one way: the filter keys alone, in
 * `FILTER_PARAMS` order, a key's first value where it repeats, an empty or
 * over-long value left out. What the server's render and the browser's first
 * render both start from, so the two agree (`""` for a bare link). Values
 * are not yet held to the list — `readFilterQuery` does that.
 */
export function filterQueryOf(src: ParamSource): string {
  const out = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    const v = firstOf(src, key)?.trim();
    if (v && v.length <= MAX_VALUE) out.set(key, v);
  }
  return out.toString();
}

/** What the list can show, for holding a link's values to it: the deals'
 *  own asset classes, markets and fit keys, and whether the reader is on a
 *  team (the sharing filter is drawn only there). */
export interface FilterOptions {
  assets: readonly string[];
  markets: readonly string[];
  fits: readonly string[];
  onTeam: boolean;
}

/** The filters a canonical query asks for, each held to what the list can
 *  show; a value it cannot is "all". */
export function readFilterQuery(query: string, options: FilterOptions): PipelineFilters {
  const q = new URLSearchParams(query);
  const pick = (key: FilterParam, ok: (v: string) => boolean): string => {
    const v = q.get(key);
    return v != null && v !== "all" && ok(v) ? v : "all";
  };
  // A view saved before the fit filter's words changed read "PASS" for the
  // low band (lib/fit-filter `normalizeFitFilter`).
  const fitRaw = q.get("fit");
  const fit = fitRaw == null ? null : normalizeFitFilter(fitRaw);
  return {
    verdict: pick("verdict", (v) => VERDICTS.has(v)),
    stage: pick("stage", (v) => STAGE_KEYS.has(v)),
    asset: pick("asset", (v) => options.assets.includes(v)),
    market: pick("market", (v) => options.markets.includes(v)),
    fit: fit != null && fit !== "all" && options.fits.includes(fit) ? fit : "all",
    sharing: options.onTeam ? pick("sharing", (v) => SHARING_KEYS.has(v)) : "all",
    dead: q.get("dead") === "1",
  };
}

/** The canonical query for a set of filters: a filter at its default is
 *  left out, so an unfiltered list is a bare link. */
export function filterQueryFrom(f: Partial<PipelineFilters>): string {
  const out = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    if (key === "dead") {
      if (f.dead) out.set("dead", "1");
      continue;
    }
    const v = f[key];
    if (typeof v === "string" && v && v !== "all" && v.length <= MAX_VALUE) out.set(key, v);
  }
  return out.toString();
}

/** An address's query with its filter keys replaced by `filterQuery`'s and
 *  every other key (broker, new, error…) kept as it is. */
export function withFilterQuery(search: string, filterQuery: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of FILTER_PARAMS) q.delete(key);
  for (const [k, v] of new URLSearchParams(filterQuery)) q.set(k, v);
  return q.toString();
}

/** Filters as the tab's session kept them before the address carried them
 *  (`uc-pipeline-view`: `mfit` and `showDead` under their old names), as a
 *  canonical query — read through `readFilterQuery` like any link. */
export function sessionFilterQuery(saved: unknown): string {
  if (!saved || typeof saved !== "object") return "";
  const s = saved as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return filterQueryFrom({
    verdict: str(s.verdict),
    stage: str(s.stage),
    asset: str(s.asset),
    market: str(s.market),
    fit: str(s.mfit),
    sharing: str(s.sharing),
    dead: s.showDead === true,
  });
}
