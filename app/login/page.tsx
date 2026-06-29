import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="group flex items-center gap-2.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
          UC
        </div>
        <span className="font-semibold tracking-tight text-ink">
          Underwrite Copilot
        </span>
      </Link>

      <div className="shadow-float mt-8 rounded-2xl border border-line bg-surface p-7">
        <h1 className="text-xl font-semibold tracking-tight">
          Sign in or create an account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Screen your first deal in minutes. New here? Just pick a password and
          hit “Create account.”
        </p>
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        First-pass screen, not investment advice.
      </p>
    </div>
  );
}
