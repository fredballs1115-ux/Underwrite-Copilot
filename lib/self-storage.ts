// Self-storage (#471) — a facility let month to month, a unit at a time,
// whose rent roll is a history of rate increases on tenants who stopped
// shopping. The screen read a storage deal as a building with a vacancy
// rate: the two occupancies an operator quotes, the street rate against
// what sitting tenants pay, and whose platform the income rides on were in
// none of its surfaces.
//
// Pure — no I/O, no model call. The extraction files the figures as rows of
// their own, each only as stated: "Physical occupancy" (by units), "SF
// occupancy" (by rentable area), "Economic occupancy", "In-place rent" and
// "Street rate" (each with its basis as written — "$1.38/SF/month", "$118
// per unit per month"), "Climate-controlled", "Tenant insurance",
// "Management", "Expansion" and "Storage SF per capita".
//
// Six rules.
//
// PHYSICAL IS UNITS, ECONOMIC IS RENT. The share of units let is not the
// share of the rent the facility could collect; the gap between them is
// discounts, concessions and delinquency, said in points. By area the
// share runs lower still where small units fill first.
//
// IN-PLACE OVER STREET IS THE INCREASES' PREMIUM, AND A MOVE-OUT GIVES IT
// BACK. A sitting tenant pays years of rate increases; the unit re-lets at
// the street rate. The premium is said over the street rate, and what the
// rent would be with every tenant at street is said as the downside — the
// case a new facility down the road makes real. Compared only on one basis
// (per SF or per unit) and one period; a monthly and a yearly figure are
// converted, and a basis the words do not state is compared only with one
// stated the same way.
//
// UNDER 85% BY UNITS IS A LEASE-UP. A facility below it is priced on an
// occupancy it has not reached (the class's own trap list, STORAGE_TRAPS).
//
// THE PLATFORM'S INCOME IS THE PLATFORM'S. Tenant insurance is the
// operator's program, and a manager's brand and pricing system set the
// street rate; a buyer on another platform keeps neither by buying the
// building.
//
// SUPPLY IS AS STATED. A figure per capita is said with its radius and
// never held to a norm the site does not read.
//
// A BLANK IS NULL. An economic occupancy is never read from a physical one.

import { compactUsd } from "@/lib/money";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey } from "@/lib/asset-words";
import { parsePct } from "@/lib/criteria";
import { parsePageNumber } from "@/lib/facts";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

const PHYSICAL = /^(?:physical\s+occupancy|unit\s+occupancy|occupancy\s*\((?:by\s+)?units?\)|occupancy\s+by\s+units?)\b/i;
const OCCUPANCY = /^(?:current\s+)?occupancy$/i;
const SF_OCCUPANCY = /^(?:sf|nrsf|area|rentable\s+sf)\s+occupancy\b|^occupancy\s*\((?:by\s+)?(?:sf|nrsf|area|square\s+feet)\)|^occupancy\s+by\s+(?:sf|nrsf|area|square\s+feet)\b/i;
const ECONOMIC = /^economic\s+occupancy\b/i;
const IN_PLACE = /^(?:average\s+|avg\.?\s+)?in-?place\s+(?:rent|rate)s?\b/i;
const STREET = /^(?:average\s+|avg\.?\s+)?street\s+(?:rent|rate)s?\b/i;
const CLIMATE = /^climate[- ]controlled\b/i;
const TENANT_INSURANCE = /^tenant\s+(?:insurance|protection)\b/i;
const MANAGEMENT = /^(?:property\s+)?management\b|^(?:third[- ]party\s+)?manager\b|^managed\s+by\b/i;
const EXPANSION = /^expansion\b/i;
const PER_CAPITA = /^(?:storage\s+)?(?:sf|square\s+feet)\s+per\s+capita\b|^per\s+capita\s+(?:storage\s+)?(?:supply|sf)\b/i;

/** The pace below which a facility is read as leasing up — the class's own
 *  trap list's line. */
export const STABILIZED_UNITS_PCT = 85;

