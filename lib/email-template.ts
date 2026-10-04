/**
 * The emails' templates — one minimal, on-brand family. Deliberately
 * dependency-free (inline styles, table layout, no imports) so email clients
 * render it faithfully and it can be unit-tested with plain Node.
 */

export interface AnalysisReadyEmailInput {
  dealName: string;
  /** "Go" | "Caution" | "No-go" */
  verdictLabel: string;
  /** hex for the verdict accent, e.g. "#1b7a5e" */
  verdictColor: string;
  /** the deal header's buy-box chip (lib/buy-box-chip): "Fit 82 · Pursue",
   *  "Fit 61 · Outside box", "Fits buy box", "Near buy box", "Outside buy
   *  box", "Buy box unverified" — or "No buy box set", or lib/email's line
   *  for a box it could not read. Drawn after "Buy box:", as the plain-text
   *  part has always said it: beside the call's pill, a bare "Fit 82 ·
   *  Pursue" read as a second call ("No-go  Fit 82 · Pursue"). */
  buyBoxLabel: string;
  /** one-line verdict reason ("" to omit) */
  reason: string;
  dealUrl: string;
  settingsUrl: string;
  /** the building's picture across the top (#464, lib/email-picture). Its
   *  route serves whatever is stored when the email is OPENED — the deal's
   *  photograph, else its cover — so the alt is the template's, worded to be
   *  true of either (`bannerAlt`), never decided at send time. */
  picture?: { url: string } | null;
}

/** Text made safe inside an email's HTML, in an element or an attribute. */
export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const esc = escapeHtml;

/** The colour a picture's box holds while its image is blocked or loading:
 *  a band of the brand's light tint, never a blank white gap. */
const PICTURE_BOX = "#dfe8e7";

/** The longest preview line the hidden preheader carries: an inbox shows
 *  the first stretch of it after the subject, and the rest is noise. */
export const PREVIEW_MAX = 140;

/** A preview line: white space folded, cut at a word to `PREVIEW_MAX`. */
export function previewLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_MAX) return flat;
  const cut = flat.slice(0, PREVIEW_MAX - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > PREVIEW_MAX / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:—–-]+$/, "")}…`;
}

/** The banner's alt text, and so its link's name: the deal and where the
 *  link goes. True of a photograph and of the cover alike — the picture is
 *  chosen when the email is opened, the alt when it is sent — and it reads
 *  as a line of its own in the band when images are blocked. */
export function bannerAlt(dealName: string): string {
  return `${dealName} — open the deal`;
}

/**
 * The document every email is: a head (the charset, a phone's viewport, the
 * one colour scheme the cards are drawn in, the subject as its title), the
 * inbox's preview line hidden first in the body — what matters, ahead of
 * whatever text a client would otherwise lift from the card — then the card:
 * the masthead, and the rows the email brings.
 */
function emailDocument(opts: { title: string; preheader: string; rows: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f2f4f4;mso-hide:all;">${esc(previewLine(opts.preheader))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #dde3e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background-color:#0c3338;padding:18px 28px;">
            <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:-0.01em;">Underwrite Copilot</span>
          </td>
        </tr>${opts.rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** The card's one button: a link that carries its own words. */
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
              <tr>
                <td style="background-color:#114e54;border-radius:8px;">
                  <a href="${esc(url)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
                </td>
              </tr>
            </table>`;
}

