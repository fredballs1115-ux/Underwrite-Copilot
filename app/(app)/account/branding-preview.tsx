// What branding changes, as a picture: the sample memo's head and foot
// (app/memo-preview, the homepage's own miniature of the download) with the
// firm's name, logo and footer text laid in where the PDF lays them. Pure,
// so the account page's card and its render test draw one thing. On the
// locked Free card it is ghosted: muted, and hidden from a screen reader,
// since it shows an example firm rather than anything of the reader's.
import type { MemoData } from "@/lib/memo/memo-document";
import { MemoPreview, type MemoPreviewBranding } from "@/app/memo-preview";

/** The example the locked card shows: a firm's name and footer, no logo. */
export const GHOST_BRANDING: MemoPreviewBranding = {
  firmName: "Your firm",
  logoUrl: null,
  footerText: "Your footer on every page",
};

export function BrandingPreview({
  data,
  branding,
  ghost = false,
}: {
  data: MemoData;
  branding: MemoPreviewBranding;
  /** the locked Free card's example: muted and aria-hidden */
  ghost?: boolean;
}) {
  return (
    <div
      data-qa={ghost ? "branding-preview-ghost" : "branding-preview"}
      aria-hidden={ghost ? true : undefined}
      className={`w-full max-w-[260px] shrink-0 ${ghost ? "pointer-events-none select-none opacity-50 grayscale" : ""}`}
    >
      <MemoPreview data={data} branding={branding} label="Your memo's head and footer, as exported" />
    </div>
  );
}
