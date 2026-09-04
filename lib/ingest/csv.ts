// Minimal streaming CSV for the bulk extract pipelines (King County EXTR
// files and similar assessor exports). Handles quoted fields and embedded
// commas; assumes no embedded newlines (true of the extracts we ingest —
// the parser COUNTS ragged rows so a violated assumption surfaces in ingest
// logs instead of silently corrupting rows). (Node-side only.)

import type { Readable } from "node:stream";
import { createInterface } from "node:readline";

/** Split one CSV line into fields (RFC-ish: double quotes, "" escapes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export interface CsvStats {
  rows: number;
  ragged: number;
}

/** Stream a CSV: header row → objects keyed by header. Ragged rows (wrong
 *  field count) are skipped and counted in stats. */
export async function* csvObjects(
  stream: Readable,
  stats: CsvStats
): AsyncGenerator<Record<string, string>> {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, "");
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields.map((h) => h.trim());
      continue;
    }
    if (fields.length !== header.length) {
      stats.ragged += 1;
      continue;
    }
    stats.rows += 1;
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = fields[i];
    yield row;
  }
}
