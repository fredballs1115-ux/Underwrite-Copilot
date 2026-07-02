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
}: {
  initialMode?: Mode;
}) {
  // Explicit mode: password managers get the right autocomplete for signup,
  // and there's exactly one primary action on screen at a time. Marketing
  // CTAs deep-link to /login?mode=signup so "Get started" lands on signup.
  const [mode, setMode] = useState<Mode>(initialMode);
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
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
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
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <ButtonSpinner />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
