"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FigureHow, HeroFigure } from "@/lib/hero-figure";

/**
 * "How this is read" for the deal header's figures and its fit chip: the
 * label (or the chip) is a button that opens a small popover saying where
 * the figure comes from — the memorandum's row and its validated page, the
 * first read, or what it is derived from — with this deal's own inputs
 * (lib/hero-how, which quotes the header's own readers and computes
 * nothing). A tap, a click, Enter or Space opens it; Escape, a click
 * outside or focus leaving closes it, and Escape puts the focus back on the
 * button. The ring is the site's own :focus-visible rule.
 *
 * Plain strings in, so this client module loads no reader.
 */

/** The popover's words: the source, then the inputs, then the notes. */
function HowBody({ how }: { how: FigureHow }) {
  return (
    <>
      <p className="font-medium text-ink">{how.source}</p>
      {how.inputs?.length ? (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          {how.inputs.map((i) => (
            <div key={i.label} className="contents">
              <dt className="text-muted">{i.label}</dt>
              <dd className="[overflow-wrap:anywhere]">{i.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {how.notes?.map((n) => (
        <p key={n} className="mt-1.5 text-muted">
          {n}
        </p>
      ))}
    </>
  );
}

const PANEL = "z-30 rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-snug tracking-normal whitespace-normal font-sans normal-nums text-ink shadow-md";

/** Open state shared by a tile and a chip: closes on Escape (focus back to
 *  the button), on a press outside `root` and on focus leaving it. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };
  const blur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && root.current?.contains(next)) return;
    // A press on the panel's own words moves focus nowhere; the pointer
    // handler above decides that case.
    if (next) setOpen(false);
  };
  // Handed out as a callback ref, so a caller never writes to the hook's
  // own ref object (the compiler's immutability rule).
  const setRoot = useCallback((el: HTMLElement | null) => {
    root.current = el;
  }, []);
  return { open, setOpen, setRoot, button, keys, blur };
}

function Glyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
    </svg>
  );
}

/**
 * One of the header's figure tiles. With a `how`, its label is the button
 * and the popover opens under the tiles, the grid's whole width: the tiles
 * sit in a clipped, rounded grid, so the panel's box is the grid's wrapper
 * (`relative`), which the clip does not reach.
 */
export function HeroFigureTile({ figure: f, reading }: { figure: HeroFigure; reading: boolean }) {
  const id = useId();
  const { open, setOpen, setRoot, button, keys, blur } = usePopover();
  const value =
    f.value ??
    (reading ? (
      // Not read yet, rather than not stated: a quiet shimmer (still under
      // prefers-reduced-motion — the .skeleton sweep only runs where motion
      // is welcome). A picture with a name, not a live region: four figures
      // announcing themselves at once is noise.
      <span
        role="img"
        aria-label="Reading the memorandum"
        data-qa="figure-reading"
        className="skeleton inline-block h-[1.1em] w-20 max-w-full rounded align-middle"
      />
    ) : (
      "—"
    ));
  const ddClass = `mt-0.5 text-base font-semibold @xs/facts:text-lg ${f.figure ? "whitespace-nowrap font-mono tabular-nums" : "break-words"}`;
  if (!f.how) {
    return (
      <div className="flex min-w-0 flex-col justify-between bg-surface px-3.5 py-2.5">
        <dt className="line-clamp-2 text-[11px] uppercase tracking-wide text-muted">{f.label}</dt>
        <dd className={ddClass} title={f.title}>
          {value}
        </dd>
      </div>
    );
  }
  return (
    <div
      ref={setRoot}
      onKeyDown={keys}
      onBlur={blur}
      className="flex min-w-0 flex-col justify-between bg-surface px-3.5 py-2.5"
    >
      <dt className="line-clamp-2 text-[11px] uppercase tracking-wide text-muted">
        <button
          ref={button}
          type="button"
          data-qa="figure-how"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`How this is read: ${f.label}`}
          onClick={() => setOpen((o) => !o)}
          className="inline cursor-help rounded-sm text-left uppercase tracking-wide underline decoration-dotted decoration-1 underline-offset-2 hover:text-ink"
        >
          {f.label}
          <span className="ml-1 inline-flex align-[-1px]">
            <Glyph />
          </span>
        </button>
      </dt>
      <dd className={ddClass} title={f.title}>
        {value}
        <div id={id} data-qa="figure-how-panel" hidden={!open} tabIndex={-1} className={`absolute inset-x-0 top-full mt-1.5 ${PANEL}`}>
          <HowBody how={f.how} />
        </div>
      </dd>
    </div>
  );
}

/**
 * The fit chip as a button that opens its "how this is read": the chip
 * itself, unchanged, inside it; the popover under it, moved left as far as
 * it must to stay on a phone's screen.
 */
export function HowChip({ how, label, children }: { how: FigureHow; label: string; children: ReactNode }) {
  const id = useId();
  const { open, setOpen, setRoot, button, keys, blur } = usePopover();
  const panel = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    // Measured where it opens (the click set the shift back to 0): past the
    // screen's right gutter, it moves left by the overflow, never past the
    // left gutter.
    const box = panel.current.getBoundingClientRect();
    const over = box.right - (document.documentElement.clientWidth - 16);
    setShift(over > 0 ? -Math.max(0, Math.min(over, box.left - 16)) : 0);
  }, [open]);
  return (
    <span
      ref={setRoot}
      onKeyDown={keys}
      onBlur={blur}
      className="relative inline-flex"
    >
      <button
        ref={button}
        type="button"
        data-qa="fit-how"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`How this is read: ${label}`}
        onClick={() => {
          setShift(0);
          setOpen((o) => !o);
        }}
        className="inline-flex cursor-help rounded-full"
      >
        {children}
      </button>
      <div
        id={id}
        ref={panel}
        data-qa="fit-how-panel"
        hidden={!open}
        tabIndex={-1}
        style={shift ? { left: shift } : undefined}
        className={`absolute left-0 top-full mt-1.5 w-80 max-w-[calc(100vw-2rem)] ${PANEL}`}
      >
        <HowBody how={how} />
      </div>
    </span>
  );
}
