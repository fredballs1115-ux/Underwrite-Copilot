import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The plain-English terms for using Underwrite Copilot's CRE deal-screening service.",
};

const SECTIONS: { h: string; body: string[] }[] = [
  {
    h: "What the service is",
    body: [
      "Underwrite Copilot is a first-pass screening tool for commercial real estate deals. You upload deal documents (offering memoranda, rent rolls, and similar), and the service runs an AI-assisted analysis that produces ranges, flagged assumptions, and a Go / No-Go screening verdict.",
      "It is a screen, not an underwriter of record. Outputs can be wrong, incomplete, or out of date — always verify flagged figures against the source documents before acting.",
    ],
  },
  {
    h: "Not investment advice",
    body: [
      "Nothing the service produces is investment, legal, tax, or accounting advice, and no output is a recommendation to buy, sell, or finance any asset. You are solely responsible for your investment decisions.",
    ],
  },
  {
    h: "Your account",
    body: [
      "Keep your credentials to yourself and give us accurate account information. You're responsible for activity under your account. One account is for one person — to share a pipeline with colleagues, use the Team plan rather than sharing a login.",
    ],
  },
  {
    h: "Your documents",
    body: [
      "You keep ownership of everything you upload. You give us the limited rights needed to run the service on it: storing your documents, and processing them with AI models to produce your analysis. We don't sell your documents, share them with anyone outside your account or team, or use them to train models.",
      "Only upload documents you have the right to use. Offering memoranda are often shared under confidentiality terms — those terms are between you and whoever gave you the document, and staying within them is your responsibility.",
    ],
  },
  {
    h: "Acceptable use",
    body: [
      "Don't abuse the service: no attempts to break isolation between accounts, probe or overload the infrastructure, scrape or resell the service's output as a data product, or use the service for anything unlawful.",
    ],
  },
  {
    h: "Billing",
    body: [
      "The free tier includes a limited number of deals. Pro is a monthly subscription and the Team plan is billed monthly per seat, both through Stripe; team billing adjusts automatically as members join or leave. You can cancel anytime from the billing page; cancellation takes effect at the end of the paid period and no further charges are made. Downgrading never deletes your deals or documents.",
    ],
  },
  {
    h: "Service availability and warranty",
    body: [
      "The service is provided “as is” and “as available,” without warranties of any kind, express or implied. We don't guarantee uninterrupted availability, or that any analysis is accurate or complete. To the maximum extent permitted by law, our total liability for any claim related to the service is limited to the amount you paid us in the twelve months before the claim.",
    ],
  },
  {
    h: "Termination",
    body: [
      "You can stop using the service at any time. We may suspend or terminate accounts that violate these terms. On termination we'll delete your documents and analyses within a reasonable period, except where the law requires retention.",
    ],
  },
  {
    h: "Changes",
    body: [
      "We may update these terms as the product evolves. If a change is material, we'll flag it on the site or by email before it takes effect. Continuing to use the service after a change means you accept the updated terms.",
    ],
  },
  {
    h: "Contact",
    body: [
      "Questions about these terms: support@underwritecopilot.com.",
    ],
  },
];

export default function TermsPage() {
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
            href="/login"
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Terms of service
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: July 2, 2026</p>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          These are the terms for using Underwrite Copilot. They&apos;re written
          in plain English on purpose — if anything is unclear, ask us before
          relying on it.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold tracking-tight">{s.h}</h2>
              {s.body.map((p, i) => (
                <p
                  key={i}
                  className="mt-2 text-sm leading-relaxed text-muted"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Underwrite Copilot</span>
          <span className="flex gap-4">
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
