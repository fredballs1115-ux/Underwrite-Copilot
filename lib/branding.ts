// Custom report branding (Feature 6): the firm identity a Pro/Team account
// puts on its exported memos and reports. Pure parsing/sanitizing — length
// caps and empties handled here so every writer stores the same clean shape.
// (Universal module: settings page, export routes, tests.)

export interface Branding {
  /** shown in the report header, ≤50 chars */
  firmName?: string;
  /** storage path of the uploaded logo (private bucket), png/jpg */
  logoPath?: string;
  /** shown at the bottom of every page, ≤200 chars */
  footerText?: string;
}

export const FIRM_NAME_MAX = 50;
export const FOOTER_TEXT_MAX = 200;
/** Logo upload cap (bytes) — 1MB per the spec. */
export const LOGO_MAX_BYTES = 1 * 1024 * 1024;

export function isEmptyBranding(b: Branding | null | undefined): boolean {
  if (!b) return true;
  return !b.firmName?.trim() && !b.logoPath?.trim() && !b.footerText?.trim();
}

/** Normalize a stored/raw branding value: trim, cap lengths, drop empties.
 *  Returns null when nothing remains — "no branding" is stored as NULL, never
 *  an empty object. */
export function sanitizeBranding(raw: unknown): Branding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const firmName =
    typeof o.firmName === "string" && o.firmName.trim()
      ? o.firmName.trim().slice(0, FIRM_NAME_MAX)
      : undefined;
  const logoPath =
    typeof o.logoPath === "string" && o.logoPath.trim()
      ? o.logoPath.trim()
      : undefined;
  const footerText =
    typeof o.footerText === "string" && o.footerText.trim()
      ? o.footerText.trim().slice(0, FOOTER_TEXT_MAX)
      : undefined;
  const out: Branding = {};
  if (firmName) out.firmName = firmName;
  if (logoPath) out.logoPath = logoPath;
  if (footerText) out.footerText = footerText;
  return isEmptyBranding(out) ? null : out;
}
