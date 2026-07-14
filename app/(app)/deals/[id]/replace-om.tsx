"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { replaceOm } from "../actions";

function PickButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <>
      <input
        ref={(el) => {
          inputRef.current = el;
          formRef.current = el?.form ?? null;
        }}
        type="file"
        name="om"
        accept="application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          if (f.size > 32 * 1024 * 1024) {
            // Past 32 MB the request would blow the server-action body cap
            // and die as a raw 500 — reject before the confirm dialog.
            alert(`"${f.name}" is ${(f.size / 1048576).toFixed(0)} MB — the limit is 32 MB. Try compressing or splitting it.`);
            e.currentTarget.value = "";
            return;
          }
          const ok = window.confirm(
            `Replace the stored OM with "${f.name}" and re-screen?\n\nThe full analysis runs again on the new document, and the deal page will show exactly what moved since this screen.`,
          );
          if (ok) formRef.current?.requestSubmit();
          else e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
        title="Upload a reissued OM (price cut, updated deck) and re-run the screen — the deal page will show what moved."
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        )}
        {pending ? "Uploading…" : "Replace OM"}
      </button>
    </>
  );
}

/** "The broker sent a new deck" — swap the OM and re-screen in one step. */
export function ReplaceOm({
  dealId,
  disabled,
}: {
  dealId: string;
  disabled: boolean;
}) {
  return (
    <form action={replaceOm}>
      <input type="hidden" name="dealId" value={dealId} />
      <PickButton disabled={disabled} />
    </form>
  );
}
