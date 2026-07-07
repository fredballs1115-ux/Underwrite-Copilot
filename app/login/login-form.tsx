"use client";

import { useActionState, useState } from "react";
import {
  authenticate,
  requestPasswordReset,
  type AuthState,
} from "./actions";

const initialState: AuthState = null;

function ButtonSpinner() {
  return (
    <span
      role="status"
      aria-label="Submitting"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

const inputCls =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

type Mode = "signin" | "signup" | "reset";

export function LoginForm({
  initialMode = "signin",
  next = null,
}: {
  initialMode?: Mode;
  next?: string | null;
}) {
  // Explicit mode: password managers get the right autocomplete for signup,
  // and there's exactly one primary action on screen at a time. Marketing
  // CTAs deep-link to /login?mode=signup so "Get started" lands on signup.
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showPw, setShowPw] = useState(false);
  const [state, formAction, pending] = useActionState(
    authenticate,
    initialState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  const active = mode === "reset" ? resetState : state;

  return (
    <div className="mt-6">
      {/* Mode toggle */}
      {mode !== "reset" && (
        <div
          role="tablist"
          aria-label="Sign in or create account"
          className="flex rounded-lg border border-line bg-faint p-0.5"
        >
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === key
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "reset" ? (
        <form action={resetAction} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputCls}
            />
          </div>
          {active?.error && (
            <p className="text-sm text-kill" role="alert">
              {active.error}
            </p>
          )}
          {active?.notice && (
            <p
              className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass"
              role="status"
            >
              {active.notice}
            </p>
          )}
          <button
            type="submit"
            disabled={resetPending}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetPending && <ButtonSpinner />}
            Email me a reset link
          </button>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            ← Back to sign in
          </button>
        </form>
      ) : (
        <form action={formAction} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="intent" value={mode} />
          {next && <input type="hidden" name="next" value={next} />}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                className={`${inputCls} w-full pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-ink"
              >
                {showPw ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {active?.error && (
            <p className="text-sm text-kill" role="alert">
              {active.error}
            </p>
          )}
          {active?.notice && (
            <p
              className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass"
              role="status"
            >
              {active.notice}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <ButtonSpinner />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {mode === "signup" && (
            <p className="text-center text-xs leading-relaxed text-muted">
              By creating an account you agree to our{" "}
              <a
                href="/terms"
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>
          )}
        </form>
      )}
    </div>
  );
}
