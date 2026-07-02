import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { MemoDocument, buildMemoData } from "@/lib/memo/memo-document";
import type { DealRow } from "@/lib/deals";

// PDF generation needs the Node runtime (not edge).
export const runtime = "nodejs";

/**
 * Stream a one-page screening memo PDF for a deal. RLS on the user-scoped
 * Supabase client guarantees the caller can only export their own deals.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // The PDF memo is a Pro feature.
  if (!(await isPro(supabase, user.id))) {
    return Response.redirect(new URL("/billing", req.url), 302);
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return new Response("Not found", { status: 404 });

  const deal = data as DealRow;
  // A memo without a verdict is a near-blank, brand-damaging PDF — refuse it.
  if (!deal.verdict) {
    return Response.redirect(
      new URL(`/deals/${id}?error=memoempty`, req.url),
      302,
    );
  }
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const memo = buildMemoData(deal, dateStr);
  // MemoDocument renders a <Document>; cast to the element type renderToBuffer
  // expects (it's typed for a Document element, not a wrapping component).
  const element = React.createElement(MemoDocument, {
    data: memo,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  const safe =
    (deal.name || "deal")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "deal";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}-screening-memo-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
