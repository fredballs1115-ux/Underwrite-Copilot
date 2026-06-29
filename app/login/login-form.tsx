"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";

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

export function LoginForm() {
  // useActionState (React 19) gives us the action's returned error and a
  // `pending` flag while the server processes the submission.
  const [state, formAction, pending] = useActionState(
    authenticate,
    initialState,
  );
  // Track which button was pressed so only that one shows the spinner.
  const [intent, setIntent] = useState<string | null>(null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
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
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-kill" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex gap-3">
        <button
          type="submit"
          name="intent"
          value="signin"
          onClick={() => setIntent("signin")}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && intent === "signin" && <ButtonSpinner />}
          Sign in
        </button>
        <button
          type="submit"
          name="intent"
          value="signup"
          onClick={() => setIntent("signup")}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && intent === "signup" && <ButtonSpinner />}
          Create account
        </button>
      </div>
    </form>
  );
}
