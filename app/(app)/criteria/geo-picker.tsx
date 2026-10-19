"use client";

import { useState } from "react";
import { AddressAutocomplete } from "../address-autocomplete";
import { GalleryCreditPartsText } from "@/app/credit-parts";
import type { GeoTarget } from "@/lib/criteria";
import type { StructuredAddress } from "@/lib/address";
import type { ChipPicture } from "@/lib/geo-chip-pictures";

/** A covered market's thumbnail on its chip: its photograph, cropped to a
 *  disc, named by the chip's own words beside it. */
function ChipThumb({ picture }: { picture: ChipPicture | undefined }) {
  if (!picture) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- the skyline
       route serves the file; a disc this size needs no optimizer */
    <img
      src={picture.src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      width={20}
      height={20}
      data-picture="geo-chip"
      className="h-5 w-5 shrink-0 rounded-full bg-faint object-cover"
    />
  );
}

/**
 * Geography targets as removable chips, fed by the address autocomplete.
 * Type a city, county, or metro; picking a suggestion adds a structured
 * target (city/county/state) the mandate check matches against. The chips
 * ride along as one hidden JSON field. A covered market's chip wears its
 * market's photograph (lib/geo-chip-pictures, handed in as plain data), and
 * one line under the chips credits every photograph they show.
 */
export function GeoPicker({
  initial,
  suggestions = [],
  pictures = {},
}: {
  initial: GeoTarget[];
  /** covered markets offered as one-tap territories (server-built) */
  suggestions?: GeoTarget[];
  /** each covered market's photograph, by its chip's label (server-built) */
  pictures?: Record<string, ChipPicture>;
}) {
  const [chips, setChips] = useState<GeoTarget[]>(initial);
  const pictureOf = (label: string): ChipPicture | undefined => (Object.hasOwn(pictures, label) ? pictures[label] : undefined);

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
  // Every photograph on screen, for the one credit line (which names each
  // photographer and photograph once).
  const shown = [...chips.map((c) => c.label), ...unpicked.map((s) => s.label)]
    .map(pictureOf)
    .filter((p): p is ChipPicture => !!p)
    .map((p) => p.credit);

  return (
    <div>
      <input type="hidden" name="geos" value={JSON.stringify(chips)} />
      {chips.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li
              key={c.label}
              className={`flex items-center gap-1.5 rounded-full border border-line bg-faint py-1 pr-1 text-xs font-medium ${pictureOf(c.label) ? "pl-1" : "pl-3"}`}
            >
              <ChipThumb picture={pictureOf(c.label)} />
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
              data-qa="geo-suggestion"
              className={`flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-2.5 text-[11px] font-medium text-muted outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40 ${pictureOf(s.label) ? "pl-0.5" : "pl-2.5"}`}
            >
              <ChipThumb picture={pictureOf(s.label)} />+ {s.label}
            </button>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-muted" data-qa="geo-credit">
          <GalleryCreditPartsText credits={shown} />
        </p>
      )}
    </div>
  );
}
