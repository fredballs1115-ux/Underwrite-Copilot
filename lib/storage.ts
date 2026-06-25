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
