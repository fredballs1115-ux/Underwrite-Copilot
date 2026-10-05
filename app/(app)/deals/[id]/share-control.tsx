"use client";

import { useEffect, useRef, useState } from "react";
import { createShareLink, revokeShareLink } from "./share-actions";
import { SHARE_LINK_DAYS } from "@/lib/link-limits";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export interface ShareRow {
  id: string;
  created_at: string;
  expires_at: string;
}

/**
 * Read-only share links for a deal: create, copy, revoke. Renders as a small
 * header button with a disclosure panel — same visual weight as the IC memo
 * button beside it.
 */
export function ShareControl({
  dealId,
  shares,
  sharesUnread = false,
  appUrl,
}: {
  dealId: string;
  shares: ShareRow[];
  /** The read of the live links failed: said, never shown as none beside
   *  "revocable here anytime" (audit C5, LOW-5). */
  sharesUnread?: boolean;
  /** absolute origin for copyable links (from the server, not window) */
  appUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes the panel and hands keyboard focus back to the Share
  // button that opened it, as the deal menu does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copy(shareId: string) {
    const url = `${appUrl}/share/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(shareId);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard can be blocked — fall back to the prompt-style select.
      window.prompt("Copy the share link:", url);
    }
  }

  // The panel opens from the button's left edge, the toolbar's first: it
  // had opened from the right one and run 206px off a phone's left edge
  // (research pass 36). On a phone the button sits in the deal header's
  // scrolling row of tools, so the panel's containing block is that row
  // (DealHero's ToolRow), outside the scroller, and it opens across it.
  return (
    <div className="sm:relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Share a read-only view of this screen — expiring link, no sign-in needed"
        className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 text-muted"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        Share
        {/* A space a screen reader reads; the flex row draws none. */}
        {shares.length > 0 && " "}
        {shares.length > 0 && (
          <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand" data-qa="share-count">
            {shares.length}
            <span className="sr-only">{` ${liveLinksWords(shares.length)}`}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-line bg-surface p-4 shadow-card max-sm:right-0 max-sm:w-auto">
          <p className="text-sm font-semibold tracking-tight">
            Share this screen
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            A read-only page — verdict, ranges, and key terms. No sign-in
            needed, expires after {SHARE_LINK_DAYS} days, revocable here anytime.
          </p>
          {/* The verdict's own words go with it, and the verdict is handed
              the buy box (research pass 39): said before a link is made. */}
          <p className="mt-1.5 text-xs leading-relaxed text-ink" data-qa="share-buybox-note">
            The link shows the call and its reasons, which can name where the
            deal misses your buy box.
          </p>

          <form action={createShareLink} className="mt-3">
            <input type="hidden" name="dealId" value={dealId} />
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Create share link
            </button>
          </form>

          {sharesUnread && (
            <p className="mt-3 border-t border-line pt-3 text-[11px] text-caution" role="status" data-qa="share-unread">
              Couldn&rsquo;t list this deal&rsquo;s live links just now, so none can be revoked here until the page is
              reloaded.
            </p>
          )}

          {!sharesUnread && shares.length > 0 && (
            // Every live link, so each can be revoked here; a long list
            // scrolls inside the panel rather than past the screen.
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] text-muted" data-qa="share-live">
                {`${shares.length} ${liveLinksWords(shares.length)}, newest first`}
              </p>
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                      /share/{s.id.slice(0, 8)}…
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      to {DATE_FMT.format(new Date(s.expires_at))}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(s.id)}
                      className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium transition-colors hover:bg-faint"
                      aria-live="polite"
                    >
                      {copied === s.id ? "Copied ✓" : "Copy"}
                    </button>
                    <form action={revokeShareLink} className="shrink-0">
                      <input type="hidden" name="dealId" value={dealId} />
                      <input type="hidden" name="shareId" value={s.id} />
                      <button
                        type="submit"
                        title="Revoke this link now"
                        className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-kill"
                      >
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "live link" / "live links" — what the Share button's count counts. */
function liveLinksWords(n: number): string {
  return n === 1 ? "live link" : "live links";
}
