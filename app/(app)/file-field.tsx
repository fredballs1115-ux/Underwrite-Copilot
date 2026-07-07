"use client";

import { useRef, useState } from "react";

/**
 * A styled stand-in for a bare `<input type="file">` inside compact forms:
 * button trigger + chosen-file readout, identical form semantics (the named
 * input still submits with the form). Rejects files over the 22 MB action
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
        className="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          if (f && f.size > 22 * 1024 * 1024) {
            alert(
              `"${f.name}" is ${(f.size / 1048576).toFixed(0)} MB — the limit is 22 MB. Try compressing or splitting it.`,
            );
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
