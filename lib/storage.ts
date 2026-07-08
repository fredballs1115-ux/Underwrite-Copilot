import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The private Supabase Storage bucket that holds the uploaded OM PDFs.
const BUCKET = "offering-memoranda";

/** Store an OM PDF at `<user_id>/<deal_id>.pdf`. */
export async function uploadOmPdf(path: string, body: Buffer): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, body, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/** Read an OM PDF back out of Storage as a Buffer (for sending to Claude). */
export async function downloadOmPdf(path: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Download any file in the bucket as a Buffer (model source documents). */
export async function downloadDealFile(path: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

// Content types safe to serve inline from a signed URL. Everything else is
// stored as octet-stream so the browser downloads it rather than rendering it
// — a user-uploaded text/html or SVG must never execute inline on the storage
// origin (stored-XSS defense). Note SVG is deliberately excluded (script vector).
const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

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

/** Store a user-uploaded supplement file. The browser-declared content type is
 *  honored only if it's on the inline-safe allowlist; anything else is stored
 *  as octet-stream so it can't render as active content when opened. */
export async function uploadSupplement(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const safeType = INLINE_SAFE_TYPES.has(contentType)
    ? contentType
    : "application/octet-stream";
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, body, {
    contentType: safeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Supplement upload failed: ${error.message}`);
  }
}

/** Remove a supplement file from Storage (best-effort). */
export async function removeSupplementFile(path: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove([path]);
}

/** Where a worker-mode reconcile parks the buyer's model file: next to the
 *  OM, fixed name per deal. ONE definition on purpose — the enqueue path,
 *  the worker's cleanup, and the deal/account deletion sweeps must all agree
 *  or deleted deals would leak parked models. */
export function modelTmpPath(omStoragePath: string): string {
  return omStoragePath.replace(/\.pdf$/i, "") + ".model-tmp";
}

/** Remove several files at once (best-effort — used when deleting a deal). */
export async function removeStorageFiles(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove(clean);
}

/** A short-lived signed URL so the user can download their supplement file. */
export async function signedSupplementUrl(path: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
