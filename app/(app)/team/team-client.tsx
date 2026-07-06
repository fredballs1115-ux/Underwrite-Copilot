"use client";

import { useFormStatus } from "react-dom";
import { useToast } from "../toaster";

/** Copy an invite URL to the clipboard with toast feedback. */
export function CopyLinkButton({ url }: { url: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("Invite link copied — send it to your teammate.", "success");
        } catch {
          toast("Couldn't copy — long-press or right-click the link instead.", "error");
        }
      }}
      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
    >
      Copy link
    </button>
  );
}

/** A submit button that asks for confirmation before firing its form. */
export function ConfirmSubmit({
  label,
  confirmText,
  danger = false,
}: {
  label: string;
  confirmText: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        danger
          ? "text-kill hover:bg-kill/5"
          : "border border-line hover:bg-faint"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
