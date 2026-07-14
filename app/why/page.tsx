import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";

export const metadata: Metadata = {
  title: "Why Underwrite Copilot",
  description:
    "Why Underwrite Copilot exists: screen more offering memoranda without cutting corners. Deterministic math, page-level citations, and a fast read on whether a deal fits your mandate.",
  alternates: { canonical: "/why" },
};

// Copy rules for this page: short sentences, plain words, no hype, no
// exclamation marks, no rhetorical questions. Every claim maps to something the
// product actually does.
const SECTIONS: { h: string; body: string[] }[] = [
  {
    h: "The problem",
    body: [
      "An offering memorandum is a sales document. The pro forma is the seller's best case. Rents are pushed, expenses run light, and the exit cap compresses.",
      "Reading past that takes time. Most of the deals on your desk will not clear your box. The slow part is finding out which ones, and you spend it on deals that were never going to work.",
    ],
  },
  {
    h: "What it does",
    body: [
      "Upload an OM. The app reads it and returns a screen: the key terms, a red-team of the assumptions, the comps inside the deck, a reconciliation across your documents, a market check, and a verdict.",
      "It scores the deal against your buy box from zero to one hundred and gives a Pursue, Watch, or Pass call. It exports a working Excel model with live formulas. You get to a defensible read before you build anything by hand.",
    ],
  },
  {
    h: "Deterministic where it counts",
    body: [
      "Claude reads the document. The math does not run on a language model. Excel formulas, reconciliation deltas, and the mandate-fit score are computed in code and covered by tests.",
      "The same deal returns the same numbers every time. The model does the reading; the arithmetic is ours, and it is checkable.",
    ],
  },
  {
    h: "It shows its work",
    body: [
      "Every extracted number carries the page it came from. Click a figure to open the OM at that page and confirm it against the source.",
      "When a figure cannot be located in the document, the app says so. It does not invent a citation, a page, or a number.",
    ],
  },
  {
    h: "Your data stays yours",
    body: [
      "Documents are private to your account and, if you create one, your team. The market data built from your past screens is private to you alone.",
      "Nothing you upload is used to train AI models. The security page has the full detail.",
    ],
  },
  {
    h: "What it is not",
    body: [
      "This is a screening tool, not a full underwriting model. It works at the annual level.",
      "It does not replace ARGUS, a monthly cash-flow build, or your own diligence. It gets you to a fast, honest read on whether a deal earns that work.",
    ],
  },
];

export default function WhyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Why Underwrite Copilot
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          You get more offering memoranda than you can model. Underwrite Copilot
          reads an OM and tells you what the deal is, where it breaks, and
          whether it fits your mandate. You decide what to model.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold tracking-tight">{s.h}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            See it on a real deal
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Start with a fully worked sample, or upload an OM and get a verdict
            in a few minutes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started
            </Link>
            <Link
              href="/security"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
            >
              How your data is handled
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Underwrite Copilot</span>
          <span className="flex gap-4">
            <Link href="/why" className="transition-colors hover:text-ink">
              Why
            </Link>
            <Link href="/security" className="transition-colors hover:text-ink">
              Security
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
