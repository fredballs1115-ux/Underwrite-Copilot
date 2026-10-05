"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { replacePicture } from "../actions";
import { tooLargeMessage } from "@/lib/upload-limit";

/** The size the action refuses past — said here before the upload starts. */
const MAX_MB = 12;

/** How the control sits: on a plain bar, or on the picture itself (#433),
 *  where it wears the same dark glass as the picture's credit lines. */
export type PickTone = "plain" | "overlay";

const TONE: Record<PickTone, string> = {
  plain: "border border-line hover:bg-faint",
  overlay: "bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70 focus-on-photo",
};

function PickButton({ hasPicture, tone }: { hasPicture: boolean; tone: PickTone }) {
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
        name="picture"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Photograph file"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          if (f.size > MAX_MB * 1024 * 1024) {
            alert(tooLargeMessage(f.name, f.size, MAX_MB * 1024 * 1024, "picture"));
            e.currentTarget.value = "";
            return;
          }
          formRef.current?.requestSubmit();
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        title={
          hasPicture
            ? "Swap the photograph for one of your own — a JPEG, PNG or WebP of the building."
            : "Add a photograph of the building — a JPEG, PNG or WebP. It leads the deal's picture from then on."
        }
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TONE[tone]}`}
      >
        {pending ? (
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand" />
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
            <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        )}
        {pending ? "Uploading…" : hasPicture ? "Replace photo" : "Add photo"}
      </button>
    </>
  );
}

/** "That's not the building" or "I have a better shot": the reader's own picture, in one step. */
export function ReplacePicture({
  dealId,
  hasPicture,
  tone = "plain",
}: {
  dealId: string;
  hasPicture: boolean;
  tone?: PickTone;
}) {
  return (
    <form action={replacePicture}>
      <input type="hidden" name="dealId" value={dealId} />
      <PickButton hasPicture={hasPicture} tone={tone} />
    </form>
  );
}
