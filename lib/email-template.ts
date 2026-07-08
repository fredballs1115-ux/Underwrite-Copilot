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
    `You're getting this because analysis emails are on. Turn them off on your Account page: ${input.settingsUrl}`,
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
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#18211f;letter-spacing:-0.01em;">${esc(input.dealName)}</h1>
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
                ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#18211f;">${esc(input.reason)}</p>`
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
            <p style="margin:0;font-size:12px;line-height:1.5;color:#5f6b69;">
              You're getting this because analysis emails are on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn them off on your Account page</a>.
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

/* ------------------------- weekly pipeline digest ------------------------ */

export interface DigestInput {
  /** e.g. [{ label: "Screening", count: 3 }] — ladder order, zeros dropped */
  stages: { label: string; count: number }[];
  /** offers due in the next 7 days, soonest first */
  offersDue: { name: string; due: string; url: string }[];
  /** verdicts that landed in the last 7 days */
  verdicts: { name: string; label: string; color: string; url: string }[];
  pipelineUrl: string;
  settingsUrl: string;
}

/** The Monday-morning pipeline digest — same dependency-free table style as
 *  the analysis-ready email so clients render it faithfully. */
export function weeklyDigestEmail(input: DigestInput): {
  subject: string;
  html: string;
  text: string;
} {
  const live = input.stages.reduce((n, s) => n + s.count, 0);
  const subject = `Your pipeline this week — ${live} live deal${live === 1 ? "" : "s"}`;

  const text = [
    `Your pipeline this week:`,
    ``,
    ...input.stages.map((s) => `  ${s.label}: ${s.count}`),
    input.offersDue.length ? `` : null,
    input.offersDue.length ? `Offers due this week:` : null,
    ...input.offersDue.map((o) => `  ${o.name} — ${o.due}: ${o.url}`),
    input.verdicts.length ? `` : null,
    input.verdicts.length ? `Verdicts since last week:` : null,
    ...input.verdicts.map((v) => `  ${v.label}: ${v.name} — ${v.url}`),
    ``,
    `Open the pipeline: ${input.pipelineUrl}`,
    ``,
    `You're getting this because the weekly digest is on. Turn it off on your Account page: ${input.settingsUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const stageRows = input.stages
    .map(
      (s) => `<tr>
        <td style="padding:4px 0;font-size:14px;color:#18211f;">${esc(s.label)}</td>
        <td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#18211f;text-align:right;">${s.count}</td>
      </tr>`,
    )
    .join("");

  const offerRows = input.offersDue
    .map(
      (o) => `<tr>
        <td style="padding:4px 0;font-size:13px;"><a href="${esc(o.url)}" style="color:#114e54;font-weight:600;text-decoration:none;">${esc(o.name)}</a></td>
        <td style="padding:4px 0 4px 16px;font-size:13px;color:#b23a30;font-weight:600;text-align:right;white-space:nowrap;">${esc(o.due)}</td>
      </tr>`,
    )
    .join("");

  const verdictRows = input.verdicts
    .map(
      (v) => `<tr>
        <td style="padding:4px 8px 4px 0;"><span style="display:inline-block;background-color:${esc(v.color)};color:#ffffff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;">${esc(v.label)}</span></td>
        <td style="padding:4px 0;font-size:13px;"><a href="${esc(v.url)}" style="color:#18211f;text-decoration:none;">${esc(v.name)}</a></td>
      </tr>`,
    )
    .join("");

  const section = (title: string, rows: string) =>
    rows
      ? `<p style="margin:20px 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f6b69;">${title}</p>
         <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`
      : "";

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
            <p style="margin:0;font-size:13px;color:#5f6b69;">Monday pipeline digest</p>
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#18211f;letter-spacing:-0.01em;">${live} live deal${live === 1 ? "" : "s"} in your pipeline</h1>
            ${section("By stage", stageRows)}
            ${section("Offers due this week", offerRows)}
            ${section("Verdicts since last week", verdictRows)}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td style="background-color:#114e54;border-radius:8px;">
                  <a href="${esc(input.pipelineUrl)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open the pipeline</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #eef1f0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#5f6b69;">
              You're getting this because the weekly digest is on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn it off on your Account page</a>.
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
