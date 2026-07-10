import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildLoiDocx } from "@/lib/loi";
import { parseUsd } from "@/lib/money";
import type { DealRow } from "@/lib/deals";
import type { StructuredAddress } from "@/lib/address";

export const runtime = "nodejs";

// Missing or blank means "use the default" — Number(null) and Number("") are
// both 0, which would otherwise silently clamp to the LOW bound (a 5-day DD
// period nobody asked for).
const clampInt = (v: string | null, lo: number, hi: number, dflt: number) => {
  if (v === null || v.trim() === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/**
 * Download a non-binding LOI draft (.docx) prefilled from the panel's form.
 * Pro deliverable, mirroring the memo/model gates: every bounce lands back
 * on the deal with a banner that explains itself.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url),
      302,
    );
  }

  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch (err) {
    console.error(`loi isPro check failed for deal ${id}:`, err);
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  if (!pro) {
    return Response.redirect(new URL(`/billing?upsell=loi`, req.url), 302);
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  if (!data) return new Response("Not found", { status: 404 });
  const deal = data as DealRow;
  if ((deal as { is_sample?: boolean }).is_sample) {
    // The sample is a demo, not a deal — mirror the ask/share server guards.
    return Response.redirect(
      new URL(`/deals/${id}?tab=documents&error=loisample`, req.url),
      302,
    );
  }

  // Same M-aware parse the panel uses, so "$68.5M" means the same thing on
  // both sides; the floors bounce figures that could only be typos ("$68"
  // is never a building price).
  const priceN = parseUsd(url.searchParams.get("price") ?? "");
  const depositN = parseUsd(url.searchParams.get("deposit") ?? "", 100);
  if (priceN === null || depositN === null) {
    return Response.redirect(
      new URL(`/deals/${id}?tab=documents&error=loiprice`, req.url),
      302,
    );
  }
  if (depositN > priceN) {
    // Catches the classic field transposition before it becomes a letter
    // offering $680k with a $68M deposit.
    return Response.redirect(
      new URL(`/deals/${id}?tab=documents&error=loideposit`, req.url),
      302,
    );
  }
  const price = `$${priceN.toLocaleString("en-US")}`;
  const deposit = `$${depositN.toLocaleString("en-US")}`;

  const buyerName =
    url.searchParams
      .get("buyer")
      ?.trim()
      // XML 1.0 can't carry these control chars — docx writes them verbatim
      // and Word then reports the file as corrupt.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .slice(0, 120) || "Buyer";
  const address =
    ((deal as { address?: StructuredAddress | null }).address?.label ?? "")
      .trim()
      .slice(0, 160);

  try {
    const buffer = await buildLoiDocx({
      buyerName,
      propertyName: deal.name,
      propertyAddress: address,
      price,
      deposit,
      ddDays: clampInt(url.searchParams.get("dd"), 5, 120, 30),
      closeDays: clampInt(url.searchParams.get("close"), 5, 120, 30),
      // Key absent = checkbox off = genuinely no financing contingency.
      // Key present but blank = checkbox ON with the number cleared — fall
      // back to the default LTV rather than silently inverting the clause
      // into "not contingent on financing".
      ltvPct:
        url.searchParams.get("ltv") === null
          ? null
          : clampInt(url.searchParams.get("ltv"), 30, 85, 60),
      openDays: clampInt(url.searchParams.get("open"), 2, 30, 7),
      dateStr: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });

    const safe =
      (deal.name || "deal")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "deal";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}-loi-draft.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("loi build failed", err);
    return Response.redirect(
      new URL(`/deals/${id}?tab=documents&error=loifail`, req.url),
      302,
    );
  }
}
