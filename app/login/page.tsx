import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { FREE_DEALS } from "@/lib/marketing-constants";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Underwrite Copilot — upload an offering memorandum and get a sourced, adversarial screen of the deal in minutes.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; deleted?: string; confirmed?: string }>;
}) {
  const { mode, next, deleted, confirmed } = await searchParams;
  return (
    <div className="band-dark flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
        <Link
          href="/"
          className="flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <LogoMark className="h-8 w-8" />
          <span className="font-semibold tracking-tight text-white">
            Underwrite Copilot
          </span>
        </Link>

        {deleted && (
          <p className="mt-6 rounded-lg bg-surface/95 px-3 py-2 text-center text-sm text-ink shadow-card">
            Your account and all its data have been deleted. Thanks for trying
            Underwrite Copilot.
          </p>
        )}
        {confirmed && (
          <p className="mt-6 rounded-lg bg-surface/95 px-3 py-2 text-center text-sm text-ink shadow-card">
            Email confirmed — sign in below and your pipeline is ready.
          </p>
        )}
        <div className="shadow-float mt-8 rounded-2xl border border-line bg-surface p-7">
          <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Screen your first deal in minutes. Your first {FREE_DEALS} deals
            are free — no card required, and a fully-worked sample deal is
            waiting inside.
          </p>
          <LoginForm
            initialMode={mode === "signup" ? "signup" : "signin"}
            next={next ?? null}
          />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/50">
          First-pass screen, not investment advice.
        </p>
      </div>
    </div>
  );
}
