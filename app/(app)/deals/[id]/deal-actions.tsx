"use client";

import { useEffect, useState } from "react";
import { renameDeal, deleteDeal } from "../actions";

const itemCls =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors";

export function DealActions({
  dealId,
  dealName,
}: {
  dealId: string;
  dealName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "delete">("menu");

  function close() {
    setOpen(false);
    setMode("menu");
  }

  // Escape closes the menu (standard popover behavior).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Deal actions"
        onClick={() => {
          setOpen((o) => !o);
          setMode("menu");
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-faint hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="shadow-float absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-line bg-surface p-1.5">
            {mode === "menu" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("rename")}
                  className={`${itemCls} hover:bg-faint`}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => setMode("delete")}
                  className={`${itemCls} text-kill hover:bg-kill/5`}
                >
                  Delete deal
                </button>
              </>
            )}

            {mode === "rename" && (
              <form action={renameDeal} className="space-y-2 p-1.5">
                <input type="hidden" name="dealId" value={dealId} />
                <input
                  name="name"
                  defaultValue={dealName}
                  required
                  autoFocus
                  maxLength={120}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-faint"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {mode === "delete" && (
              <div className="space-y-2.5 p-1.5">
                <p className="text-sm leading-relaxed">
                  Delete this deal permanently? Its documents and analysis are
                  removed and this can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <form action={deleteDeal}>
                    <input type="hidden" name="dealId" value={dealId} />
                    <button
                      type="submit"
                      className="rounded-lg bg-kill px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Delete
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-faint"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
