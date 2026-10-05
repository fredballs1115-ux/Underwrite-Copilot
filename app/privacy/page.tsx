import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { ProcessorList } from "@/app/processor-list";
import { publicMetadata } from "@/lib/page-meta";

export const metadata = publicMetadata({
  title: "Privacy policy",
  description:
    "What Underwrite Copilot collects, how deal documents are handled, and what we never do with your data.",
  canonical: "/privacy",
});

// The outside services are lib/data-processors, the security page's list
// too, held to the hosts the code sends a user's data to.
const SECTIONS: { h: string; body: string[]; processors?: boolean }[] = [
  {
    h: "What we collect",
    body: [
      "Your account email and password (the password is stored only as a hash by our auth provider). The deal documents you upload and the analyses generated from them. Subscription status from Stripe if you upgrade — card numbers go straight to Stripe and never touch our servers. Standard operational logs (timestamps, request metadata) needed to run and debug the service.",
    ],
  },
  {
    h: "How your documents are used",
    body: [
      "Documents exist to produce your analysis and for no other purpose. They're stored in private storage with isolation enforced at the database level — no one outside your account (or your team, if you join one) can query or access them.",
      "To generate the analysis, document contents are sent to Anthropic's Claude API. Under Anthropic's commercial API terms, that data is not used to train models. We don't use your documents to train anything either.",
    ],
  },
  {
    h: "What we never do",
    body: [
      "We don't sell your data. We don't share your documents or analyses with anyone outside your account — or outside your team, if you join one. We don't run ads or hand your information to ad networks. We don't use your deal documents to build datasets or benchmarks.",
    ],
  },
  {
    h: "Retention and deletion",
    body: [
      "Deleting a deal deletes its documents and analyses. You can delete your whole account and everything in it instantly, yourself, from the Account page — it cancels any live subscription and removes your files. A team's owner cannot, since the team would go with them: write to us instead. Prefer email? Write to underwritecopilot.support@gmail.com from your account address and we'll remove it within 30 days. Either way, everything is deleted except two things: the deals you added to a team's pipeline, which stay with the team, handed to its owner along with your work on the team's deals; and what the law requires us to keep (for example, billing records).",
    ],
  },
  {
    h: "Cookies and browser storage",
    body: [
      "Signing in sets the session cookies that keep you signed in; they last up to 400 days unless you sign out. Three cookies of our own last a year: the view of your pipeline you left on (cards or list), the regulatory alerts you dismissed, kept under your account's name, and your browser's time zone, so a due date counts from your own calendar day.",
      "Your browser also keeps a few things on this device only: a deal you started adding but did not submit (its name and address), that you closed the getting-started list, and, for the visit, your pipeline's filters and the map's looked-up places. There are no advertising or cross-site tracking cookies.",
    ],
  },
  {
    h: "Security",
    body: [
      "Traffic is encrypted in transit (TLS). Documents live in private, access-controlled storage. Analysis keys and service credentials are held server-side only and never reach the browser. No system is perfectly secure, but isolation between accounts is enforced in the database itself, not just in application code.",
    ],
  },
  {
    h: "Third parties we rely on",
    body: [
      "Each receives only what it needs to do its job. Your documents themselves are stored with Supabase and read by Anthropic; every other service receives only what is named beside it.",
    ],
    processors: true,
  },
  {
    h: "Changes",
    body: [
      "If this policy changes in a way that matters, we'll flag it on the site or by email before it takes effect.",
    ],
  },
  {
    h: "Contact",
    body: [
      "Privacy questions or deletion requests: underwritecopilot.support@gmail.com.",
    ],
  },
];

export default function PrivacyPage() {
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

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: October 5, 2026</p>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          Deal documents are sensitive — most OMs travel under confidentiality
          terms. This page says exactly what we collect, where it goes, and
          what we never do with it.
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
              {s.processors && <ProcessorList />}
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
            <Link href="/security" className="transition-colors hover:text-ink">
              Security
            </Link>
            <Link href="/whats-new" className="transition-colors hover:text-ink">
              What&apos;s new
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
