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
//     roll or a T-12 already on the deal is not asked for again;
//   - and the ones its class keeps (audit C8, L6): a hotel has no rent roll
//     — it is asked for its P&L and its STR reports — and land has neither a
//     rent roll nor a T-12 — it is asked for its survey, its title and its
//     entitlements. The class is the caller's to read (`documentProfileOf`
//     over lib/asset-words' class key), since this module imports nothing.

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

/** What a class keeps on file for a first screen to ask for. */
export type DocumentProfile = "income" | "lodging" | "land";

/** The profile a deal's class asks by, from its class key (lib/asset-words
 *  `dealClassKey`): a hotel's documents, land's, else an income property's. */
export function documentProfileOf(classKey: string | null | undefined): DocumentProfile {
  if (classKey === "hospitality_str") return "lodging";
  if (classKey === "land_infill") return "land";
  return "income";
}

const CA = { key: "ca", label: "the confidentiality agreement, if one is required for the data room" } as const;

/** The documents a first screen asks a broker for, by what the class keeps,
 *  in the order asked. */
export const DOCUMENT_REQUESTS: Record<DocumentProfile, readonly { key: string; label: string }[]> = {
  income: [
    { key: "rentRoll", label: "the current rent roll" },
    { key: "t12", label: "the trailing-12-month operating statement (T-12)" },
    CA,
  ],
  lodging: [
    { key: "t12", label: "the trailing-12-month P&L, by department (T-12)" },
    { key: "str", label: "the STR reports for the last 12 months" },
    { key: "franchise", label: "the franchise agreement and any property improvement plan (PIP)" },
    CA,
  ],
  land: [
    { key: "survey", label: "the survey" },
    { key: "title", label: "the title commitment" },
    { key: "entitlements", label: "the entitlement record: approvals, conditions and the zoning" },
    CA,
  ],
};

/** The request for what the deal does not have yet, as one email. */
export function documentRequestEmail(
  dealName: string | null | undefined,
  have: { rentRoll?: boolean; t12?: boolean },
  profile: DocumentProfile = "income",
): { subject: string; body: string; asked: string[] } {
  const deal = dealName?.trim() || "the deal";
  const asked = DOCUMENT_REQUESTS[profile].filter((d) => !(d.key === "rentRoll" && have.rentRoll) && !(d.key === "t12" && have.t12)).map((d) => d.label);
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
