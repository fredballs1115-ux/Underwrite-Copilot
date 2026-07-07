"use client";

import { useEffect, useId, useRef, useState } from "react";
import { abbrevState, type StructuredAddress } from "@/lib/address";

/**
 * Live address suggestions via the Photon geocoder (photon.komoot.io) —
 * free, keyless, and explicitly built for search-as-you-type, unlike the
 * US Census geocoder (no suggest endpoint) or Mapbox (needs an account
 * token). Selecting a suggestion fills every structured field we collect
 * (street, city, state, zip, county, submarket when inferable) into a
 * hidden JSON input; if the service is unreachable the field degrades to
 * plain text and the raw string still submits.
 */

const PHOTON = "https://photon.komoot.io/api/";
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

type PhotonFeature = {
  properties: {
    countrycode?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    county?: string;
    district?: string;
    suburb?: string;
    neighbourhood?: string;
  };
};

function toStructured(f: PhotonFeature): StructuredAddress | null {
  const p = f.properties;
  if ((p.countrycode ?? "").toUpperCase() !== "US") return null;
  const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
  const city = p.city ?? p.town ?? p.village ?? "";
  const state = abbrevState(p.state ?? "");
  const label = [street, city, [state, p.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (!label) return null;
  return {
    label,
    street,
    city,
    state,
    zip: p.postcode ?? "",
    county: p.county ?? "",
    submarket: p.district ?? p.suburb ?? p.neighbourhood ?? "",
  };
}

export function AddressAutocomplete({
  name,
  textName,
  defaultValue = null,
  placeholder = "Start typing an address…",
  className = "",
  onSelect,
  clearOnSelect = false,
}: {
  /** hidden input carrying the structured JSON (only set after a pick) */
  name: string;
  /** visible input's own name, so the raw text also submits as a fallback */
  textName?: string;
  defaultValue?: StructuredAddress | null;
  placeholder?: string;
  className?: string;
  /** chip-picker mode: get the pick via callback instead of/in addition to the form */
  onSelect?: (a: StructuredAddress) => void;
  clearOnSelect?: boolean;
}) {
  const [text, setText] = useState(defaultValue?.label ?? "");
  const [picked, setPicked] = useState<StructuredAddress | null>(defaultValue);
  const [options, setOptions] = useState<StructuredAddress[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const idBase = useId();

  // Debounced lookup; every keystroke cancels the previous request.
  function lookup(q: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < MIN_CHARS) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=en`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { features?: PhotonFeature[] };
        const opts = (data.features ?? [])
          .map(toStructured)
          .filter((a): a is StructuredAddress => a !== null)
          // de-dupe identical labels (Photon returns near-duplicates)
          .filter((a, i, arr) => arr.findIndex((x) => x.label === a.label) === i)
          .slice(0, 5);
        setOptions(opts);
        setOpen(opts.length > 0);
        setActive(0);
      } catch {
        // Unreachable/blocked geocoder — stay a plain text field.
        setOptions([]);
        setOpen(false);
      }
    }, DEBOUNCE_MS);
  }

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function choose(a: StructuredAddress) {
    setPicked(a);
    setText(clearOnSelect ? "" : a.label);
    setOptions([]);
    setOpen(false);
    onSelect?.(a);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((v) => Math.min(v + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[active];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        name={textName}
        value={text}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${idBase}-list`}
        aria-activedescendant={
          open && options.length ? `${idBase}-${active}` : undefined
        }
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          // Hand-edited text is no longer the picked address.
          setPicked(null);
          lookup(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {/* The structured pick, for the server action. Empty until a pick. */}
      <input
        type="hidden"
        name={name}
        value={picked ? JSON.stringify(picked) : ""}
      />
      {open && (
        <ul
          id={`${idBase}-list`}
          role="listbox"
          aria-label="Address suggestions"
          className="shadow-float absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1"
        >
          {options.map((o, i) => (
            <li
              key={o.label}
              id={`${idBase}-${i}`}
              role="option"
              aria-selected={i === active}
            >
              <button
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(o)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  i === active ? "bg-brand/10" : ""
                }`}
              >
                <span className="block truncate">{o.label}</span>
                {(o.county || o.submarket) && (
                  <span className="block truncate text-xs text-muted">
                    {[o.submarket, o.county && `${o.county} County`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
