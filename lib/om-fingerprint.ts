import "server-only";
import { createHash } from "node:crypto";

/**
 * Which memorandum: a fingerprint of the OM's bytes — the first sixteen hex
 * digits of their SHA-256. The stored OM keeps ONE path across a
 * replacement (the deal actions' `replaceOm` writes the reissued deck over
 * the same object), so the path cannot tell one memorandum from the next;
 * the bytes can. Ask stamps each answer with the fingerprint of the deck it
 * read, and a replacement marks the thread with the new deck's (lib/deals
 * `parseDealQa`), so an answer and its pages are never read as the current
 * memorandum's when they were another's.
 */
export function omFingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
