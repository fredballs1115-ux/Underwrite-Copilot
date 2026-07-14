import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveBranding } from "@/lib/branding-server";
import { signedSupplementUrl } from "@/lib/storage";
import { FIRM_NAME_MAX, FOOTER_TEXT_MAX, type Branding } from "@/lib/branding";
import { saveBranding } from "./actions";
import { PendingButton } from "../pending-button";

/**
 * Report branding card (Feature 6, Pro/Team): firm name, logo, and footer
 * text stamped onto every exported memo and report. Free plan sees the card
 * locked with the upgrade path; team members see it read-only (the owner
 * edits the shared identity).
 */
export async function BrandingSection({
  userId,
  pro,
}: {
  userId: string;
  pro: boolean;
}) {
  if (!pro) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              Report branding
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                Pro
              </span>
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Put your firm&apos;s name, logo, and footer on every exported
              memo and report — your deals go to your IC under your identity.
            </p>
          </div>
          <Link
            href="/billing?upsell=branding"
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Upgrade to Pro
          </Link>
        </div>
      </section>
    );
  }

  // Best-effort: a pre-0021 schema reads as "no branding set" and the form
  // still renders (the save action will surface any real failure).
  let branding: Branding | null = null;
  let scope: "team" | "personal" = "personal";
  let editable = true;
  try {
    const supabase = await createSupabaseServerClient();
    const active = await getActiveBranding(supabase, userId);
    branding = active.branding;
    scope = active.scope;
    editable = active.editable;
  } catch {
    branding = null;
  }

  let logoUrl: string | null = null;
  if (branding?.logoPath) {
    try {
      logoUrl = await signedSupplementUrl(branding.logoPath);
    } catch {
      logoUrl = null;
    }
  }

  const readOnly = scope === "team" && !editable;

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold tracking-tight">Report branding</h2>
      <p className="mt-1 max-w-lg text-sm text-muted">
        Shown on every export{" "}
        {scope === "team" ? "for your whole team" : "you download"} — name and
        logo on the memo and report, your name in the Excel workbooks&apos;
        file properties and print header, and a letterhead on the LOI. Footer
        text prints on each PDF page. A small &ldquo;Powered by Underwrite
        Copilot&rdquo; line stays at the very bottom of the PDFs.
      </p>

      {readOnly ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Firm logo"
                className="h-9 max-w-[140px] rounded border border-line bg-white object-contain p-1"
              />
            ) : null}
            <p className="text-sm font-medium">
              {branding?.firmName ?? (
                <span className="text-muted">No firm name set</span>
              )}
            </p>
          </div>
          {branding?.footerText ? (
            <p className="text-sm text-muted">{branding.footerText}</p>
          ) : null}
          <p className="text-xs text-muted">
            Your team&apos;s branding is managed by the team owner.
          </p>
        </div>
      ) : (
        <form action={saveBranding} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Firm name
              </span>
              <input
                type="text"
                name="firmName"
                maxLength={FIRM_NAME_MAX}
                defaultValue={branding?.firmName ?? ""}
                placeholder="e.g. Sterling Ridge Capital"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Logo{" "}
                <span className="normal-case tracking-normal">
                  (PNG or JPG, ≤1MB — about 200×100px works best)
                </span>
              </span>
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg"
                className="mt-1 w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-faint"
              />
            </label>
          </div>

          {logoUrl ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-faint/60 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Current firm logo"
                className="h-9 max-w-[140px] rounded border border-line bg-white object-contain p-1"
              />
              <span className="text-xs text-muted">Current logo</span>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  name="removeLogo"
                  value="1"
                  className="h-3.5 w-3.5 accent-brand"
                />
                Remove logo
              </label>
            </div>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Report footer text
            </span>
            <input
              type="text"
              name="footerText"
              maxLength={FOOTER_TEXT_MAX}
              defaultValue={branding?.footerText ?? ""}
              placeholder="e.g. Confidential — prepared for internal investment committee use only"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
            />
          </label>

          <div className="flex items-center gap-3">
            <PendingButton
              pendingLabel="Saving…"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Save branding
            </PendingButton>
            <span className="text-xs text-muted">
              Clearing every field removes your branding — exports go back to
              the default look.
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
