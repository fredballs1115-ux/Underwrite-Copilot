// What kind of file a stored document is, for the icon its row wears on the
// deal's Documents tab (pictures, not words). Pure and import-free, so the
// client page can take it.
//
// The file's own name is read first: the bucket stores everything it will
// not serve inline as application/octet-stream (lib/inline-types), so a rent
// roll's spreadsheet comes back with no type that says it is one. The stored
// type is read only where the name has no extension this knows.

export type FileKind = "pdf" | "sheet" | "image" | "doc" | "text" | "other";

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: "pdf",
  xlsx: "sheet",
  xlsm: "sheet",
  xls: "sheet",
  csv: "sheet",
  tsv: "sheet",
  ods: "sheet",
  numbers: "sheet",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  tif: "image",
  tiff: "image",
  docx: "doc",
  doc: "doc",
  odt: "doc",
  rtf: "doc",
  pages: "doc",
  txt: "text",
  md: "text",
};

/** The kind a file is, from its name, else its stored type, else "other". */
export function fileKindOf(filename: string, contentType?: string | null): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase();
  if (ext && BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  const type = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type === "text/csv" || type.includes("spreadsheet") || type.includes("excel")) return "sheet";
  if (type.includes("wordprocessing") || type === "application/msword") return "doc";
  if (type.startsWith("text/")) return "text";
  return "other";
}

/** The kind said in words, for a screen reader and the icon's title. */
export const FILE_KIND_WORDS: Record<FileKind, string> = {
  pdf: "PDF",
  sheet: "Spreadsheet",
  image: "Image",
  doc: "Word document",
  text: "Text file",
  other: "File",
};
