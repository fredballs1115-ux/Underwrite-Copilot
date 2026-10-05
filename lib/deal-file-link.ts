import { classifyDealPath, isScopedPath } from "@/lib/storage-paths";

/**
 * The links to a deal's own files that a reader opens from its pages: the
 * files added with a note (deals.supplements, `supplements/<dealId>/<id>-<name>`)
 * and the source documents (deal_documents, `documents/<dealId>/<id>-<name>`,
 * a BOV among them). Each points at the route that signs the file at the
 * moment it is opened (`app/api/deals/[id]/file`), never at a signed URL
 * minted when the page rendered: that one lasted an hour, so a page left
 * open longer handed the reader the storage host's expiry error. The OM has
 * a route and a helper of its own (lib/om-link). Pure: the deal page and the
 * valuations page build the links, and the route reads the same rules.
 */

/** The kinds of a deal's objects the file route serves. */
export const DEAL_FILE_KINDS = ["supplement", "document"] as const;
export type DealFileKind = (typeof DEAL_FILE_KINDS)[number];

/** Which of the deal's own served files the path is — one of THIS deal's
 *  supplements or source documents, by its shape (lib/storage-paths) — or
 *  null for anything else: another deal's file, the OM, a photograph, a
 *  flood frame, a parked model, a malformed path. */
export function dealFileKind(dealId: string, path: string | null | undefined): DealFileKind | null {
  if (!path || !isScopedPath(path, { kind: "deal", dealId, only: DEAL_FILE_KINDS })) return null;
  const kind = classifyDealPath(path, dealId);
  return kind === "supplement" || kind === "document" ? kind : null;
}

/** The link to one of the deal's own files: the route, with the object's
 *  path as `p`. Null where the path is not one of the deal's own supplements
 *  or documents, so no link is drawn. */
export function dealFileLinkFor(dealId: string, path: string | null | undefined): string | null {
  if (!path || !dealFileKind(dealId, path)) return null;
  return `/api/deals/${dealId}/file?p=${encodeURIComponent(path)}`;
}

/** Whether the deal's supplements (deals.supplements: a tab's key → its notes
 *  and files) list the path as one of their files. The route signs a
 *  supplement only where the deal's own record names it, so a path of the
 *  right shape that no record lists is never signed. */
export function supplementListed(supplements: unknown, path: string): boolean {
  if (!path || !supplements || typeof supplements !== "object" || Array.isArray(supplements)) return false;
  for (const tab of Object.values(supplements as Record<string, unknown>)) {
    const files = tab && typeof tab === "object" ? (tab as { files?: unknown }).files : null;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (f && typeof f === "object" && (f as { path?: unknown }).path === path) return true;
    }
  }
  return false;
}
