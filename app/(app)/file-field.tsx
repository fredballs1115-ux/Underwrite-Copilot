"use client";

import { useRef, useState } from "react";
import { UPLOAD_MAX_BYTES, tooLargeMessage } from "@/lib/upload-limit";

/**
 * A styled stand-in for a bare `<input type="file">` inside compact forms:
 * button trigger + chosen-file readout, identical form semantics (the named
 * input still submits with the form). Rejects files over the 32 MB action
 * cap before submit — past it the request dies as a raw 500.
 */
export function FileField({
  name,
  accept,
  buttonLabel = "Choose file",
}: {
  name: string;
  accept?: string;
  buttonLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        required
        aria-label={buttonLabel}
        className="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          if (f && f.size > UPLOAD_MAX_BYTES) {
            alert(tooLargeMessage(f.name, f.size, UPLOAD_MAX_BYTES));
            e.currentTarget.value = "";
            setFileName(null);
            return;
          }
          setFileName(f?.name ?? null);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-lg border border-line bg-faint px-3 py-1.5 text-xs font-medium transition-colors hover:bg-line"
      >
        {buttonLabel}
      </button>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${fileName ? "" : "text-muted"}`}
      >
        {fileName ?? "No file chosen"}
      </span>
    </div>
  );
}
