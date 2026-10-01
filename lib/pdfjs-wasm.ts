import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Where pdfjs's WebAssembly decoders live, as the `wasmUrl` its
 * `getDocument` takes: the package's own `wasm/` folder, with the trailing
 * slash pdfjs insists on. In Node, pdfjs reads `${wasmUrl}${file}` off the
 * disk (its NodeBinaryDataFactory), so a folder path is the whole answer.
 *
 * Without it pdfjs has no JPEG 2000 decoder at all: a `/JPXDecode` image —
 * what an Acrobat-optimised memorandum stores its photographs as — fails to
 * decode and is passed over, so a cover stored that way was never found
 * (and JBIG2 and CCITT fax images, a scanned page's, fail the same way).
 *
 * Every document the server opens passes the same value. pdfjs keeps these
 * options process-wide — each document it opens sets the decoders' location
 * for all of them — so a text read opened without it would take the
 * decoders away from a picture read running beside it.
 *
 * Found from the app's root, where both the web service and the worker
 * start (as `lib/photos-fs` finds `public/`): at the plain path, then by
 * Node's own resolution, which follows a hoisted or linked install. Node's
 * resolver is reached at run time only, so no bundler reads the call as a
 * module to trace. Undefined where neither holds the decoder, and pdfjs
 * then reads as it did without it.
 */
export function pdfjsWasmUrl(): string | undefined {
  if (found === undefined) found = locate();
  return found ?? undefined;
}

/** The decoder whose presence says the folder is the one. */
export const PDFJS_JPX_DECODER = "openjpeg.wasm";

let found: string | null | undefined;

function locate(): string | null {
  const root = process.cwd();
  const candidates = [join(root, "node_modules", "pdfjs-dist", "wasm")];
  try {
    const nodeModule = process.getBuiltinModule?.("module");
    const resolved = nodeModule?.createRequire(join(root, "package.json")).resolve("pdfjs-dist/package.json");
    if (resolved) candidates.push(join(dirname(resolved), "wasm"));
  } catch {
    // Not resolvable from the root: the plain path is all there is.
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, PDFJS_JPX_DECODER))) return dir.endsWith("/") ? dir : `${dir}/`;
  }
  return null;
}
