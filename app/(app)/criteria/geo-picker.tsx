"use client";

import { useState } from "react";
import { AddressAutocomplete } from "../address-autocomplete";
import type { GeoTarget } from "@/lib/criteria";
import type { StructuredAddress } from "@/lib/address";

/**
 * Geography targets as removable chips, fed by the address autocomplete.
 * Type a city, county, or metro; picking a suggestion adds a structured
 * target (city/county/state) the mandate check matches against. The chips
 * ride along as one hidden JSON field.
 */
export function GeoPicker({
  initial,
  suggestions = [],
}: {
  initial: GeoTarget[];
  /** covered markets offered as one-tap territories (server-built) */
  suggestions?: GeoTarget[];
}) {
  const [chips, setChips] = useState<GeoTarget[]>(initial);

  function addTarget(target: GeoTarget) {
    setChips((prev) =>
      prev.some((c) => c.label.toLowerCase() === target.label.toLowerCase())
        ? prev
        : [...prev, target].slice(0, 24),
    );
  }

  function add(a: StructuredAddress) {
    // A mandate territory is city/county-level — if the pick is a street
    // address, keep only its locality parts.
    const label = a.city
      ? `${a.city}${a.state ? `, ${a.state}` : ""}`
      : a.county
        ? `${a.county} County${a.state ? `, ${a.state}` : ""}`
        : a.label;
    addTarget({
      label,
      city: a.city || undefined,
      state: a.state || undefined,
      county: a.county || undefined,
    });
  }

  const unpicked = suggestions.filter(
    (s) => !chips.some((c) => c.label.toLowerCase() === s.label.toLowerCase()),
  );

  return (
    <div>
      <input type="hidden" name="geos" value={JSON.stringify(chips)} />
      {chips.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li
              key={c.label}
              className="flex items-center gap-1 rounded-full border border-line bg-faint py-1 pl-3 pr-1 text-xs font-medium"
            >
              {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={() =>
                  setChips((prev) => prev.filter((x) => x.label !== c.label))
                }
                className="flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-muted transition-colors hover:bg-line hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddressAutocomplete
        name=""
        placeholder="Add a city or county — e.g. Dallas, Tarrant County…"
        clearOnSelect
        onSelect={add}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      {unpicked.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Covered markets, one tap:</span>
          {unpicked.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => addTarget(s)}
              className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-muted outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