/** The footer row: why the reader got this, and where to turn it off. */
function footerRow(inner: string): string {
  return `
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #eef1f0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#5f6b69;">
              ${inner}
            </p>
          </td>
        </tr>`;
}

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
    `Open the deal: ${input.dealUrl}`,
    ``,
    `You're getting this because analysis emails are on. Turn them off on your Account page: ${input.settingsUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // The call first, then why, then the box — what an inbox's preview shows.
  const preheader = `${input.verdictLabel}${input.reason ? ` — ${input.reason}` : "."} Buy box: ${input.buyBoxLabel}.`;

  const pictureRow = input.picture
    ? `
        <tr>
          <td style="padding:0;line-height:0;font-size:0;background-color:${PICTURE_BOX};">
            <a href="${esc(input.dealUrl)}" style="display:block;text-decoration:none;background-color:${PICTURE_BOX};"><img src="${esc(input.picture.url)}" width="520" height="260" alt="${esc(bannerAlt(input.dealName))}" style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;text-decoration:none;background-color:${PICTURE_BOX};color:#114e54;font-size:15px;font-weight:600;line-height:1.4;text-align:center;" /></a>
          </td>
        </tr>`
    : "";

  const html = emailDocument({
    title: subject,
    preheader,
    rows: `${pictureRow}
        <tr>
          <td style="padding:28px;">
            <p style="margin:0;font-size:13px;color:#5f6b69;">Screen complete</p>
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#18211f;letter-spacing:-0.01em;">${esc(input.dealName)}</h1>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
              <tr>
                <td style="background-color:${esc(input.verdictColor)};border-radius:999px;padding:5px 14px;">
                  <span style="color:#ffffff;font-size:13px;font-weight:600;">${esc(input.verdictLabel)}</span>
                </td>
                <td style="padding-left:12px;">
                  <span style="color:#5f6b69;font-size:13px;">Buy box: <span style="color:#18211f;font-weight:600;">${esc(input.buyBoxLabel)}</span></span>
                </td>
              </tr>
            </table>
            ${
              input.reason
                ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#18211f;">${esc(input.reason)}</p>`
                : ""
            }
            ${button(input.dealUrl, "Open the deal")}
          </td>
        </tr>${footerRow(
          `You're getting this because analysis emails are on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn them off on your Account page</a>.`,
        )}`,
  });

  return { subject, html, text };
}

/* ------------------------- a screen that stopped ------------------------- */

export interface ScreenStoppedEmailInput {
  dealName: string;
  /** the one sentence the deal page shows for the failure (lib/anthropic/
   *  failure) — written for the analyst, never the provider's raw text */
  message: string;
  dealUrl: string;
  settingsUrl: string;
  /** on a re-screen, the call the deal still shows — the previous screen's
   *  (lib/screen-run `verdictBehind` "failed") — and the day it was made
   *  (`screenedOn`, null for a call saved before the pipeline dated one) */
  previousCall?: { label: string; color: string; on: string | null } | null;
}

/** The sentence a stopped re-screen says about the call that stands. */
export function previousCallLine(call: { label: string; on: string | null }): string {
  return `The previous call still stands: ${call.label}${call.on ? `, screened ${call.on}` : ""}. It stays on the deal until a screen finishes.`;
}

/**
 * A screen that stopped before its verdict: the analyst usually tabs away
 * during the run, and the screen-complete email never comes for a run that
 * fails, so nothing told them (pass 14, 2026-10-01). The deal page's own
 * sentence, and the way back to it. Same template family as the
 * screen-complete email, under the same switch on the Account page.
 */
export function screenStoppedEmail(input: ScreenStoppedEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${input.dealName} — the screen stopped`;
  const stands = input.previousCall ? previousCallLine(input.previousCall) : null;
  const text = [
    `${input.dealName} — the screen stopped before its verdict.`,
    ``,
    input.message,
    stands ? `` : null,
    stands,
    ``,
    `Open the deal: ${input.dealUrl}`,
    ``,
    `You're getting this because analysis emails are on. Turn them off on your Account page: ${input.settingsUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  // The call that stands, drawn as the pill the screen-complete email drew,
  // the sentence beside it (the plain text says the call in words).
  const standing = input.previousCall
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">
              <tr>
                <td style="padding-right:10px;vertical-align:top;">
                  <span style="display:inline-block;background-color:${esc(input.previousCall.color)};color:#ffffff;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:600;">${esc(input.previousCall.label)}</span>
                </td>
                <td style="font-size:13px;line-height:1.5;color:#5f6b69;vertical-align:top;">The previous call still stands${input.previousCall.on ? `, screened ${esc(input.previousCall.on)}` : ""}. It stays on the deal until a screen finishes.</td>
              </tr>
            </table>`
    : "";
  const html = emailDocument({
    title: subject,
    // Why it stopped, first; then the call that stands.
    preheader: [input.message, stands].filter(Boolean).join(" "),
    rows: `
        <tr>
          <td style="padding:28px;">
            <p style="margin:0;font-size:13px;color:#a8432f;">The screen stopped</p>
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#18211f;letter-spacing:-0.01em;">${esc(input.dealName)}</h1>
            <p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#18211f;">${esc(input.message)}</p>
            ${standing}
            ${button(input.dealUrl, "Open the deal")}
          </td>
        </tr>${footerRow(
          `You're getting this because analysis emails are on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn them off on your Account page</a>.`,
        )}`,
  });
  return { subject, html, text };
}

/* ------------------------- weekly pipeline digest ------------------------ */

export interface DigestInput {
  /** the OPEN deals by stage (lib/stages `isOpenStage`: Closed and Dead are
   *  not counted), e.g. [{ label: "Screening", count: 3 }] — ladder order,
   *  zeros dropped; their sum is the digest's "open deals" */
  stages: { label: string; count: number }[];
  /** open deals' offer deadlines from today through `offersThrough`,
   *  soonest first; `pictureUrl` is the deal's square (#464,
   *  lib/email-picture) */
  offersDue: { name: string; due: string; url: string; pictureUrl?: string | null }[];
  /** the window's last day, as the deadlines are written ("Sun, Oct 11"):
   *  the section is headed "Offers due by" it, so it says the window it
   *  lists — a "this week" heading had listed eight days */
  offersThrough: string;
  /** verdicts that landed in the last 7 days; `note` marks a call whose
   *  re-screen is running, stalled or failed (lib/digest), as the pipeline
   *  card marks it */
  verdicts: {
    name: string;
    label: string;
    color: string;
    url: string;
    pictureUrl?: string | null;
    note?: string | null;
  }[];
  pipelineUrl: string;
  settingsUrl: string;
  /** the unsubscribe link (lib/email-unsubscribe): drawn in the footer
   *  beside the Account page's switch, which needs a sign-in. It opens a
   *  page that turns the digest off with one button and no sign-in — the
   *  one-click unsubscribe itself is the mail program's own, through the
   *  List-Unsubscribe headers, so the footer never calls the link one click.
   *  Null where no link could be minted. */
  unsubscribeUrl?: string | null;
}

/**
 * A digest row's picture cell (#464): the deal's 48px square, the way a
 * listing alert pictures each result, linked to the deal like its name. The
 * square's alt is the deal's name — the link's name, and what shows in the
 * tinted square when images are blocked; the route serves the photograph or
 * the cover, whichever is stored when the email is opened, and the name is
 * true of both. A section where some rows have a picture keeps the column
 * for all of them, so the names start at one x.
 */
function pictureCell(entry: { name: string; url: string; pictureUrl?: string | null }, column: boolean): string {
  if (!column) return "";
  const img = entry.pictureUrl
    ? `<a href="${esc(entry.url)}" style="display:block;text-decoration:none;"><img src="${esc(entry.pictureUrl)}" width="48" height="48" alt="${esc(entry.name)}" style="display:block;width:48px;height:48px;border:0;border-radius:8px;background-color:${PICTURE_BOX};color:#114e54;font-size:9px;line-height:11px;" /></a>`
    : "";
  return `<td width="48" style="width:48px;padding:6px 12px 6px 0;vertical-align:middle;line-height:0;font-size:0;">${img}</td>`;
}

/** The Monday-morning pipeline digest — same dependency-free table style as
 *  the analysis-ready email so clients render it faithfully. */
export function weeklyDigestEmail(input: DigestInput): {
  subject: string;
  html: string;
  text: string;
} {
  const open = input.stages.reduce((n, s) => n + s.count, 0);
  const dealsWord = `${open} open deal${open === 1 ? "" : "s"}`;
  const subject = `Your pipeline this week — ${dealsWord}`;
  const offersTitle = `Offers due by ${input.offersThrough}`;

  const text = [
    `Your pipeline this week — ${dealsWord}, by stage:`,
    ``,
    ...input.stages.map((s) => `  ${s.label}: ${s.count}`),
    input.offersDue.length ? `` : null,
    input.offersDue.length ? `${offersTitle}:` : null,
    ...input.offersDue.map((o) => `  ${o.name} — ${o.due}: ${o.url}`),
    input.verdicts.length ? `` : null,
    input.verdicts.length ? `Verdicts since last week:` : null,
    ...input.verdicts.map((v) => `  ${v.label}: ${v.name}${v.note ? ` (${v.note})` : ""} — ${v.url}`),
    ``,
    `Open the pipeline: ${input.pipelineUrl}`,
    ``,
    input.unsubscribeUrl
      ? `You're getting this because the weekly digest is on. Unsubscribe without signing in: ${input.unsubscribeUrl} — or manage both emails on your Account page: ${input.settingsUrl}`
      : `You're getting this because the weekly digest is on. Turn it off on your Account page: ${input.settingsUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // The deadlines first — the one thing in a digest with a date on it — then
  // the count and the calls.
  const preheader = [
    input.offersDue.length ? `Offers due: ${input.offersDue.map((o) => `${o.name} (${o.due})`).join(", ")}.` : null,
    `${dealsWord} in your pipeline.`,
    input.verdicts.length ? `${input.verdicts.length} verdict${input.verdicts.length === 1 ? "" : "s"} since last week.` : null,
  ]
    .filter((l): l is string => l !== null)
    .join(" ");

  const stageRows = input.stages
    .map(
      (s) => `<tr>
        <td style="padding:4px 0;font-size:14px;color:#18211f;">${esc(s.label)}</td>
        <td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#18211f;text-align:right;">${s.count}</td>
      </tr>`,
    )
    .join("");

  const offerPictures = input.offersDue.some((o) => o.pictureUrl);
  const offerRows = input.offersDue
    .map(
      (o) => `<tr>
        ${pictureCell(o, offerPictures)}<td style="padding:4px 0;font-size:13px;vertical-align:middle;"><a href="${esc(o.url)}" style="color:#114e54;font-weight:600;text-decoration:none;">${esc(o.name)}</a></td>
        <td style="padding:4px 0 4px 16px;font-size:13px;color:#b23a30;font-weight:600;text-align:right;white-space:nowrap;vertical-align:middle;">${esc(o.due)}</td>
      </tr>`,
    )
    .join("");

  // With a picture the call moves to the right, as the due date sits in the
  // row above it; without one it leads, as it always has.
  const verdictPictures = input.verdicts.some((v) => v.pictureUrl);
  const verdictPill = (v: DigestInput["verdicts"][number]) =>
    `<span style="display:inline-block;background-color:${esc(v.color)};color:#ffffff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;">${esc(v.label)}</span>`;
  // A call its re-screen is replacing, or failed to: said under the name, in
  // the caution tone, as the pipeline card says it over the call.
  const callNote = (v: DigestInput["verdicts"][number]) =>
    v.note ? `<br /><span style="font-size:12px;font-weight:600;color:#a05a1c;">${esc(v.note)}</span>` : "";
  const verdictRows = input.verdicts
    .map((v) =>
      verdictPictures
        ? `<tr>
        ${pictureCell(v, true)}<td style="padding:4px 0;font-size:13px;vertical-align:middle;"><a href="${esc(v.url)}" style="color:#18211f;font-weight:600;text-decoration:none;">${esc(v.name)}</a>${callNote(v)}</td>
        <td style="padding:4px 0 4px 16px;text-align:right;white-space:nowrap;vertical-align:middle;">${verdictPill(v)}</td>
      </tr>`
        : `<tr>
        <td style="padding:4px 8px 4px 0;vertical-align:top;">${verdictPill(v)}</td>
        <td style="padding:4px 0;font-size:13px;"><a href="${esc(v.url)}" style="color:#18211f;text-decoration:none;">${esc(v.name)}</a>${callNote(v)}</td>
      </tr>`,
    )
    .join("");

  const section = (title: string, rows: string) =>
    rows
      ? `<p style="margin:20px 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f6b69;">${esc(title)}</p>
         <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`
      : "";

  const html = emailDocument({
    title: subject,
    preheader,
    rows: `
        <tr>
          <td style="padding:28px;">
            <p style="margin:0;font-size:13px;color:#5f6b69;">Monday pipeline digest</p>
            <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#18211f;letter-spacing:-0.01em;">${dealsWord} in your pipeline</h1>
            ${section("Open deals by stage", stageRows)}
            ${section(offersTitle, offerRows)}
            ${section("Verdicts since last week", verdictRows)}
            ${button(input.pipelineUrl, "Open the pipeline")}
          </td>
        </tr>${footerRow(
          input.unsubscribeUrl
            ? `You're getting this because the weekly digest is on.
              <a href="${esc(input.unsubscribeUrl)}" style="color:#114e54;">Unsubscribe without signing in</a>, or
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">manage both emails on your Account page</a>.`
            : `You're getting this because the weekly digest is on.
              <a href="${esc(input.settingsUrl)}" style="color:#114e54;">Turn it off on your Account page</a>.`,
        )}`,
  });

  return { subject, html, text };
}
