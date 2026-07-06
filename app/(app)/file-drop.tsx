"use client";

import { useRef, useState } from "react";

/** Does this file satisfy the accept string (".pdf,.csv" / "application/pdf")? */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const parts = accept.split(",").map((p) => p.trim().toLowerCase());
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return parts.some((p) => {
    if (p.startsWith(".")) return name.endsWith(p);
    if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
    return type === p;
  });
}

/**
 * A drag-and-drop file field that still submits through a normal form: it holds
 * a hidden <input type="file"> and sets its files on drop or browse, so the
 * server action receives the file exactly as before.
 */
export function FileDrop({
  name,
  accept,
  hint,
}: {
  name: string;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child the cursor crosses — count the
  // nesting depth so the highlight doesn't flicker mid-drag.
  const dragDepth = useRef(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  function take(files: FileList | null) {
    if (!inputRef.current || !files || !files.length) return;
    const file = files[0];
    if (!matchesAccept(file, accept)) {
      setTypeError(
        `"${file.name}" isn't a supported file type${hint ? ` — ${hint.toLowerCase()}` : "."}`,
      );
      return;
    }
    setTypeError(null);
    inputRef.current.files = files;
    setFileName(file.name);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setTypeError(null);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={
          fileName
            ? `Replace file — ${fileName} selected`
            : `Upload file — drag and drop, or browse${hint ? ` (${hint})` : ""}`
        }
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDrag(false);
          take(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 ${
          drag
            ? "border-brand bg-brand/5"
            : "border-line hover:border-brand/50 hover:bg-faint"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept}
          className="hidden"
          onChange={(e) => {
            setTypeError(null);
            setFileName(e.target.files?.[0]?.name ?? null);
          }}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 ${drag ? "text-brand" : "text-muted"}`}
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        <p className="text-sm font-medium">
          Drag &amp; drop, or <span className="text-brand">browse</span>
        </p>
        {hint && !fileName && <p className="text-xs text-muted">{hint}</p>}
      </div>

      {/* Selected file lives outside the drop zone so its remove button isn't
          an interactive control nested inside another one. */}
      {fileName && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-faint px-3 py-2 text-sm font-medium">
          <span className="min-w-0 flex-1 truncate">{fileName}</span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-kill"
            aria-label={`Remove ${fileName}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </p>
      )}

      {typeError && (
        <p className="mt-2 text-xs text-kill" role="alert">
          {typeError}
        </p>
      )}
    </div>
  );
}
