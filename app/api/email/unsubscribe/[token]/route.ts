// GET | POST /api/email/unsubscribe/<token> — the Monday digest's one-click
// unsubscribe (lib/email-unsubscribe). The token is the whole permission:
// the user and the ONE setting it turns off, signed by the server. /api is
// outside the proxy's matcher, so no sign-in bounce (and no canonical-host
// redirect, which a provider's POST would not follow) ever reaches it.
//
//   POST, carrying `List-Unsubscribe=One-Click` (RFC 8058: what a mailbox
//   provider sends when its reader presses "Unsubscribe"): turns that one
//   setting off for that one user, and nothing else.
//   GET (the link in the digest's footer, and whatever a link scanner
//   fetches): changes nothing — a small page whose button sends that POST.
//
// A token that does not verify answers 404 and changes nothing.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  UNSUBSCRIBE_SETTINGS,
  isOneClickBody,
  readEmailUnsubscribeToken,
  type UnsubscribeSetting,
} from "@/lib/email-unsubscribe";
import { escapeHtml } from "@/lib/email-template";

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
};

/** The largest body a one-click POST needs: the one pair, with room. */
const MAX_BODY_BYTES = 4096;

/** What each setting is called on the page. */
const WHAT: Record<UnsubscribeSetting, string> = {
  digest: "the weekly pipeline digest",
};

type Params = { params: Promise<{ token: string }> };

/** A small page in the emails' own look; every value in it escaped. */
function page(title: string, inner: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — Underwrite Copilot</title>
<style>
  body{margin:0;background:#f2f4f4;color:#18211f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;}
  main{max-width:440px;margin:48px auto;padding:0 16px;}
  .card{background:#fff;border:1px solid #dde3e2;border-radius:12px;padding:28px;}
  .brand{font-size:13px;font-weight:600;color:#114e54;margin:0 0 12px;}
  h1{font-size:20px;line-height:1.3;margin:0;}
  p{font-size:14px;line-height:1.55;color:#5f6b69;margin:12px 0 0;}
  button{margin-top:20px;background:#114e54;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;}
  a{color:#114e54;}
</style>
</head>
<body>
<main id="main"><div class="card"><p class="brand">Underwrite Copilot</p>${inner}</div></main>
</body>
</html>`,
    { status, headers: PAGE_HEADERS },
  );
}

const ACCOUNT_LINK = `<a href="/account">your Account page</a>`;

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const read = readEmailUnsubscribeToken(token);
  if (!read) return new NextResponse(null, { status: 404 });
  // Asks, never acts: a link scanner opening the footer's link must not
  // unsubscribe anyone. The button sends the one-click POST.
  return page(
    "Unsubscribe",
    `<h1>Stop ${escapeHtml(WHAT[read.setting])}?</h1>
<p>One click turns it off for the account it was sent to. Nothing else changes, and you can turn it back on from ${ACCOUNT_LINK}.</p>
<form method="post" action="/api/email/unsubscribe/${escapeHtml(token)}">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit">Unsubscribe</button>
</form>`,
  );
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  const read = readEmailUnsubscribeToken(token);
  if (!read) return new NextResponse(null, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
  if (!(await isOneClickBody(req.headers.get("content-type"), body))) {
    // Not the one-click request: nothing changes.
    return new NextResponse("Expected List-Unsubscribe=One-Click", { status: 400 });
  }

  try {
    const { error } = await createSupabaseAdminClient()
      .from("profiles")
      .update({ [UNSUBSCRIBE_SETTINGS[read.setting]]: false })
      .eq("id", read.userId);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      `[unsubscribe] ${read.setting} could not be turned off for ${read.userId}:`,
      err instanceof Error ? err.message : err,
    );
    return page(
      "Not unsubscribed",
      `<h1>That didn’t go through</h1>
<p>Nothing was changed. Try again in a moment, or turn it off on ${ACCOUNT_LINK}.</p>`,
      500,
    );
  }
  return page(
    "Unsubscribed",
    `<h1>You’re unsubscribed from ${escapeHtml(WHAT[read.setting])}</h1>
<p>It won’t be sent to this account again unless you turn it back on from ${ACCOUNT_LINK}.</p>`,
  );
}
