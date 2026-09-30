import { isScopedPath } from "@/lib/storage-paths";

/**
 * The deal page's link to its offering memorandum: the route that signs the
 * file at the moment it is opened (`app/api/deals/[id]/om`), never a signed
 * URL minted when the page rendered — that one lasted an hour, so a page
 * left open longer sent the OM link and every "p. N" chip to the storage
 * host's expiry error. A chip appends `#page=N` to it; the fragment survives
 * the route's redirect (see the route). Null where the deal has no
 * memorandum of its own, so no link is drawn. Pure: the deal page hands it
 * to the chips, and the route's test holds it.
 */
export function omLinkFor(dealId: string, omPath: string | null | undefined): string | null {
  if (!omPath || !isScopedPath(omPath, { kind: "deal", dealId, only: ["om"] })) return null;
  return `/api/deals/${dealId}/om`;
}
