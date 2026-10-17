"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

/** How long a toast stays on screen, in milliseconds; null is until it is
 *  dismissed. An error carries instructions, so it stays until the reader
 *  dismisses it; any other toast goes after 4.5 seconds — counted only
 *  while it is neither hovered nor holding focus, so a reader zoomed in, or
 *  one who has tabbed to it, never loses it mid-read (WCAG 2.2.1). */
export function toastLifetime(tone: Tone): number | null {
  return tone === "error" ? null : 4500;
}

const ToastCtx = createContext<(message: string, tone?: Tone) => void>(
  () => {},
);

/** Fire a transient toast from any client component under the provider. */
export function useToast() {
  return useContext(ToastCtx);
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Each card keeps its own time (`toastLifetime`), so it can pause.
  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, tone }]);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const TONE: Record<Tone, { accent: string; icon: ReactNode }> = {
  success: {
    accent: "border-l-pass",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-pass"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  error: {
    accent: "border-l-kill",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-kill"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  info: {
    accent: "border-l-brand",
    icon: (
      <span className="mt-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden />
    ),
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  /** stable (the provider's own), so the clock is not re-armed by a render */
  onDismiss: (id: number) => void;
}) {
  const t = TONE[toast.tone];
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // What is left of the toast's time, carried across each pause.
  const left = useRef(toastLifetime(toast.tone));
  useEffect(() => {
    const ms = left.current;
    if (ms == null || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), ms);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, ms - (Date.now() - started));
    };
  }, [paused, onDismiss, toast.id]);
  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`shadow-float animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line border-l-4 ${t.accent} bg-surface px-4 py-3`}
    >
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-ink"
      >
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
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
