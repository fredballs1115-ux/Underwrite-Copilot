// Every asset class's research file, loadable by id — the market page's
// sector explorer renders these directly. (Universal: JSON imports only.)
//
// Policy note: sfr_btr appears HERE as an asset-class page (the user asked
// for every asset type), while staying excluded from multifamily sales
// AGGREGATES — an SFR overview is not an SFR row leaking into 2-4 unit math.

import multifamily from "@/data/research/multifamily.json";
import sfr from "@/data/research/sfr_btr.json";
import office from "@/data/research/office.json";
import industrial from "@/data/research/industrial.json";
import retail from "@/data/research/retail.json";
import hospitality from "@/data/research/hospitality_str.json";
import storage from "@/data/research/self_storage.json";
import dataCenters from "@/data/research/data_centers.json";
import senior from "@/data/research/senior_housing.json";
import student from "@/data/research/student_housing.json";
import lifeScience from "@/data/research/life_science.json";
import mhc from "@/data/research/manufactured_housing.json";
import land from "@/data/research/land_infill.json";
import specialty from "@/data/research/specialty.json";

export interface SectorDocRange {
  tier?: string;
  low?: number | null;
  high?: number | null;
  status?: string;
  sources?: string[];
  note?: string;
}

export interface SectorDoc {
  sector: string;
  as_of?: string;
  cycle_position?: { summary?: string; status?: string; sources?: string[] };
  cap_rate_ranges?: SectorDocRange[];
  supply_demand?: unknown;
  debt_terms?: unknown;
  small_investor_verdict?: {
    accessible?: boolean;
    entry_vehicle?: string;
    reasoning?: string;
  };
  gaps?: string[];
}

export const SECTORS: { id: string; label: string; doc: SectorDoc }[] = [
  { id: "multifamily", label: "Multifamily", doc: multifamily as SectorDoc },
  { id: "industrial", label: "Industrial / IOS", doc: industrial as SectorDoc },
  { id: "self_storage", label: "Self-storage", doc: storage as SectorDoc },
  { id: "manufactured_housing", label: "Manufactured housing", doc: mhc as SectorDoc },
  { id: "retail", label: "Retail / NNN", doc: retail as SectorDoc },
  { id: "sfr_btr", label: "SFR / BTR", doc: sfr as SectorDoc },
  { id: "land_infill", label: "Land / infill", doc: land as SectorDoc },
  { id: "student_housing", label: "Student housing", doc: student as SectorDoc },
  { id: "office", label: "Office / medical", doc: office as SectorDoc },
  { id: "hospitality_str", label: "Hospitality / STR", doc: hospitality as SectorDoc },
  { id: "senior_housing", label: "Senior housing", doc: senior as SectorDoc },
  { id: "data_centers", label: "Data centers", doc: dataCenters as SectorDoc },
  { id: "life_science", label: "Life science", doc: lifeScience as SectorDoc },
  { id: "specialty", label: "Specialty", doc: specialty as SectorDoc },
];

/** Pull the one-line "value" out of the loose supply_demand / debt_terms
 *  shapes (they vary per file: sometimes {value, status}, sometimes richer). */
export function looseValue(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const val = (v as { value?: unknown }).value;
  return typeof val === "string" ? val : null;
}
