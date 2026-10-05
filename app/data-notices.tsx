import { FRED_NOTICE } from "@/lib/data-notices";

/**
 * The data providers' notices in a page's footer: one short paragraph in
 * the footer's own type, words only (FRED's terms ask for the notice, never
 * its logo). At the app root because three footers draw it — the public
 * pages' chrome (app/public-shell.tsx), the signed-in shell
 * (app/(app)/app-shell.tsx) and /demo's own — and a second copy of a
 * provider's sentence is how two footers come to say it differently. The
 * words are lib/data-notices', held there to what the runner printed.
 *
 * Pure and free of hooks, so the client shell and a server page both draw it.
 */
export function DataNotices({ className }: { className?: string }) {
  return (
    <p className={className} data-qa="data-notices">
      {FRED_NOTICE}
    </p>
  );
}
