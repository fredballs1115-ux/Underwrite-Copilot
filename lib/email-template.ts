/**
 * Analysis-ready email — one minimal, on-brand template. Deliberately
 * dependency-free (inline styles, table layout, no imports) so email clients
 * render it faithfully and it can be unit-tested with plain Node.
 */

export interface AnalysisReadyEmailInput {
  dealName: string;
  /** "Go" | "Caution" | "No-go" */
  verdictLabel: string;
  /** hex for the verdict accent, e.g. "#1b7a5e" */
  verdictColor: string;
  /** "Fits buy box" | "Near buy box" | "Outside buy box" | "Buy box unverified" */
  buyBoxLabel: string;
  /** one-line verdict reason ("" to omit) */
  reason: string;
  dealUrl: string;
  settingsUrl: string;
}

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function analysisReadyEmail(input: AnalysisReadyEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${input.verdictLabel}: ${input.dealName} — screen complete`;

  const text = [
    `${input.dealName} — the screen is complete.`,
    ``,
    `Verdict: ${input.verdictLabel}`,
    `Buy box: ${input.buyBoxLabel}`,
    input.reason ? `Why: ${input.reason}` : null,
    ``,
    `Open the full report: ${input.dealUrl}`,
    ``,
    `You're getting this because analysis emails are on. Turn them off: ${input.settingsUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#f2f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #dde3e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background-color:#0c3338;padding:18px 28px;">
            <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:-0.01em;">Underwrite Copilot</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0;font-size:13px;color:#5f6b69;">Screen complete</p>
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#15201e;letter-spacing:-0.01em;">${esc(input.dealName)}</h1>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
              <tr>
                <td style="background-color:${esc(input.verdictColor)};border-radius:999px;padding:5px 14px;">
                  <span style="color:#ffffff;font-size:13px;font-weight:600;">${esc(input.verdictLabel)}</span>
                </td>
                <td style="padding-left:10px;">
                  <span style="color:#5f6b69;font-size:13px;">${esc(input.buyBoxLabel)}</span>
                </td>
              </tr>
            </table>
            ${
              input.reason
                ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#3c4644;">${esc(input.reason)}</p>`
                : ""
            }
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
              <tr>
                <td style="background-color:#114e54;border-radius:8px;">
                  <a href="${esc(input.dealUrl)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open the full report</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #eef1f0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9391;">
              You're getting this because analysis emails are on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn them off in Settings</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
