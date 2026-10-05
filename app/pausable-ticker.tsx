"use client";

import { useState, type ReactNode } from "react";

/**
 * A band that scrolls on its own, with a button that stops it.
 *
 * WCAG 2.2.2: anything that moves by itself for more than five seconds
 * needs a way to pause it. The track already stops under the pointer and
 * while one of its links has the keyboard's focus (app/globals.css); this
 * button is the way for everyone else — a touch screen has no hover, and a
 * reader who only wants it still has no link to focus. It comes first in
 * the tab order, before the links it stops. Under reduced motion nothing
 * moves (globals.css), so the button is not drawn at all.
 *
 * The band's own markup stays the server's: it arrives as `children`, and
 * the button stops it through `data-ticker-paused` on this wrapper.
 */
export function PausableTicker({
  what,
  className,
  children,
}: {
  /** what is moving, for the button's name: "Pause the {what}" */
  what: string;
  className?: string;
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`relative ${className ?? ""}`} data-ticker-paused={paused || undefined}>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={`${paused ? "Play" : "Pause"} the ${what}`}
        className="absolute right-3 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:hidden print:hidden"
      >
        {paused ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
            <path d="M3 1.5v9l7.5-4.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
            <rect x="2" y="1.5" width="3" height="9" rx="0.75" />
            <rect x="7" y="1.5" width="3" height="9" rx="0.75" />
          </svg>
        )}
      </button>
      {children}
    </div>
  );
}
