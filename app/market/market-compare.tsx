"use client";

import { useState } from "react";
import Link from "next/link";
import { FMR_BEDS, fmrLabel, fmrWhen, type FmrBed } from "@/lib/fmr";

// Compact, serializable per-metro facts the server derives from the research
// layer (metros.json) — this component only arranges them. Bars share ONE
// dollar scale across both picks so the visual comparison is honest.
export type CompareSector = {
  vLow?: number;
  vHigh?: number;
  /** the asking rent a foot as the research states it, written — "$13.27",
   *  or a band as a band ("$10–15"), never a midpoint */
  rent?: string;
  capLow?: number;
  capHigh?: number;
  /** the cell's figures' own house, area and period (lib/tracker-read), for
   *  its title — never the day the research was read */
  cite?: string;
  /** each figure's own period, printed beside it ("Q2 2026", "undated") —
   *  the card had shown only the day the research was read, each figure's
   *  period in a hover title (the research pass of 2026-10-01) */
  vPeriod?: string;
  rentPeriod?: string;
  capPeriod?: string;
  /** the area a figure several markets share is for ("Suburban Maryland"),
   *  said beside it, so a county's cell never passes it off as the county's */
  shared?: string;
};

export type CompareMetro = {
  id: string;
  name: string;
  region: string;
  /** HUD's fair market rent through lib/fmr's reader: each bedroom it
   *  states, the fiscal year its block names and its status */
  fmr: Partial<Record<FmrBed, number>> & {
    fy?: number;
    status?: string;
  };
  sectors?: Partial<
    Record<"office" | "industrial" | "multifamily" | "retail", CompareSector>
  >;
  ruleCount: number;
  /** the recorded-sales feed: running, a source named but not wired, or none */
  compsFeed: "live" | "documented" | "none";
  /** the day the research sweep read the snapshot, said ("Aug 25, 2026") —
   *  never the figures' own date, which each cell's title states; null where
   *  the file states none */
  researchReadOn?: string | null;
};

const SECTOR_ROWS = ["office", "industrial", "multifamily", "retail"] as const;

// One cell of the asset-type table: the vacancy read (single figure or the
// tracker spread), with rent / cap appended when the research carries them.
// A missing read renders an em dash — a gap, not a zero.
function sectorCell(s: CompareSector | undefined): string {
  if (!s || typeof s.vLow !== "number") return "—";
  const v =
    s.vHigh != null && s.vHigh !== s.vLow
      ? `${s.vLow}–${s.vHigh}%`
      : `${s.vLow}%`;
  // Each figure with its own period beside it — once for the cell where the
  // figures share one — and the shared area where the figure is several
  // markets' own.
  const parts: { text: string; period: string }[] = [{ text: v, period: s.vPeriod ?? "undated" }];
  if (s.rent) parts.push({ text: `${s.rent}/SF`, period: s.rentPeriod ?? "undated" });
  if (typeof s.capLow === "number" && typeof s.capHigh === "number")
    parts.push({ text: `cap ${s.capLow}–${s.capHigh}%`, period: s.capPeriod ?? "undated" });
  const said = (period: string) => [s.shared, period].filter(Boolean).join(", ");
  const periods = new Set(parts.map((p) => p.period));
  return periods.size === 1
    ? `${parts.map((p) => p.text).join(" · ")} (${said(parts[0].period)})`
    : parts.map((p) => `${p.text} (${said(p.period)})`).join(" · ");
}

/** The days the research was read for the two metros, said once where they
 *  agree — the day read, never the figures' own period, which is each
 *  house's print's and rides in each cell's title. */
function researchDates(a: CompareMetro, b: CompareMetro): string {
  const da = a.researchReadOn ?? null;
  const db = b.researchReadOn ?? null;
  if (da && db && da !== db) return `research read ${da} (${a.name}) and ${db} (${b.name})`;
  const d = da ?? db;
  return d ? `research read ${d}` : "research undated";
}

/** "FY… fair market rent" with the year the block states; no year typed —
 *  and, past the year's last day, that it ended (lib/fmr `fmrWhen`). */
function fmrHeading(m: CompareMetro, today?: string): string {
  if (typeof m.fmr.fy !== "number") return "Fair market rent";
  const when = today ? fmrWhen({ fy: m.fmr.fy, effective: null }, today) : null;
  return `${fmrLabel(m.fmr.fy)} fair market rent${when?.ended ? `, ${when.text}` : ""}`;
}