export interface StorageRate {
  /** the figure, to the cent, as stated */
  value: number;
  /** per rentable SF or per unit; null where the words say neither */
  basis: "sf" | "unit" | null;
  /** a month's or a year's; null where the words say neither */
  period: "month" | "year" | null;
  stated: string;
}

/** A storage rate as stated — "$1.38/SF/month", "$16.56 per SF per year",
 *  "$118 per unit per month" — with its basis and period read only from the
 *  words: the value's, and the row's label where it carries them ("In-place
 *  rent/SF/mo: $1.38"). Null for a range, which is no average. */
export function storageRateOf(stated: string, label = ""): StorageRate | null {
  const s = stated.trim();
  if (/\d\s*(?:[-–—]|to)\s*\$?\s*\d/.test(s)) return null;
  const m = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/.exec(s);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const words = `${label} ${s}`;
  const basis = /(?:\/|\bper\s+|\ba\s+)(?:sf|nrsf|sq\.?\s*ft\.?|square\s+f(?:oo|ee)t)\b|\bpsf\b/i.test(words)
    ? "sf"
    : /(?:\/|\bper\s+|\ba\s+)(?:unit|space)\b/i.test(words)
      ? "unit"
      : null;
  const period = /(?:\/|\bper\s+|\ba\s+)(?:mo|month)\b|\bmonthly\b/i.test(words)
    ? "month"
    : /(?:\/|\bper\s+|\ba\s+)(?:yr|year|annum)\b|\bannual(?:ly)?\b/i.test(words)
      ? "year"
      : null;
  return { value, basis, period, stated: s };
}

/** The street rate over the in-place one on one footing, or null where the
 *  two are not stated the same way: a monthly and a yearly figure are
 *  converted, anything else must match. */
function onOneFooting(inPlace: StorageRate, street: StorageRate): { inPlace: number; street: number } | null {
  if (inPlace.basis !== street.basis) return null;
  if (inPlace.period === street.period) return { inPlace: inPlace.value, street: street.value };
  if (inPlace.period == null || street.period == null) return null;
  const monthly = (r: StorageRate) => (r.period === "year" ? r.value / 12 : r.value);
  return { inPlace: monthly(inPlace), street: monthly(street) };
}

export interface SelfStorageRead {
  /** the share of units let, % */
  physicalPct: number | null;
  /** the share of rentable area let, % */
  sfPct: number | null;
  /** the rent collected against its potential, % */
  economicPct: number | null;
  /** physical less economic, in points */
  economicGapPts: number | null;
  /** under `STABILIZED_UNITS_PCT` by units */
  leaseUp: boolean;
  inPlace: StorageRate | null;
  street: StorageRate | null;
  /** the two on one footing (a month's where a yearly figure was
   *  converted), for a picture; null where they are not comparable */
  footing: { inPlace: number; street: number } | null;
  /** how far sitting tenants pay over (+) or under (−) the street rate, % of
   *  the street rate */
  premiumPct: number | null;
  /** how much lower the rent is with every tenant at street, % of today's */
  rollDownPct: number | null;
  climatePct: number | null;
  climateStated: string;
  tenantInsurance: string;
  management: { stated: string; thirdParty: boolean; feePct: number | null } | null;
  expansion: string;
  perCapita: string;
  page: string;
  sentences: string[];
  headline: string;
}

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const pts = (n: number) => `${Math.round(Math.abs(n) * 10) / 10} ${Math.abs(n) === 1 ? "point" : "points"}`;
const cents = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const money = (n: number) => compactUsd(n);

/** "$1.38/SF a month", "$118 a unit a month": a rate in the words a sentence
 *  says it in. */
export function rateWords(r: StorageRate, value = r.value): string {
  const basis = r.basis === "sf" ? "/SF" : r.basis === "unit" ? " a unit" : "";
  const period = r.period === "month" ? " a month" : r.period === "year" ? " a year" : "";
  return `${cents(Math.round(value * 100) / 100)}${basis}${period}`;
}

