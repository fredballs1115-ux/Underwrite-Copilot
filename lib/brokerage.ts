// Which brokerages send the deals (research pass 24, B13): a scorecard by
// firm — deals received, how many fit the buy box, how many the screen
// called Go — and the pipeline's filter by firm. Pure: the firms come from
// the memorandum's listing team as printed (lib/offering `listingTeamOf`).
//
// Its rules:
//   - names are normalized conservatively: case, punctuation and a trailing
//     corporate suffix ("CBRE, Inc." is "CBRE"), "&" read as "and" — never a
//     guessed alias ("JLL" is not merged with "Jones Lang LaSalle"), and the
//     raw names a key gathers are kept and shown;
//   - a deal co-listed by two firms counts for each;
//   - a rate is said over what it can be: the fit rate over the deals whose
//     fit was judged, the Go rate over the deals with a call — never over
//     every deal received, which would count the unjudged as misses;
//   - a fit is judged only on the whole box (audit C8, M2, the pipeline
//     card's rule — lib/fit-label `fitScoreLabel`: a call over part of the
//     box is no call): a deal that passes on one criterion with the rest
//     unchecked is counted apart as checked on part of the box, never as a
//     fit; a miss outright is a judgement however much was checked, as the
//     card keeps "Outside box" over a partial count;
//   - a deal with no firm named is counted apart, never as a firm.
import type { ExtractionResult } from "@/lib/anthropic/types";
import { listingTeamOf } from "@/lib/offering";
import { buyBoxCoverage, foldBuyBoxChecks, type BuyBoxCheck } from "@/lib/criteria";

const SUFFIX = /(?:\s+|,\s*)(?:inc|incorporated|llc|l\.l\.c|ltd|limited|co|corp|corporation|company|lp|llp|plc)\.?$/i;

/** The key a firm's name files under: lowercased, "&" as "and", a trailing
 *  corporate suffix and punctuation dropped. "" for a name that is nothing
 *  once stripped. */
export function brokerageKey(name: string): string {
  let s = name.trim().replace(/&/g, " and ");
  // A suffix can follow another ("Co., Inc."): strip until none is left.
  for (let i = 0; i < 3 && SUFFIX.test(s); i++) s = s.replace(SUFFIX, "");
  return s
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The firms offering a deal, each once by its key, with the name as the
 *  memorandum printed it. */
export function dealFirms(ex: ExtractionResult | null | undefined): { key: string; name: string }[] {
  const out: { key: string; name: string }[] = [];
  for (const b of listingTeamOf(ex)) {
    if (!b.firm) continue;
    const key = brokerageKey(b.firm);
    if (!key || out.some((f) => f.key === key)) continue;
    out.push({ key, name: b.firm });
  }
  return out;
}

export interface BrokerDeal {
  firms: readonly { key: string; name: string }[];
  /** the buy-box fold (lib/criteria `foldBuyBoxChecks`), null where unjudged */
  fit: "fits" | "near" | "outside" | null;
  /** the box's criteria were not all checked (lib/criteria `buyBoxCoverage`):
   *  a fit or a near-miss on part of the box is no call */
  partial?: boolean;
  /** the screen's call, null where none */
  verdict: string | null;
}

export interface BrokerRow {
  key: string;
  /** the name printed most often for the key (the first on a tie) */
  name: string;
  /** every name the key gathered, as printed */
  names: string[];
  received: number;
  /** deals whose fit is a call: every criterion checked, or a miss outright */
  judged: number;
  fits: number;
  /** deals that passed or nearly passed on part of the box, the rest
   *  unchecked — counted apart, never in `judged` */
  partial: number;
  decided: number;
  go: number;
  /** fits over judged, 0–1; null where none was judged */
  fitRate: number | null;
  /** Go calls over the deals with a call, 0–1; null where none has one */
  goRate: number | null;
}

/**
 * A deal's fit as the scorecard counts it: the box's fold over its checks,
 * and whether that fold stands on part of the box only.
 */
export function brokerDealFit(checks: BuyBoxCheck[]): { fit: BrokerDeal["fit"]; partial: boolean } {
  const fit = foldBuyBoxChecks(checks);
  const cov = buyBoxCoverage(checks, null);
  return { fit, partial: fit != null && cov.checked < cov.total };
}

/**
 * The scorecard: one row a firm, the most deals first (then the name), and
 * how many deals named no firm at all.
 */
export function brokerScorecard(deals: readonly BrokerDeal[]): { rows: BrokerRow[]; unnamed: number } {
  const by = new Map<string, { names: Map<string, number>; order: string[]; received: number; judged: number; fits: number; partial: number; decided: number; go: number }>();
  let unnamed = 0;
  for (const d of deals) {
    if (!d.firms.length) {
      unnamed++;
      continue;
    }
    for (const f of d.firms) {
      const row = by.get(f.key) ?? { names: new Map<string, number>(), order: [] as string[], received: 0, judged: 0, fits: 0, partial: 0, decided: 0, go: 0 };
      if (!row.names.has(f.name)) row.order.push(f.name);
      row.names.set(f.name, (row.names.get(f.name) ?? 0) + 1);
      row.received++;
      if (d.fit && d.partial && d.fit !== "outside") {
        row.partial++;
      } else if (d.fit) {
        row.judged++;
        if (d.fit === "fits") row.fits++;
      }
      if (d.verdict) {
        row.decided++;
        if (d.verdict === "pass") row.go++;
      }
      by.set(f.key, row);
    }
  }
  const rows: BrokerRow[] = [...by].map(([key, r]) => {
    const name = r.order.reduce((best, n) => ((r.names.get(n) ?? 0) > (r.names.get(best) ?? 0) ? n : best), r.order[0]);
    return {
      key,
      name,
      names: r.order,
      received: r.received,
      judged: r.judged,
      fits: r.fits,
      partial: r.partial,
      decided: r.decided,
      go: r.go,
      fitRate: r.judged ? r.fits / r.judged : null,
      goRate: r.decided ? r.go / r.decided : null,
    };
  });
  rows.sort((a, b) => b.received - a.received || a.name.localeCompare(b.name));
  return { rows, unnamed };
}

/** "3 of 5 (60%)", or "—" where nothing could be counted. */
export function rateText(n: number, of: number): string {
  return of ? `${n} of ${of} (${Math.round((n / of) * 100)}%)` : "—";
}

/** The scorecard's word for the deals it set apart: "+2 checked on part of
 *  the box", "" where none was. */
export function partialText(n: number): string {
  return n > 0 ? `+${n} checked on part of the box` : "";
}