function Ladder({ m, max, today }: { m: CompareMetro; max: number; today?: string }) {
  const rows = FMR_BEDS.map((b) => ({ label: b.toUpperCase(), value: m.fmr[b] })).filter(
    (r): r is { label: string; value: number } => typeof r.value === "number",
  );
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {`${fmrHeading(m, today)} not yet confirmed for this metro — an honest gap, never an estimate.`}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[10px] font-medium text-muted">
            {r.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                r.label === "2BR" ? "bg-brand" : "bg-brand/40"
              }`}
              style={{ width: `${Math.max(6, Math.round((r.value / max) * 100))}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
            ${r.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function Picker({
  metros,
  value,
  onChange,
  label,
}: {
  metros: CompareMetro[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <label className="block text-[11px] font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        {metros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MarketCompare({ metros, today }: { metros: CompareMetro[]; today?: string }) {
  const [aId, setAId] = useState(metros.find((m) => m.id === "philadelphia")?.id ?? metros[0]?.id ?? "");
  const [bId, setBId] = useState(metros.find((m) => m.id === "dc")?.id ?? metros[1]?.id ?? "");
  const a = metros.find((m) => m.id === aId);
  const b = metros.find((m) => m.id === bId);
  if (!a || !b) return null;

  // One shared scale — the tallest bar across BOTH metros is 100%.
  const max = Math.max(
    1,
    ...[a, b].flatMap((m) => FMR_BEDS.map((k) => m.fmr[k] ?? 0)),
  );
  // Two figures of one fiscal year only: a spread across two years is the
  // year's change as much as the markets'.
  const spread =
    typeof a.fmr["2br"] === "number" && typeof b.fmr["2br"] === "number" && a.fmr.fy === b.fmr.fy
      ? a.fmr["2br"] - b.fmr["2br"]
      : null;

  return (
    <section className="shadow-card mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Compare two markets
        </h2>
        <span className="text-[11px] text-muted">
          same research layer, one shared dollar scale
        </span>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(
          [
            [a, setAId, "Market A"],
            [b, setBId, "Market B"],
          ] as const
        ).map(([m, set, label]) => (
          <div key={label} className="rounded-xl border border-line bg-paper p-4">
            <Picker metros={metros} value={m.id} onChange={set} label={label} />
            <p className="mt-2 text-[10px] uppercase tracking-wide text-muted">
              {fmrHeading(m, today)}
              {m.fmr.status && (
                <span
                  className={`ml-1.5 rounded px-1.5 py-px text-[9px] font-medium normal-case tracking-normal ${
                    m.fmr.status === "verified"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  {m.fmr.status}
                </span>
              )}
            </p>
            <Ladder m={m} max={max} today={today} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>
                <span className="font-semibold text-ink">{m.ruleCount}</span>{" "}
                rule{m.ruleCount === 1 ? "" : "s"} on file
              </span>
              <span>
                comps feed:{" "}
                <span className={m.compsFeed === "live" ? "font-medium text-emerald-600" : ""}>
                  {m.compsFeed === "live" ? "live" : m.compsFeed === "documented" ? "documented, not wired" : "none yet"}
                </span>
              </span>
            </div>
            <Link
              href={`/market?metro=${m.id}`}
              className="mt-2 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
            >
              Open the {m.name} brief →
            </Link>
          </div>
        ))}
      </div>
      {(a.sectors || b.sectors) && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            {`Asset-type read · vacancy, asking rent, cap where sourced, each with its own period · ${researchDates(a, b)}`}
          </p>
          <table className="mt-1.5 w-full min-w-[28rem] text-left text-[11px]">
            <thead>
              <tr className="text-muted">
                <th className="w-24 py-1 pr-2 font-medium">Sector</th>
                <th className="py-1 pr-2 font-medium">{a.name}</th>
                <th className="py-1 font-medium">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {SECTOR_ROWS.map((sec) => (
                <tr key={sec} className="border-t border-line/60">
                  <td className="py-1.5 pr-2 font-medium capitalize text-ink">
                    {sec}
                  </td>
                  {[a, b].map((m) => (
                    <td
                      key={m.id}
                      className="py-1.5 pr-2 font-mono tabular-nums text-muted"
                      title={m.sectors?.[sec]?.cite}
                    >
                      {sectorCell(m.sectors?.[sec])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-muted">
            Tracker spreads shown as ranges; a dash is a recorded gap.
          </p>
        </div>
      )}
      {spread !== null && (
        <p className="mt-3 text-[12px] text-muted">
          2BR spread:{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {spread >= 0 ? "+" : "−"}${Math.abs(spread).toLocaleString()}/mo
          </span>{" "}
          ({a.name} vs {b.name}).
        </p>
      )}
    </section>
  );
}