/** Whether the deal is self-storage: the class the deck was read as, or —
 *  where no class was read — a street rate stated beside an in-place one.
 *  An apartment memorandum speaks of street rents too, so a deal read as
 *  any other class is never storage by its rows. */
function isStorage(ex: ExtractionResult, rows: Row[]): boolean {
  const key = assetClassKey(ex.assetClass);
  if (key === "self_storage") return true;
  if (key) return false;
  const has = (re: RegExp) => rows.some((r) => re.test(r.label.trim()));
  return has(STREET) && has(IN_PLACE);
}

/**
 * A facility's occupancies, its rates against the street's and whose
 * platform its income rides on, as stated. Null on anything but storage,
 * and where the memorandum states none of it.
 */
export function readSelfStorage(ex: ExtractionResult | null | undefined): SelfStorageRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  if (!isStorage(ex, rows)) return null;
  const find = (re: RegExp) => rows.find((m) => re.test(m.label.trim())) ?? null;
  const pctOf = (r: Row | null) => {
    const n = r ? parsePct(r.value) : null;
    return n != null && n > 0 && n <= 100 ? n : null;
  };

  const physicalRow = find(PHYSICAL) ?? find(OCCUPANCY);
  const physicalPct = pctOf(physicalRow);
  const sfPct = pctOf(find(SF_OCCUPANCY));
  const economicRow = find(ECONOMIC);
  const economicPct = pctOf(economicRow);
  const inPlaceRow = find(IN_PLACE);
  const streetRow = find(STREET);
  const inPlace = inPlaceRow ? storageRateOf(inPlaceRow.value, inPlaceRow.label) : null;
  const street = streetRow ? storageRateOf(streetRow.value, streetRow.label) : null;
  const footing = inPlace && street ? onOneFooting(inPlace, street) : null;
  const climateRow = find(CLIMATE);
  const managementRow = find(MANAGEMENT);
  const management = managementRow
    ? {
        stated: managementRow.value.trim(),
        thirdParty: /\bthird[- ]party\b|\bmanaged\s+by\b|\b(?:public\s+storage|extra\s+space|cubesmart|life\s+storage|storage\s+king|storquest)\b/i.test(
          managementRow.value,
        ),
        feePct: (() => {
          const fee = /(\d+(?:\.\d+)?)\s*%/.exec(managementRow.value);
          const n = fee ? Number(fee[1]) : null;
          return n != null && n > 0 && n <= 15 ? n : null;
        })(),
      }
    : null;

  const read: Omit<SelfStorageRead, "sentences" | "headline"> = {
    physicalPct,
    sfPct,
    economicPct,
    economicGapPts: physicalPct != null && economicPct != null ? Math.round((physicalPct - economicPct) * 10) / 10 : null,
    leaseUp: physicalPct != null && physicalPct < STABILIZED_UNITS_PCT,
    inPlace,
    street,
    footing,
    premiumPct: footing && footing.street > 0 ? Math.round(((footing.inPlace - footing.street) / footing.street) * 1000) / 10 : null,
    rollDownPct:
      footing && footing.inPlace > footing.street ? Math.round(((footing.inPlace - footing.street) / footing.inPlace) * 1000) / 10 : null,
    climatePct: pctOf(climateRow),
    climateStated: climateRow?.value.trim() ?? "",
    tenantInsurance: find(TENANT_INSURANCE)?.value.trim() ?? "",
    management,
    expansion: find(EXPANSION)?.value.trim() ?? "",
    perCapita: find(PER_CAPITA)?.value.trim() ?? "",
    page: "",
  };
  const facts =
    read.economicPct != null ||
    read.sfPct != null ||
    read.inPlace != null ||
    read.street != null ||
    read.climatePct != null ||
    !!read.tenantInsurance ||
    read.management != null ||
    !!read.expansion ||
    !!read.perCapita;
  if (!facts) return null;
  const pages = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const pageRow = economicRow ?? streetRow ?? inPlaceRow ?? physicalRow;
  const n = parsePageNumber(pageRow?.page);
  read.page = n != null && pages != null && n <= pages ? (pageRow?.page ?? "").trim() : "";
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<SelfStorageRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  if (r.physicalPct != null || r.economicPct != null) {
    const parts: string[] = [];
    if (r.physicalPct != null) parts.push(`${pct1(r.physicalPct)} occupied by units`);
    if (r.sfPct != null) parts.push(`${pct1(r.sfPct)} by area`);
    if (r.economicPct != null) parts.push(`${pct1(r.economicPct)} economically`);
    const gap =
      r.economicGapPts != null && r.economicGapPts > 0
        ? `: the ${pts(r.economicGapPts)} between the units let and the rent collected are discounts, concessions and delinquency`
        : "";
    out.push(`It is ${parts.join(", ")}${gap}.`);
  } else if (r.sfPct != null) {
    out.push(`It is ${pct1(r.sfPct)} occupied by area.`);
  }
  if (r.physicalPct != null && r.sfPct != null && r.sfPct < r.physicalPct) {
    out.push("By area it runs lower than by units: the small units fill first, and the large ones are the space still to let.");
  }
  if (r.leaseUp && r.physicalPct != null) {
    out.push(
      `Under ${STABILIZED_UNITS_PCT}% by units, it is in lease-up: the price rests on an occupancy the facility has not reached, at the street rates new tenants pay.`,
    );
  }

  if (r.inPlace && r.street && r.premiumPct != null) {
    if (r.premiumPct > 0) {
      out.push(
        `Sitting tenants pay ${rateWords(r.inPlace)} against a street rate of ${rateWords(r.street)}: ${pct1(r.premiumPct)} over it, the premium years of rate increases built, and every move-out gives it back, since the unit re-lets at street.${
          r.rollDownPct != null ? ` With every tenant at street the rent would be ${pct1(r.rollDownPct)} lower — the case a new facility nearby makes real.` : ""
        }`,
      );
    } else if (r.premiumPct < 0) {
      out.push(
        `Sitting tenants pay ${rateWords(r.inPlace)} against a street rate of ${rateWords(r.street)}: ${pct1(-r.premiumPct)} under it — room the rate increases have not yet taken, if the street rate is what new tenants actually sign at.`,
      );
    } else {
      out.push(`Sitting tenants pay the street rate, ${rateWords(r.street)}: the rent roll carries no premium to give back.`);
    }
  } else if (r.inPlace && r.street) {
    out.push(`The in-place rent (${r.inPlace.stated}) and the street rate (${r.street.stated}) are not stated on one basis, so they are not compared.`);
  } else if (r.street) {
    out.push(`The street rate is ${rateWords(r.street)}; the memorandum states no in-place rent to set against it.`);
  } else if (r.inPlace) {
    out.push(`Sitting tenants pay ${rateWords(r.inPlace)}; the memorandum states no street rate to set it against.`);
  }

  if (r.climatePct != null) out.push(`${pct1(r.climatePct)} of it is climate-controlled, as stated.`);
  if (r.tenantInsurance) {
    out.push(`Tenant insurance, as stated: ${r.tenantInsurance}. It is the operator's program, and a buyer keeps its income only by running one.`);
  }
  if (r.management) {
    out.push(
      r.management.thirdParty
        ? `It is managed by a third party, as stated (${r.management.stated}): the fee belongs in the expenses, and a buyer on another platform changes the brand and the pricing system that sets the street rates.`
        : `Its management, as stated: ${r.management.stated}.`,
    );
  }
  if (r.expansion) out.push(`Expansion, as stated: ${r.expansion}.`);
  if (r.perCapita) out.push(`Storage supply per person, as stated: ${r.perCapita}.`);
  return out;
}

