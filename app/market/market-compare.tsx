"use client";

import { useState } from "react";
import Link from "next/link";

// Compact, serializable per-metro facts the server derives from the research
// layer (metros.json) — this component only arranges them. Bars share ONE
// dollar scale across both picks so the visual comparison is honest.
export type CompareSector = {
  vLow?: number;
  vHigh?: number;
  rent?: number;
  capLow?: number;
  capHigh?: number;
};

export type CompareMetro = {
  id: string;
  name: string;
  region: string;
  fmr: Partial<Record<"0br" | "1br" | "2br" | "3br", number>> & {
    status?: string;
  };
  sectors?: Partial<Record<"office" | "industrial" | "multifamily", CompareSector>>;
  ruleCount: number;
  compsLive: boolean;
};

const SECTOR_ROWS = ["office", "industrial", "multifamily"] as const;

// One cell of the asset-type table: the vacancy read (single figure or the
// tracker spread), with rent / cap appended when the research carries them.
// A missing read renders an em dash — a gap, not a zero.
function sectorCell(s: CompareSector | undefined): string {
  if (!s || typeof s.vLow !== "number") return "—";
  const v =
    s.vHigh != null && s.vHigh !== s.vLow
      ? `${s.vLow}–${s.vHigh}%`
      : `${s.vLow}%`;
  const extras: string[] = [];
  if (typeof s.rent === "number") extras.push(`$${s.rent.toFixed(2)}/SF`);
  if (typeof s.capLow === "number" && typeof s.capHigh === "number")
    extras.push(`cap ${s.capLow}–${s.capHigh}%`);
  return extras.length > 0 ? `${v} · ${extras.join(" · ")}` : v;
}

const BEDS = ["0br", "1br", "2br", "3br"] as const;

function Ladder({ m, max }: { m: CompareMetro; max: number }) {
  const rows = BEDS.map((b) => ({ label: b.toUpperCase(), value: m.fmr[b] })).filter(
    (r): r is { label: string; value: number } => typeof r.value === "number",
  );
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        FY2026 FMR not yet confirmed for this metro — an honest gap, never an
        estimate.
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

export function MarketCompare({ metros }: { metros: CompareMetro[] }) {
  const [aId, setAId] = useState(metros.find((m) => m.id === "philadelphia")?.id ?? metros[0]?.id ?? "");
  const [bId, setBId] = useState(metros.find((m) => m.id === "dc")?.id ?? metros[1]?.id ?? "");
  const a = metros.find((m) => m.id === aId);
  const b = metros.find((m) => m.id === bId);
  if (!a || !b) return null;

  // One shared scale — the tallest bar across BOTH metros is 100%.
  const max = Math.max(
    1,
    ...[a, b].flatMap((m) => BEDS.map((k) => m.fmr[k] ?? 0)),
  );
  const spread =
    typeof a.fmr["2br"] === "number" && typeof b.fmr["2br"] === "number"
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
              FY2026 fair market rent
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
            <Ladder m={m} max={max} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>
                <span className="font-semibold text-ink">{m.ruleCount}</span>{" "}
                rule{m.ruleCount === 1 ? "" : "s"} on file
              </span>
              <span>
                comps feed:{" "}
                <span className={m.compsLive ? "font-medium text-emerald-600" : ""}>
                  {m.compsLive ? "live" : "documented, not wired"}
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
            Asset-type read · vacancy, asking rent, cap where sourced
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
                    >
                      {sectorCell(m.sectors?.[sec])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-muted">
            Ranges are tracker spreads, shown rather than averaged; an em dash
            is a recorded gap. Sources and bases in each metro brief.
          </p>
        </div>
      )}
      {spread !== null && (
        <p className="mt-3 text-[12px] text-muted">
          2BR spread:{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">
            {spread >= 0 ? "+" : "−"}${Math.abs(spread).toLocaleString()}/mo
          </span>{" "}
          ({a.name} vs {b.name}) — HUD FY2026 figures from the same research
          layer, statuses as chipped.
        </p>
      )}
    </section>
  );
}
