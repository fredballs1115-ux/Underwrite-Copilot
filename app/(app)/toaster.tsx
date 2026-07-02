"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

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

  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
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

function ToastCard({ toast }: { toast: Toast }) {
  const t = TONE[toast.tone];
  return (
    <div
      role="status"
      className={`shadow-float animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line border-l-4 ${t.accent} bg-surface px-4 py-3`}
    >
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <p className="text-sm leading-relaxed">{toast.message}</p>
    </div>
  );
}
