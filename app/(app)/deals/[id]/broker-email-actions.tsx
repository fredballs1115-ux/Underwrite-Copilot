"use client";

import { useState } from "react";
import type { Challenge } from "@/lib/anthropic/types";
import { documentRequestEmail, emailCopyText, mailtoHref, splitEmail, type DocumentProfile } from "@/lib/broker-mail";
import { buildBrokerEmail } from "./deal-sections";

/** One email: opened in the reader's mail program, addressed and filled,
 *  where the link fits; where it would not, copied with its addresses and
 *  subject, beside a short link that opens it addressed and titled, for
 *  the body to be pasted into. */
function EmailAction({ label, to, subject, body }: { label: string; to: string[]; subject: string; body: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const href = mailtoHref(to, subject, body);
  const cls =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:border-brand/50";
  if (href) {
    return (
      <a href={href} className={cls}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        {label}
      </a>
    );
  }
  const short = mailtoHref(to, subject, "");
  return (
    <>
      <button
        type="button"
        aria-live="polite"
        className={cls}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(emailCopyText(to, subject, body));
            setCopied("yes");
          } catch {
            setCopied("no");
          }
        }}
      >
        {copied === "yes" ? "Copied — paste it into your email" : copied === "no" ? "Couldn't copy — try again" : `${label} (copy)`}
      </button>
      {short && (
        <a href={short} className={cls} aria-label={`Open an email to them, then paste the copied text (${label})`}>
          {"Open an email to them"}
        </a>
      )}
    </>
  );
}

/**
 * Writing to the listing team from the offering card (research pass 24,
 * B15): the challenger's questions as the broker email the Challenge tab
 * copies, and a request for the documents the deal does not hold yet — each
 * addressed to the brokers whose address the memorandum prints whole
 * (lib/broker-mail). Nothing renders where there is no one to write to.
 */
export function BrokerEmailActions({
  to,
  dealName,
  challenges,
  totalPages,
  have,
  profile = "income",
}: {
  to: string[];
  dealName: string;
  challenges: Challenge[];
  totalPages: number | null;
  have: { rentRoll: boolean; t12: boolean };
  /** what the deal's class keeps to ask for (lib/broker-mail
   *  `documentProfileOf`) */
  profile?: DocumentProfile;
}) {
  if (!to.length) return null;
  const questions = challenges.some((c) => c.question) ? splitEmail(buildBrokerEmail(challenges, dealName, totalPages)) : null;
  const docs = documentRequestEmail(dealName, have, profile);
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-qa="broker-email-actions">
      {questions && <EmailAction label="Email the questions" to={to} subject={questions.subject} body={questions.body} />}
      {docs.asked.length > 0 && <EmailAction label="Request documents" to={to} subject={docs.subject} body={docs.body} />}
    </div>
  );
}
