// Writing to the listing team from the deal (research pass 24, B15): the
// challenger's questions, and a request for the documents the deal does not
// have yet, opened in the reader's own mail program addressed to the brokers
// the memorandum names. Pure; no imports, so the client card reads it.
//
// Its rules:
//   - only the brokers whose address is one plain address are written to
//     (lib/offering `mailtoAddressOf` already holds the printed address to
//     that), and none where there is none — never a guessed address;
//   - a mailto: link past what a mail program reliably opens is not built:
//     the card copies the email instead (`MAILTO_MAX`);
//   - the documents asked for are the ones the deal does not hold: a rent
//     roll or a T-12 already on the deal is not asked for again.

/** The longest mailto: link the card builds. Mail programs and browsers cut
 *  long links at different lengths (some near 2,000 characters), so past
 *  this the card offers the email to copy instead. */
export const MAILTO_MAX = 1900;

/** A mailto: link to the addresses with the subject and body, or null where
 *  there is no one to write to or the link would run past `MAILTO_MAX`. */
export function mailtoHref(to: readonly string[], subject: string, body: string): string | null {
  const list = to.filter(Boolean);
  if (!list.length) return null;
  const href = `mailto:${list.map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return href.length <= MAILTO_MAX ? href : null;
}

/** An email written as one text — "Subject: …" on its first line, a blank
 *  line, then the body — split into its subject and body. */
export function splitEmail(text: string): { subject: string; body: string } {
  const m = /^Subject:\s*(.*)\n\n?([\s\S]*)$/.exec(text);
  return m ? { subject: m[1].trim(), body: m[2] } : { subject: "", body: text };
}

/** The documents a first screen asks a broker for, in the order asked. */
export const DOCUMENT_REQUEST = [
  { key: "rentRoll", label: "the current rent roll" },
  { key: "t12", label: "the trailing-12-month operating statement (T-12)" },
  { key: "ca", label: "the confidentiality agreement, if one is required for the data room" },
] as const;

/** The request for what the deal does not have yet, as one email. */
export function documentRequestEmail(
  dealName: string | null | undefined,
  have: { rentRoll?: boolean; t12?: boolean },
): { subject: string; body: string; asked: string[] } {
  const deal = dealName?.trim() || "the deal";
  const asked = DOCUMENT_REQUEST.filter((d) => !(d.key === "rentRoll" && have.rentRoll) && !(d.key === "t12" && have.t12)).map((d) => d.label);
  const lines = asked.map((l, i) => `${i + 1}. ${l.charAt(0).toUpperCase()}${l.slice(1)}`);
  return {
    subject: `${deal} — document request`,
    body: [
      "Hi,",
      "",
      `We're reviewing ${deal} and would like to take it further. Could you send:`,
      "",
      ...lines,
      "",
      "Thanks,",
    ].join("\n"),
    asked,
  };
}
