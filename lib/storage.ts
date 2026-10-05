import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dealPhotoPath, isScopedPath, scopedPath, type StorageScope } from "@/lib/storage-paths";
import { INLINE_SAFE_TYPES } from "@/lib/inline-types";

export {
  StoragePathError,
  brandingLogoPath,
  classifyDealPath,
  dealPhotoPath,
  documentPath,
  isScopedPath,
  modelTmpPath,
  omStoragePath,
  scopedPath,
  supplementPath,
  type DealObjectKind,
  type StorageScope,
} from "@/lib/storage-paths";

// The private Supabase Storage bucket that holds the uploaded OM PDFs and
// everything else a deal or an account attaches.
const BUCKET = "offering-memoranda";

/**
 * Every primitive here runs as the service role, which has no row-level
 * security, and every path it is handed was read off a database row the
 * row's owner can edit. So each one takes the scope the path is used on
 * behalf of — the deal, or the account/team whose logo it is — and refuses
 * a path that is not one of that scope's own shapes (`lib/storage-paths.ts`)
 * before any bytes move. Reads, writes and signed URLs throw a
 * StoragePathError; the best-effort removals skip the path and log it.
 */

function skipUnscoped(paths: string[], scope: StorageScope, op: string): string[] {
  const keep: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    if (isScopedPath(p, scope)) keep.push(p);
    else console.warn(`[storage] ${op}: refused a path outside its scope (${JSON.stringify(scope)}): ${p}`);
  }
  return keep;
}

/** Store an OM PDF at `<user_id>/<deal_id>.pdf`. */
export async function uploadOmPdf(path: string, body: Buffer, scope: StorageScope): Promise<void> {
  const target = scopedPath(path, scope);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(target, body, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/** Read an OM PDF back out of Storage as a Buffer (for sending to Claude). */
export async function downloadOmPdf(path: string, scope: StorageScope): Promise<Buffer> {
  const target = scopedPath(path, scope);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(target);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Store one of the building's photograph derivatives — always a JPEG the
 *  server itself encoded (`lib/deal-picture.ts`), never the user's bytes. */
export async function uploadDealPhoto(path: string, body: Buffer, scope: StorageScope): Promise<void> {
  const target = scopedPath(path, scope);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(target, body, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }
}

/** Download any file in the bucket as a Buffer (model source documents, a
 *  branding logo) — within its scope. */
export async function downloadDealFile(path: string, scope: StorageScope): Promise<Buffer> {
  const target = scopedPath(path, scope);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(target);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

// Content types served inline from a signed URL: lib/inline-types, one
// list with the page that labels a link View or Download.


/** Magic-byte check for the formats we recognize by extension: a file whose
 *  NAME claims a known format must carry that format's signature (the same
 *  gate the OM upload applies to PDFs). Unknown extensions pass — they're
 *  stored as octet-stream anyway. Returns the offending format, or null. */
export function signatureMismatch(fileName: string, body: Buffer): string | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const head = body.subarray(0, 8);
  const startsWith = (bytes: number[]) =>
    bytes.every((b, i) => head[i] === b);
  if (ext === "pdf" && !head.toString("latin1").startsWith("%PDF-")) return "PDF";
  if (ext === "xlsx" && !startsWith([0x50, 0x4b, 0x03, 0x04])) return "Excel (.xlsx)";
  if (ext === "xls" && !startsWith([0xd0, 0xcf, 0x11, 0xe0])) return "Excel (.xls)";
  if (ext === "png" && !startsWith([0x89, 0x50, 0x4e, 0x47])) return "PNG";
  if ((ext === "jpg" || ext === "jpeg") && !startsWith([0xff, 0xd8])) return "JPEG";
  return null;
}

/** Store a user-uploaded supplement, document, parked model or logo. The
 *  browser-declared content type is honored only if it's on the inline-safe
 *  allowlist; anything else is stored as octet-stream so it can't render as
 *  active content when opened. */
export async function uploadSupplement(
  path: string,
  body: Buffer,
  contentType: string,
  scope: StorageScope,
): Promise<void> {
  const target = scopedPath(path, scope);
  const safeType = INLINE_SAFE_TYPES.has(contentType)
    ? contentType
    : "application/octet-stream";
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(target, body, {
    contentType: safeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Supplement upload failed: ${error.message}`);
  }
}

/** Remove one file from Storage (best-effort; a path outside its scope is
 *  skipped and logged, never removed). */
export async function removeSupplementFile(path: string, scope: StorageScope): Promise<void> {
  const clean = skipUnscoped([path], scope, "remove");
  if (clean.length === 0) return;
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove(clean);
}

/** Remove several files at once (best-effort — used when deleting a deal or
 *  an account). Every path must belong to the one scope; the rest are
 *  skipped and logged. */
export async function removeStorageFiles(paths: string[], scope: StorageScope): Promise<void> {
  const clean = skipUnscoped(paths, scope, "remove");
  if (clean.length === 0) return;
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove(clean);
}

/** Objects a listing asks for at once. */
const LIST_PAGE = 1000;

/**
 * Every object stored in a deal's own picture folders — its photographs
 * (`photos/<dealId>/`) and its drawn flood frames (`flood/<dealId>/`) — as
 * full paths, each held to the deal's scope like any other path here. For
 * the deletion sweeps (research pass 39): the files a deal's photo cache
 * names are not always all of them — a picture stored by a write that lost
 * its record to another writer is still the deal's, and recorded nowhere —
 * so a sweep lists the folders rather than trusting the record alone. A
 * deal id that is not one of the layout's own segments lists nothing.
 * Best-effort: a page that fails ends the listing with what was read.
 */
export async function listDealPictureFiles(dealId: string): Promise<string[]> {
  const scope = { kind: "deal", dealId, only: ["photo", "flood"] } as const;
  // The folders the layout mints for this deal, or none for an id it would
  // not mint them under.
  if (!isScopedPath(dealPhotoPath(dealId, "probe", "hero"), scope)) return [];
  const admin = createSupabaseAdminClient();
  const out: string[] = [];
  for (const folder of [`photos/${dealId}`, `flood/${dealId}`]) {
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: LIST_PAGE, offset });
      if (error || !data) break;
      for (const o of data) {
        const path = `${folder}/${o.name}`;
        if (isScopedPath(path, scope)) out.push(path);
      }
      if (data.length < LIST_PAGE) break;
    }
  }
  return out;
}

/** A short-lived signed URL so the user can download their file. Null when
 *  the path is outside its scope (logged) or the bucket has no such object. */
export async function signedSupplementUrl(path: string, scope: StorageScope): Promise<string | null> {
  if (skipUnscoped([path], scope, "sign").length === 0) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
