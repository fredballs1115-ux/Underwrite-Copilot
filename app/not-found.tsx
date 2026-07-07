import Link from "next/link";
import { LogoMark } from "@/app/logo";

// Global 404 — branded to match the marketing pages.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center px-6 text-center">
      <LogoMark className="h-10 w-10" />
      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        This page isn&apos;t here.
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        The link may be broken, or the deal may have been removed. Let&apos;s get
        you back on track.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/deals"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Go to your pipeline
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-faint"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
