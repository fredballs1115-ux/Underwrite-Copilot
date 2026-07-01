"use client";

import { useRef, useState } from "react";

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  function take(files: FileList | null) {
    if (inputRef.current && files && files.length) {
      inputRef.current.files = files;
      setFileName(files[0].name);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
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
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
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
      {fileName ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="max-w-[16rem] truncate">{fileName}</span>
          <button
            type="button"
            onClick={clear}
            className="rounded p-0.5 text-muted transition-colors hover:text-kill"
            aria-label="Remove file"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">
            Drag &amp; drop, or{" "}
            <span className="text-brand">browse</span>
          </p>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}
