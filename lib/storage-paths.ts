/**
 * Where the private bucket's objects live — the one definition — and the
 * gate every storage primitive applies before it touches the service-role
 * client. (Universal module: the server storage layer, the worker, tests.)
 *
 * Layout. Every writer in the app mints one of these, through the helpers
 * below:
 *
 *   <userId>/<dealId>.pdf                             the OM, in its creator's folder
 *   <userId>/<dealId>.model-tmp                       a worker-mode reconcile's parked model
 *   documents/<dealId>/<uuid>-<name>                  source documents (deal_documents)
 *   supplements/<dealId>/<uuid>-<name>                tab attachments (deals.supplements)
 *   <teamId|userId>/branding-logo-<suffix>.<png|jpg>  report branding
 *
 * Why a gate: the paths are read back off ordinary database columns that the
 * row's owner can write through PostgREST, and the storage client that
 * consumes them runs as the service role, which has no row-level security.
 * So a path is only ever used on behalf of a scope — the deal it hangs off,
 * or the account or team whose logo it is — and it must be one of that
 * scope's own shapes. A deal's objects all carry the deal's id; a logo sits
 * in its account's or team's folder. Anything else is refused before any
 * read, write, signed URL or delete. Migration 0034 asserts the same shapes
 * at the row, so the two layers agree.
 */

export type DealObjectKind = "om" | "model-tmp" | "document" | "supplement";

export type StorageScope =
  | { kind: "deal"; dealId: string; only?: readonly DealObjectKind[] }
  | { kind: "branding"; userId: string | null; teamId?: string | null };

/** A path that is not one of its scope's own shapes. The message is the
 *  sentence the person sees; the scope and path go to the server log. */
export class StoragePathError extends Error {
  readonly path: string;
  readonly scope: StorageScope;
  constructor(path: string, scope: StorageScope) {
    super("This file isn't stored where its record says it should be — upload it again.");
    this.name = "StoragePathError";
    this.path = path;
    this.scope = scope;
  }
}

// One path segment: no slashes, no dot-only names, nothing outside the
// characters the minting helpers produce.
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOGO_FILE = /^branding-logo-[a-z0-9]+-[a-z0-9]+\.(png|jpg)$/;

/** A branding logo path of any account or team — for parsers that know no
 *  ids (`sanitizeBranding`); the scope check pins the folder. */
export const BRANDING_LOGO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/branding-logo-[a-z0-9]+-[a-z0-9]+\.(png|jpg)$/;

function segments(path: string): string[] | null {
  if (typeof path !== "string" || !path || path.length > 400) return null;
  // A backslash or a control character is never part of a minted path.
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return null;
  const parts = path.split("/");
  for (const p of parts) {
    if (!SEGMENT.test(p) || p === "." || p === "..") return null;
  }
  return parts;
}

/** Which of a deal's objects this path is — or null when it is not one of
 *  that deal's. The deal's id must appear where the layout puts it: as the
 *  file's stem for the OM and the parked model, as the folder for documents
 *  and supplements. */
export function classifyDealPath(path: string, dealId: string): DealObjectKind | null {
  if (!dealId || !SEGMENT.test(dealId)) return null;
  const parts = segments(path);
  if (!parts) return null;
  if (parts.length === 2) {
    const file = parts[1];
    if (file === `${dealId}.pdf`) return "om";
    if (file === `${dealId}.model-tmp`) return "model-tmp";
    return null;
  }
  if (parts.length === 3 && parts[1] === dealId) {
    if (parts[0] === "documents") return "document";
    if (parts[0] === "supplements") return "supplement";
  }
  return null;
}

/** True when the path is a branding logo in the account's or team's folder. */
export function isBrandingPath(
  path: string,
  scope: { userId: string | null; teamId?: string | null },
): boolean {
  const parts = segments(path);
  if (!parts || parts.length !== 2) return false;
  const [folder, file] = parts;
  const owners = [scope.userId, scope.teamId].filter((x): x is string => !!x);
  return owners.includes(folder) && LOGO_FILE.test(file);
}

/** True when the path is one of the scope's own. */
export function isScopedPath(path: string, scope: StorageScope): boolean {
  if (scope.kind === "deal") {
    const kind = classifyDealPath(path, scope.dealId);
    return kind != null && (!scope.only || scope.only.includes(kind));
  }
  return isBrandingPath(path, scope);
}

/** The path itself when it is one of the scope's own; throws otherwise. */
export function scopedPath(path: string, scope: StorageScope): string {
  if (!isScopedPath(path, scope)) throw new StoragePathError(path, scope);
  return path;
}

// ---- the minting side: every writer produces one of the shapes above -------

/** A file name reduced to the characters a path may carry. */
export function safeFileName(name: string, fallback = "file"): string {
  return (
    name
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[^a-z0-9]+/i, "")
      .slice(0, 80) || fallback
  );
}

/** The OM: `<userId>/<dealId>.pdf`, in its creator's folder. */
export function omStoragePath(userId: string, dealId: string): string {
  return `${userId}/${dealId}.pdf`;
}

/** Where a worker-mode reconcile parks the buyer's model file: next to the
 *  OM, fixed name per deal. ONE definition on purpose — the enqueue path,
 *  the worker's cleanup, and the deal/account deletion sweeps must all agree
 *  or deleted deals would leak parked models. */
export function modelTmpPath(omStoragePath: string): string {
  return omStoragePath.replace(/\.pdf$/i, "") + ".model-tmp";
}

/** A source document: `documents/<dealId>/<id>-<name>`. */
export function documentPath(dealId: string, id: string, fileName: string, fallback = "file"): string {
  return `documents/${dealId}/${id}-${safeFileName(fileName, fallback)}`;
}

/** A tab attachment: `supplements/<dealId>/<id>-<name>`. */
export function supplementPath(dealId: string, id: string, fileName: string): string {
  return `supplements/${dealId}/${id}-${safeFileName(fileName)}`;
}

/** A report-branding logo in its account's or team's folder. */
export function brandingLogoPath(scopeId: string, suffix: string, ext: "png" | "jpg"): string {
  return `${scopeId}/branding-logo-${suffix}.${ext}`;
}
