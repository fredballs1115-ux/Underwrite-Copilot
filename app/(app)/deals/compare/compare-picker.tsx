"use client";

import Link from "next/link";
import { useState } from "react";
import { DealAvatar } from "@/app/(app)/deal-avatar";
import { COMPARE_MAX } from "@/lib/link-limits";
import { paletteCall, type PaletteRun } from "@/lib/palette-search";
import { PIN_LABEL } from "@/lib/pipeline-map";

/** One deal the picker offers: its name, where it is, and its call. */
export interface PickableDeal {
  id: string;
  name: string;
  /** the memorandum's market words, or null where none was read */
  place: string | null;
  /** the call on file (`pass`, `caution`, `pass_on`), or null */
  call: string | null;
  /** the deal's latest run as the pipeline card reads it (lib/screen-run
   *  `listJobStatus`): a re-screen, or a stalled or failed run, outranks
   *  the call on file */
  run?: PaletteRun;
}

/**
 * A picker tile's call, the pipeline card's way: a failed or stalled run,
 * or a screen still running, is said over the call it left on file
 * (lib/palette-search `paletteCall`, the palette's and the pipeline CSV's
 * words: "Failed", "Stalled", "Re-screening", "Screening") — the picker had
 * printed "Go" beside a re-screen replacing it — and the call alone where
 * no run stands in its way.
 */
export function pickerCall(d: Pick<PickableDeal, "call" | "run">): { dot: string; word: string | null; title: string | null } {
  const { dot, word } = paletteCall(d.call, d.run);
  const was = d.call ? (PIN_LABEL[d.call] ?? null) : null;
  if (word) return { dot, word, title: was ? `${word} — the call on file is the previous screen's, ${was}` : null };
  return { dot, word: was, title: null };
}

/** The compare link for a set of deals, in the order they were picked. */
export function compareHref(ids: readonly string[]): string {
  return `/deals/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/**
 * The compare page with fewer than two deals to set side by side (signed-in
 * gaps, M5): the reader's own deals as a tray of tiles, each the building's
 * picture (`DealAvatar`, the call's dot on its corner), its name and place,
 * a checkbox a deal, up to COMPARE_MAX — the boxes left unticked are
 * disabled once that many are picked — and the link that compares them
 * once two are. It had been one sentence sending the reader back to the
 * pipeline. `initial` keeps a deal the link already named ticked.
 */
export function ComparePicker({ deals, initial = [] }: { deals: readonly PickableDeal[]; initial?: readonly string[] }) {
  const known = new Set(deals.map((d) => d.id));
  const [picked, setPicked] = useState<string[]>(() =>
    initial.filter((id) => known.has(id)).slice(0, COMPARE_MAX),
  );
  const full = picked.length >= COMPARE_MAX;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= COMPARE_MAX ? p : [...p, id]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted">
          {picked.length === 0
            ? `Pick 2–${COMPARE_MAX} deals.`
            : full
              ? `${picked.length} of ${COMPARE_MAX} picked`
              : `${picked.length} picked`}
        </p>
        {picked.length >= 2 ? (
          <Link
            href={compareHref(picked)}
            data-qa="compare-go"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Compare {picked.length} deals
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="cursor-not-allowed rounded-lg bg-faint px-4 py-2 text-sm font-medium text-muted"
          >
            Compare
          </span>
        )}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-qa="compare-picker">
        {deals.map((d) => {
          const on = picked.includes(d.id);
          const off = !on && full;
          const shown = pickerCall(d);
          const call = shown.word;
          return (
            <li key={d.id}>
              <label
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  on
                    ? "border-brand bg-brand/5"
                    : off
                      ? "cursor-not-allowed border-line bg-surface opacity-50"
                      : "cursor-pointer border-line bg-surface hover:bg-faint"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={off}
                  onChange={() => toggle(d.id)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <DealAvatar dealId={d.id} dot={shown.dot} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  {(call || d.place) && (
                    <span className="block truncate text-xs text-muted" title={shown.title ?? undefined} data-qa="picker-call">
                      {[call, d.place].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
