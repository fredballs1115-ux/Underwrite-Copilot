// Source-link audit gate (ship-it pass). scripts/audit-source-links.mjs
// (run where egress exists — locally or a Render job) HEAD-checks every
// source URL in the research layer and writes data/research/link_audit.json.
// Render surfaces consult it before making a provenance link clickable:
//   ok:true  -> link renders
//   ok:false -> plain text "source on file — link unavailable" (never a 404)
//   unknown  -> link renders (never audited ≠ dead; the audit is the gate,
//               not an excuse to hide provenance)
// (Universal module.)

import auditSeed from "@/data/research/link_audit.json";

interface AuditEntry {
  ok: boolean;
  status: number | null;
  last_checked_at: string;
}

const AUDIT = (auditSeed as { results?: Record<string, AuditEntry> }).results ?? {};

/** true = verified live, false = verified dead, null = never audited. */
export function linkOk(url: string | null | undefined): boolean | null {
  if (!url) return null;
  const entry = AUDIT[url];
  return entry ? entry.ok : null;
}
