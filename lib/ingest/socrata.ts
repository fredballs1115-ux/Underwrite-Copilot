// Shared Socrata (SODA) helpers for the bulk ingest pipelines. One home so a
// timeout/resolver fix lands everywhere at once. (Node-side only — imported
// by scripts/ingest/*.ts, never by app code.)

export async function soda(
  base: string,
  params: Record<string, string>
): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}?${qs}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`SODA HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Field-name resolver: Socrata slugs occasionally shift — detect from a
 *  sample row and fail LOUDLY (listing what exists) rather than ingesting
 *  nulls. */
export function resolveFields(
  sample: Record<string, unknown>,
  wanted: Record<string, string[]>
): Record<string, string> {
  const keys = Object.keys(sample);
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, candidates] of Object.entries(wanted)) {
    const hit = candidates.find((c) => keys.includes(c));
    if (hit) out[name] = hit;
    else missing.push(`${name} (tried ${candidates.join("/")})`);
  }
  if (missing.length) {
    throw new Error(
      `dataset fields not found: ${missing.join("; ")} — available: ${keys.join(", ")}`
    );
  }
  return out;
}

export const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Cook-style PINs zero-pad to 14 digits; null when no digits at all. */
export const pin14 = (v: unknown): string | null => {
  const digits = (str(v) ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(14, "0") : null;
};

/** SoQL literal for a value that may be numeric or text in the dataset —
 *  quoting a number column raises a SODA type-mismatch error. */
export const soqlLit = (v: string): string => (/^\d+(\.\d+)?$/.test(v) ? v : `'${v}'`);
