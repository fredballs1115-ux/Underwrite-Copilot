// URL scheme allowlist for externally-sourced links (Feature 4 hardening).
// Comp source URLs arrive from LLM output over hostile documents and web
// results — only real web URLs may ever become an href; javascript:, data:,
// vbscript:, file: and friends are dropped, never rendered.
// (Universal module: client comps map + tests.)

export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null; // relative / garbage — not a linkable source
  }
}
