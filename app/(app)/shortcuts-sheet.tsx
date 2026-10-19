"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MODAL_SELECTOR, SHORTCUTS, SHORTCUT_PLACES, opensShortcuts, type ShortcutPlace } from "@/lib/shortcuts";

/**
 * "?" anywhere in the signed-in app opens the shortcuts sheet: the keys
 * lib/shortcuts lists, by where each works. Not while typing in a field, not
 * with a modifier held, and not over another dialog (the palette, the photo
 * viewer) — the same guard every page shortcut keeps.
 */
export function useShortcutsKey(onOpen: () => void) {
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      if (!opensShortcuts(e, { modalOpen: !!document.querySelector(MODAL_SELECTOR) })) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The sheet over the whole page, wherever it is opened from: a transformed
 *  ancestor would hold a fixed layer to its own box. */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return createPortal(<ShortcutsSheetBody onClose={onClose} />, document.body);
}

const PLACES: ShortcutPlace[] = ["anywhere", "pipeline", "deal"];

const SHEET_NOTE =
  "The keys stand down while you type in a field. On a deal, [ and ] follow the pipeline's order as you last left it in this tab.";

/**
 * The sheet itself (and what the render test draws, with no page to portal
 * into): a small modal dialog. Opened, the focus moves to its Close button
 * and the page behind stops scrolling; Esc, Close or a click on the dim
 * closes it and gives the focus back to what had it, as the photo viewer
 * does. While it is open the focus stays inside.
 */
export function ShortcutsSheetBody({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      // Given back only where it is still on the page: opened from the
      // palette, the field that had it has gone with the palette.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []),
      ].filter((el) => el.tabIndex >= 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-sheet-title"
      data-shortcuts-sheet
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[10vh] print:hidden"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close the shortcuts"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="shortcuts-sheet-title" className="text-sm font-semibold tracking-tight">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-faint hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="h-4 w-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {PLACES.map((place) => (
            <section key={place} aria-labelledby={`shortcuts-${place}`}>
              <h3 id={`shortcuts-${place}`} className="text-[10px] font-medium uppercase tracking-wider text-muted">
                {SHORTCUT_PLACES[place]}
              </h3>
              <ul className="mt-1.5 space-y-1.5" data-shortcuts={place}>
                {SHORTCUTS.filter((s) => s.where === place).map((s) => (
                  <li key={s.keys.join("+")} className="flex items-center justify-between gap-4 text-sm">
                    <span>{s.does}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="min-w-6 rounded border border-line bg-faint px-1.5 py-0.5 text-center font-mono text-[11px] text-ink">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted">{SHEET_NOTE}</p>
        </div>
      </div>
    </div>
  );
}
