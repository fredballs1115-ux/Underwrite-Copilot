// The disk half of lib/photos: which of the homepage's photograph slots
// have a file under public/photos/. Server-only by nature (fs); the pure
// list and the choosing live in lib/photos so the tests never touch the
// disk. Checked at render time — an ISR page re-reads it on its next
// revalidation, so a photograph committed to the repo appears with the
// deploy that carries it and never needs a code change.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { presentPhotos, type PhotoSlot } from "./photos";

export const PHOTOS_DIR = join(process.cwd(), "public", "photos");

export function photosOnDisk(): Partial<Record<PhotoSlot["id"], PhotoSlot>> {
  return presentPhotos((file) => existsSync(join(PHOTOS_DIR, file)));
}