/**
 * What the screening model does with the facility: it grows today's rent
 * at one rate, so the premium sitting tenants pay over street is in its
 * rent as if it never rolls back; and it holds one vacancy across its
 * years, so a facility in lease-up fills in none of them. "" where none of
 * it applies.
 */
export function storageModelLine(r: SelfStorageRead, m: { rentAnnual: number; exitCapPct: number; vacancyPct: number }): string {
  const parts: string[] = [];
  if (r.rollDownPct != null && r.rollDownPct > 0 && m.rentAnnual > 0) {
    const lost = (m.rentAnnual * r.rollDownPct) / 100;
    parts.push(
      `The model grows today's rent, the rate increases' premium included; with every tenant at street its year-one rent would be ${money(lost)} lower${
        m.exitCapPct > 0 ? `, ${money(lost / m.exitCapPct)} at its ${(m.exitCapPct * 100).toFixed(2)}% exit cap` : ""
      } — a downside it does not run.`,
    );
  }
  if (r.leaseUp) {
    parts.push(`Its ${pct1(m.vacancyPct)} vacancy is held flat across its years: a lease-up to a stabilized occupancy is in none of them.`);
  }
  return parts.join(" ");
}

/** The pipeline row's tag, its parts in the order a scan wants them:
 *  "Lease-up, 72% occupied", "In-place 21% over street", "Economic 84%".
 *  `max` parts (two on a card and a row, all of them on the compare
 *  table). Null where there is nothing to say. */
