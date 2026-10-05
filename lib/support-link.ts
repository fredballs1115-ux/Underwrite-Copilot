/**
 * The support link under a stopped screen. It was a bare mailto: no
 * subject, no deal, no sentence, so support had to ask for all three before
 * looking (research pass 30). It now carries the deal's name and id, the
 * step the screen stopped at and the page's own sentence. Pure, with no
 * imports, so the deal page (a client component) and its test build one
 * link.
 */

/** Where support is reached, as every surface names it. */
export const SUPPORT_EMAIL = "underwritecopilot.support@gmail.com";

export interface SupportLinkInput {
  dealId: string;
  dealName: string;
  /** the step the job stopped at, as the job row names it */
  step: string | null | undefined;
  /** the sentence the page shows for the failure */
  error: string | null | undefined;
}

/** A mailto that opens an email already saying which deal and what the
 *  page said. Lines end CRLF, as RFC 6068 asks of a mailto body. */
export function supportMailto(input: SupportLinkInput): string {
  const subject = `Screen stopped — ${input.dealName} (${input.dealId})`;
  const body = [
    `Deal: ${input.dealName}`,
    `Deal id: ${input.dealId}`,
    input.step ? `Stopped at the ${input.step} step` : null,
    input.error ? `What the page said: ${input.error}` : null,
    "",
    "Anything else you noticed:",
  ]
    .filter((line): line is string => line !== null)
    .join("\r\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
