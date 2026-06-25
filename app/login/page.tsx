import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Underwrite Copilot
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Sign in or create an account
      </h1>
      <p className="mt-2 text-sm text-muted">
        Screen your first deal in minutes. New here? Just pick a password and hit
        “Create account.”
      </p>
      <LoginForm />
    </div>
  );
}