export function selfStorageTag(ex: ExtractionResult | null | undefined, max = 2): string | null {
  const r = readSelfStorage(ex);
  if (!r) return null;
  const parts: string[] = [];
  if (r.leaseUp && r.physicalPct != null) parts.push(`Lease-up, ${pct1(r.physicalPct)} occupied`);
  if (r.premiumPct != null && r.premiumPct > 0) parts.push(`In-place ${pct1(r.premiumPct)} over street`);
  else if (r.premiumPct != null && r.premiumPct < 0) parts.push(`In-place ${pct1(-r.premiumPct)} under street`);
  if (r.economicPct != null) parts.push(`Economic ${pct1(r.economicPct)}`);
  if (r.management?.thirdParty) parts.push("3rd-party managed");
  return parts.length ? parts.slice(0, max).join(", ") : null;
}

/** The facility in one line, for the memo, the workbook's cover and the
 *  report. */
export function storageShortLine(r: SelfStorageRead): string {
  const parts: string[] = [];
  const occ = [
    r.physicalPct != null ? `${pct1(r.physicalPct)} occupied by units` : "",
    r.economicPct != null ? `${pct1(r.economicPct)} economic` : "",
  ].filter(Boolean);
  if (occ.length) parts.push(occ.join(", "));
  if (r.inPlace && r.street && r.premiumPct != null) {
    parts.push(`in-place ${rateWords(r.inPlace)} against street ${rateWords(r.street)} (${r.premiumPct >= 0 ? "+" : "−"}${pct1(Math.abs(r.premiumPct))})`);
  } else if (r.street) {
    parts.push(`street ${rateWords(r.street)}`);
  }
  if (r.climatePct != null) parts.push(`${pct1(r.climatePct)} climate-controlled`);
  if (r.management?.thirdParty) parts.push("third-party managed");
  return `Self-storage: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function storageContextLine(r: SelfStorageRead): string {
  return `Self-storage: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The facts beside the class's own traps, for the assumption review. */
export function storageNote(r: SelfStorageRead): string {
  return [
    `SELF-STORAGE AS STATED: ${r.headline}`,
    "Check by name: the street rate against the rates the facility's own recent move-ins signed at, not the advertised rate alone; the premium sitting tenants pay over street and how many of them could leave; the economic occupancy's definition (its potential at street or at in-place rent); new supply within three miles, permitted and under construction; and the management fee, the tenant-insurance program and the pricing system a buyer on another platform would not inherit.",
  ].join(" ");
}

/** The rows a key-terms block leads with on a storage deal: the economic
 *  occupancy, the street rate and the in-place rent — only where a street
 *  rate is stated, since an apartment memorandum's "In-place rent" and
 *  "Economic occupancy" are its own rows and lead nothing. */
export function storageTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label.trim()));
  if (!pick(STREET)) return [];
  return [pick(ECONOMIC), pick(STREET), pick(IN_PLACE)].filter((m): m is M => m != null);
}
