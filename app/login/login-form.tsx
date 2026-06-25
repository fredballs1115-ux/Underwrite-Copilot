"use client";

import { useActionState } from "react";
import { authenticate, type AuthState } from "./actions";

const initialState: AuthState = null;

export function LoginForm() {
  // useActionState (React 19) gives us the action's returned error and a
  // `pending` flag while the server processes the submission.
  const [state, formAction, pending] = useActionState(
    authenticate,
    initialState,
  );

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
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
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
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
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
          disabled={pending}
          className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          Sign in
        </button>
        <button
          type="submit"
          name="intent"
          value="signup"
          disabled={pending}
          className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:bg-faint disabled:opacity-60"
        >
          Create account
        </button>
      </div>
    </form>
  );
}
