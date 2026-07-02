import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return (
    <div className="band-dark flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
        <Link href="/" className="flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="font-semibold tracking-tight text-white">
            Underwrite Copilot
          </span>
        </Link>

        <div className="shadow-float mt-8 rounded-2xl border border-line bg-surface p-7">
          <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Screen your first deal in minutes. Your first 3 deals are free — no
            card required, and a fully-worked sample deal is waiting inside.
          </p>
          <LoginForm initialMode={mode === "signup" ? "signup" : "signin"} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/50">
          First-pass screen, not investment advice.
        </p>
      </div>
    </div>
  );
}
